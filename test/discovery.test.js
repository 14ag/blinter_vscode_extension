const assert = require('assert');
const { findBlinterExecutable } = require('../lib/discovery');
const path = require('path');

describe('Discovery tests', () => {
  it('returns bin path when bin contains executable', () => {
    const calls = [];
    const fakeExists = (p) => {
      calls.push(p);
      return p.indexOf(path.join('bin', 'blinter.exe')) !== -1;
    };
    const res = findBlinterExecutable('root', 'win32', fakeExists);
    assert.ok(res && res.indexOf(path.join('bin', 'blinter.exe')) !== -1, 'Expected bin path');
  });

  it('returns bins path when bin missing but bins contains executable', () => {
    const fakeExists = (p) => p.indexOf(path.join('bins', 'blinter.exe')) !== -1;
    const res = findBlinterExecutable('root', 'win32', fakeExists);
    assert.ok(res && res.indexOf(path.join('bins', 'blinter.exe')) !== -1, 'Expected bins path');
  });

  it('returns null when no executable present', () => {
    const fakeExists = () => false;
    const res = findBlinterExecutable('root', 'win32', fakeExists);
    assert.strictEqual(res, null);
  });
});
