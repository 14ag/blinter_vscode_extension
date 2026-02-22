const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const reportDir = path.join(repoRoot, 'test', 'reports');

const matrix = [
  { type: 'Unit Testing', command: 'npm run test:unit' },
  { type: 'Integration Testing', command: 'npm run test:integration' },
  { type: 'System Testing', command: 'npx vsce package --no-dependencies --out tmp/system-test.vsix' },
  { type: 'Acceptance Testing (UAT)', command: 'npm run test:uat' },
  { type: 'Regression Testing', command: 'npm run test:regression' },
  { type: 'Performance Testing', command: 'npm run test:performance' },
  { type: 'Security Testing', command: 'npm run test:security && npm run test:security:audit' },
  { type: 'Smoke Testing', command: 'npm run test:smoke' },
  { type: 'Sanity Testing', command: 'npm run test:sanity' },
  { type: 'Exploratory Testing', command: 'npm run test:exploratory' }
];

function runCommand(command) {
  const started = Date.now();
  const result = cp.spawnSync(command, {
    cwd: repoRoot,
    shell: true,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024
  });
  const ended = Date.now();
  return {
    command,
    exitCode: result.status == null ? 1 : result.status,
    durationSeconds: Number(((ended - started) / 1000).toFixed(2)),
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

function formatReport(results) {
  const lines = [];
  lines.push('# Test Matrix Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('| Test Type | Status | Duration (s) | Command |');
  lines.push('| --- | --- | ---: | --- |');
  for (const result of results) {
    const status = result.exitCode === 0 ? 'PASS' : 'FAIL';
    lines.push(`| ${result.type} | ${status} | ${result.durationSeconds} | \`${result.command}\` |`);
  }
  lines.push('');

  for (const result of results) {
    lines.push(`## ${result.type}`);
    lines.push('');
    lines.push(`- Status: ${result.exitCode === 0 ? 'PASS' : 'FAIL'}`);
    lines.push(`- Duration: ${result.durationSeconds}s`);
    lines.push(`- Command: \`${result.command}\``);
    if (result.exitCode !== 0) {
      lines.push(`- Exit code: ${result.exitCode}`);
    }
    lines.push('');
    lines.push('```text');
    const output = `${result.stdout}${result.stderr}`.trim();
    lines.push(output ? output : '(no output)');
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

function main() {
  fs.mkdirSync(reportDir, { recursive: true });

  const results = [];
  let failed = false;
  for (const item of matrix) {
    console.log(`\n=== ${item.type} ===`);
    console.log(`Running: ${item.command}`);
    const result = runCommand(item.command);
    const typedResult = { ...result, type: item.type };
    results.push(typedResult);

    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');

    if (result.exitCode !== 0) {
      failed = true;
      console.error(`${item.type} failed with exit code ${result.exitCode}`);
    } else {
      console.log(`${item.type} passed.`);
    }
  }

  const markdown = formatReport(results);
  const markdownPath = path.join(reportDir, 'test-matrix-latest.md');
  const jsonPath = path.join(reportDir, 'test-matrix-latest.json');

  fs.writeFileSync(markdownPath, markdown, 'utf8');
  fs.writeFileSync(jsonPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    results
  }, null, 2), 'utf8');

  console.log(`\nWrote report: ${markdownPath}`);
  console.log(`Wrote report: ${jsonPath}`);

  if (failed) {
    process.exit(1);
  }
}

main();
