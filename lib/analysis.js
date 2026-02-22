const path = require('path');

const ERROR_LINE_RE = /^(?<file>.+?):(?<line>\d+):\s*(?<severity>error|warning|info)\s*:?\s*(?<message>.+)$/i;
const BRACKETED_RE = /^\s*\[(?<severity>info|warn|warning|error|fatal)\]\s*\((?<code>[^)]+)\)\s*->\s*(?<message>.+?)(?:\s+on\s+line\s+(?<line>\d+))?$/i;
const DETAILED_LINE_RE = /^\s*Line\s+(?<line>\d+):\s+(?<message>.+?)\s*\((?<code>[A-Za-z0-9_+-]+)\)\s*$/i;
const UNDEFINED_VAR_RE = /undefined\s+variable\s+'?(?<name>[A-Za-z0-9_]+)'?/i;
const SET_VAR_RE = /^\s*(?:setlocal\b.*|set\s+(?<name>[A-Za-z0-9_]+)\s*=\s*(?<value>.*))$/i;

const CRITICAL_KEYWORDS = [
    'undefined variable',
    'unreachable',
    'bad label',
    'invalid label',
    'infinite loop',
    'empty label',
    'syntax error',
    'deprecated',
    'duplicate label'
];

let issueId = 0;

function nextIssueId() {
    issueId += 1;
    return `issue-${issueId}`;
}

function normalizeSeverity(value) {
    if (!value) return 'error';
    const severity = value.toString().toLowerCase();
    if (severity === 'info' || severity === 'information') return 'information';
    if (severity === 'warn' || severity === 'warning') return 'warning';
    return 'error';
}

function severityFromCode(code) {
    const normalized = String(code || '').toUpperCase();
    if (normalized.startsWith('E')) return 'error';
    if (normalized.startsWith('W') || normalized.startsWith('SEC')) return 'warning';
    return 'information';
}

function isInfoSeverity(severity) {
    return normalizeSeverity(severity) === 'information';
}

function classifyMessage(message, severity) {
    const infoSeverity = isInfoSeverity(severity);
    if (!message) {
        return { classification: infoSeverity ? 'Info' : 'General', isCritical: !infoSeverity };
    }

    const normalizedMessage = message.toLowerCase();
    if (normalizedMessage.includes('undefined variable')) {
        return { classification: 'UndefinedVariable', isCritical: true };
    }
    if (normalizedMessage.includes('infinite loop')) {
        return { classification: 'PossibleInfiniteLoop', isCritical: true };
    }
    if (normalizedMessage.includes('bad label')
        || normalizedMessage.includes('invalid label')
        || normalizedMessage.includes('duplicate label')
        || normalizedMessage.includes('empty label')) {
        return { classification: 'BadLabel', isCritical: true };
    }
    if (normalizedMessage.includes('syntax')) {
        return { classification: 'SyntaxWarning', isCritical: true };
    }
    if (normalizedMessage.includes('deprecated')) {
        return { classification: 'Deprecated', isCritical: !infoSeverity };
    }
    if (CRITICAL_KEYWORDS.some((keyword) => normalizedMessage.includes(keyword))) {
        return { classification: 'Heuristic', isCritical: true };
    }
    if (infoSeverity) {
        return { classification: 'Info', isCritical: false };
    }
    return { classification: 'General', isCritical: true };
}

function resolveFile(fileText, workspaceRoot, defaultFile) {
    if (fileText && path.isAbsolute(fileText)) {
        return path.normalize(fileText);
    }

    const trimmed = (fileText || '').trim();
    if (!trimmed) {
        return defaultFile ? path.normalize(defaultFile) : undefined;
    }

    if (workspaceRoot) {
        return path.normalize(path.join(workspaceRoot, trimmed));
    }
    if (defaultFile) {
        return path.normalize(path.join(path.dirname(defaultFile), trimmed));
    }
    return path.normalize(trimmed);
}

function analyzeLine(line, options) {
    const { workspaceRoot, defaultFile, variableIndex } = options;

    const trimmed = line.replace(/\r?\n$/, '');
    const issues = [];
    let consumed = false;

    const setMatch = trimmed.match(SET_VAR_RE);
    if (setMatch && setMatch.groups && setMatch.groups.name) {
        const name = setMatch.groups.name.toUpperCase();
        addVariableEvent(variableIndex, name, {
            file: defaultFile ? path.normalize(defaultFile) : undefined,
            line: undefined,
            value: setMatch.groups.value ? setMatch.groups.value.trim() : ''
        });
    }

    const detailed = trimmed.match(DETAILED_LINE_RE);
    if (detailed && detailed.groups) {
        consumed = true;
        const lineNumber = parseInt(detailed.groups.line, 10);
        const code = detailed.groups.code.trim();
        const message = detailed.groups.message.trim();
        const filePath = resolveFile(defaultFile, workspaceRoot, defaultFile);

        issues.push(createIssue({
            severity: severityFromCode(code),
            message,
            code,
            filePath,
            lineNumber,
            variableIndex
        }));
    }

    const bracketed = trimmed.match(BRACKETED_RE);
    if (!consumed && bracketed && bracketed.groups) {
        consumed = true;
        const filePath = resolveFile(defaultFile, workspaceRoot, defaultFile);
        const lineNumber = bracketed.groups.line ? parseInt(bracketed.groups.line, 10) : 1;
        issues.push(createIssue({
            severity: normalizeSeverity(bracketed.groups.severity),
            message: bracketed.groups.message.trim(),
            code: bracketed.groups.code,
            filePath,
            lineNumber,
            variableIndex
        }));
    }

    const general = trimmed.match(ERROR_LINE_RE);
    if (!consumed && general && general.groups) {
        const filePath = resolveFile(general.groups.file, workspaceRoot, defaultFile);
        const lineNumber = parseInt(general.groups.line, 10);
        issues.push(createIssue({
            severity: normalizeSeverity(general.groups.severity),
            message: general.groups.message.trim(),
            filePath,
            lineNumber,
            variableIndex
        }));
    }

    return { issues };
}

function createIssue({ severity, message, filePath, lineNumber, code = undefined, variableIndex }) {
    const normalizedSeverity = normalizeSeverity(severity);
    const safeMessage = typeof message === 'string' ? message : '';
    const { classification, isCritical } = classifyMessage(safeMessage, normalizedSeverity);

    let variableName;
    const variableMatch = safeMessage.toLowerCase().match(UNDEFINED_VAR_RE);
    if (variableMatch && variableMatch.groups && variableMatch.groups.name) {
        variableName = variableMatch.groups.name.toUpperCase();
    }

    let variableTrace;
    if (variableName && variableIndex) {
        const trace = variableIndex.get(variableName);
        if (trace && trace.length) {
            variableTrace = trace
                .map((entry) => {
                    if (!entry) return '';
                    const parts = [];
                    if (entry.file) parts.push(path.basename(entry.file));
                    if (entry.line != null) parts.push(`line ${entry.line}`);
                    if (entry.value) parts.push(`= ${entry.value}`);
                    return parts.join(' ');
                })
                .filter(Boolean);
        }
    }

    const normalizedLine = Number.isFinite(lineNumber) ? Math.max(1, lineNumber) : 1;
    const lineIndex = normalizedLine - 1;

    return {
        id: nextIssueId(),
        severity: normalizedSeverity,
        classification,
        isCritical,
        message: safeMessage,
        code,
        filePath: filePath ? path.normalize(filePath) : undefined,
        line: normalizedLine,
        range: {
            start: { line: lineIndex, character: 0 },
            end: { line: lineIndex, character: Number.MAX_SAFE_INTEGER }
        },
        variableName,
        variableTrace
    };
}

function addVariableEvent(variableIndex, variableName, record) {
    if (!variableName || !variableIndex) {
        return;
    }
    const key = variableName.toUpperCase();
    if (!variableIndex.has(key)) {
        variableIndex.set(key, []);
    }
    variableIndex.get(key).push(record);
}

function buildVariableIndexFromFile(filePath, fsModule) {
    const map = new Map();
    if (!filePath || !fsModule) {
        return map;
    }

    try {
        const content = fsModule.readFileSync(filePath, 'utf8');
        const lines = content.split(/\r?\n/);
        lines.forEach((line, index) => {
            const match = line.match(/\bset\b\s+([A-Za-z0-9_]+)\s*=\s*(.*)$/i);
            if (!match) {
                return;
            }
            addVariableEvent(map, match[1].toUpperCase(), {
                file: path.normalize(filePath),
                line: index + 1,
                value: match[2].trim()
            });
        });
    } catch {
        // Ignore read failures when building variable traces.
    }

    return map;
}

module.exports = {
    analyzeLine,
    buildVariableIndexFromFile
};
