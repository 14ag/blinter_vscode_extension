# Blinter — VS Code Batch Linter

Blinter integrates the Blinter linter into Visual Studio Code to provide fast, actionable diagnostics and simple quick fixes for Windows batch files (.bat, .cmd).

What it does
- Runs the native Blinter executable (bundled) against the active batch file and reports problems in the Problems panel.
- Shows a Blinter activity view with a Run button, status, and quick access to the Output channel.
- Provides quick-fix CodeActions for selected diagnostics (configurable via settings).

Requirements
 - Visual Studio Code 1.75.0 or higher.
 - Native Blinter executable bundled in the extension at `bin/blinter.exe` (Windows). The extension requires the native binary and will not fall back to Python. If you renamed the folder to `bins/`, that is also supported.

Quick start
1. Ensure `bin/blinter.exe` is present in the extension root (this is included in our packaged VSIX).
2. Open a `.bat` or `.cmd` file in VS Code.
3. Use the Blinter Activity Bar item or run the command `Blinter: Run` from the Command Palette to run the linter on the active file.

Commands
- `Blinter: Run` — Run the linter on the active BAT/CMD file (contributed as `blinter.run`).

Settings (contributed)
- `blinter.enabled` (boolean) — enable/disable the linter.
- `blinter.runOn` ("onSave" | "onType") — run on save or as you type.
- `blinter.debounceDelay` (number) — debounce delay in ms for onType runs.
- `blinter.rulesPath` (string|null) — optional path to a rules JSON file to override bundled rules.
- `blinter.quickFixCodes` (string[]) — list of diagnostic codes for which the extension will offer quick fixes.

Output & Troubleshooting
- Open View → Output and select "Blinter" to see the raw command invocation and the tool output.
- If the extension cannot find `bin/blinter.exe`, it will show a warning and log details to the Output channel. Make sure `bin/blinter.exe` is present and executable.

Packaging & publishing
- Use `npm run package:vsix` to create a VSIX. Packaging will generate the icon PNG and include `bin/blinter.exe` when present. See `PACKAGING.md` for details.

Notes
- This build targets VS Code and VS Code Insiders. Support for Visual Studio (IDE) is intentionally not included.

License
- MIT — see `LICENSE`.

If you'd like a different layout for the Activity view (logs, last-run summary, clickable problem list), tell me what you'd prefer and I will extend the webview accordingly.