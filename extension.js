const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const cp = require('child_process');

const { findBlinterExecutable } = require('./lib/discovery');
const { analyzeLine, buildVariableIndexFromFile } = require('./lib/analysis');
const { parseBlinterOutput } = require('./lib/parser');
const { InlineDebugAdapterSession } = require('./lib/debugAdapterCore');

function activate(context) {
  // Register debug configuration provider
  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider('blinter-debug', {
      /**
       * Provide debug configurations when user has no launch.json
       */
  provideDebugConfigurations(_workspaceFolder) {
        return [{
          type: 'blinter-debug',
          name: 'Launch Batch (Blinter)',
          request: 'launch',
          program: '${file}'
        }];
      },
      
      /**
       * Resolve configuration before debugging starts
       */
  resolveDebugConfiguration(_workspaceFolder, config, _token) {
        // Ensure config is an object
        if (!config || typeof config !== 'object') {
          config = { type: '', name: '', request: '' };
        }
        
        // If no launch.json exists and user clicked "Run and Debug"
        if (!config.type && !config.request && !config.name) {
          const editor = vscode.window.activeTextEditor;
          if (editor && (editor.document.languageId === 'bat' || editor.document.languageId === 'cmd')) {
            config.type = 'blinter-debug';
            config.name = 'Launch Batch (Blinter)';
            config.request = 'launch';
            config.program = editor.document.uri.fsPath;
          } else {
            // No batch file open - return undefined to prevent launch
            return undefined;
          }
        }

        // Ensure type is set
        if (!config.type) {
          config.type = 'blinter-debug';
        }
        
        // Resolve ${file} variable if needed
        if (config.program === '${file}' || config.program === '${fileBasename}') {
          const editor = vscode.window.activeTextEditor;
          if (editor && (editor.document.languageId === 'bat' || editor.document.languageId === 'cmd')) {
            config.program = editor.document.uri.fsPath;
          } else {
            vscode.window.showWarningMessage('${file} variable requires an active batch file. Open a .bat or .cmd file first.');
            return undefined;
          }
        }

        if (!config.program) {
          vscode.window.showErrorMessage('No batch file specified. Open a .bat or .cmd file, or set "program" in launch.json.');
          return undefined; // abort launch
        }

        if (!config.request) {
          config.request = 'launch';
        }

        return config;
      }
    })
  );
  const controller = new BlinterController(context);
  controller.initialize();

  // Keep a backward-compatible `blinter.run` command for integrations/tests.
  context.subscriptions.push(vscode.commands.registerCommand('blinter.run', async () => {
    const editor = vscode.window.activeTextEditor;
    if (editor && (editor.document.languageId === 'bat' || editor.document.languageId === 'cmd')) {
      try {
        await controller.lintDocument(editor.document);
      } catch (e) {
        // swallow - command should not throw in tests
      }
    } else {
      vscode.window.showInformationMessage('Open a .bat or .cmd file to run Blinter.');
    }
  }));
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};

class BlinterController {
  constructor(context) {
    this.context = context;
    this.output = vscode.window.createOutputChannel('Blinter');
    this.diagnostics = vscode.languages.createDiagnosticCollection('blinter');
    this.issuesByFile = new Map();
    this.variableIndex = new Map();
    this.currentProgramPath = undefined;
    this.currentWorkspaceRoot = undefined;
    this.currentSessionId = undefined;
    this.pendingUpdateTimer = undefined;
    this.status = { state: 'idle', detail: '' };

    this.decorationType = this.createDecorationType();

    context.subscriptions.push(this.output);
    context.subscriptions.push(this.diagnostics);
    context.subscriptions.push(this.decorationType);
  }

  initialize() {
    const { context } = this;

    this.webviewProvider = new BlinterOutputViewProvider(context.extensionUri, this);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('blinter.outputSummary', this.webviewProvider));

    context.subscriptions.push(
      vscode.languages.registerHoverProvider(['bat', 'cmd'], {
        provideHover: (document, position) => this.provideHover(document, position)
      })
    );

    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider('bat', this.createQuickFixProvider(), {
        providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
      })
    );

    context.subscriptions.push(
      vscode.debug.registerDebugAdapterDescriptorFactory('blinter-debug', new BlinterDebugAdapterFactory(this))
    );

    context.subscriptions.push(
      vscode.window.onDidChangeVisibleTextEditors(() => this.refreshDecorations())
    );

    context.subscriptions.push(
      vscode.workspace.onDidCloseTextDocument((doc) => this.clearDocument(doc.uri))
    );

    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('blinter.stupidHighlightColor')) {
          this.resetDecorationStyle();
        }
      })
    );

    context.subscriptions.push(
      vscode.debug.onDidStartDebugSession((session) => {
        if (session.type === 'blinter-debug') {
          this.currentSessionId = session.id;
          this.webviewProvider?.ensureVisible();
        }
      })
    );

    context.subscriptions.push(
      vscode.debug.onDidTerminateDebugSession((session) => {
        if (session.type === 'blinter-debug') {
          this.handleProcessExit(this.lastExitCode ?? 0);
          this.currentSessionId = undefined;
        }
      })
    );

    // Automatic linting on save/onType
    const debounceTimers = new Map();
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        const config = vscode.workspace.getConfiguration('blinter');
        if (!config.get('enabled', true)) return;
        if (config.get('runOn', 'onSave') === 'onSave' && (doc.languageId === 'bat' || doc.languageId === 'cmd')) {
          this.lintDocument(doc);
        }
      })
    );

    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        const config = vscode.workspace.getConfiguration('blinter');
        if (!config.get('enabled', true)) return;
        if (String(config.get('runOn', 'onSave')) !== 'onType') return;
        const doc = e.document;
        if (doc.languageId !== 'bat' && doc.languageId !== 'cmd') return;

        const key = doc.uri.toString();
        if (debounceTimers.has(key)) clearTimeout(debounceTimers.get(key));
        const timeout = setTimeout(() => {
          this.lintDocument(doc);
          debounceTimers.delete(key);
        }, config.get('debounceDelay', 500));
        debounceTimers.set(key, timeout);
      })
    );

    this.updateStatus('idle');
    this.updateWebview();
    this.refreshDecorations();
  }

  createQuickFixProvider() {
    return {
      provideCodeActions: (document, range, context) => {
        if (document.languageId !== 'bat') {
          return [];
        }

			const actions = [];
			const config = vscode.workspace.getConfiguration('blinter');
        const allowedCodes = config.get('quickFixCodes', ['BLINTER_CASE', 'CMD_CASE', 'CASE001']);

			for (const diag of context.diagnostics) {
				const code = diag.code ? String(diag.code) : '';
				const message = diag.message ? String(diag.message).toLowerCase() : '';

				const codeMatches = code && allowedCodes.includes(code);
				const messageHintsCase = message.includes('case') || message.includes('casing');
          if (!codeMatches && !messageHintsCase) {
            continue;
          }

				const lineText = document.lineAt(range.start.line).text;
          const match = /^\s*([A-Za-z0-9_@]+)(\b.*)$/m.exec(lineText);
          if (!match) {
            continue;
          }

          const commandToken = match[1];
          const rest = match[2] || '';
				const fixed = commandToken.toLowerCase() + rest;

				const fix = new vscode.CodeAction('Normalize command casing', vscode.CodeActionKind.QuickFix);
				fix.edit = new vscode.WorkspaceEdit();
				fix.edit.replace(document.uri, document.lineAt(range.start.line).range, fixed);
				fix.diagnostics = [diag];
				fix.isPreferred = true;
				actions.push(fix);
			}

			return actions;
		}
	};
  }

  resetDecorationStyle() {
    const newDecoration = this.createDecorationType();
    this.decorationType.dispose();
    this.decorationType = newDecoration;
    this.context.subscriptions.push(this.decorationType);
    this.refreshDecorations();
  }

  createDecorationType() {
    const color = this.getHighlightColor();
    return vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: color,
      overviewRulerColor: color,
      overviewRulerLane: vscode.OverviewRulerLane.Full,
      light: { backgroundColor: color },
      dark: { backgroundColor: color }
    });
  }

  getHighlightColor() {
    const colorFromConfig = vscode.workspace.getConfiguration('blinter').get('stupidHighlightColor', '#5a1124');
    if (typeof colorFromConfig === 'string') {
      const trimmed = colorFromConfig.trim();
      const hexMatch = trimmed.match(/^#?([0-9A-Fa-f]{6})$/);
      if (hexMatch) {
        const value = hexMatch[1];
        const r = parseInt(value.slice(0, 2), 16);
        const g = parseInt(value.slice(2, 4), 16);
        const b = parseInt(value.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, 0.35)`;
      }
    }
    return new vscode.ThemeColor('editorError.background');
  }

  prepareForLaunch(args, session) {
    this.clearIssues();

    if (!args || !args.program) {
      throw new Error('Launch configuration is missing the "program" field.');
    }

    const config = vscode.workspace.getConfiguration('blinter');
    if (!config.get('enabled', true)) {
      throw new Error('Blinter is disabled in settings. Enable "blinter.enabled" to run debugging.');
    }

    // Support single-file mode: if no workspace, use the file's directory
    let workspaceFolder = session?.workspaceFolder?.uri?.fsPath
      || args.workspaceFolder;
    
    // Resolve program path first to handle ${file} variables
    let programPath;
    if (args.program === '${file}' || args.program === '${fileBasename}') {
      const editor = vscode.window.activeTextEditor;
      if (editor && (editor.document.languageId === 'bat' || editor.document.languageId === 'cmd')) {
        programPath = editor.document.uri.fsPath;
      } else {
        throw new Error('No active batch file found. Open a .bat or .cmd file first.');
      }
    } else {
      if (!workspaceFolder && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
      }
      programPath = this.resolveProgramPath(args.program, workspaceFolder);
    }

    if (!fs.existsSync(programPath)) {
      throw new Error(`Program not found: ${programPath}`);
    }

    // Set workspace root to file's directory if no workspace
    if (!workspaceFolder) {
      workspaceFolder = path.dirname(programPath);
    }

    let executablePath = findBlinterExecutable(this.context.extensionPath, process.platform);
    let _fallbackToCmd = false;
    if (!executablePath) {
      // Fallback for test environments or when the bundled executable is missing on Windows
      if (process.platform === 'win32') {
        this.log('Blinter executable not found; falling back to cmd.exe to run the batch file (test fallback).');
        executablePath = 'cmd.exe';
        _fallbackToCmd = true;
      } else {
        throw new Error('Blinter executable not found. Place `blinter.exe` under the extension `bin/` or `bins/` folder.');
      }
    }

    const rulesPathSetting = args.rulesPath || config.get('rulesPath') || null;
    const resolvedRulesPath = rulesPathSetting
      ? this.resolveRulesPath(rulesPathSetting, workspaceFolder, programPath)
      : null;

    const userArgs = Array.isArray(args.args) ? args.args.filter((value) => typeof value === 'string' && value.trim().length > 0) : [];

    // If we fell back to cmd.exe, use ['/c', programPath]; otherwise pass programPath as first arg
    let execArgs = _fallbackToCmd ? ['/c', programPath] : [programPath];
    if (resolvedRulesPath && !_fallbackToCmd) {
      execArgs.push('--rules', resolvedRulesPath);
    }
    execArgs.push(...userArgs);

    this.currentProgramPath = programPath;
    this.currentWorkspaceRoot = workspaceFolder || path.dirname(programPath);
    this.variableIndex = buildVariableIndexFromFile(programPath, fs);
    this.updateStatus('running', path.basename(programPath));
    this.webviewProvider?.ensureVisible();
    this.updateWebview();

    this.log(`Launching Blinter: ${executablePath} ${execArgs.map((a) => JSON.stringify(a)).join(' ')}`);

    return {
      executable: executablePath,
      args: execArgs,
      cwd: path.dirname(programPath)
    };
  }

  resolveProgramPath(program, workspaceFolder) {
    if (path.isAbsolute(program)) {
      return path.normalize(program);
    }
    // Support single-file mode: if no workspace, resolve relative to current working directory
    if (workspaceFolder) {
      return path.normalize(path.join(workspaceFolder, program));
    }
    // Fallback: try resolving relative to process cwd
    return path.normalize(path.resolve(process.cwd(), program));
  }

  resolveRulesPath(rulesPath, workspaceFolder, programPath) {
    if (!rulesPath) {
      return null;
    }
    if (path.isAbsolute(rulesPath)) {
      return path.normalize(rulesPath);
    }
    if (workspaceFolder) {
      const candidate = path.join(workspaceFolder, rulesPath);
      if (fs.existsSync(candidate)) {
        return path.normalize(candidate);
      }
    }
    const fromProgram = path.join(path.dirname(programPath), rulesPath);
    if (fs.existsSync(fromProgram)) {
      return path.normalize(fromProgram);
    }
    return path.normalize(rulesPath);
  }

  acceptProcessText(line, channel) {
    const text = line.replace(/\r?$/, '');
    if (!text) {
      return;
    }

    this.log(`[${channel}] ${text}`);

    const { issues } = analyzeLine(text, {
      workspaceRoot: this.currentWorkspaceRoot,
      defaultFile: this.currentProgramPath,
      variableIndex: this.variableIndex
    });

    if (!issues || issues.length === 0) {
      return;
    }

    for (const issue of issues) {
      this.addIssue(issue);
    }
  }

  addIssue(issue) {
    const targetFile = issue.filePath || this.currentProgramPath;
    if (!targetFile) {
      return;
    }

    issue.filePath = path.normalize(targetFile);
    if (!this.issuesByFile.has(issue.filePath)) {
      this.issuesByFile.set(issue.filePath, []);
    }
    this.issuesByFile.get(issue.filePath).push(issue);

    this.scheduleDiagnosticsUpdate();
  }

  scheduleDiagnosticsUpdate() {
    if (this.pendingUpdateTimer) {
      return;
    }
    this.pendingUpdateTimer = setTimeout(() => {
      this.pendingUpdateTimer = undefined;
      this.flushDiagnostics();
    }, 75);
  }

  flushDiagnostics() {
    const entries = [];
    for (const [filePath, list] of this.issuesByFile.entries()) {
      const uri = vscode.Uri.file(filePath);
      const diagnostics = list.sort((a, b) => this.compareIssues(a, b)).map((issue) => this.toDiagnostic(issue));
      entries.push({ uri, diagnostics });
    }

    this.diagnostics.clear();
    for (const entry of entries) {
      this.diagnostics.set(entry.uri, entry.diagnostics);
    }

    this.refreshDecorations();
    this.updateWebview();
  }

  compareIssues(a, b) {
    const order = { error: 0, warning: 1, info: 2 };
    const severityDelta = (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
    if (severityDelta !== 0) {
      return severityDelta;
    }
    return (a.line || 0) - (b.line || 0);
  }

  toDiagnostic(issue) {
    const severityMap = {
      error: vscode.DiagnosticSeverity.Error,
      warning: vscode.DiagnosticSeverity.Warning,
      info: vscode.DiagnosticSeverity.Information
    };

    const lineIndex = Math.max(0, (issue.line || 1) - 1);
    const startChar = issue.range?.start?.character ?? 0;
    const endChar = issue.range?.end?.character ?? 200;
    const range = new vscode.Range(lineIndex, startChar, lineIndex, endChar);
    const message = issue.message;

    const diagnostic = new vscode.Diagnostic(range, message, severityMap[issue.severity] ?? vscode.DiagnosticSeverity.Error);
    diagnostic.source = 'blinter';
    diagnostic.code = issue.code || issue.classification;
    return diagnostic;
  }

  refreshDecorations() {
    if (!this.decorationType) {
      return;
    }

    const editors = vscode.window.visibleTextEditors;
    for (const editor of editors) {
      const issues = this.issuesByFile.get(editor.document.uri.fsPath) || [];
      const stupidRanges = [];

      for (const issue of issues) {
        if (!issue.isStupid) {
          continue;
        }
        const lineIndex = Math.max(0, (issue.line || 1) - 1);
        if (lineIndex >= editor.document.lineCount) {
          continue;
        }
        const lineRange = editor.document.lineAt(lineIndex).range;
        stupidRanges.push(lineRange);
      }

      editor.setDecorations(this.decorationType, stupidRanges);
    }
  }

  updateWebview() {
    if (!this.webviewProvider) {
      return;
    }

    const summary = this.collectSummary();
    this.webviewProvider.update(summary);
  }

  collectSummary() {
    const definitions = [
      { id: 'errors', label: 'Errors', filter: (issue) => issue.severity === 'error' },
      { id: 'warnings', label: 'Warnings', filter: (issue) => issue.severity === 'warning' },
      { id: 'info', label: 'Info', filter: (issue) => issue.severity === 'info' },
      { id: 'undefined', label: 'Undefined Variables', filter: (issue) => issue.classification === 'UndefinedVariable' },
      { id: 'stupid', label: 'Stupid Lines', filter: (issue) => issue.isStupid }
    ];

    const groups = definitions.map((definition) => ({
      id: definition.id,
      label: definition.label,
      items: []
    }));

    for (const [filePath, list] of this.issuesByFile.entries()) {
      for (const issue of list) {
        for (let i = 0; i < definitions.length; i += 1) {
          const definition = definitions[i];
          if (!definition.filter(issue)) {
            continue;
          }
          groups[i].items.push({
            id: issue.id,
            filePath,
            fileName: path.basename(filePath),
            line: issue.line,
            message: issue.message,
            severity: issue.severity,
            classification: issue.classification
          });
        }
      }
    }

    return { groups, status: this.status };
  }

  provideHover(document, position) {
    const issues = this.issuesByFile.get(document.uri.fsPath) || [];
    const lineNumber = position.line + 1;
    const hits = issues.filter((issue) => issue.line === lineNumber);
    if (!hits.length) {
      return undefined;
    }

    hits.sort((a, b) => this.compareIssues(a, b));

    const md = new vscode.MarkdownString(undefined, true);
    md.isTrusted = true;

    hits.forEach((issue) => {
      md.appendMarkdown(`- **${escapeMarkdown(issue.classification || issue.severity.toUpperCase())}** — ${escapeMarkdown(issue.message)}\n`);
      if (issue.variableTrace && issue.variableTrace.length) {
        md.appendMarkdown(`  - Trace: ${escapeMarkdown(issue.variableTrace.join(' → '))}\n`);
      }
    });

    return new vscode.Hover(md);
  }

  clearDocument(uri) {
    const filePath = uri.fsPath;
    if (!this.issuesByFile.has(filePath)) {
      return;
    }
    this.issuesByFile.delete(filePath);
    this.scheduleDiagnosticsUpdate();
  }

  clearIssues() {
    this.issuesByFile.clear();
    this.diagnostics.clear();
    this.refreshDecorations();
    this.updateWebview();
  }

  handleProcessExit(code) {
    this.lastExitCode = code;
    const status = code === 0 ? 'completed' : 'errored';
    this.updateStatus(status, code === 0 ? 'Blinter completed' : `Exited with code ${code}`);
    this.flushDiagnostics();
  }

  updateStatus(state, detail) {
    this.status = { state, detail: detail || '' };
    if (this.webviewProvider) {
      this.webviewProvider.updateStatus(this.status);
    }
  }

  revealLocation(filePath, line) {
    if (!filePath) {
      return;
    }
    const uri = vscode.Uri.file(filePath);
    vscode.workspace.openTextDocument(uri).then((doc) => {
      vscode.window.showTextDocument(doc, { preview: false }).then((editor) => {
        const targetLine = Math.max(0, (line || 1) - 1);
        const position = new vscode.Position(targetLine, 0);
        const range = new vscode.Range(position, position);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        editor.selection = new vscode.Selection(position, position);
      });
    }, () => {
      vscode.window.showWarningMessage(`Unable to open ${filePath}`);
    });
  }

  log(message) {
    this.output.appendLine(message);
  }

  async lintDocument(document) {
    if (document.languageId !== 'bat' && document.languageId !== 'cmd') {
      return;
    }

    const config = vscode.workspace.getConfiguration('blinter');
    if (!config.get('enabled', true)) {
      return;
    }

    const filePath = document.uri.fsPath;
    if (!filePath) {
      return;
    }

    const executablePath = findBlinterExecutable(this.context.extensionPath, process.platform);
    if (!executablePath) {
      this.log('Blinter executable not found for linting. Ensure blinter.exe is in bin/ or bins/');
      return;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
      ? vscode.workspace.workspaceFolders[0].uri.fsPath
      : path.dirname(filePath);

    this.currentProgramPath = filePath;
    this.currentWorkspaceRoot = workspaceFolder;
    this.variableIndex = buildVariableIndexFromFile(filePath, fs);

    const rulesPathSetting = config.get('rulesPath') || null;
    const resolvedRulesPath = rulesPathSetting
      ? this.resolveRulesPath(rulesPathSetting, workspaceFolder, filePath)
      : null;

    const execArgs = [filePath];
    if (resolvedRulesPath) {
      execArgs.push('--rules', resolvedRulesPath);
    }

    this.log(`[Linter] Running: ${executablePath} ${execArgs.map((a) => JSON.stringify(a)).join(' ')}`);

    // Clear previous diagnostics for this file
    this.diagnostics.delete(document.uri);
    const fileIssues = this.issuesByFile.get(filePath) || [];
    if (fileIssues.length > 0) {
      this.issuesByFile.set(filePath, []);
    }

    try {
      const proc = cp.spawn(executablePath, execArgs, {
        cwd: path.dirname(filePath),
        windowsHide: true
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.setEncoding('utf8');
      proc.stderr.setEncoding('utf8');

      proc.stdout.on('data', (data) => {
        stdout += String(data);
      });

      proc.stderr.on('data', (data) => {
        stderr += String(data);
      });

      proc.on('error', (err) => {
        this.log(`[Linter] Process error: ${err && err.message ? err.message : String(err)}`);
      });

      await new Promise((resolve) => {
        proc.on('close', (code) => {
          if (stderr && stderr.trim()) {
            this.log(`[Linter] stderr: ${stderr}`);
          }
          
          // Parse the complete stdout using the parser
          const parsed = parseBlinterOutput(stdout);
          for (const item of parsed) {
            const lineNumber = Math.max(0, (item.line || 1) - 1);
            const range = new vscode.Range(
              new vscode.Position(lineNumber, 0),
              new vscode.Position(lineNumber, Number.MAX_SAFE_INTEGER)
            );
            const severityMap = {
              'error': vscode.DiagnosticSeverity.Error,
              'warning': vscode.DiagnosticSeverity.Warning,
              'information': vscode.DiagnosticSeverity.Information
            };
            const diag = new vscode.Diagnostic(
              range,
              `${item.description} (${item.code})`,
              severityMap[item.severity] || vscode.DiagnosticSeverity.Information
            );
            diag.code = item.code;
            diag.source = 'blinter';
            
            if (!this.issuesByFile.has(filePath)) {
              this.issuesByFile.set(filePath, []);
            }
            this.issuesByFile.get(filePath).push({
              id: `lint-${item.line}-${item.code}`,
              severity: item.severity,
              classification: 'Linter',
              isStupid: item.severity === 'error' || item.severity === 'warning',
              message: item.description,
              code: item.code,
              filePath: filePath,
              line: item.line,
              range: {
                start: { line: lineNumber, character: 0 },
                end: { line: lineNumber, character: Number.MAX_SAFE_INTEGER }
              }
            });
          }
          
          this.flushDiagnostics();
          resolve(code);
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`[Linter] Exception: ${message}`);
    }
  }
}

class BlinterConfigurationProvider {
  provideDebugConfigurations(_folder, _token) {
    return [
      {
        name: 'Launch Batch (Blinter)',
        type: 'blinter-debug',
        request: 'launch',
        program: '${file}'
      }
    ];
  }

resolveDebugConfiguration(folder, config, _token) {
    if (!config || typeof config !== 'object') {
      config = {};
    }
    
    if (!config.type) {
      config.type = 'blinter-debug';
    }
    if (!config.request) {
      config.request = 'launch';
    }
    if (!config.program) {
      const editor = vscode.window.activeTextEditor;
      if (editor && (editor.document.languageId === 'bat' || editor.document.languageId === 'cmd')) {
        config.program = editor.document.uri.fsPath;
      } else if (editor) {
        // User has a file open but it's not a batch file
        vscode.window.showWarningMessage('Blinter debugger requires a .bat or .cmd file. Open a batch file first.');
        return undefined;
      } else {
        // No active editor - try to use folder if available
        if (folder && folder.uri) {
          // Could search for .bat/.cmd files, but for now just show an error
          vscode.window.showErrorMessage('No batch file is open. Open a .bat or .cmd file, or set "program" in launch.json.');
          return undefined;
        }
        // Single-file mode - can't determine program
        return undefined;
      }
    }
    
    // Resolve ${file} and ${fileBasename} variables if present
    if (config.program === '${file}' || config.program === '${fileBasename}') {
      const editor = vscode.window.activeTextEditor;
      if (editor && (editor.document.languageId === 'bat' || editor.document.languageId === 'cmd')) {
        config.program = editor.document.uri.fsPath;
      } else {
        vscode.window.showWarningMessage('${file} variable requires an active batch file. Open a .bat or .cmd file first.');
        return undefined;
      }
    }
    
    return config;
  }
}

class BlinterDebugAdapterFactory {
  constructor(controller) {
    this.controller = controller;
  }

  createDebugAdapterDescriptor(session) {
    return new vscode.DebugAdapterInlineImplementation(new BlinterInlineDebugAdapter(this.controller, session));
  }
}

class BlinterInlineDebugAdapter {
  constructor(controller, session) {
    this.controller = controller;
    this.session = session;
    this._onDidSendMessage = new vscode.EventEmitter();
    this.onDidSendMessage = this._onDidSendMessage.event;

    // In test mode we provide a fake spawn implementation to avoid actually executing binaries
    /**
     * @param {string} command
     * @param {string[]} args
     * @param {import('child_process').SpawnOptions} options
     */
    const spawnImpl = (command, args, options) => {
      if (process.env['BLINTER_TEST_MODE'] === '1') {
        const { EventEmitter } = require('events');
        /** @type {any} */
        const fake = /** @type {any} */ (new EventEmitter());
        fake.stdout = new EventEmitter();
        fake.stderr = new EventEmitter();
        fake.stdout.setEncoding = () => {};
        fake.stderr.setEncoding = () => {};
        fake.kill = () => { fake.killed = true; };
        fake.killed = false;
        fake.pid = 12345;
        // simulate immediate close in tests after a short tick
        setTimeout(() => fake.emit('close', 0), 10);
        return fake;
      }
      return cp.spawn(command, args, options);
    };

    this.inner = new InlineDebugAdapterSession(controller, session, { spawn: spawnImpl });

    this.innerSubscription = this.inner.onDidSendMessage((message) => {
      this._onDidSendMessage.fire(message);
    });
  }

  handleMessage(message) {
    this.inner.handleMessage(message);
  }

  dispose() {
    if (this.innerSubscription) {
      this.innerSubscription.dispose();
      this.innerSubscription = undefined;
    }
    if (this.inner) {
      this.inner.dispose();
      this.inner = undefined;
    }
    this._onDidSendMessage.dispose();
  }
}

class BlinterOutputViewProvider {
  constructor(extensionUri, controller) {
    this.extensionUri = extensionUri;
    this.controller = controller;
    this._view = undefined;
    this._data = { groups: [] };
    this._status = { state: 'idle', detail: '' };
  }

		resolveWebviewView(webviewView) {
			this._view = webviewView;
			const webview = webviewView.webview;
    webview.options = {
      enableScripts: true
    };
    webview.html = this.renderHtml(webview);

    webview.onDidReceiveMessage((msg) => {
      if (msg?.command === 'reveal' && msg.path) {
        this.controller.revealLocation(msg.path, msg.line);
      }
    });

    this.postUpdate();
  }

  ensureVisible() {
    if (this._view && typeof this._view.show === 'function') {
      try {
        this._view.show(true);
      } catch {
				// ignore
			}
		}
    vscode.commands.executeCommand('workbench.view.debug');
  }

  update(data) {
    this._data = data || { groups: [] };
    this.postUpdate();
  }

  updateStatus(status) {
    this._status = status || { state: 'idle', detail: '' };
    this.postUpdate();
  }

  postUpdate() {
    if (!this._view) {
      return;
    }
    this._view.webview.postMessage({
      command: 'refresh',
      payload: {
        groups: this._data.groups || [],
        status: this._status
      }
    });
  }

  renderHtml(webview) {
    const cspSource = webview.cspSource;
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data:; script-src 'unsafe-inline'; style-src 'unsafe-inline';" />
    <style>
      body {
        font-family: var(--vscode-font-family);
        color: var(--vscode-foreground);
        background-color: transparent;
        padding: 12px;
      }
      h2 {
        margin: 0 0 8px 0;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--vscode-titleBar-activeForeground);
      }
      .status {
        font-size: 12px;
        margin-bottom: 12px;
        color: var(--vscode-descriptionForeground);
      }
      .group {
        margin-bottom: 12px;
      }
      .group-header {
        font-weight: 600;
        font-size: 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 4px;
      }
      .group-items {
        border: 1px solid var(--vscode-list-hoverBackground);
        border-radius: 4px;
        overflow: hidden;
      }
      .item {
        display: flex;
        gap: 8px;
        padding: 6px 8px;
        font-size: 12px;
        cursor: pointer;
        border-bottom: 1px solid var(--vscode-list-hoverBackground);
      }
      .item:last-child {
        border-bottom: none;
      }
      .item:hover {
        background-color: var(--vscode-list-hoverBackground);
      }
      .line {
        font-family: var(--vscode-editor-font-family);
        color: var(--vscode-textLink-foreground);
        min-width: 72px;
      }
      .severity-error {
        color: var(--vscode-errorForeground);
      }
      .severity-warning {
        color: var(--vscode-editorWarning-foreground);
      }
      .empty {
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
        padding: 12px;
        border: 1px dashed var(--vscode-list-hoverBackground);
        border-radius: 4px;
      }
    </style>
  </head>
  <body>
    <div class="status" id="status">Waiting for Blinter...</div>
    <div id="content"></div>
    <script>
      const vscodeApi = acquireVsCodeApi();

      function escapeHtml(value) {
        return String(value || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      function formatStatus(status) {
        if (!status) {
          return 'Waiting for Blinter...';
        }
        switch (status.state) {
          case 'running':
            return 'Running analysis' + (status.detail ? ' — ' + escapeHtml(status.detail) : '');
          case 'completed':
            return status.detail ? escapeHtml(status.detail) : 'Analysis complete';
          case 'errored':
            return status.detail ? escapeHtml(status.detail) : 'Blinter encountered an error';
          default:
            return status.detail ? escapeHtml(status.detail) : 'Idle';
        }
      }

      function render(payload) {
        const statusEl = document.getElementById('status');
        const container = document.getElementById('content');

        statusEl.textContent = formatStatus(payload.status);

        const groups = Array.isArray(payload.groups) ? payload.groups : [];
        const hasItems = groups.some(group => Array.isArray(group.items) && group.items.length > 0);

        if (!hasItems) {
          container.innerHTML = '<div class="empty">No diagnostics captured yet.</div>';
          return;
        }

        const parts = [];
        for (const group of groups) {
          if (!Array.isArray(group.items) || group.items.length === 0) {
            continue;
          }
          parts.push('<div class="group">');
          parts.push('<div class="group-header">');
          parts.push('<span>' + escapeHtml(group.label) + '</span>');
          parts.push('<span>' + group.items.length + '</span>');
          parts.push('</div>');
          parts.push('<div class="group-items">');
          for (const item of group.items) {
            const severityClass = item.severity ? 'severity-' + escapeHtml(item.severity) : '';
            const displayLine = escapeHtml(item.fileName) + ':' + escapeHtml(item.line || 0);
            parts.push('<div class="item" data-path="' + escapeHtml(item.filePath) + '" data-line="' + escapeHtml(item.line || 0) + '">');
            parts.push('<span class="line ' + severityClass + '">' + displayLine + '</span>');
            parts.push('<span>' + escapeHtml(item.message) + '</span>');
            parts.push('</div>');
          }
          parts.push('</div></div>');
        }

        container.innerHTML = parts.join('');
      }

      document.addEventListener('click', (event) => {
        const target = event.target.closest('.item');
        if (!target) {
          return;
        }
        const path = target.getAttribute('data-path');
        const line = Number(target.getAttribute('data-line')) || 0;
        vscodeApi.postMessage({ command: 'reveal', path, line });
      });

      window.addEventListener('message', (event) => {
        if (event.data && event.data.command === 'refresh') {
          render(event.data.payload || {});
        }
      });
    </script>
  </body>
</html>`;
  }
}

function escapeMarkdown(value) {
  return String(value || '')
    .replace(/[\\`*_{}\[\]()#+\-.!]/g, '\\$&');
}
