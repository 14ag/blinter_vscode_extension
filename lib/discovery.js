const fs = require('fs');
const path = require('path');

function findBlinterExecutable(extensionPath, platform, existsSync) {
  existsSync = existsSync || fs.existsSync;
  const isWindows = platform === 'win32';
  const exeName = isWindows ? 'blinter.exe' : 'blinter';
  const ExeName = isWindows ? 'Blinter.exe' : 'Blinter';
  
  const candidates = [
    // Primary: exact match (blinter.exe or Blinter.exe)
    path.join(extensionPath, 'bin', exeName),
    path.join(extensionPath, 'bin', ExeName),
    path.join(extensionPath, 'bins', exeName),
    path.join(extensionPath, 'bins', ExeName)
  ];
  
  // Check exact matches first
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  
  // Fallback: search for versioned executables (Blinter-v*.exe or blinter-*.exe)
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
