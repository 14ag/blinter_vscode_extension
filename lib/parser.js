// Parse Blinter stdout into a simple array of issue objects.
// Supports two output styles:
// 1) Legacy single-line format:
//    [WARN] (W028) -> Description ... on line 2
// 2) Detailed block format:
//    Line 2: Message text (W028)
//    - Explanation: ...
//    - Recommendation: ...
//    - Context: ...

const LEGACY_LINE_RE = /\s*\[(INFO|WARN|WARNING|ERROR|FATAL)\]\s*\(([^)]+)\)\s*->\s*(.+?)\s+on line\s+(\d+)$/i;
const DETAILED_HEADER_RE = /^\s*Line\s+(\d+):\s*(.+?)\s*\(([A-Za-z0-9_+-]+)\)\s*$/i;
const DETAIL_LINE_RE = /^[-\s]+([^:]+):\s*(.*)$/;

function mapSeverityFromLegacy(value) {
    const severity = (value || '').toUpperCase();
    if (severity === 'INFO') return 'information';
    if (severity === 'WARN' || severity === 'WARNING') return 'warning';
    return 'error';
}

function mapSeverityFromCode(code) {
    if (!code) return 'information';
    const normalized = String(code).toUpperCase();
    if (normalized.startsWith('E')) return 'error';
    if (normalized.startsWith('W') || normalized.startsWith('SEC')) return 'warning';
    if (normalized.startsWith('S')) return 'information';
    if (normalized.startsWith('P')) return 'hint';
    return 'information';
}

function parseBlinterOutput(stdout) {
    const issues = [];
    if (!stdout) {
        return issues;
    }

    const rawLines = String(stdout).split(/\r?\n/);
    for (let i = 0; i < rawLines.length; i += 1) {
        const line = rawLines[i].trim();
        if (!line) {
            continue;
        }

        const legacyMatch = LEGACY_LINE_RE.exec(line);
        if (legacyMatch) {
            const [, severity, code, description, lineNumber] = legacyMatch;
            issues.push({
                severity: mapSeverityFromLegacy(severity),
                code,
                description,
                line: parseInt(lineNumber, 10)
            });
            continue;
        }

        const detailedMatch = DETAILED_HEADER_RE.exec(line);
        if (!detailedMatch) {
            continue;
        }

        const [, lineNumber, message, code] = detailedMatch;
        const details = [];
        let description = message;

        while (i + 1 < rawLines.length && DETAIL_LINE_RE.test(rawLines[i + 1])) {
            const detailMatch = DETAIL_LINE_RE.exec(rawLines[++i]);
            const label = detailMatch && detailMatch[1] ? detailMatch[1].trim() : '';
            const detail = detailMatch && detailMatch[2] ? detailMatch[2].trim() : '';
            details.push({ label, detail });
            if (label || detail) {
                description += `\n${label}: ${detail}`;
            }
        }

        issues.push({
            severity: mapSeverityFromCode(code),
            code,
            description,
            line: parseInt(lineNumber, 10),
            details
        });
    }

    return issues;
}

module.exports = { parseBlinterOutput };
