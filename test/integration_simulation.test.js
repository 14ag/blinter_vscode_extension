const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

function waitForDebugTermination(timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (disposable) {
        disposable.dispose();
      }
      reject(new Error(`Timed out waiting for debug termination after ${timeoutMs}ms`));
    }, timeoutMs);

    const disposable = vscode.debug.onDidTerminateDebugSession((session) => {
      if (session.type !== 'blinter-debug') {
        return;
      }
      clearTimeout(timer);
      disposable.dispose();
      resolve(session);
    });
  });
}

suite('Integration (simulation) - debugger + suppressions', () => {
  test('validates launch/debug + suppression UI contributions', () => {
    const projectRoot = path.join(__dirname, '..');
    const packageJsonPath = path.join(projectRoot, 'package.json');
    const extensionJsPath = path.join(projectRoot, 'extension.js');

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const commands = (packageJson.contributes && packageJson.contributes.commands) || [];
    const viewTitleMenus = (packageJson.contributes && packageJson.contributes.menus && packageJson.contributes.menus['view/title']) || [];
    const debuggers = (packageJson.contributes && packageJson.contributes.debuggers) || [];

    assert.strictEqual(
      commands.some((cmd) => cmd && cmd.command === 'blinter.removeAllSuppressions'),
      true,
      'Expected blinter.removeAllSuppressions command contribution'
    );
    assert.strictEqual(
      viewTitleMenus.some((entry) => entry && entry.command === 'blinter.removeAllSuppressions' && entry.when === 'view == blinter.outputSummary'),
      true,
      'Expected remove-all-suppressions action to be contributed to Blinter Output view title'
    );

    const blinterDebugger = debuggers.find((dbg) => dbg && dbg.type === 'blinter-debug');
    assert.ok(blinterDebugger, 'Expected blinter-debug debugger contribution');
    const matchingInitial = (blinterDebugger.initialConfigurations || []).filter((cfg) =>
      cfg
      && cfg.type === 'blinter-debug'
      && cfg.name === 'Launch Batch (Blinter)'
      && cfg.request === 'launch'
    );
    assert.strictEqual(
      matchingInitial.length,
      1,
      'Expected exactly one "Launch Batch (Blinter)" initial configuration contribution'
    );

    const extensionSource = fs.readFileSync(extensionJsPath, 'utf8');
    assert.strictEqual(
      extensionSource.includes('provideDebugConfigurations('),
      false,
      'Expected provideDebugConfigurations() to be removed to prevent duplicate launch entries'
    );
    assert.strictEqual(
      extensionSource.includes('removeSuppressionsBtn'),
      true,
      'Expected Blinter Output webview HTML to include remove-suppressions button'
    );
  });

  test('inserts suppression via quick fix and removes it via button command path', async function () {
    this.timeout(90000);

    const ext = vscode.extensions.getExtension('14ag.blinter');
    if (ext) {
      await ext.activate();
    }

    const samplePath = path.join(__dirname, '..', 'tmp', 'simulation-debug-target.bat');
    const sampleContent = [
      '@echo off',
      'set foo=bar',
      'echo %foo%'
    ].join('\r\n') + '\r\n';

    fs.writeFileSync(samplePath, sampleContent, 'utf8');

    const doc = await vscode.workspace.openTextDocument(samplePath);
    await vscode.window.showTextDocument(doc, { preview: false });

    const terminated = waitForDebugTermination();
    const started = await vscode.debug.startDebugging(undefined, {
      type: 'blinter-debug',
      name: 'Launch Batch (Blinter) - simulation',
      request: 'launch',
      program: samplePath
    });

    assert.strictEqual(started, true, 'Expected debug session to start');
    await vscode.commands.executeCommand('workbench.view.debug');
    const allCommands = await vscode.commands.getCommands(true);
    const focusCommand = allCommands.find((c) => c === 'blinter.outputSummary.focus');
    if (focusCommand) {
      await vscode.commands.executeCommand(focusCommand);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));

    const outputViewState = await vscode.commands.executeCommand('blinter.test.getOutputViewState');
    assert.strictEqual(
      Boolean(outputViewState && outputViewState.viewResolved),
      true,
      `Blinter Output view did not resolve during debug run. State: ${JSON.stringify(outputViewState)}`
    );
    assert.strictEqual(
      Boolean(outputViewState && outputViewState.containsRemoveSuppressionsButton),
      true,
      `Remove All Suppressions button not found in webview HTML. State: ${JSON.stringify(outputViewState)}`
    );
    assert.strictEqual(
      Boolean(outputViewState && outputViewState.containsRemoveSuppressionsHandler),
      true,
      `Remove-suppressions message handler missing in webview HTML. State: ${JSON.stringify(outputViewState)}`
    );

    await terminated;
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const diagnostics = vscode.languages.getDiagnostics(doc.uri);
    const hasWarning = diagnostics.some((d) => d.severity === vscode.DiagnosticSeverity.Warning);
    const hasInformation = diagnostics.some((d) => d.severity === vscode.DiagnosticSeverity.Information);

    assert.strictEqual(
      hasWarning,
      true,
      `Expected at least one warning diagnostic. Saw: ${diagnostics.map((d) => `${d.code || 'NO_CODE'}:${d.severity}`).join(', ')}`
    );
    assert.strictEqual(
      hasInformation,
      true,
      `Expected at least one information diagnostic. Saw: ${diagnostics.map((d) => `${d.code || 'NO_CODE'}:${d.severity}`).join(', ')}`
    );

    const commands = await vscode.commands.getCommands(true);
    assert.strictEqual(
      commands.includes('blinter.removeAllSuppressions'),
      true,
      'Expected blinter.removeAllSuppressions command to be registered'
    );

    const firstDiagnostic = diagnostics.find((d) => d.source === 'blinter');
    assert.ok(firstDiagnostic, 'Expected at least one blinter diagnostic to create suppression from');

    const quickFixActions = await vscode.commands.executeCommand(
      'vscode.executeCodeActionProvider',
      doc.uri,
      firstDiagnostic.range,
      'quickfix'
    );
    const suppressAction = (quickFixActions || []).find((action) =>
      action
      && typeof action.title === 'string'
      && action.title.toLowerCase().startsWith('blinter: suppress ')
    );
    assert.ok(suppressAction, 'Expected a Blinter suppression quick fix action');

    if (suppressAction.edit) {
      const appliedSuppressEdit = await vscode.workspace.applyEdit(suppressAction.edit);
      assert.strictEqual(appliedSuppressEdit, true, 'Expected suppression quick-fix edit to apply');
    }
    if (suppressAction.command) {
      await vscode.commands.executeCommand(
        suppressAction.command.command,
        ...(Array.isArray(suppressAction.command.arguments) ? suppressAction.command.arguments : [])
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 300));

    const withSuppressionText = (await vscode.workspace.openTextDocument(samplePath)).getText();
    assert.strictEqual(
      /LINT:IGNORE(?:-LINE)?/i.test(withSuppressionText),
      true,
      `Expected suppression comment to be inserted by quick fix, but file was:\n${withSuppressionText}`
    );

    // The UI button posts this exact command path.
    await vscode.commands.executeCommand('blinter.removeAllSuppressions');
    await new Promise((resolve) => setTimeout(resolve, 300));

    const updatedDoc = await vscode.workspace.openTextDocument(samplePath);
    const updatedText = updatedDoc.getText();

    assert.strictEqual(
      /LINT:IGNORE(?:-LINE)?/i.test(updatedText),
      false,
      `Expected suppression comments to be removed, but file was:\n${updatedText}`
    );
    assert.strictEqual(
      /\bset foo=bar\b/i.test(updatedText),
      true,
      'Expected script body to remain after suppression removal'
    );
  });
});
