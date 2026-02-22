const assert = require('assert');

const { buildArgs, getExePath } = require('../lib/blinterRunner');
const { parseBlinterOutput } = require('../lib/parser');
const { analyzeLine } = require('../lib/analysis');
const { findBlinterExecutable } = require('../lib/discovery');

function makeConfig(overrides = {}) {
  const defaults = {
    followCalls: false,
    minSeverity: 'all',
    enabledRules: [],
    disabledRules: [],
    useConfigFile: true,
    maxLineLength: 100,
    noRecursive: false
  };
  const merged = { ...defaults, ...overrides };
  return {
    get: (key, fallback) => (Object.prototype.hasOwnProperty.call(merged, key) ? merged[key] : fallback)
  };
}

describe('Smoke tests', () => {
  it('executes the core parsing + analysis path without throwing', () => {
    const output = '[WARN] (W001) -> Something happened on line 3';
    const parsed = parseBlinterOutput(output);
    assert.strictEqual(parsed.length, 1);
    assert.strictEqual(parsed[0].code, 'W001');

    const analyzed = analyzeLine(output, {
      workspaceRoot: undefined,
      defaultFile: 'C:\\repo\\sample.bat',
      variableIndex: new Map()
    });
    assert.ok(Array.isArray(analyzed.issues));
    assert.strictEqual(analyzed.issues.length, 1);
    assert.strictEqual(analyzed.issues[0].severity, 'warning');
  });

  it('builds arguments and resolves expected executable locations', () => {
    const args = buildArgs(makeConfig({ followCalls: true, minSeverity: 'warning' }), 'C:\\repo\\sample.bat');
    assert.ok(args.includes('--summary'));
    assert.ok(args.includes('--follow-calls'));
    assert.ok(args.includes('--min-severity'));
    assert.strictEqual(args[args.length - 1], 'C:\\repo\\sample.bat');

    const exePath = getExePath('C:\\repo\\blinter-vscode-extension');
    assert.ok(exePath.endsWith('\\vendor\\Blinter\\Blinter.exe'));
  });

  it('resolves system blinter command when configured', () => {
    const result = findBlinterExecutable(
      'C:\\repo\\blinter-vscode-extension',
      'win32',
      () => false,
      { useSystemBlinter: true }
    );
    assert.strictEqual(result, 'blinter.exe');
  });
});
