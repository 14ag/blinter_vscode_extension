const cp = require('child_process');
const path = require('path');

/**
 * Get the path to the vendored Blinter EXE.
 * @param {string} extensionUri  The extension's base URI
 * @returns {string}
 */
function getExePath(extensionUri) {
    // Correctly resolve the path to vendor/Blinter/Blinter.exe relative to the extension root.
    // Handle both string and vscode.Uri for extensionUri.
    const base = (extensionUri && typeof extensionUri === 'object' && extensionUri.fsPath)
        ? extensionUri.fsPath
        : extensionUri;
    const exePath = path.join(base, 'vendor', 'Blinter', 'Blinter.exe');
    return exePath;
}

/**
 * Build the complete CLI arguments array from VS Code blinter settings.
 * @param {{ get: (key: string, defaultValue?: any) => any }} config
 * @param {string} filePath  the target file to lint
 * @returns {string[]}
 */
function buildArgs(config, filePath) {
    const args = [];

    if (config.get('followCalls', false)) {
        args.push('--follow-calls');
    }

    const minSev = config.get('minSeverity', 'all');
    if (minSev && minSev !== 'all') {
        args.push('--min-severity', minSev);
    }

    const enabled = config.get('enabledRules', []);
    if (Array.isArray(enabled) && enabled.length > 0) {
        args.push('--enabled-rules', enabled.join(','));
    }

    const disabled = config.get('disabledRules', []);
    if (Array.isArray(disabled) && disabled.length > 0) {
        args.push('--disabled-rules', disabled.join(','));
    }

    if (config.get('useConfigFile', true) === false) {
        args.push('--no-config');
    }

    const maxLen = config.get('maxLineLength', 100);
    if (typeof maxLen === 'number' && maxLen !== 100) {
        args.push('--max-line-length', String(maxLen));
    }

    if (config.get('noRecursive', false)) {
        args.push('--no-recursive');
    }

    // Always request the summary section
    args.push('--summary');

    // Target file is the final positional argument
    args.push(filePath);

    return args;
}

/**
 * Spawn a Blinter lint run.
 *
 * @param {object} opts
 * @param {string} opts.exePath         resolved EXE path
 * @param {import('vscode').WorkspaceConfiguration} opts.config  blinter configuration
 * @param {string} opts.filePath        file to lint
 * @param {string} opts.cwd             working directory
 * @param {(line: string) => void} opts.onLine   called for each stdout line
 * @param {(text: string) => void} opts.onStderr  called for stderr chunks
 * @param {(code: number|null) => void} opts.onExit   called on process exit
 * @param {Function} [opts.spawnImpl]    optional spawn override (for tests)
 * @returns {{ kill: () => void, process: import('child_process').ChildProcess }}
 */
function spawnBlinter(opts) {
    const { exePath, config, filePath, cwd, onLine, onStderr, onExit, spawnImpl } = opts;
    const cliArgs = buildArgs(config, filePath);

    const spawn = spawnImpl || cp.spawn;
    const proc = spawn(exePath, cliArgs, {
        cwd: cwd || path.dirname(filePath),
        windowsHide: true
    });

    const encoding = config.get('encoding', 'utf8') || 'utf8';
    if (proc.stdout && typeof proc.stdout.setEncoding === 'function') {
        try { proc.stdout.setEncoding(encoding); } catch { proc.stdout.setEncoding('utf8'); }
    }
    if (proc.stderr && typeof proc.stderr.setEncoding === 'function') {
        try { proc.stderr.setEncoding(encoding); } catch { proc.stderr.setEncoding('utf8'); }
    }

    // Stream stdout line-by-line
    let stdoutBuffer = '';
    if (proc.stdout) {
        proc.stdout.on('data', (data) => {
            stdoutBuffer += String(data);
            let nl = stdoutBuffer.indexOf('\n');
            while (nl !== -1) {
                const line = stdoutBuffer.substring(0, nl).replace(/\r$/, '');
                stdoutBuffer = stdoutBuffer.substring(nl + 1);
                if (onLine) onLine(line);
                nl = stdoutBuffer.indexOf('\n');
            }
        });
    }

    if (proc.stderr) {
        proc.stderr.on('data', (data) => {
            if (onStderr) onStderr(String(data));
        });
    }

    proc.on('close', (code) => {
        // Flush remaining buffer
        if (stdoutBuffer.length > 0) {
            const remaining = stdoutBuffer.replace(/\r$/, '');
            if (remaining && onLine) onLine(remaining);
            stdoutBuffer = '';
        }
        if (onExit) onExit(code);
    });

    proc.on('error', (err) => {
        if (onStderr) onStderr(err && err.message ? err.message : String(err));
        if (onExit) onExit(null);
    });

    return {
        kill: () => {
            if (proc && !proc.killed) {
                try { proc.kill(); } catch { /* ignore */ }
            }
        },
        process: proc
    };
}

module.exports = {
    getExePath,
    buildArgs,
    spawnBlinter
};
