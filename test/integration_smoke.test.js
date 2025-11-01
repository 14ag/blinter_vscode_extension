const assert = require('assert');
const vscode = require('vscode');
const path = require('path');

suite('Integration (smoke) - Run & Debug single file', () => {
  test('starts debug session for single open .bat file', async function() {
    this.timeout(20000);

  // Resolve sample file relative to the repository root (test file lives under <repo>/test)
  const samplePath = path.join(__dirname, '..', 'tmp', 'sample1.bat');

  // Ensure extension is activated so runtime registrations are present
  const ext = vscode.extensions.getExtension('14ag.blinter');
  if (ext) await ext.activate();

    // Open the sample .bat file in the editor
    const doc = await vscode.workspace.openTextDocument(samplePath);
    await vscode.window.showTextDocument(doc);

    // Start a debug session using the blinter-debug inline adapter (single-file mode)
    const started = await vscode.debug.startDebugging(undefined, {
      type: 'blinter-debug',
      name: 'Launch Batch (Blinter) - smoke',
      request: 'launch',
      program: samplePath
    });

    assert.strictEqual(started, true, 'Expected vscode.debug.startDebugging to return true');

    // Give the extension a moment to register the session and produce outputs
    await new Promise((r) => setTimeout(r, 1200));
  }).timeout(20000);
});
