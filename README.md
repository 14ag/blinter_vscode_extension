# Blinter — the IDE Batch Linter

Blinter integrates the vendored Blinter linter EXE into the IDE's **Run & Debug** workflow so Windows batch files (`.bat`, `.cmd`) get diagnostics, suppression comments, and actionable quick fixes as you work.

## What it does
- Registers a `blinter-debug` debug type that invokes the vendored `Blinter.exe` and streams its output into the IDE.
- Parses stdout incrementally to keep the **Problems** panel, hover tooltips, and inline critical issue decorations in sync.
- Exposes a **Blinter Output** view in the Run & Debug sidebar that groups diagnostics and lets you jump straight to problem lines.
- Provides command-casing quick fixes (configurable) and detailed variable traces for undefined-variable diagnostics.
- Offers **suppress on this line** quick fixes that insert `LINT:IGNORE` comments.
- Shows a status bar indicator for `blinter.ini` in the workspace.
- Provides a **Blinter: Create Config File** command to bootstrap a `blinter.ini` in your workspace.

## Requirements (Prerequisites)

- **Windows OS** (required). Blinter specifically targets Windows batch scripting.
- **No Python Required**. The extension bundles the core linter as a standalone executable.
- See the Blinter project for more details: [https://github.com/tboy1337/Blinter](https://github.com/tboy1337/Blinter) (Core v1.0.112 @ 3564f35)

## Developer Setup (Cloning)

If you are cloning this repository for development, you must pull the core Blinter linter sources into the `vendor/` folder (which is ignored by Git to keep the repository size manageable).

1. Execute the `setup-vendor.bat` script located at the repository root.
2. This script downloads and extracts the validated version of the core linter (**v1.0.112 @ 3564f35**) into `vendor/Blinter`.

> [!NOTE]
> The extension package (`.vsix`) automatically includes these sources, so regular users do not need to perform this setup.

## Quick start
1. Open a workspace that contains the batch file you want to lint.
2. Open the **Run & Debug** view (`Ctrl+Shift+D`) and choose the `Launch Batch (Blinter)` configuration. If prompted, allow the IDE to create a `launch.json` using the snippet below.
4. Press **Run** (F5). Blinter runs immediately, populating the Problems panel, in-editor highlights, and the Blinter Output view.

Example `launch.json` entry:

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

## Settings


### Linting behaviour
- **`blinter.enabled`** (boolean) — Enable/disable Blinter (`true`).
- **`blinter.runOn`** (`"onSave"` | `"onType"`) — When to auto-lint (`"onSave"`).
- **`blinter.debounceDelay`** (number) — Debounce in ms for `onType` runs (`500`).
- **`blinter.followCalls`** (boolean) — Pass `--follow-calls` to trace CALL statements and eliminate false-positive undefined-variable warnings (`false`).
- **`blinter.minSeverity`** (`"all"` | `"performance"` | `"style"` | `"warning"` | `"error"`) — Suppress diagnostics below this severity (`"all"`).
- **`blinter.enabledRules`** (string[]) — Exclusive list of rule codes to enable. Empty = all rules (`[]`).
- **`blinter.disabledRules`** (string[]) — Rule codes to disable (`[]`).
- **`blinter.useConfigFile`** (boolean) — Let Blinter read `blinter.ini` from the workspace root (`true`). Set to `false` to pass `--no-config`.
- **`blinter.maxLineLength`** (number) — Maximum line length for rule S011 (`100`).
- **`blinter.noRecursive`** (boolean) — When linting a directory, analyze only the top-level folder (`false`).

### Presentation
- **`blinter.quickFixCodes`** (string[]) — Diagnostic codes that offer command-casing quick fixes.
- **`blinter.criticalHighlightColor`** (string) — Hex colour for critical issue highlights during debug sessions (`#5a1124`).
- **`blinter.encoding`** (string) — Encoding for Blinter output (`utf8`).

### Suppression comments
- **`blinter.suppressionCommentStyle`** (`"REM"` | `"::"`) — Comment style for inserted `LINT:IGNORE` comments (`"REM"`).

## Suppression quick fixes

When a Blinter diagnostic appears on a line, the **Quick Fix** (`Ctrl+.`) menu shows:

- **Blinter: Suppress [CODE] on this line** - inserts `REM LINT:IGNORE [CODE]` on a dedicated line above the flagged line.
- Optional: **Blinter: Ask Copilot about [CODE]** - enable `blinter.showAskCopilotQuickFix` to add this action.

Suppression merges codes if a `LINT:IGNORE` comment already exists directly above the target line. Multiple codes are joined with `, `.

## Blinter: Create Config File command

Run **Blinter: Create Config File** from the Command Palette to generate a `blinter.ini` in the workspace root using the vendored linter. The file is opened automatically after creation.

The status bar shows `$(gear) blinter.ini` when a config file exists (click to open it), or `$(circle-slash) No blinter.ini` when it doesn't (click to create one). The indicator is only visible when a `.bat` or `.cmd` file is active.

## Output & troubleshooting
- **View → Output → Blinter** shows the exact command invocation, stdout, and stderr.
- Diagnostics clear automatically when a session ends; start a new Run & Debug session to refresh analysis.

## Packaging & publishing
- Run `build.bat` to build a distributable VSIX. The script regenerates icon assets and runs `vsce package`.
- See `PACKAGING.md` for end-to-end packaging guidance.

## License
- MIT — see `LICENSE`.
- Blinter (core linter): tboy1337 — [https://github.com/tboy1337/Blinter](https://github.com/tboy1337/Blinter)

Questions or feature requests? Open an issue or tweak the Blinter Output webview to suit your team's workflow.
