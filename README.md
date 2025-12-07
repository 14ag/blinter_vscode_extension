# Blinter — the IDE Batch Linter

Blinter integrates the native Blinter executable into the IDE's **Run & Debug** workflow so Windows batch files (`.bat`, `.cmd`) get diagnostics and actionable quick fixes while you iterate.

## What it does
- Registers a `blinter-debug` debug type that launches the bundled `blinter.exe` and streams its output into the IDE.
- Parses stdout incrementally to keep the **Problems** panel, hover tooltips, and inline “stupid line” decorations in sync.
- Exposes a **Blinter Output** view in the Run & Debug sidebar that groups diagnostics (errors, warnings, undefined variables, etc.) and lets you jump straight to problem lines.
- Provides command-casing quick fixes (configurable) and detailed variable traces for undefined-variable diagnostics.

## Requirements
- Visual Studio Code 1.75.0 or higher (stable, Insiders of forks).

Important third-party notice
----------------------------
This extension bundles the upstream Blinter linter (standalone executable) produced
by the Blinter project (author: `tboy1337`). The bundled executable in this
repository is `bin/Blinter-v1.0.94.exe` (Blinter v1.0.94). Blinter itself is
licensed under the GNU AGPL-3.0 (AGPL-3.0-or-later). By bundling the executable
we are redistributing AGPL-licensed code; please review the upstream
license (https://github.com/tboy1337/Blinter) and ensure the AGPL obligations are
acceptable for your distribution channel. The extension code (this repository)
is released under the MIT license (see `LICENSE`).

Credits
-------
- Blinter (core linter executable): tboy1337 — https://github.com/tboy1337/Blinter
- This the IDE integration and extension scaffolding: Blinter the IDE Extension
  contributors (see repository history / git log)

## Quick start
1. Open a workspace that contains the batch file you want to lint.
2. Open the **Run & Debug** view (`Ctrl+Shift+D`) and choose the `Launch Batch (Blinter)` configuration. If prompted, allow the IDE to create a `launch.json` using the snippet below.
3. Press **Run** (F5). Blinter runs immediately, populating the Problems panel, in-editor highlights, and the Blinter Output view.

Example `launch.json` entry:

```
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
- `blinter.enabled` (boolean) – enable/disable the integration entirely.
- `blinter.runOn` (`"onSave" | "onType"`) – keep the legacy background linting triggers if you prefer automatic runs outside of debugging.
- `blinter.debounceDelay` (number) – debounce (ms) for `onType` runs.
- `blinter.rulesPath` (string|null) – optional override for a custom rules JSON file.
- `blinter.quickFixCodes` (string[]) – diagnostic codes that should offer command-casing quick fixes.
- `blinter.stupidHighlightColor` (string) – hex color used for highlighted “stupid” lines during a debug session.

## Output & troubleshooting
- View → Output → **Blinter** shows the exact command invocation, stdout, and stderr.
- Diagnostics clear automatically when a session ends; start a new Run & Debug session to refresh analysis.

## Packaging & publishing
- Run `build.bat` to build a distributable VSIX. The script regenerates the icon assets and runs `vsce package`.
- See `PACKAGING.md` for end-to-end packaging guidance (including CI notes and artifact checks).

## License
- MIT — see `LICENSE`.

Questions or feature requests? Open an issue or tweak the Blinter Output webview to suit your team’s workflow.