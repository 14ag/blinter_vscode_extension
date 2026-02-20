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
// Match detail lines like: "- Explanation: ..." capturing label and value
const DETAIL_LINE_RE = /^[-\s]+([^:]+):\s*(.*)$/;

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
    if (c.startsWith('SEC')) return 'error';   // Security — checked before S
    if (c.startsWith('W')) return 'warning';
    if (c.startsWith('S')) return 'information'; // Style
    if (c.startsWith('P')) return 'hint';        // Performance
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

        // Legacy format
        const legacyMatch = LEGACY_LINE_RE.exec(line);
        if (legacyMatch) {
            const [, severity, code, description, lineNumber] = legacyMatch;
            const issue = {
                severity: mapSeverityFromLegacy(severity),
                code,
                description,
                line: parseInt(lineNumber, 10)
            };
            console.log('Parsed legacy issue:', issue);
            issues.push(issue);
            continue;
        }

        // Detailed format
        const detailedMatch = DETAILED_HEADER_RE.exec(line);
        if (detailedMatch) {
            const [, lineNumber, message, code] = detailedMatch;
            const details = [];
            let description = message;
            while (i + 1 < rawLines.length && DETAIL_LINE_RE.test(rawLines[i + 1])) {
                const matched = DETAIL_LINE_RE.exec(rawLines[++i]);
                const label = matched && matched[1] ? matched[1].trim() : '';
                const detail = matched && matched[2] ? matched[2].trim() : '';
                details.push({ label, detail });
                if (label || detail) description += `\n${label}: ${detail}`;
            }
            const issue = {
                severity: mapSeverityFromCode(code),
                code,
                description,
                line: parseInt(lineNumber, 10),
                details
            };
            console.log('Parsed detailed issue:', issue);
            issues.push(issue);
        }
    }

    console.log('Final parsed issues:', issues);
    return issues;
}

module.exports = { parseBlinterOutput };
