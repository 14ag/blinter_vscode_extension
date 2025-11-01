const assert = require('assert');
const vscode = require('vscode');

suite('Integration (basic) Test Suite', () => {
    test('blinter.run command is registered', async () => {
        // Ensure our extension is activated so runtime-registered commands are present.
        const ext = vscode.extensions.getExtension('14ag.blinter');
        if (ext) {
            await ext.activate();
        }
        const commands = await vscode.commands.getCommands(true);
        const has = commands.includes('blinter.run');
        assert.strictEqual(has, true, 'blinter.run should be registered');
    }).timeout(10000);
});
