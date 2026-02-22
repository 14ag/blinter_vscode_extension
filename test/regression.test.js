const assert = require('assert');
const { EventEmitter } = require('events');

const { spawnBlinter } = require('../lib/blinterRunner');
const { InlineDebugAdapterSession } = require('../lib/debugAdapterCore');

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
  proc.pid = 1234;
  return proc;
}

describe('Regression tests', () => {
  it('spawnBlinter calls onExit once when both error and close fire', (done) => {
    let proc;
    const exitCodes = [];

    spawnBlinter({
      exePath: 'blinter.exe',
      config: makeConfig(),
      filePath: 'C:\\repo\\sample.bat',
      spawnImpl: () => {
        proc = createFakeProcess();
        return proc;
      },
      onStderr: () => {},
      onExit: (code) => {
        exitCodes.push(code);
      }
    });

    proc.emit('error', new Error('spawn failed'));
    proc.emit('close', 1);

    setImmediate(() => {
      assert.strictEqual(exitCodes.length, 1);
      assert.strictEqual(exitCodes[0], null);
      done();
    });
  });

  it('debug adapter emits terminated once when process emits error then close', async () => {
    const messages = [];
    let proc;

    const controller = {
      currentProgramPath: 'C:/repo/sample.bat',
      prepareForLaunch: async () => ({
        executable: 'blinter.exe',
        args: ['sample.bat'],
        cwd: 'C:/repo'
      }),
      acceptProcessText: () => {},
      handleProcessExit: () => {},
      log: () => {}
    };

    const session = new InlineDebugAdapterSession(controller, { id: 'session-1' }, {
      spawn: () => {
        proc = createFakeProcess();
        return proc;
      }
    });

    session.onDidSendMessage((msg) => messages.push(msg));
    session.handleMessage({ type: 'request', seq: 1, command: 'launch', arguments: { program: 'sample.bat' } });
    await new Promise((resolve) => setImmediate(resolve));

    proc.emit('error', new Error('boom'));
    proc.emit('close', 1);
    await new Promise((resolve) => setImmediate(resolve));

    const terminatedEvents = messages.filter((msg) => msg.type === 'event' && msg.event === 'terminated');
    assert.strictEqual(terminatedEvents.length, 1);

    session.dispose();
  });
});
