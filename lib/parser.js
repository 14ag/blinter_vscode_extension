// Parse Blinter stdout into a simple array of issue objects
// Each line format expected: [SEVERITY] (CODE) -> DESCRIPTION on line LINE_NUMBER
const BLINTER_LINE_RE = /\s*\[(INFO|WARN|WARNING|ERROR|FATAL)\]\s*\(([^)]+)\)\s*->\s*(.+?)\s+on line\s+(\d+)$/i;

function mapSeverity(s) {
    const sev = (s || '').toUpperCase();
    if (sev === 'INFO') return 'information';
    if (sev === 'WARN' || sev === 'WARNING') return 'warning';
    return 'error';
}

function parseBlinterOutput(stdout) {
    const issues = [];
    if (!stdout) return issues;
    const lines = String(stdout).split(/\r?\n/);
    for (const lineRaw of lines) {
        const line = lineRaw.trim();
        if (!line) continue;
        const m = line.match(BLINTER_LINE_RE);
        if (m) {
            const severity = m[1];
            const code = m[2];
            const description = m[3];
            const lineNumber = parseInt(m[4], 10);
            issues.push({
                severity: mapSeverity(severity),
                code,
                description,
                line: lineNumber
            });
        }
    }
    return issues;
}

module.exports = { parseBlinterOutput };
