<!-- Short, focused Copilot instructions for the `blinter` VS Code extension. -->
# Copilot instructions for the blinter extension

This file contains concise, actionable guidance to help an AI coding assistant work productively in this repository.

Key files
- `extension.js` — extension entry point. Exports `activate(context)` and `deactivate()`. Manages `BlinterController` for diagnostics, decorations, hover providers, and debug adapter integration.
- `lib/discovery.js` — finds `blinter.exe` in `bin/` or `bins/` folders, supports versioned executables (e.g., `Blinter-v1.0.94.exe`).
- `lib/analysis.js` — parses Blinter output line-by-line using regex patterns. Handles both legacy and detailed (v1.0.94+) output formats. Tracks variable definitions and builds variable traces.
- `lib/parser.js` — parses complete Blinter stdout into structured issue objects. Supports multi-line detailed output blocks.
- `lib/debugAdapterCore.js` — `InlineDebugAdapterSession` class that spawns Blinter process and streams stdout/stderr via DAP.
- `package.json` — VS Code extension manifest. Defines `blinter-debug` debugger type, activation events (`onDebug:blinter-debug`, `onLanguage:bat`, `onLanguage:cmd`), and configuration properties.
- `test/parser.test.js`, `test/analysis.test.js`, `test/debugAdapter.test.js` — unit tests for parsing and debug adapter behavior.
- `eslint.config.mjs` — project ESLint rules and globals (Node, CommonJS, Mocha).
- `jsconfig.json` — JS/Node config (Node16 modules, ES2022, checkJs enabled).
- `run_tests.bat` — automation script that runs lint and unit tests, capturing output to `project_logs.log`.

Big picture
- This is a VS Code extension for linting and debugging Windows Batch files (.bat/.cmd). It integrates with VS Code's native Run & Debug UI via a debug adapter (`blinter-debug`), and also provides automatic linting on save/onType.
- The extension bundles `blinter.exe` (upstream: https://github.com/tboy1337/Blinter) and executes it as a child process, parsing output for diagnostics, variable traces, and "stupid line" decorations.
- Tests use the official VS Code test runner (`@vscode/test-electron` / `@vscode/test-cli`) and mocha. Unit tests (`npm run test:unit`) can run standalone; integration tests require VS Code test environment.

What to do when making changes
- Preserve the `activate`/`deactivate` exports in `extension.js`. The test/test-runner and VS Code expect those names.
- The extension supports both workspace folders and single-file mode (no workspace). Always handle the case where `vscode.workspace.workspaceFolders` is empty.
- Executable discovery in `lib/discovery.js` checks for `blinter.exe`, `Blinter.exe`, and versioned names (`Blinter-v*.exe`) in `bin/` and `bins/` folders.
- When modifying output parsing, update both `lib/analysis.js` (streaming line-by-line) and `lib/parser.js` (full output parsing) to maintain consistency.
 - When modifying output parsing, update both `lib/analysis.js` (streaming line-by-line) and `lib/parser.js` (full output parsing) to maintain consistency.
 - Before editing any repository file, record a brief "formatting snapshot" into `progress.txt` (see project rules). The snapshot must include: filename, encoding (UTF-8), detected EOL (LF or CRLF), indentation style (tabs or spaces and size), whether a trailing newline exists, total line count, and a 3-line sample around the intended edit (context). Append a one-line intent summary. This helps downstream agents preserve file formatting and avoid accidental reformatting.
- New runtime dependencies must be added to `package.json`. Dev-only test or tooling deps go into `devDependencies`.

Tests and verification
- Run linting locally with `npm run lint`. ESLint config is in `eslint.config.mjs` and expects Node/CommonJS globals.
- Run tests with `npm test`. The `pretest` script runs the linter first.
- Tests are minimal. When adding behavior, add focused tests in `test/` that import `vscode` and exercise command registration or exported functions.

Project-specific patterns and conventions
- Files are plain JS (CommonJS modules). `jsconfig.json` enables type checking for `.js` files — prefer adding JSDoc types for complex functions if needed.
- ESLint rules are deliberately permissive (many rules set to `warn`). Do not change project-wide lint rules without reason; prefer adding file-level overrides where necessary.
- Keep extension activation light. Heavy work should be lazily loaded inside command callbacks to avoid slowing VS Code startup.

Integration points
- VS Code API (via the `vscode` module) is the primary external API. Tests expect the `vscode` test environment provided by `@vscode/test-electron` / `@vscode/test-cli`.
- No external network or platform-specific services are used by default.

Examples (concrete edits)
- To add a new Blinter configuration option:
  1. Add a property to `contributes.configuration.properties` in `package.json` (e.g., `blinter.newOption`).
  2. Read the setting in `extension.js` using `vscode.workspace.getConfiguration('blinter').get('newOption', defaultValue)`.
  3. Add a test in `test/` if the feature affects parsing or executable discovery.
- To modify the debug adapter behavior:
  1. Update `lib/debugAdapterCore.js` for process spawning/streaming logic.
  2. Update `BlinterController.prepareForLaunch()` in `extension.js` if launch arguments change.
  3. Run `npm run test:unit` to verify debug adapter tests pass.

Edge cases an assistant should watch for
- Do not change the extension activation export names (`activate` / `deactivate`).
- If modifying `package.json` `engines.vscode`, ensure tests and `@types/vscode` devDependency remain compatible.

If something is unclear
- Ask about desired activation strategy, making breaking changes to `package.json`, or adding new native modules that require build steps.

After editing
- Run `npm run lint` then `npm run test:unit` (or `run_tests.bat` on Windows) and report any linter/test failures. Include stack traces and exact error output.
 - Run `npm run lint` then `npm run test:unit` (or `run_tests.bat` on Windows) and report any linter/test failures. Include stack traces and exact error output.
 - When making any edits, do not reformat files automatically. Preserve the file's original indentation and EOLs unless the user explicitly asks for a reformat. If you must change formatting, record the before/after snapshot in `progress.txt`.
- For packaging: `build.bat` handles icon generation and VSIX creation. It temporarily renames versioned executables during packaging.

Contact
- The repo has no in-repo AI guidance files to merge; treat this file as the canonical short-runner guide for automated agents.
