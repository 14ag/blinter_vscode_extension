# Test Matrix Report

Generated: 2026-02-22T14:36:34.202Z

| Test Type | Status | Duration (s) | Command |
| --- | --- | ---: | --- |
| Unit Testing | PASS | 0.45 | `npm run test:unit` |
| Integration Testing | PASS | 7.4 | `npm run test:integration` |
| System Testing | PASS | 2.43 | `npx vsce package --no-dependencies --out tmp/system-test.vsix` |
| Acceptance Testing (UAT) | PASS | 0.23 | `npm run test:uat` |
| Regression Testing | PASS | 0.37 | `npm run test:regression` |
| Performance Testing | PASS | 0.29 | `npm run test:performance` |
| Security Testing | PASS | 0.99 | `npm run test:security && npm run test:security:audit` |
| Smoke Testing | PASS | 0.35 | `npm run test:smoke` |
| Sanity Testing | PASS | 0.41 | `npm run test:sanity` |
| Exploratory Testing | PASS | 0.36 | `npm run test:exploratory` |

## Unit Testing

- Status: PASS
- Duration: 0.45s
- Command: `npm run test:unit`

```text
> blinter@1.26.15681 test:unit
> mocha "test/parser.test.js" "test/blinterRunner.test.js" "test/analysis.test.js" "test/debugAdapter.test.js" "test/discovery.test.js"



  Parser tests
    √ parses single error line
    √ parses multiple lines and ignores non-matching
    √ parses detailed multi-line Blinter v1.0.94 output format
    √ parses SEC and P rule families
    √ maps detailed SEC rules to warning severity

  BlinterRunner — buildArgs
    √ always appends --summary and the file path as last args
    √ adds --follow-calls when enabled
    √ adds --min-severity when not "all"
    √ omits --min-severity when "all"
    √ adds --enabled-rules when non-empty
    √ adds --disabled-rules when non-empty
    √ adds --no-config when useConfigFile is false
    √ adds --max-line-length when not default (100)
    √ adds --no-recursive when enabled

  BlinterRunner — getExePath
    √ returns the correct path to the vendored EXE

  Analysis pipeline
    √ classifies bracketed output and flags critical issues
    √ tracks variable assignments and produces variable trace for undefined variables
    √ resolves relative file paths against workspace root
    √ treats informational detailed codes as non-critical info issues

  InlineDebugAdapterSession
    √ streams output to controller and emits DAP lifecycle events

  Discovery tests
    √ returns bin path when bin contains executable
    √ returns bins path when bin missing but bins contains executable
    √ returns null when no executable present


  23 passing (34ms)
```

## Integration Testing

- Status: PASS
- Duration: 7.4s
- Command: `npm run test:integration`

```text
> blinter@1.26.15681 test:integration
> node ./test/runTest.js


[main 2026-02-22T14:36:22.379Z] update#setState disabled
[main 2026-02-22T14:36:22.380Z] update#ctor - updates are disabled by the environment
ChatSessionStore: Migrating 0 chat sessions from storage service to file system
Started local extension host with pid 8972.
Loading development extension at c:\Users\philip\sauce\blinter-vscode-extension
MCP Registry configured: https://api.mcp.github.com/2025-09-15
Settings Sync: Account status changed from uninitialized to unavailable
[0m[0m
[0m  Smoke tests[0m
  [32m  √[0m[90m executes the core parsing + analysis path without throwing[0m
  [32m  √[0m[90m builds arguments and resolves expected executable locations[0m
  [32m  √[0m[90m resolves system blinter command when configured[0m
[0m  Security tests[0m
  [32m  √[0m[90m does not use dynamic code execution primitives[0m
  [32m  √[0m[90m does not hardcode obvious secrets in source files[0m
  [32m  √[0m[90m avoids shell=true and exec-style process launching in runtime extension code[0m
[0m  Sanity tests[0m
  [32m  √[0m[90m keeps detailed SEC severity aligned as warning[0m
  [32m  √[0m[90m keeps detailed style issues informational and non-critical[0m
  [32m  √[0m[90m flushes trailing stdout data without a newline on process close[0m
[0m  Regression tests[0m
  [32m  √[0m[90m spawnBlinter calls onExit once when both error and close fire[0m
  [32m  √[0m[90m debug adapter emits terminated once when process emits error then close[0m
[0m  Parser tests[0m
  [32m  √[0m[90m parses single error line[0m
  [32m  √[0m[90m parses multiple lines and ignores non-matching[0m
  [32m  √[0m[90m parses detailed multi-line Blinter v1.0.94 output format[0m
  [32m  √[0m[90m parses SEC and P rule families[0m
  [32m  √[0m[90m maps detailed SEC rules to warning severity[0m
[0m  Integration (smoke) - Run & Debug single file[0m
  [32m  √[0m[90m starts debug session for single open .bat file[0m[31m (1578ms)[0m
[0m  Integration (simulation) - debugger + suppressions[0m
  [32m  √[0m[90m validates launch/debug + suppression UI contributions[0m
  [32m  √[0m[90m inserts suppression via quick fix and removes it via button command path[0m[31m (2514ms)[0m
[0m  Integration (basic) Test Suite[0m
  [32m  √[0m[90m blinter.run command is registered[0m
[0m  Extension Test Suite[0m
  [32m  √[0m[90m Sample test[0m
[0m  Exploratory fuzz tests[0m
  [32m  √[0m[90m parser and analyzer stay stable across randomized mixed input[0m
[0m  Discovery tests[0m
  [32m  √[0m[90m returns bin path when bin contains executable[0m
  [32m  √[0m[90m returns bins path when bin missing but bins contains executable[0m
  [32m  √[0m[90m returns null when no executable present[0m
[0m  InlineDebugAdapterSession[0m
  [32m  √[0m[90m streams output to controller and emits DAP lifecycle events[0m
[0m  BlinterRunner — buildArgs[0m
  [32m  √[0m[90m always appends --summary and the file path as last args[0m
  [32m  √[0m[90m adds --follow-calls when enabled[0m
  [32m  √[0m[90m adds --min-severity when not "all"[0m
  [32m  √[0m[90m omits --min-severity when "all"[0m
  [32m  √[0m[90m adds --enabled-rules when non-empty[0m
  [32m  √[0m[90m adds --disabled-rules when non-empty[0m
  [32m  √[0m[90m adds --no-config when useConfigFile is false[0m
  [32m  √[0m[90m adds --max-line-length when not default (100)[0m
  [32m  √[0m[90m adds --no-recursive when enabled[0m
[0m  BlinterRunner — getExePath[0m
  [32m  √[0m[90m returns the correct path to the vendored EXE[0m
[0m  Analysis pipeline[0m
  [32m  √[0m[90m classifies bracketed output and flags critical issues[0m
  [32m  √[0m[90m tracks variable assignments and produces variable trace for undefined variables[0m
  [32m  √[0m[90m resolves relative file paths against workspace root[0m
  [32m  √[0m[90m treats informational detailed codes as non-critical info issues[0m
[92m [0m[32m 40 passing[0m[90m (4s)[0m
[main 2026-02-22T14:36:28.572Z] Extension host with pid 8972 exited with code: 0, signal: unknown.
Exit code:   0
VS Code integration tests finished successfully.
Cached VS Code executable is invalid. Falling back to download. Reason: Configured VS Code executable does not report a VS Code version: C:\Users\philip\sauce\testbench\.vscode-test\vscode-win32-x64-archive-1.105.1\Code.exe
- Resolving version...
√ Validated version: 1.105.1
√ Found existing install in C:\Users\philip\sauce\blinter-vscode-extension\.vscode-test\vscode-win32-x64-archive-1.105.1
```

## System Testing

- Status: PASS
- Duration: 2.43s
- Command: `npx vsce package --no-dependencies --out tmp/system-test.vsix`

```text
DONE  Packaged: tmp/system-test.vsix (20 files, 9.76MB)
```

## Acceptance Testing (UAT)

- Status: PASS
- Duration: 0.23s
- Command: `npm run test:uat`

```text
> blinter@1.26.15681 test:uat
> node ./test/uat.runner.js

UAT checks passed.
```

## Regression Testing

- Status: PASS
- Duration: 0.37s
- Command: `npm run test:regression`

```text
> blinter@1.26.15681 test:regression
> mocha "test/regression.test.js"



  Regression tests
    √ spawnBlinter calls onExit once when both error and close fire
    √ debug adapter emits terminated once when process emits error then close


  2 passing (3ms)
```

## Performance Testing

- Status: PASS
- Duration: 0.29s
- Command: `npm run test:performance`

```text
> blinter@1.26.15681 test:performance
> node ./test/performance.runner.js

Parser benchmark: 8.10ms for 3000 issues.
Analysis benchmark: 47.37ms for 15000 analyzed issues.
Performance report written to: C:\Users\philip\sauce\blinter-vscode-extension\test\reports\performance-latest.json
```

## Security Testing

- Status: PASS
- Duration: 0.99s
- Command: `npm run test:security && npm run test:security:audit`

```text
> blinter@1.26.15681 test:security
> mocha "test/security.test.js"



  Security tests
    √ does not use dynamic code execution primitives
    √ does not hardcode obvious secrets in source files
    √ avoids shell=true and exec-style process launching in runtime extension code


  3 passing (10ms)


> blinter@1.26.15681 test:security:audit
> npm audit --omit=dev --audit-level=high

found 0 vulnerabilities
```

## Smoke Testing

- Status: PASS
- Duration: 0.35s
- Command: `npm run test:smoke`

```text
> blinter@1.26.15681 test:smoke
> mocha "test/smoke.test.js"



  Smoke tests
    √ executes the core parsing + analysis path without throwing
    √ builds arguments and resolves expected executable locations
    √ resolves system blinter command when configured


  3 passing (4ms)
```

## Sanity Testing

- Status: PASS
- Duration: 0.41s
- Command: `npm run test:sanity`

```text
> blinter@1.26.15681 test:sanity
> mocha "test/sanity.test.js"



  Sanity tests
    √ keeps detailed SEC severity aligned as warning
    √ keeps detailed style issues informational and non-critical
    √ flushes trailing stdout data without a newline on process close


  3 passing (6ms)
```

## Exploratory Testing

- Status: PASS
- Duration: 0.36s
- Command: `npm run test:exploratory`

```text
> blinter@1.26.15681 test:exploratory
> mocha "test/exploratory.test.js"



  Exploratory fuzz tests
    √ parser and analyzer stay stable across randomized mixed input


  1 passing (19ms)
```
