# Blinter for VS Code

Blinter is a linter and debug companion for batch scripts (`.bat`, `.cmd`). It runs the bundled `Blinter.exe` and surfaces diagnostics in VS Code Problems, hover tooltips, decorations, and a dedicated output view

## At a glance

- Windows only (`win32`)
- Works with `.bat` and `.cmd`
- Run and debug through `blinter-debug` (F5)
- Quick fixes for suppression comments and command casing

## Release notes summary

- For user-facing changes, see [CHANGELOG.md](./CHANGELOG.md).

## Table of contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Core features](#core-features)
- [Commands](#commands)
- [Configuration](#configuration)
- [Suppression workflow](#suppression-workflow)
- [Output and troubleshooting](#output-and-troubleshooting)
- [Developer setup](#developer-setup)
- [Testing](#testing)
- [Packaging](#packaging)
- [License](#license)

## Installation

### Option 1: Install from VSIX

1. Build or download a `.vsix` package.
2. In VS Code, open Extensions.
3. Select the `...` menu and choose `Install from VSIX...`.
4. Select the VSIX file.

### Option 2: Run from source (development)

1. Clone this repository.
2. Install dependencies:

```powershell
npm ci
```

3. Ensure vendor assets are present:

```powershell
.\setup-vendor.bat
```

4. Press `F5` in VS Code to launch Extension Development Host.

## Quick start

1. Open a workspace containing a `.bat` or `.cmd` file.
2. Open Run and Debug (`Ctrl+Shift+D`).
3. Use `Launch Batch (Blinter)` and run with `F5`.
4. Review diagnostics in Problems and the `Blinter Output` view.
5. Use Quick Fix (`Ctrl+.`) for suppression/comment assistance.

Example `launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Launch Batch (Blinter)",
      "type": "blinter-debug",
      "request": "launch",
      "program": "${file}"
    }
  ]
}
```

## Features

- Registers `blinter-debug` for Run and Debug workflows
- Streams diagnostics while the script runs
- Highlights critical issues in-editor
- Shows grouped issue summaries in `Blinter Output`
- Adds quick fixes for:
  - command casing normalization
  - suppression comments (`LINT:IGNORE`)
  - optional Copilot handoff
- Supports `blinter.ini` creation and status-bar visibility

## Commands

- `Blinter: Run`
- `Blinter: Run and Debug`
- `Blinter: Create Config File`
- `Blinter: Ask Copilot About Diagnostic`
- `Blinter: Remove All Suppressions`

## Configuration

### Linting behavior

- `blinter.enabled` (`boolean`, default `true`)
- `blinter.runOn` (`onSave | onType`, default `onSave`)
- `blinter.debounceDelay` (`number`, default `500`)
- `blinter.followCalls` (`boolean`, default `false`)
- `blinter.minSeverity` (`all | performance | style | warning | error`, default `all`)
- `blinter.enabledRules` (`string[]`, default `[]`)
- `blinter.disabledRules` (`string[]`, default `[]`)
- `blinter.useConfigFile` (`boolean`, default `true`)
- `blinter.maxLineLength` (`number`, default `100`)
- `blinter.noRecursive` (`boolean`, default `false`)

### Presentation

- `blinter.quickFixCodes` (`string[]`)
- `blinter.criticalHighlightColor` (`string`, default `#5a1124`)
- `blinter.encoding` (`string`, default `utf8`)

### Suppression comments

- `blinter.suppressionCommentStyle` (`REM | ::`, default `REM`)
- `blinter.showAskCopilotQuickFix` (`boolean`, default `false`)

## Suppression workflow

When a Blinter diagnostic appears:

1. Use Quick Fix (`Ctrl+.`).
2. Choose `Blinter: Suppress ... on this line`.
3. Blinter inserts a `LINT:IGNORE` comment above the target line.
4. Existing `LINT:IGNORE` codes on the previous line are merged.

You can remove all suppression comments via:

- Command Palette: `Blinter: Remove All Suppressions`
- `Blinter Output` view title button

## Output and troubleshooting

- Open `View -> Output -> Blinter` for command, stdout, and stderr logs.
- If diagnostics do not appear:
  - confirm `blinter.enabled` is true
  - confirm file language is `bat` or `cmd`
  - verify the bundled executable exists under `vendor/Blinter/Blinter.exe`
- If the debug session closes early, inspect output logs first.

## Developer setup

The repository keeps vendor artifacts out of source control where possible. Use:

```powershell
.\setup-vendor.bat
```

to populate the required core assets under `vendor/Blinter`.

## Testing

Common commands:

```powershell
npm run lint
npm run test:unit
npm run test:integration
npm run test:matrix
```

`test:matrix` runs unit, integration, system packaging, UAT checks, regression, performance, security, smoke, sanity, and exploratory suites with reports in `test/reports/`.

## Packaging

Build a VSIX package:

```powershell
.\build.bat
```

or

```powershell
npm run package:vsix
```

See `PACKAGING.md` for release flow details.

## License

- Project: MIT (`LICENSE`)
- Blinter core linter: https://github.com/tboy1337/Blinter
