const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const { runTests } = require('@vscode/test-electron');

const PREFERRED_VSCODE_VERSION = '1.105.1';

function resolveUserProfile() {
  if (process.env.USERPROFILE) {
    return process.env.USERPROFILE;
  }
  if (process.env.HOMEDRIVE && process.env.HOMEPATH) {
    return path.join(process.env.HOMEDRIVE, process.env.HOMEPATH);
  }
  return undefined;
}

function getPreferredExecutablePath() {
  const userProfile = resolveUserProfile();
  if (!userProfile) {
    return undefined;
  }
  return path.join(
    userProfile,
    'sauce',
    'testbench',
    '.vscode-test',
    `vscode-win32-x64-archive-${PREFERRED_VSCODE_VERSION}`,
    'Code.exe'
  );
}

function assertLooksLikeVSCodeExecutable(executablePath) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = cp.spawnSync(executablePath, ['--status'], { encoding: 'utf8', env, timeout: 20000 });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (result.status !== 0 || /Usage:\s+node/i.test(output) || !/Version:\s+Code\s+\d+\.\d+\.\d+/i.test(output)) {
    throw new Error(
      `Configured VS Code executable does not report a VS Code version: ${executablePath}`
    );
  }
}

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '..');
    // The test runner entrypoint that bootstraps Mocha and loads tests
    const extensionTestsPath = path.resolve(__dirname, 'suite', 'index.js');

    const preferredExecutable = getPreferredExecutablePath();

    // Allow running tests against a specific VS Code build via VSCODE_VERSION.
    const vscodeVersion = process.env.VSCODE_VERSION || PREFERRED_VSCODE_VERSION;

    const runOptions = {
      extensionDevelopmentPath,
      extensionTestsPath
    };

    if (preferredExecutable && fs.existsSync(preferredExecutable)) {
      try {
        assertLooksLikeVSCodeExecutable(preferredExecutable);
        runOptions.vscodeExecutablePath = preferredExecutable;
        console.log(`Using cached VS Code executable: ${preferredExecutable}`);
      } catch (validationError) {
        const message = validationError instanceof Error ? validationError.message : String(validationError);
        console.warn(`Cached VS Code executable is invalid. Falling back to download. Reason: ${message}`);
        runOptions.version = vscodeVersion;
      }
    } else {
      runOptions.version = vscodeVersion;
      console.log(`Cached VS Code not found. Downloading version: ${vscodeVersion}`);
    }

    // VS Code terminals can inherit ELECTRON_RUN_AS_NODE=1, which breaks Code.exe launches.
    runOptions.extensionTestsEnv = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: undefined,
      BLINTER_TEST_MODE: process.env.BLINTER_TEST_MODE || '1'
    };

    // Download VS Code only when the local executable is not available.
    await runTests(runOptions);
    console.log('VS Code integration tests finished successfully.');
  } catch (err) {
    console.error('Failed to run VS Code integration tests:', err);
    process.exit(1);
  }
}

main();
