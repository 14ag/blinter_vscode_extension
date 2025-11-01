const path = require('path');
const Mocha = require('mocha');
const glob = require('glob');

function run() {
  // Create the mocha test
  const mocha = new Mocha({
    ui: 'bdd',
    color: true
  });

  // Register both BDD and TDD interfaces so tests can use either `describe/it` or `suite/test`.
  // This directly invokes Mocha's interface installers to set globals inside the extension host.
  try {
    require('mocha/lib/interfaces/bdd')(mocha.suite);
    require('mocha/lib/interfaces/tdd')(mocha.suite);
  } catch (e) {
    // Fallback: alias describe/it to suite/test if interfaces cannot be loaded
    if (typeof global.describe === 'function') global.suite = global.describe;
    if (typeof global.it === 'function') global.test = global.it;
  }

  const testsRoot = path.resolve(__dirname, '..');

  return new Promise((resolve, reject) => {
    try {
      // Use glob.sync to avoid callback vs ESM interop issues
      const files = glob.sync('**/**.test.js', { cwd: testsRoot });
      files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

      mocha.run(failures => {
        if (failures > 0) {
          reject(new Error(`${failures} tests failed.`));
        } else {
          resolve();
        }
      });
    } catch (err) {
      console.error(err);
      reject(err);
    }
  });
}

module.exports = { run };
