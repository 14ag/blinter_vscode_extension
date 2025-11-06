const fs = require('fs');
const path = require('path');

function findBlinterExecutable(extensionPath, platform, existsSync, options) {
  existsSync = existsSync || fs.existsSync;
  options = options || {};
  const isWindows = platform === 'win32';
  const exeName = isWindows ? 'blinter.exe' : 'blinter';
  const ExeName = isWindows ? 'Blinter.exe' : 'Blinter';

  // 1) If the user configured an explicit binary path, prefer that
  if (options.binaryPath && typeof options.binaryPath === 'string') {
    try {
      const candidate = path.isAbsolute(options.binaryPath)
        ? options.binaryPath
        : path.join(extensionPath, options.binaryPath);
      if (existsSync(candidate)) return candidate;
    } catch {
      // ignore and continue
    }
  }

  // 2) If user opted to use system blinter, return the command name so spawn can resolve it from PATH
  if (options.useSystemBlinter) {
    return exeName; // let child_process.spawn resolve on PATH (or fail later)
  }

  // 3) Look for bundled binaries under bin/ and bins/
  const candidates = [
    path.join(extensionPath, 'bin', exeName),
    path.join(extensionPath, 'bin', ExeName),
    path.join(extensionPath, 'bins', exeName),
    path.join(extensionPath, 'bins', ExeName)
  ];

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }

  // 4) Fallback: search for versioned executables (Blinter-v*.exe or blinter-*.exe)
  if (isWindows) {
    const binDirs = [
      path.join(extensionPath, 'bin'),
      path.join(extensionPath, 'bins')
    ];

    for (const binDir of binDirs) {
      try {
        const files = fs.readdirSync(binDir);
        const versioned = files.find(f =>
          /^[Bb]linter[-v]?[\d.]+\.exe$/i.test(f)
        );
        if (versioned) {
          const fullPath = path.join(binDir, versioned);
          if (existsSync(fullPath)) return fullPath;
        }
      } catch {
        // Directory doesn't exist or can't be read
      }
    }
  }

  return null;
}

module.exports = { findBlinterExecutable };
