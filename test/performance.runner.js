const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const { parseBlinterOutput } = require('../lib/parser');
const { analyzeLine } = require('../lib/analysis');

const MAX_PARSE_MS = Number(process.env.BLINTER_MAX_PARSE_MS || 15000);
const MAX_ANALYZE_MS = Number(process.env.BLINTER_MAX_ANALYZE_MS || 15000);

function buildLargeParserInput(issueCount) {
  const lines = [];
  for (let i = 1; i <= issueCount; i += 1) {
    lines.push(`Line ${i}: Style issue ${i} (S007)`);
    lines.push(`- Explanation: Explanation text ${i}`);
    lines.push(`- Recommendation: Recommendation text ${i}`);
    lines.push(`- Context: Context text ${i}`);
    lines.push('');
  }
  return lines.join('\n');
}

function runParserBenchmark() {
  const input = buildLargeParserInput(3000);
  const started = performance.now();
  const parsed = parseBlinterOutput(input);
  const durationMs = performance.now() - started;
  return {
    durationMs,
    issueCount: parsed.length
  };
}

function runAnalysisBenchmark() {
  const lines = [];
  for (let i = 1; i <= 15000; i += 1) {
    const line = i % 4 === 0
      ? `Line ${i}: Undefined variable 'FOO${i}' (E001)`
      : `${`sample${i}.bat`}:${(i % 200) + 1}: warning: possible bad label`;
    lines.push(line);
  }

  const variableIndex = new Map();
  const started = performance.now();
  let totalIssues = 0;
  for (const line of lines) {
    const result = analyzeLine(line, {
      workspaceRoot: 'C:\\repo',
      defaultFile: 'C:\\repo\\sample.bat',
      variableIndex
    });
    totalIssues += result.issues.length;
  }
  const durationMs = performance.now() - started;
  return {
    durationMs,
    totalIssues
  };
}

function ensureReportDir() {
  const reportDir = path.join(__dirname, 'reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  return reportDir;
}

function writeReport(report) {
  const reportDir = ensureReportDir();
  const outputPath = path.join(reportDir, 'performance-latest.json');
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
  return outputPath;
}

function main() {
  const parser = runParserBenchmark();
  const analysis = runAnalysisBenchmark();

  const report = {
    generatedAt: new Date().toISOString(),
    thresholdsMs: {
      parser: MAX_PARSE_MS,
      analysis: MAX_ANALYZE_MS
    },
    parser,
    analysis
  };

  const reportPath = writeReport(report);

  console.log(`Parser benchmark: ${parser.durationMs.toFixed(2)}ms for ${parser.issueCount} issues.`);
  console.log(`Analysis benchmark: ${analysis.durationMs.toFixed(2)}ms for ${analysis.totalIssues} analyzed issues.`);
  console.log(`Performance report written to: ${reportPath}`);

  if (parser.durationMs > MAX_PARSE_MS) {
    console.error(`Parser benchmark exceeded threshold (${MAX_PARSE_MS}ms).`);
    process.exit(1);
  }
  if (analysis.durationMs > MAX_ANALYZE_MS) {
    console.error(`Analysis benchmark exceeded threshold (${MAX_ANALYZE_MS}ms).`);
    process.exit(1);
  }
}

main();
