// Parse Blinter stdout into a simple array of issue objects.
// Supports two output styles:
// 1) Legacy single-line format:
//    [WARN] (W028) -> Description ... on line 2
// 2) Detailed block format (current exe style):
//    Line 2: Message text (W028)
//    - Explanation: ...
//    - Recommendation: ...
//    - Context: ...

const LEGACY_LINE_RE = /\s*\[(INFO|WARN|WARNING|ERROR|FATAL)\]\s*\(([^)]+)\)\s*->\s*(.+?)\s+on line\s+(\d+)$/i;
const DETAILED_HEADER_RE = /^\s*Line\s+(\d+):\s*(.+?)\s*\(([A-Za-z0-9_+-]+)\)\s*$/i;

function mapSeverityFromLegacy(s) {
    const sev = (s || '').toUpperCase();
    if (sev === 'INFO') return 'information';
    if (sev === 'WARN' || sev === 'WARNING') return 'warning';
    return 'error';
}

function mapSeverityFromCode(code) {
    if (!code) return 'information';
    const c = String(code).toUpperCase();
    if (c.startsWith('E')) return 'error';
    if (c.startsWith('W') || c.startsWith('SEC')) return 'warning';
    // Style, Performance, and other informational categories
    if (c.startsWith('S') || c.startsWith('P')) return 'information';
    return 'information';
}

function parseBlinterOutput(stdout) {
    const issues = [];
    if (!stdout) return issues;
    const rawLines = String(stdout).split(/\r?\n/);

    for (let i = 0; i < rawLines.length; i++) {
        const raw = rawLines[i];
        const line = raw.trim();
        if (!line) continue;

        // Legacy single-line parser
        const mLegacy = line.match(LEGACY_LINE_RE);
        if (mLegacy) {
            const severity = mLegacy[1];
            const code = mLegacy[2];
            const description = mLegacy[3];
            const lineNumber = parseInt(mLegacy[4], 10);
            issues.push({
                severity: mapSeverityFromLegacy(severity),
                code,
                description,
                line: lineNumber,
            });
            continue;
        }

        // Detailed multi-line block parser
        const mDet = raw.match(DETAILED_HEADER_RE);
        if (mDet) {
            const lineNumber = parseInt(mDet[1], 10);
            const message = mDet[2].trim();
            const code = mDet[3].trim();

            // Collect following dash-prefixed lines as extra details
            let description = message;
            let j = i + 1;
            for (; j < rawLines.length; j++) {
                const next = rawLines[j].trim();
                if (!next) break;
                if (next.startsWith('-')) {
                    // remove leading '- ' and append
                    description += ' ' + next.replace(/^[-\s]+/, '').trim();
                    continue;
                }
                // stop when we reach a non-detail line
                break;
            }
            // advance main loop to skip consumed detail lines
            i = j - 1;

            issues.push({
                severity: mapSeverityFromCode(code),
                code,
                description: description.trim(),
                line: lineNumber,
            });
            continue;
        }
    }

    return issues;
}

module.exports = { parseBlinterOutput };
