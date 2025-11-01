const path = require('path');
const { runTests } = require('@vscode/test-electron');

async function main() {
  try {
  const extensionDevelopmentPath = path.resolve(__dirname, '..');
  // The test runner entrypoint that bootstraps Mocha and loads tests
  const extensionTestsPath = path.resolve(__dirname, 'suite', 'index.js');

  // Allow running tests against a specific VS Code build (e.g. 'insiders') via
  // the VSCODE_VERSION env var. If not provided, runTests will choose default.
  const vscodeVersion = process.env.VSCODE_VERSION || undefined;

  // Download VS Code, install extensions, and run the test suite
  await runTests({ extensionDevelopmentPath, extensionTestsPath, version: vscodeVersion });
    console.log('VS Code integration tests finished successfully.');
  } catch (err) {
    console.error('Failed to run VS Code integration tests:', err);
    process.exit(1);
  }
}

main();
