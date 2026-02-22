const assert = require('assert');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SECURITY_SCAN_DIRS = [
  'extension.js',
  'lib',
  'test',
  'tools'
];

function collectJavaScriptFiles(entryPath) {
  const fullPath = path.join(REPO_ROOT, entryPath);
  if (!fs.existsSync(fullPath)) {
    return [];
  }

  const stat = fs.statSync(fullPath);
  if (stat.isFile()) {
    return fullPath.endsWith('.js') ? [fullPath] : [];
  }

  const files = [];
  const stack = [fullPath];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const nextPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(nextPath);
      } else if (entry.isFile() && nextPath.endsWith('.js')) {
        files.push(nextPath);
      }
    }
  }
  return files;
}

function readScannedSources() {
  const files = SECURITY_SCAN_DIRS.flatMap((entry) => collectJavaScriptFiles(entry));
  return files.map((filePath) => ({
    filePath,
    content: fs.readFileSync(filePath, 'utf8')
  }));
}

describe('Security tests', () => {
  it('does not use dynamic code execution primitives', () => {
    const sources = readScannedSources();
    const bannedPatterns = [
      { name: 'eval', regex: /\beval\s*\(/ },
      { name: 'Function constructor', regex: /\bnew\s+Function\s*\(/ },
      { name: 'vm execution', regex: /\bvm\.(runIn|Script)/ }
    ];

    const violations = [];
    for (const source of sources) {
      for (const pattern of bannedPatterns) {
        if (pattern.regex.test(source.content)) {
          violations.push(`${pattern.name} in ${path.relative(REPO_ROOT, source.filePath)}`);
        }
      }
    }
    assert.deepStrictEqual(violations, []);
  });

  it('does not hardcode obvious secrets in source files', () => {
    const sources = readScannedSources();
    const secretPatterns = [
      { name: 'Private key block', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
      { name: 'AWS access key', regex: /\bAKIA[0-9A-Z]{16}\b/ },
      { name: 'GitHub token', regex: /\bghp_[A-Za-z0-9]{36}\b/ }
    ];

    const matches = [];
    for (const source of sources) {
      for (const pattern of secretPatterns) {
        if (pattern.regex.test(source.content)) {
          matches.push(`${pattern.name} pattern in ${path.relative(REPO_ROOT, source.filePath)}`);
        }
      }
    }
    assert.deepStrictEqual(matches, []);
  });

  it('avoids shell=true and exec-style process launching in runtime extension code', () => {
    const runtimeFiles = [
      path.join(REPO_ROOT, 'extension.js'),
      ...collectJavaScriptFiles('lib')
    ];

    const findings = [];
    for (const filePath of runtimeFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      if (/\bchild_process\.exec(?:Sync)?\s*\(/.test(content)) {
        findings.push(`exec API in ${path.relative(REPO_ROOT, filePath)}`);
      }
      if (/\bcp\.exec(?:Sync)?\s*\(/.test(content)) {
        findings.push(`cp.exec API in ${path.relative(REPO_ROOT, filePath)}`);
      }
      if (/\bshell\s*:\s*true\b/.test(content)) {
        findings.push(`shell:true in ${path.relative(REPO_ROOT, filePath)}`);
      }
    }

    assert.deepStrictEqual(findings, []);
  });
});
