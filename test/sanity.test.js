const assert = require('assert');
const { EventEmitter } = require('events');

const { parseBlinterOutput } = require('../lib/parser');
const { analyzeLine } = require('../lib/analysis');
const { spawnBlinter } = require('../lib/blinterRunner');

function makeConfig(overrides = {}) {
  const defaults = {
    encoding: 'utf8',
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

function createFakeProcess() {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdout.setEncoding = () => {};
  proc.stderr.setEncoding = () => {};
  proc.kill = () => {
    proc.killed = true;
  };
  proc.killed = false;
  return proc;
}

describe('Sanity tests', () => {
  it('keeps detailed SEC severity aligned as warning', () => {
    const parsed = parseBlinterOutput('Line 8: UNC path detected (SEC002)');
    assert.strictEqual(parsed.length, 1);
    assert.strictEqual(parsed[0].severity, 'warning');
  });

  it('keeps detailed style issues informational and non-critical', () => {
    const result = analyzeLine('Line 2: Prefer CMD extension (S007)', {
      workspaceRoot: undefined,
      defaultFile: 'C:\\repo\\sample.bat',
      variableIndex: new Map()
    });
    assert.strictEqual(result.issues.length, 1);
    assert.strictEqual(result.issues[0].severity, 'information');
    assert.strictEqual(result.issues[0].isCritical, false);
  });

  it('flushes trailing stdout data without a newline on process close', () => {
    let proc;
    const lines = [];
    spawnBlinter({
      exePath: 'blinter.exe',
      config: makeConfig(),
      filePath: 'C:\\repo\\sample.bat',
      spawnImpl: () => {
        proc = createFakeProcess();
        return proc;
      },
      onLine: (line) => lines.push(line),
      onExit: () => {}
    });

    proc.stdout.emit('data', 'first line\nlast line');
    proc.emit('close', 0);
    assert.deepStrictEqual(lines, ['first line', 'last line']);
  });
});
