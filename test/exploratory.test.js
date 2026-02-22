const assert = require('assert');

const { parseBlinterOutput } = require('../lib/parser');
const { analyzeLine } = require('../lib/analysis');

function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randomString(rng, length) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 []():-_./\\';
  let text = '';
  for (let i = 0; i < length; i += 1) {
    text += alphabet[Math.floor(rng() * alphabet.length)];
  }
  return text;
}

function maybeStructuredLine(rng, index) {
  const choice = Math.floor(rng() * 5);
  if (choice === 0) {
    return `[WARN] (W${100 + index}) -> ${randomString(rng, 20)} on line ${1 + (index % 200)}`;
  }
  if (choice === 1) {
    return `Line ${1 + (index % 200)}: ${randomString(rng, 24)} (S00${index % 9})`;
  }
  if (choice === 2) {
    return `${randomString(rng, 8)}.bat:${1 + (index % 200)}: warning: ${randomString(rng, 18)}`;
  }
  if (choice === 3) {
    return `set VAR${index % 25}=${randomString(rng, 10)}`;
  }
  return randomString(rng, 45);
}

describe('Exploratory fuzz tests', () => {
  it('parser and analyzer stay stable across randomized mixed input', () => {
    const rng = createRng(0x14a6c0de);
    const lines = [];
    for (let i = 0; i < 2500; i += 1) {
      lines.push(maybeStructuredLine(rng, i));
    }
    const text = lines.join('\n');

    let parsed;
    assert.doesNotThrow(() => {
      parsed = parseBlinterOutput(text);
    });
    assert.ok(Array.isArray(parsed));
    for (const issue of parsed) {
      assert.ok(issue.line >= 1, `Expected positive line number, got ${issue.line}`);
      assert.ok(typeof issue.code === 'string' && issue.code.length > 0);
    }

    const variableIndex = new Map();
    for (const line of lines) {
      assert.doesNotThrow(() => {
        analyzeLine(line, {
          workspaceRoot: 'C:\\repo',
          defaultFile: 'C:\\repo\\sample.bat',
          variableIndex
        });
      });
    }
  });
});
