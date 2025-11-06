const assert = require('assert');
const { parseBlinterOutput } = require('../lib/parser');

describe('Parser tests', () => {
    it('parses single error line', () => {
        const stdout = '[ERROR] (CMD001) -> Missing argument on line 3';
        const issues = parseBlinterOutput(stdout);
        assert.strictEqual(issues.length, 1);
        const i = issues[0];
        assert.strictEqual(i.severity, 'error');
        assert.strictEqual(i.code, 'CMD001');
        assert.strictEqual(i.line, 3);
        assert.ok(i.description.includes('Missing argument'));
    });

    it('parses multiple lines and ignores non-matching', () => {
        const stdout = `[INFO] (I001) -> Note about something on line 1\nSome unrelated log\n[WARN] (W002) -> Something suspicious on line 5`;
        const issues = parseBlinterOutput(stdout);
        assert.strictEqual(issues.length, 2);
        assert.strictEqual(issues[0].severity, 'information');
        assert.strictEqual(issues[1].severity, 'warning');
    });

    it('parses detailed multi-line Blinter v1.0.94 output format', () => {
        const stdout = `Line 2: Errorlevel handling difference between .bat/.cmd (W028)
- Explanation: Commands like APPEND, DPATH, FTYPE, SET, PATH, ASSOC handle errorlevel differently in .bat vs .cmd files
- Recommendation: Use .cmd extension for consistent errorlevel behavior with these commands
- Context: Command 'set' handles errorlevel differently in .bat vs .cmd files

Line 1: BAT extension used instead of CMD for newer Windows (S007)
- Explanation: The .cmd file extension is recommended over .bat for Windows NT and newer versions (Windows 2000+). CMD files support additional features and have better error handling in newer Windows environments
- Recommendation: Consider renaming .bat files to .cmd for scripts intended for Windows 2000 and newer versions. CMD files provide better compatibility with modern Windows features and improved error reporting
- Context: Consider using .cmd extension instead of .bat for scripts targeting Windows 2000 and newer`;
        const issues = parseBlinterOutput(stdout);
        assert.strictEqual(issues.length, 2);
        
        const issue1 = issues[0];
        assert.strictEqual(issue1.severity, 'warning');
        assert.strictEqual(issue1.code, 'W028');
        assert.strictEqual(issue1.line, 2);
        assert.ok(issue1.description.includes('Errorlevel handling difference'));
        assert.ok(issue1.description.includes('Explanation'));
        assert.ok(issue1.description.includes('Recommendation'));
        assert.ok(issue1.description.includes('Context'));
        
        const issue2 = issues[1];
        assert.strictEqual(issue2.severity, 'information');
        assert.strictEqual(issue2.code, 'S007');
        assert.strictEqual(issue2.line, 1);
        assert.ok(issue2.description.includes('BAT extension used instead of CMD'));
    });

    it('parses SEC and P rule families', () => {
        const stdout = `[WARN] (SEC001) -> UNC path used on line 10\n[INFO] (P123) -> Performance note on line 12`;
        const issues = parseBlinterOutput(stdout);
        assert.strictEqual(issues.length, 2);
        assert.strictEqual(issues[0].code, 'SEC001');
        assert.strictEqual(issues[0].severity, 'warning');
        assert.strictEqual(issues[0].line, 10);
        assert.strictEqual(issues[1].code, 'P123');
        assert.strictEqual(issues[1].severity, 'information');
        assert.strictEqual(issues[1].line, 12);
    });
});
