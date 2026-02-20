const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { analyzeLine, buildVariableIndexFromFile } = require('../lib/analysis');

describe('Analysis pipeline', () => {
  it('classifies bracketed output and flags critical issues', () => {
    const defaultFile = path.join(__dirname, 'fixtures', 'variable-sample.bat');
    const issues = analyzeLine('[WARN] (BL001) -> unreachable code detected on line 10', {
      workspaceRoot: null,
      defaultFile,
      variableIndex: new Map()
    }).issues;

    assert.strictEqual(issues.length, 1);
    const issue = issues[0];
    assert.strictEqual(issue.severity, 'warning');
    assert.strictEqual(issue.classification, 'Heuristic');
    assert.strictEqual(issue.isCritical, true);
    assert.strictEqual(issue.line, 10);
  });

  it('tracks variable assignments and produces variable trace for undefined variables', () => {
    const fixturePath = path.join(__dirname, 'fixtures', 'variable-sample.bat');
    const variableIndex = buildVariableIndexFromFile(fixturePath, fs);

    const result = analyzeLine("variable-sample.bat:7: error: Undefined variable 'FOO'", {
      workspaceRoot: path.dirname(fixturePath),
      defaultFile: fixturePath,
      variableIndex
    });

    assert.strictEqual(result.issues.length, 1);
    const issue = result.issues[0];
    assert.strictEqual(issue.classification, 'UndefinedVariable');
    assert.strictEqual(issue.variableName, 'FOO');
    assert.ok(Array.isArray(issue.variableTrace));
    assert.ok(issue.variableTrace.length > 0);
    assert.ok(issue.variableTrace[0].includes('variable-sample.bat'));
  });

  it('resolves relative file paths against workspace root', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blinter-analysis-'));
    const targetFile = path.join(tmpDir, 'test.bat');
    fs.writeFileSync(targetFile, 'echo test', 'utf8');

    const result = analyzeLine('test.bat:3: warning: Possible bad label', {
      workspaceRoot: tmpDir,
      defaultFile: undefined,
      variableIndex: new Map()
    });

    const issue = result.issues[0];
    assert.strictEqual(issue.filePath, path.normalize(targetFile));
    assert.strictEqual(issue.line, 3);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

