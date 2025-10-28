const assert = require('assert');

// `vscode` is only available when tests run inside the VS Code test runner.
// If it's not available, skip these integration-style tests so `npm run test:unit`
// (plain mocha) can run unit tests without failing.
let vscode;
try {
  // eslint-disable-next-line global-require
  vscode = require('vscode');
} catch (e) {
  console.log('Skipping extension integration tests: vscode module not available in this environment.');
  // Export an empty module so Mocha exits cleanly.
  module.exports = {};
  // Do not use `return` at top-level; guard runtime behavior by checking `vscode` below.
}

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
// const myExtension = require('../extension');

if (vscode) {
  suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Sample test', () => {
      assert.strictEqual(-1, [1, 2, 3].indexOf(5));
      assert.strictEqual(-1, [1, 2, 3].indexOf(0));
    });
  });
}
