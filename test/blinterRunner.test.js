const assert = require('assert');
const path = require('path');
const { buildArgs, getExePath } = require('../lib/blinterRunner');

// Minimal mock for vscode.WorkspaceConfiguration
function makeConfig(overrides = {}) {
    const defaults = {
        followCalls: false,
        minSeverity: 'all',
        enabledRules: [],
        disabledRules: [],
        useConfigFile: true,
        maxLineLength: 100,
        noRecursive: false,
        encoding: 'utf8'
    };
    const merged = { ...defaults, ...overrides };
    return {
        get: (key, fallback) => {
            const val = merged[key];
            return val !== undefined ? val : fallback;
        }
    };
}

describe('BlinterRunner — buildArgs', () => {
    it('always appends --summary and the file path as last args', () => {
        const args = buildArgs(makeConfig(), 'C:\\test\\file.bat');
        assert.ok(args.includes('--summary'), 'should include --summary');
        assert.strictEqual(args[args.length - 1], 'C:\\test\\file.bat');
    });

    it('adds --follow-calls when enabled', () => {
        const args = buildArgs(makeConfig({ followCalls: true }), 'file.bat');
        assert.ok(args.includes('--follow-calls'), 'should include --follow-calls');
    });

    it('adds --min-severity when not "all"', () => {
        const args = buildArgs(makeConfig({ minSeverity: 'warning' }), 'file.bat');
        const idx = args.indexOf('--min-severity');
        assert.ok(idx !== -1, 'should include --min-severity');
        assert.strictEqual(args[idx + 1], 'warning');
    });

    it('omits --min-severity when "all"', () => {
        const args = buildArgs(makeConfig({ minSeverity: 'all' }), 'file.bat');
        assert.ok(!args.includes('--min-severity'), 'should not include --min-severity for "all"');
    });

    it('adds --enabled-rules when non-empty', () => {
        const args = buildArgs(makeConfig({ enabledRules: ['E001', 'W005'] }), 'file.bat');
        const idx = args.indexOf('--enabled-rules');
        assert.ok(idx !== -1, 'should include --enabled-rules');
        assert.strictEqual(args[idx + 1], 'E001,W005');
    });

    it('adds --disabled-rules when non-empty', () => {
        const args = buildArgs(makeConfig({ disabledRules: ['S007'] }), 'file.bat');
        const idx = args.indexOf('--disabled-rules');
        assert.ok(idx !== -1, 'should include --disabled-rules');
        assert.strictEqual(args[idx + 1], 'S007');
    });

    it('adds --no-config when useConfigFile is false', () => {
        const args = buildArgs(makeConfig({ useConfigFile: false }), 'file.bat');
        assert.ok(args.includes('--no-config'));
    });

    it('adds --max-line-length when not default (100)', () => {
        const args = buildArgs(makeConfig({ maxLineLength: 120 }), 'file.bat');
        const idx = args.indexOf('--max-line-length');
        assert.ok(idx !== -1, 'should include --max-line-length');
        assert.strictEqual(args[idx + 1], '120');
    });

    it('adds --no-recursive when enabled', () => {
        const args = buildArgs(makeConfig({ noRecursive: true }), 'file.bat');
        assert.ok(args.includes('--no-recursive'));
    });
});

describe('BlinterRunner — getExePath', () => {
    it('returns the correct path to the vendored EXE', () => {
        const extensionUri = 'C:\\path\\to\\extension';
        const expected = path.join(extensionUri, 'vendor', 'Blinter', 'Blinter.exe');
        const actual = getExePath(extensionUri);
        assert.strictEqual(actual, expected);
    });
});
