<!-- Short, focused Copilot instructions for the `blinter` VS Code extension. -->
# Copilot instructions for the blinter extension

This file contains concise, actionable guidance to help an AI coding assistant work productively in this repository.

Key files
- `extension.js` — extension entry point. Exports `activate(context)` and `deactivate()`; registers the `blinter.helloWorld` command.
- `package.json` — VS Code extension manifest. `main` points to `./extension.js`. Scripts:
  - `npm run lint` runs `eslint .` using `eslint.config.mjs`.
  - `npm test` runs `vscode-test` (pretest runs lint).
- `test/extension.test.js` — basic mocha test harness that runs inside VS Code test runner.
- `eslint.config.mjs` — project ESLint rules and globals (Node, CommonJS, Mocha).
- `jsconfig.json` — JS/Node config (Node16 modules, ES2022, checkJs enabled).

Big picture
- This is a small VS Code extension implemented in plain CommonJS JavaScript. The extension registers one command (`blinter.helloWorld`) that shows an information message. The codebase follows the classic single-file extension layout: `package.json` (manifest) + `extension.js` (runtime).
- Tests use the official VS Code test runner (`@vscode/test-electron` / `@vscode/test-cli`) and mocha. Linting is enforced before tests via the `pretest` script.

What to do when making changes
- Preserve the `activate`/`deactivate` exports in `extension.js`. The test/test-runner and VS Code expect those names.
- If you add new commands, update `contributes.commands` in `package.json` and register them in `extension.js`.
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
- To add a new command `blinter.checkFile`:
  1. Add a command entry to `package.json` under `contributes.commands`.
  2. In `extension.js`, call `vscode.commands.registerCommand('blinter.checkFile', handler)` and push the disposable into `context.subscriptions`.
  3. Add a unit/integration test in `test/` that launches the extension test runner and verifies the command is registered or behaves as expected.

Edge cases an assistant should watch for
- Do not change the extension activation export names (`activate` / `deactivate`).
- If modifying `package.json` `engines.vscode`, ensure tests and `@types/vscode` devDependency remain compatible.

If something is unclear
- Ask about desired activation strategy, making breaking changes to `package.json`, or adding new native modules that require build steps.

After editing
- Run `npm run lint` then `npm test` and report any linter/test failures. Include stack traces and exact error output.

Contact
- The repo has no in-repo AI guidance files to merge; treat this file as the canonical short-runner guide for automated agents.
