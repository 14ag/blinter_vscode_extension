const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const cp = require('child_process');

const { getExePath, buildArgs, spawnBlinter } = require('./lib/blinterRunner');
const { analyzeLine, buildVariableIndexFromFile } = require('./lib/analysis');
const { parseBlinterOutput } = require('./lib/parser');
const { InlineDebugAdapterSession } = require('./lib/debugAdapterCore');

function activate(context) {
  if (process.platform !== 'win32') {
    vscode.window.showErrorMessage('Blinter only supports Windows OS. Extension will not be activated.');
    return;
  }

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
          let editor = vscode.window.activeTextEditor;
          // Robust check for batch file in active or visible editors
          if (!editor || (editor.document.languageId !== 'bat' && editor.document.languageId !== 'cmd')) {
            editor = vscode.window.visibleTextEditors.find(e => e.document.languageId === 'bat' || e.document.languageId === 'cmd');
          }

          if (editor) {
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

        // Resolve ${file} and ${fileBasename} variables if present
        if (config.program === '${file}' || config.program === '${fileBasename}') {
          let editor = vscode.window.activeTextEditor;

          // If active editor is not a batch file, check visible editors
          if (!editor || (editor.document.languageId !== 'bat' && editor.document.languageId !== 'cmd')) {
            editor = vscode.window.visibleTextEditors.find(e => e.document.languageId === 'bat' || e.document.languageId === 'cmd');
          }

          if (editor && (editor.document.languageId === 'bat' || editor.document.languageId === 'cmd')) {
            config.program = editor.document.uri.fsPath;
          } else {
            vscode.window.showErrorMessage('No active batch file found. Open a .bat or .cmd file first to use ${file}.');
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

  // "Blinter: Create Config File" command (Task 8)
  context.subscriptions.push(vscode.commands.registerCommand('blinter.createConfig', async () => {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      vscode.window.showErrorMessage('No workspace folder open. Open a workspace first.');
      return;
    }
    const workspaceRoot = folders[0].uri.fsPath;
    const iniPath = path.join(workspaceRoot, 'blinter.ini');

    if (fs.existsSync(iniPath)) {
      const overwrite = await vscode.window.showWarningMessage(
        'blinter.ini already exists in the workspace root. Overwrite?',
        'Yes', 'No'
      );
      if (overwrite !== 'Yes') {
        return;
      }
    }

    const exePath = getExePath(context.extensionUri);
    const proc = cp.spawn(exePath, ['--create-config'], {
      cwd: workspaceRoot,
      windowsHide: true
    });

    let stderr = '';
    if (proc.stderr) {
      proc.stderr.setEncoding('utf8');
      proc.stderr.on('data', (d) => { stderr += String(d); });
    }

    proc.on('close', async (code) => {
      if (code === 0 && fs.existsSync(iniPath)) {
        const doc = await vscode.workspace.openTextDocument(iniPath);
        vscode.window.showTextDocument(doc);
      } else {
        controller.log(`[CreateConfig] Failed (code ${code}): ${stderr}`);
        vscode.window.showErrorMessage('Failed to create blinter.ini. Check the Blinter Output channel for details.');
      }
    });

    proc.on('error', (err) => {
      controller.log(`[CreateConfig] Error: ${err.message}`);
      vscode.window.showErrorMessage('Failed to run Blinter. Check the Blinter Output channel for details.');
    });
  }));
}

function deactivate() { }

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

    // Current lint run cancellation handle
    this._currentLintHandle = null;

    this.decorationType = this.createDecorationType();

    // Suppression line decoration (Task 7)
    this.suppressionDecorationType = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: 'rgba(128, 128, 128, 0.12)',
      overviewRulerColor: 'rgba(128, 128, 128, 0.3)',
      overviewRulerLane: vscode.OverviewRulerLane.Center
    });

    context.subscriptions.push(this.output);
    context.subscriptions.push(this.diagnostics);
    context.subscriptions.push(this.decorationType);
    context.subscriptions.push(this.suppressionDecorationType);
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

    // Existing command-casing quick fixes
    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider('bat', this.createQuickFixProvider(), {
        providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
      })
    );

    // Suppression comment code actions (Task 6)
    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider('bat', this.createSuppressionProvider(), {
        providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
      })
    );

    context.subscriptions.push(
      vscode.debug.registerDebugAdapterDescriptorFactory('blinter-debug', new BlinterDebugAdapterFactory(this))
    );

    context.subscriptions.push(
      vscode.window.onDidChangeVisibleTextEditors(() => {
        this.refreshDecorations();
        this.refreshSuppressionDecorations();
      })
    );

    context.subscriptions.push(
      vscode.workspace.onDidCloseTextDocument((doc) => this.clearDocument(doc.uri))
    );

    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('blinter.criticalHighlightColor')) {
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

    // Status bar indicator for blinter.ini (Task 9)
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    context.subscriptions.push(this.statusBarItem);
    this._updateConfigStatusBar();

    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(() => this._updateConfigStatusBar())
    );
    context.subscriptions.push(
      vscode.workspace.onDidCreateFiles(() => this._updateConfigStatusBar())
    );
    context.subscriptions.push(
      vscode.workspace.onDidDeleteFiles(() => this._updateConfigStatusBar())
    );

    this.updateStatus('idle');
    this.updateWebview();
    this.refreshDecorations();
  }

  /** Task 9: Update the blinter.ini status bar indicator */
  _updateConfigStatusBar() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || (editor.document.languageId !== 'bat' && editor.document.languageId !== 'cmd')) {
      this.statusBarItem.hide();
      return;
    }

    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      this.statusBarItem.hide();
      return;
    }

    const iniPath = path.join(folders[0].uri.fsPath, 'blinter.ini');
    if (fs.existsSync(iniPath)) {
      this.statusBarItem.text = '$(gear) blinter.ini';
      this.statusBarItem.tooltip = 'Workspace Blinter config active';
      this.statusBarItem.command = {
        command: 'vscode.open',
        arguments: [vscode.Uri.file(iniPath)],
        title: 'Open blinter.ini'
      };
    } else {
      this.statusBarItem.text = '$(circle-slash) No blinter.ini';
      this.statusBarItem.tooltip = 'Click to create a Blinter config file';
      this.statusBarItem.command = 'blinter.createConfig';
    }
    this.statusBarItem.show();
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

  /** Task 6: Suppression comment code action provider */
  createSuppressionProvider() {
    return {
      provideCodeActions: (document, range, context) => {
        if (document.languageId !== 'bat') {
          return [];
        }

        const blinterDiags = context.diagnostics.filter(d => d.source === 'blinter' && d.code);
        if (blinterDiags.length === 0) {
          return [];
        }

        const config = vscode.workspace.getConfiguration('blinter');
        const commentStyle = config.get('suppressionCommentStyle', 'REM') || 'REM';
        const actions = [];

        // Collect unique codes on this line
        const codes = [...new Set(blinterDiags.map(d => String(d.code)))];
        const codeList = codes.join(', ');

        const lineIndex = range.start.line;
        const lineText = document.lineAt(lineIndex).text;

        // Action 1: Suppress on this line (LINT:IGNORE-LINE)
        {
          const label = codes.length === 1
            ? `Blinter: Suppress ${codes[0]} on this line`
            : `Blinter: Suppress ${codeList} on this line`;
          const action = new vscode.CodeAction(label, vscode.CodeActionKind.QuickFix);
          action.edit = new vscode.WorkspaceEdit();
          action.diagnostics = [...blinterDiags];

          // Check if line already has a LINT:IGNORE-LINE comment
          const ignoreLineMatch = lineText.match(/(?:REM|::)\s+LINT:IGNORE-LINE\s+(.*)/i);
          if (ignoreLineMatch) {
            // Merge codes
            const existingCodes = ignoreLineMatch[1].split(',').map(c => c.trim());
            const allCodes = [...new Set([...existingCodes, ...codes])];
            const newComment = `${commentStyle} LINT:IGNORE-LINE ${allCodes.join(', ')}`;
            const commentStart = lineText.search(/(?:REM|::)\s+LINT:IGNORE-LINE/i);
            const replaceRange = new vscode.Range(lineIndex, commentStart, lineIndex, lineText.length);
            action.edit.replace(document.uri, replaceRange, newComment);
          } else if (lineText.trimEnd().endsWith('^')) {
            // Line continuation — insert on new line above instead
            const indent = lineText.match(/^(\s*)/)[1];
            const insertPos = new vscode.Position(lineIndex, 0);
            action.edit.insert(document.uri, insertPos, `${indent}${commentStyle} LINT:IGNORE-LINE ${codeList}\r\n`);
          } else {
            // Append to end of line
            const endPos = new vscode.Position(lineIndex, lineText.length);
            action.edit.insert(document.uri, endPos, `  ${commentStyle} LINT:IGNORE-LINE ${codeList}`);
          }
          actions.push(action);
        }

        // Action 2: Suppress next occurrence (LINT:IGNORE above)
        {
          const label = codes.length === 1
            ? `Blinter: Suppress ${codes[0]} on next occurrence`
            : `Blinter: Suppress ${codeList} on next occurrence`;
          const action = new vscode.CodeAction(label, vscode.CodeActionKind.QuickFix);
          action.edit = new vscode.WorkspaceEdit();
          action.diagnostics = [...blinterDiags];

          // Check if line above already has a LINT:IGNORE comment
          if (lineIndex > 0) {
            const aboveLine = document.lineAt(lineIndex - 1).text;
            const ignoreMatch = aboveLine.match(/(?:REM|::)\s+LINT:IGNORE\s+(.*)/i);
            if (ignoreMatch) {
              const existingCodes = ignoreMatch[1].split(',').map(c => c.trim());
              const allCodes = [...new Set([...existingCodes, ...codes])];
              const newComment = `${commentStyle} LINT:IGNORE ${allCodes.join(', ')}`;
              const commentStart = aboveLine.search(/(?:REM|::)\s+LINT:IGNORE\s/i);
              const replaceRange = new vscode.Range(lineIndex - 1, commentStart, lineIndex - 1, aboveLine.length);
              action.edit.replace(document.uri, replaceRange, newComment);
              actions.push(action);
              return actions;
            }
          }

          const indent = lineText.match(/^(\s*)/)[1];
          const insertPos = new vscode.Position(lineIndex, 0);
          action.edit.insert(document.uri, insertPos, `${indent}${commentStyle} LINT:IGNORE ${codeList}\r\n`);
          actions.push(action);
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
    const colorFromConfig = vscode.workspace.getConfiguration('blinter').get('criticalHighlightColor', '#5a1124');
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

  async prepareForLaunch(args, session) {
    this.clearIssues();

    if (!args || !args.program) {
      throw new Error('Launch configuration is missing the "program" field.');
    }

    const config = vscode.workspace.getConfiguration('blinter');
    if (!config.get('enabled', true)) {
      throw new Error('Blinter is disabled in settings. Enable "blinter.enabled" to run debugging.');
    }

    // Expose configured encoding for the debug adapter session to consume
    this.currentEncoding = config.get('encoding', 'utf8') || 'utf8';

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

    const exePath = getExePath(this.context.extensionUri);
    const cliArgs = buildArgs(config, programPath);
    const userArgs = Array.isArray(args.args) ? args.args.filter((value) => typeof value === 'string' && value.trim().length > 0) : [];
    const fullArgs = [...cliArgs, ...userArgs];

    this.currentProgramPath = programPath;
    this.currentWorkspaceRoot = workspaceFolder || path.dirname(programPath);
    this.variableIndex = buildVariableIndexFromFile(programPath, fs);
    this.updateStatus('running', path.basename(programPath));
    this.webviewProvider?.ensureVisible();
    this.updateWebview();

    this.log(`Launching Blinter: ${exePath} ${fullArgs.map((a) => JSON.stringify(a)).join(' ')}`);

    return {
      executable: exePath,
      args: fullArgs,
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
    this.refreshSuppressionDecorations();
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
      info: vscode.DiagnosticSeverity.Information,
      information: vscode.DiagnosticSeverity.Information,
      hint: vscode.DiagnosticSeverity.Hint
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
      const criticalRanges = [];

      for (const issue of issues) {
        if (!issue.isCritical) {
          continue;
        }
        const lineIndex = Math.max(0, (issue.line || 1) - 1);
        if (lineIndex >= editor.document.lineCount) {
          continue;
        }
        const lineRange = editor.document.lineAt(lineIndex).range;
        criticalRanges.push(lineRange);
      }

      editor.setDecorations(this.decorationType, criticalRanges);
    }
  }

  /** Task 7: Scan for LINT:IGNORE / LINT:IGNORE-LINE comments and apply suppression decorations */
  refreshSuppressionDecorations() {
    if (!this.suppressionDecorationType) {
      return;
    }

    const SUPPRESSION_RE = /(?:REM|::)\s+LINT:IGNORE(?:-LINE)?\s/i;
    const editors = vscode.window.visibleTextEditors;
    for (const editor of editors) {
      if (editor.document.languageId !== 'bat' && editor.document.languageId !== 'cmd') {
        editor.setDecorations(this.suppressionDecorationType, []);
        continue;
      }

      const ranges = [];
      const text = editor.document.getText();
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (SUPPRESSION_RE.test(lines[i])) {
          ranges.push(editor.document.lineAt(i).range);
          // Also dim the target line (the one below for LINT:IGNORE, same line for LINT:IGNORE-LINE)
          if (/LINT:IGNORE\s/i.test(lines[i]) && !/LINT:IGNORE-LINE/i.test(lines[i])) {
            // LINT:IGNORE applies to the next line
            if (i + 1 < lines.length) {
              ranges.push(editor.document.lineAt(i + 1).range);
            }
          }
        }
      }
      editor.setDecorations(this.suppressionDecorationType, ranges);
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
      { id: 'critical', label: 'Critical Issues', filter: (issue) => issue.isCritical }
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
    this.refreshSuppressionDecorations();
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

    // Cancel any in-flight lint run
    if (this._currentLintHandle) {
      this._currentLintHandle.kill();
      this._currentLintHandle = null;
    }

    const exePath = getExePath(this.context.extensionUri);

    const workspaceFolder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
      ? vscode.workspace.workspaceFolders[0].uri.fsPath
      : path.dirname(filePath);

    this.currentProgramPath = filePath;
    this.currentWorkspaceRoot = workspaceFolder;
    this.variableIndex = buildVariableIndexFromFile(filePath, fs);

    const cliArgs = buildArgs(config, filePath);
    const fullArgs = [...cliArgs];

    this.log(`[Linter] Running: ${exePath} ${fullArgs.map((a) => JSON.stringify(a)).join(' ')}`);

    // Clear previous diagnostics for this file
    this.diagnostics.delete(document.uri);
    const fileIssues = this.issuesByFile.get(filePath) || [];
    if (fileIssues.length > 0) {
      this.issuesByFile.set(filePath, []);
    }

    try {
      let stdout = '';
      let stderr = '';

      const encoding = config.get('encoding', 'utf8') || 'utf8';
      const proc = cp.spawn(exePath, fullArgs, {
        cwd: path.dirname(filePath),
        windowsHide: true
      });

      if (proc.stdout && typeof proc.stdout.setEncoding === 'function') {
        try { proc.stdout.setEncoding(encoding); } catch { proc.stdout.setEncoding('utf8'); }
      }
      if (proc.stderr && typeof proc.stderr.setEncoding === 'function') {
        try { proc.stderr.setEncoding(encoding); } catch { proc.stderr.setEncoding('utf8'); }
      }

      this._currentLintHandle = {
        kill: () => { if (proc && !proc.killed) { try { proc.kill(); } catch { } } }
      };

      if (proc.stdout) proc.stdout.on('data', (data) => { stdout += String(data); });
      if (proc.stderr) proc.stderr.on('data', (data) => { stderr += String(data); });

      proc.on('error', (err) => {
        this._currentLintHandle = null;
        const msg = err && err.message ? err.message : String(err);
        this.log(`[Linter] Process error: ${msg}`);
        vscode.window.showErrorMessage(`Failed to run Blinter: ${msg}`);
      });

      proc.on('close', () => {
        this._currentLintHandle = null;

        if (stderr && stderr.trim()) {
          this.log(`[Linter] stderr: ${stderr}`);
        }

        const parsed = parseBlinterOutput(stdout);
        for (const item of parsed) {
          const lineNumber = Math.max(0, (item.line || 1) - 1);
          const severityMap = {
            'error': vscode.DiagnosticSeverity.Error,
            'warning': vscode.DiagnosticSeverity.Warning,
            'information': vscode.DiagnosticSeverity.Information,
            'hint': vscode.DiagnosticSeverity.Hint
          };
          const range = new vscode.Range(
            new vscode.Position(lineNumber, 0),
            new vscode.Position(lineNumber, Number.MAX_SAFE_INTEGER)
          );
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
            isCritical: item.severity === 'error' || item.severity === 'warning',
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
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
    }
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
        fake.stdout.setEncoding = () => { };
        fake.stderr.setEncoding = () => { };
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
    .replace(/[\\`*_{}[\]()#+\-.!]/g, '\\$&');
}
