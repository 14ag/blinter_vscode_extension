const cp = require('child_process');
const path = require('path');

/**
 * Resolve the bundled Blinter executable path from the extension root.
 * Accepts either a string path or a vscode.Uri-like object.
 * @param {string|{ fsPath?: string }|undefined} extensionUri
 * @returns {string}
 */
function getExePath(extensionUri) {
    let basePath = extensionUri && typeof extensionUri === 'object' && extensionUri.fsPath
        ? extensionUri.fsPath
        : extensionUri;

    if (!basePath || typeof basePath !== 'string') {
        basePath = path.resolve(__dirname, '..');
    }

    return path.join(basePath, 'vendor', 'Blinter', 'Blinter.exe');
}

/**
 * Build CLI arguments from extension settings.
 * @param {{ get: (key: string, defaultValue?: any) => any }} config
 * @param {string} filePath
 * @returns {string[]}
 */
function buildArgs(config, filePath) {
    const args = [];

    if (config.get('followCalls', false)) {
        args.push('--follow-calls');
    }

    const minSeverity = config.get('minSeverity', 'all');
    if (minSeverity && minSeverity !== 'all') {
        args.push('--min-severity', minSeverity);
    }

    const enabledRules = config.get('enabledRules', []);
    if (Array.isArray(enabledRules) && enabledRules.length > 0) {
        args.push('--enabled-rules', enabledRules.join(','));
    }

    const disabledRules = config.get('disabledRules', []);
    if (Array.isArray(disabledRules) && disabledRules.length > 0) {
        args.push('--disabled-rules', disabledRules.join(','));
    }

    if (config.get('useConfigFile', true) === false) {
        args.push('--no-config');
    }

    const maxLineLength = config.get('maxLineLength', 100);
    if (typeof maxLineLength === 'number' && maxLineLength !== 100) {
        args.push('--max-line-length', String(maxLineLength));
    }

    if (config.get('noRecursive', false)) {
        args.push('--no-recursive');
    }

    args.push('--summary');
    args.push(filePath);
    return args;
}

/**
 * Spawn a Blinter lint process.
 * @param {object} opts
 * @param {string} opts.exePath
 * @param {{ get: (key: string, defaultValue?: any) => any }} opts.config
 * @param {string} opts.filePath
 * @param {string} [opts.cwd]
 * @param {(line: string) => void} [opts.onLine]
 * @param {(text: string) => void} [opts.onStderr]
 * @param {(code: number|null) => void} [opts.onExit]
 * @param {(command: string, args: string[], options: import('child_process').SpawnOptions) => import('child_process').ChildProcess} [opts.spawnImpl]
 * @returns {{ kill: () => void, process: import('child_process').ChildProcess }}
 */
function spawnBlinter(opts) {
    const { exePath, config, filePath, cwd, onLine, onStderr, onExit, spawnImpl } = opts;
    const args = buildArgs(config, filePath);

    const spawn = spawnImpl || cp.spawn;
    const proc = spawn(exePath, args, {
        cwd: cwd || path.dirname(filePath),
        windowsHide: true
    });

    const encoding = config.get('encoding', 'utf8') || 'utf8';
    if (proc.stdout && typeof proc.stdout.setEncoding === 'function') {
        try {
            proc.stdout.setEncoding(encoding);
        } catch {
            proc.stdout.setEncoding('utf8');
        }
    }
    if (proc.stderr && typeof proc.stderr.setEncoding === 'function') {
        try {
            proc.stderr.setEncoding(encoding);
        } catch {
            proc.stderr.setEncoding('utf8');
        }
    }

    let settled = false;
    const finish = (code) => {
        if (settled) {
            return;
        }
        settled = true;
        if (onExit) {
            onExit(code);
        }
    };

    let stdoutBuffer = '';
    if (proc.stdout) {
        proc.stdout.on('data', (data) => {
            stdoutBuffer += String(data);
            let newlineIndex = stdoutBuffer.indexOf('\n');
            while (newlineIndex !== -1) {
                const line = stdoutBuffer.substring(0, newlineIndex).replace(/\r$/, '');
                stdoutBuffer = stdoutBuffer.substring(newlineIndex + 1);
                if (onLine) {
                    onLine(line);
                }
                newlineIndex = stdoutBuffer.indexOf('\n');
            }
        });
    }

    if (proc.stderr) {
        proc.stderr.on('data', (data) => {
            if (onStderr) {
                onStderr(String(data));
            }
        });
    }

    proc.on('close', (code) => {
        if (stdoutBuffer.length > 0) {
            const line = stdoutBuffer.replace(/\r$/, '');
            if (line && onLine) {
                onLine(line);
            }
            stdoutBuffer = '';
        }
        finish(code);
    });

    proc.on('error', (error) => {
        if (onStderr) {
            onStderr(error && error.message ? error.message : String(error));
        }
        finish(null);
    });

    return {
        kill: () => {
            if (proc && !proc.killed) {
                try {
                    proc.kill();
                } catch {
                    // Ignore kill failures.
                }
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
