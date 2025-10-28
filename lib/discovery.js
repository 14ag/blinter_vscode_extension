const fs = require('fs');
const path = require('path');

function findBlinterExecutable(extensionPath, platform, existsSync) {
  existsSync = existsSync || fs.existsSync;
  const exeName = platform === 'win32' ? 'blinter.exe' : 'blinter';
  const candidates = [
    path.join(extensionPath, 'bin', exeName),
    path.join(extensionPath, 'bins', exeName)
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

module.exports = { findBlinterExecutable };
