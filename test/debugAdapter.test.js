const assert = require('assert');
const { EventEmitter } = require('events');

const { InlineDebugAdapterSession } = require('../lib/debugAdapterCore');

function createFakeProcess() {
  const processEmitter = new EventEmitter();
  processEmitter.stdout = new EventEmitter();
  processEmitter.stderr = new EventEmitter();
  processEmitter.stdout.setEncoding = () => {};
  processEmitter.stderr.setEncoding = () => {};
  processEmitter.kill = () => {
    processEmitter.killed = true;
  };
  processEmitter.pid = 321;
  return processEmitter;
}

describe('InlineDebugAdapterSession', () => {
  it('streams output to controller and emits DAP lifecycle events', async () => {
    const capturedMessages = [];
    const accepted = [];
    const exits = [];
    const logs = [];
    const prepared = [];

    const controller = {
      currentProgramPath: 'C:/workspace/script.bat',
      prepareForLaunch: (launchArgs, session) => {
        prepared.push({ launchArgs, session });
        return {
          executable: 'blinter.exe',
          args: ['script.bat'],
          cwd: 'C:/workspace',
          displayName: 'script.bat'
        };
      },
      acceptProcessText: (text, channel) => {
        accepted.push({ text, channel });
      },
      handleProcessExit: (code) => {
        exits.push(code);
      },
      log: (message) => {
        logs.push(message);
      }
    };

    let fakeProcess;
    const adapter = new InlineDebugAdapterSession(controller, { id: 'session-1' }, {
      spawn: (command, args, options) => {
        assert.strictEqual(command, 'blinter.exe');
        assert.deepStrictEqual(args, ['script.bat']);
        assert.strictEqual(options.cwd, 'C:/workspace');
        fakeProcess = createFakeProcess();
        return fakeProcess;
      }
    });

    adapter.onDidSendMessage((message) => capturedMessages.push(message));

    adapter.handleMessage({ type: 'request', seq: 1, command: 'initialize' });
    adapter.handleMessage({ type: 'request', seq: 2, command: 'launch', arguments: { program: 'script.bat' } });
    await new Promise((resolve) => setImmediate(resolve));

    assert.strictEqual(prepared.length, 1);
    assert.strictEqual(fakeProcess instanceof EventEmitter, true);

    fakeProcess.stdout.emit('data', 'first line\nsecond line\npartial');
    fakeProcess.stderr.emit('data', 'warning line\n');
    fakeProcess.stdout.emit('data', ' tail\n');

    assert.deepStrictEqual(accepted, [
      { text: 'first line', channel: 'stdout' },
      { text: 'second line', channel: 'stdout' },
      { text: 'warning line', channel: 'stderr' },
      { text: 'partial tail', channel: 'stdout' } // after concatenation across chunks
    ]);

    fakeProcess.emit('close', 0);
    assert.deepStrictEqual(exits, [0]);

    const initializeResponse = capturedMessages.find((msg) => msg.command === 'initialize');
    assert.ok(initializeResponse);
    assert.strictEqual(initializeResponse.type, 'response');

    const launchedProcessEvent = capturedMessages.find((msg) => msg.event === 'process');
    assert.ok(launchedProcessEvent);
    assert.strictEqual(launchedProcessEvent.body.systemProcessId, 321);

    const exitedEvent = capturedMessages.filter((msg) => msg.event === 'exited');
    assert.strictEqual(exitedEvent.length, 1);
    assert.strictEqual(exitedEvent[0].body.exitCode, 0);

    adapter.dispose();
    assert.strictEqual(adapter.inner, undefined);
  });
});

