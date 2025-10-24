// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "blinter" is now active!');

	// Output channel for Blinter logs
	const output = vscode.window.createOutputChannel('Blinter');
	context.subscriptions.push(output);

	// Diagnostics collection
	const diagnostics = vscode.languages.createDiagnosticCollection('blinter');
	context.subscriptions.push(diagnostics);

	// Status bar item
	const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	statusBar.text = 'Blinter';
	statusBar.tooltip = 'Run Blinter';
	statusBar.command = 'blinter.run';
	context.subscriptions.push(statusBar);

	function updateStatusBar() {
		const editor = vscode.window.activeTextEditor;
		if (editor && (editor.document.languageId === 'bat')) {
			statusBar.show();
		} else {
			statusBar.hide();
		}
	}

	// Register existing helloWorld command
	const hello = vscode.commands.registerCommand('blinter.helloWorld', function () {
		vscode.window.showInformationMessage('Hello World from blinter!');
	});
	context.subscriptions.push(hello);

	// Add required modules for runner
	const cp = require('child_process');
	const fs = require('fs');
	const path = require('path');

	// Keep a small map of debounce timers for onType behavior
	const debounceTimers = new Map();

	// Map Blinter severity to vscode DiagnosticSeverity
	function mapSeverity(s) {
		const sev = (s || '').toUpperCase();
		if (sev === 'INFO') return vscode.DiagnosticSeverity.Information;
		if (sev === 'WARN' || sev === 'WARNING') return vscode.DiagnosticSeverity.Warning;
		return vscode.DiagnosticSeverity.Error; // ERROR, FATAL -> Error
	}

	// Use parser utility to parse raw stdout into structured issues
	const { parseBlinterOutput } = require('./lib/parser');

	async function runBlinterOnDocument(document) {
		try {
			const config = vscode.workspace.getConfiguration('blinter');
			if (!config.get('enabled', true)) {
				output.appendLine('Blinter disabled via settings.');
				return;
			}

			if (document.languageId !== 'bat') {
				output.appendLine('Blinter: skipped non-bat file');
				return;
			}

			const filePath = document.fileName;
			output.appendLine(`Running Blinter on ${filePath}`);
			output.show(true);

			// Prefer a native Windows executable in bin/ (blinter.exe) for Windows users.
			// Fallback to bundled blinter.py if no executable is present.
			const binExe = path.join(context.extensionPath, 'bin', process.platform === 'win32' ? 'blinter.exe' : 'blinter');
			const bundledScript = path.join(context.extensionPath, 'assets', 'blinter.py');
			let runnerMode = null; // 'exe' | 'python'
			let scriptPath = null;

			if (fs.existsSync(binExe)) {
				runnerMode = 'exe';
				scriptPath = binExe;
			} else if (fs.existsSync(bundledScript)) {
				runnerMode = 'python';
				scriptPath = bundledScript;
			} else {
				// Look for blinter.py at extension root as a last resort
				const rootScript = path.join(context.extensionPath, 'blinter.py');
				if (fs.existsSync(rootScript)) {
					runnerMode = 'python';
					scriptPath = rootScript;
				}
			}

			const pythonPath = config.get('pythonPath') || 'python';
			const rulesPath = config.get('rulesPath') || null;

			// Clear previous diagnostics for this doc
			diagnostics.delete(document.uri);

			if (!scriptPath) {
				const msg = 'Blinter script not found in extension. Place blinter.py under the extension `assets/` folder or set `blinter.pythonPath` to a system python that can run Blinter.';
				output.appendLine(msg);
				vscode.window.showWarningMessage('Blinter script not found. See Output -> Blinter for details.');
				return;
			}

			// Spawn the blinter process according to the runner mode
			statusBar.text = '$(sync~spin) Blinter';
			statusBar.show();

			let proc;
			if (runnerMode === 'exe') {
				// Native executable: call it directly with file path and optional rules
				const args = [filePath];
				if (rulesPath) args.push('--rules', rulesPath);
				output.appendLine(`${scriptPath} ${args.map(a => JSON.stringify(a)).join(' ')}`);
				proc = cp.spawn(scriptPath, args, { cwd: context.extensionPath });
			} else {
				// Python mode: run python <script> <file> [--rules <rules>]
				const args = [scriptPath, filePath];
				if (rulesPath) args.push('--rules', rulesPath);
				output.appendLine(`${pythonPath} ${args.map(a => JSON.stringify(a)).join(' ')}`);
				proc = cp.spawn(pythonPath, args, { cwd: context.extensionPath });
			}

			let stdout = '';
			let stderr = '';

			proc.stdout.on('data', (data) => {
				const s = String(data);
				stdout += s;
				output.append(s);
			});

			proc.stderr.on('data', (data) => {
				const s = String(data);
				stderr += s;
				output.append(s);
			});

			proc.on('error', (err) => {
				output.appendLine(`Failed to start Blinter process: ${err && err.message}`);
				vscode.window.showErrorMessage('Failed to start Blinter process. Ensure Python is installed and configured (`blinter.pythonPath`).');
				statusBar.text = '$(error) Blinter';
			});

			proc.on('close', () => {
				const issues = [];

				// Parse stdout via parser utility
				const parsed = parseBlinterOutput(stdout);
				for (const item of parsed) {
					const lineNumber = Math.max(0, (item.line || 1) - 1);
					let range;
					try {
						const docLine = document.lineAt(lineNumber);
						range = docLine.range;
					} catch {
						range = new vscode.Range(new vscode.Position(lineNumber, 0), new vscode.Position(lineNumber, 0));
					}
					const diag = new vscode.Diagnostic(range, `${item.description} (${item.code})`, mapSeverity(item.severity.toUpperCase()));
					diag.code = item.code;
					issues.push(diag);
				}

				diagnostics.set(document.uri, issues);

				if (issues.length === 0) {
					statusBar.text = '$(check) Blinter';
					output.appendLine('Blinter: no issues found');
				} else {
					statusBar.text = '$(error) Blinter';
					output.appendLine(`Blinter: found ${issues.length} issue(s)`);
				}

				if (stderr && stderr.trim()) {
					output.appendLine('Blinter stderr:');
					output.appendLine(stderr);
				}

				updateStatusBar();
			});
		} catch (ex) {
			output.appendLine(`Blinter runner exception: ${ex && ex.message ? ex.message : String(ex)}`);
			vscode.window.showErrorMessage('Blinter encountered an exception. See Output -> Blinter for details.');
			updateStatusBar();
		}
	}

	// Command to run Blinter on the active editor
	const runCmd = vscode.commands.registerCommand('blinter.run', async function () {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showInformationMessage('No active editor to run Blinter on');
			return;
		}
		await runBlinterOnDocument(editor.document);
	});
	context.subscriptions.push(runCmd);

	// --- CodeActionProvider: quick fixes ---
	const codeActionProvider = {
		provideCodeActions(document, range, context) {
			const actions = [];
			if (document.languageId !== 'bat') return actions;

			const config = vscode.workspace.getConfiguration('blinter');
			const allowedCodes = config.get('quickFixCodes', ['BLINTER_CASE','CMD_CASE','CASE001']);

			// For each diagnostic in the range, propose a normalization quick fix only when allowed
			for (const diag of context.diagnostics) {
				const code = diag.code ? String(diag.code) : '';
				const message = diag.message ? String(diag.message).toLowerCase() : '';

				// Only offer fix if diag code is in configured list OR message hints at casing
				const codeMatches = code && allowedCodes.includes(code);
				const messageHintsCase = message.includes('case') || message.includes('casing');
				if (!codeMatches && !messageHintsCase) continue;

				// Create a quick fix that lowercases the first token of the affected line
				const lineText = document.lineAt(range.start.line).text;
				const m = /^\s*([A-Za-z0-9_@]+)(\b.*)$/m.exec(lineText);
				if (!m) continue;
				const commandToken = m[1];
				const rest = m[2] || '';
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
	context.subscriptions.push(vscode.languages.registerCodeActionsProvider('bat', codeActionProvider, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }));

	// --- Activity Bar view (Webview) ---
	class BlinterViewProvider {
		constructor(context) {
			this.context = context;
		}
		resolveWebviewView(webviewView) {
			webviewView.webview.options = { enableScripts: true };
			webviewView.webview.html = `<!doctype html><html><body>
				<h3>Blinter Actions</h3>
				<button id="run">Run Blinter</button>
				<script>
				const vscode = acquireVsCodeApi();
				document.getElementById('run').addEventListener('click', () => {
					vscode.postMessage({ command: 'run' });
				});
				</script>
				</body></html>`;
			webviewView.webview.onDidReceiveMessage((msg) => {
				if (msg.command === 'run') {
					vscode.commands.executeCommand('blinter.run');
				}
			}, null, this.context.subscriptions);
		}
	}
	const provider = new BlinterViewProvider(context);
	context.subscriptions.push(vscode.window.registerWebviewViewProvider('blinter.view', provider));

	// Automatic triggers based on settings
	const debounceDelay = vscode.workspace.getConfiguration('blinter').get('debounceDelay', 500);

	// onSave
	context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((doc) => {
		const c = vscode.workspace.getConfiguration('blinter');
		if (!c.get('enabled', true)) return;
		if (c.get('runOn', 'onSave') === 'onSave' && doc.languageId === 'bat') {
			runBlinterOnDocument(doc);
		}
	}));

	// onType (debounced)
	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((e) => {
		const c = vscode.workspace.getConfiguration('blinter');
		if (!c.get('enabled', true)) return;
	if (String(c.get('runOn', 'onSave')) !== 'onType') return;
		const doc = e.document;
		if (doc.languageId !== 'bat') return;

		const key = doc.uri.toString();
		if (debounceTimers.has(key)) clearTimeout(debounceTimers.get(key));
		const timeout = setTimeout(() => {
			runBlinterOnDocument(doc);
			debounceTimers.delete(key);
		}, c.get('debounceDelay', debounceDelay));
		debounceTimers.set(key, timeout);
	}));

	// Watch for configuration changes that affect behavior
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
		if (e.affectsConfiguration('blinter')) {
			output.appendLine('Blinter configuration changed.');
		}
	}));

	// Update status bar when active editor changes
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(updateStatusBar));
	context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(updateStatusBar));

	// Initialize status bar visibility
	updateStatusBar();
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
