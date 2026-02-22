const fs = require('fs');
const path = require('path');

const REQUIRED_COMMANDS = [
  'blinter.run',
  'blinter.createConfig',
  'blinter.removeAllSuppressions'
];

const REQUIRED_SETTINGS = [
  'blinter.enabled',
  'blinter.runOn',
  'blinter.debounceDelay',
  'blinter.quickFixCodes',
  'blinter.suppressionCommentStyle'
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readJson(jsonPath) {
  return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
}

function assertCondition(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const packageJsonPath = path.join(repoRoot, 'package.json');
  const extensionSourcePath = path.join(repoRoot, 'extension.js');
  const checklistPath = path.join(repoRoot, 'test', 'UAT_CHECKLIST.md');

  const packageJson = readJson(packageJsonPath);
  const extensionSource = fs.readFileSync(extensionSourcePath, 'utf8');

  const commands = (packageJson.contributes && packageJson.contributes.commands) || [];
  const commandIds = commands.map((entry) => entry.command);
  for (const command of REQUIRED_COMMANDS) {
    assertCondition(commandIds.includes(command), `UAT failed: missing command contribution "${command}".`);
  }

  const properties = (packageJson.contributes
    && packageJson.contributes.configuration
    && packageJson.contributes.configuration.properties) || {};
  for (const setting of REQUIRED_SETTINGS) {
    assertCondition(
      Object.prototype.hasOwnProperty.call(properties, setting),
      `UAT failed: missing user setting "${setting}".`
    );
  }

  assertCondition(
    extensionSource.includes('removeSuppressionsBtn'),
    'UAT failed: output view does not render the "Remove All Suppressions" button.'
  );
  assertCondition(
    extensionSource.includes("command: 'removeSuppressions'"),
    'UAT failed: output view does not wire the remove suppressions command handler.'
  );
  assertCondition(
    fs.existsSync(checklistPath),
    'UAT failed: checklist file is missing at test/UAT_CHECKLIST.md.'
  );

  const reportDir = path.join(repoRoot, 'test', 'reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    status: 'pass',
    checks: {
      commands: REQUIRED_COMMANDS,
      settings: REQUIRED_SETTINGS,
      webviewRemoveSuppressionsButton: true,
      webviewRemoveSuppressionsHandler: true,
      checklistPresent: true
    }
  };
  fs.writeFileSync(path.join(reportDir, 'uat-latest.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log('UAT checks passed.');
}

main();
