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

    it('handles detailed multi-line output', () => {
        const stdout = `
[INFO] (I002) -> Variable defined but not used on line 5
  > Defined at sample.bat:5
  > Last modified at sample.bat:10
`;
        const issues = parseBlinterOutput(stdout);
        assert.strictEqual(issues.length, 1);
        const issue = issues[0];
        assert.strictEqual(issue.severity, 'information');
        assert.strictEqual(issue.code, 'I002');
        assert.strictEqual(issue.line, 5);
        assert.ok(issue.description.includes('Variable defined but not used'));
        assert.ok(issue.description.includes('Defined at sample.bat:5'));
        assert.ok(issue.description.includes('Last modified at sample.bat:10'));
    });
});
