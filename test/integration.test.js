const assert = require('assert');
const vscode = require('vscode');

suite('Integration (basic) Test Suite', () => {
    test('blinter.run command is registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        const has = commands.includes('blinter.run');
        assert.strictEqual(has, true, 'blinter.run should be registered');
    }).timeout(5000);
});
