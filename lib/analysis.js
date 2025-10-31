const path = require('path');

const ERROR_LINE_RE = /^(?<file>.+?):(?<line>\d+):\s*(?<severity>error|warning|info)\s*:?\s*(?<message>.+)$/i;
const BRACKETED_RE = /^\s*\[(?<severity>info|warn|warning|error|fatal)\]\s*\((?<code>[^)]+)\)\s*->\s*(?<message>.+?)(?:\s+on\s+line\s+(?<line>\d+))?$/i;
const UNDEFINED_VAR_RE = /undefined\s+variable\s+'?(?<name>[A-Za-z0-9_]+)'?/i;
const SET_VAR_RE = /^\s*(?:setlocal\b.*|set\s+(?<name>[A-Za-z0-9_]+)\s*=\s*(?<value>.*))$/i;

const STUPID_KEYWORDS = [
    'undefined variable',
    'unreachable',
    'stupid',
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
    const sev = value.toString().toLowerCase();
    if (sev === 'info' || sev === 'information') return 'info';
    if (sev === 'warn' || sev === 'warning') return 'warning';
    return 'error';
}

function classifyMessage(message, severity) {
    if (!message) {
        return { classification: severity === 'info' ? 'Info' : 'General', isStupid: severity !== 'info' };
    }
    const msg = message.toLowerCase();
    if (msg.includes('undefined variable')) {
        return { classification: 'UndefinedVariable', isStupid: true };
    }
    if (msg.includes('infinite loop')) {
        return { classification: 'PossibleInfiniteLoop', isStupid: true };
    }
    if (msg.includes('bad label') || msg.includes('invalid label') || msg.includes('duplicate label') || msg.includes('empty label')) {
        return { classification: 'BadLabel', isStupid: true };
    }
    if (msg.includes('syntax')) {
        return { classification: 'SyntaxWarning', isStupid: true };
    }
    if (msg.includes('deprecated')) {
        return { classification: 'Deprecated', isStupid: severity !== 'info' };
    }
    if (STUPID_KEYWORDS.some(k => msg.includes(k))) {
        return { classification: 'Heuristic', isStupid: true };
    }
    if (severity === 'info') {
        return { classification: 'Info', isStupid: false };
    }
    return { classification: 'General', isStupid: severity !== 'info' };
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
    const {
        workspaceRoot,
        defaultFile,
        variableIndex
    } = options;

    const trimmed = line.replace(/\r?\n$/, '');
    const issues = [];
    let consumed = false;

    // Track explicit SET statements that reach stdout/stderr
    const setMatch = trimmed.match(SET_VAR_RE);
    if (setMatch && setMatch.groups && setMatch.groups.name) {
        const name = setMatch.groups.name.toUpperCase();
        const record = {
            file: defaultFile ? path.normalize(defaultFile) : undefined,
            line: undefined,
            value: setMatch.groups.value ? setMatch.groups.value.trim() : ''
        };
        addVariableEvent(variableIndex, name, record);
    }

    const bracketed = trimmed.match(BRACKETED_RE);
    if (bracketed && bracketed.groups) {
        consumed = true;
        const severity = normalizeSeverity(bracketed.groups.severity);
        const filePath = resolveFile(defaultFile, workspaceRoot, defaultFile);
        const lineNumber = bracketed.groups.line ? parseInt(bracketed.groups.line, 10) : 1;
        issues.push(createIssue({
            severity,
            message: bracketed.groups.message.trim(),
            code: bracketed.groups.code,
            filePath,
            lineNumber,
            variableIndex
        }));
    }

    const general = trimmed.match(ERROR_LINE_RE);
    if (!consumed && general && general.groups) {
        const severity = normalizeSeverity(general.groups.severity);
        const filePath = resolveFile(general.groups.file, workspaceRoot, defaultFile);
        const lineNumber = parseInt(general.groups.line, 10);
        issues.push(createIssue({
            severity,
            message: general.groups.message.trim(),
            filePath,
            lineNumber,
            variableIndex
        }));
    }

    return { issues };
}

function createIssue({ severity, message, filePath, lineNumber, code, variableIndex }) {
    const { classification, isStupid } = classifyMessage(message, severity);
    const lowerMsg = message.toLowerCase();
    let variableName;
    const varMatch = lowerMsg.match(UNDEFINED_VAR_RE);
    if (varMatch && varMatch.groups && varMatch.groups.name) {
        variableName = varMatch.groups.name.toUpperCase();
    }

    let variableTrace = undefined;
    if (variableName && variableIndex) {
        const trace = variableIndex.get(variableName);
        if (trace && trace.length) {
            variableTrace = trace.map(entry => {
                if (!entry) return '';
                const parts = [];
                if (entry.file) parts.push(path.basename(entry.file));
                if (entry.line != null) parts.push(`line ${entry.line}`);
                if (entry.value) parts.push(`= ${entry.value}`);
                return parts.join(' ');
            }).filter(Boolean);
        }
    }

    return {
        id: nextIssueId(),
        severity,
        classification,
        isStupid,
        message,
        code,
        filePath: filePath ? path.normalize(filePath) : undefined,
        line: Number.isFinite(lineNumber) ? lineNumber : 1,
        range: {
            start: { line: Number.isFinite(lineNumber) ? Math.max(0, lineNumber - 1) : 0, character: 0 },
            end: { line: Number.isFinite(lineNumber) ? Math.max(0, lineNumber - 1) : 0, character: Number.MAX_SAFE_INTEGER }
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
            if (match) {
                const variableName = match[1].toUpperCase();
                addVariableEvent(map, variableName, {
                    file: path.normalize(filePath),
                    line: index + 1,
                    value: match[2].trim()
                });
            }
        });
    } catch {
        // ignore read errors
    }
    return map;
}

module.exports = {
    analyzeLine,
    buildVariableIndexFromFile
};

