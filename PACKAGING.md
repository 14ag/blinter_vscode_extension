# Packaging and VSIX inclusion notes for Blinter extension

This document explains how to package the extension so Windows users receive the bundled native `blinter.exe` and any bundled Python assets.

Checklist before packaging

- Ensure `bin/blinter.exe` (Windows native) is present in the repository root under `bin/` (or `bins/` if you've renamed the folder).
- Ensure `.vscodeignore` does **not** exclude `bin/` or the executable. The repository’s ignore settings already keep it.
- The extension no longer ships or references Python scripts; only the native executable is required.
- Choose a `publisher` name and set `engines.vscode` in `package.json` to the supported VS Code range.
- Verify the documentation (README / `project.txt`) references the Run & Debug flow and the `blinter-debug` launch configuration.

Packaging steps (local)

1. Install packaging tool (`vsce`) if you don't have it:

```powershell
npm install -g vsce
```

2. Optional: run the linter and tests locally:

```powershell
npm install
npm run lint
npm run test:unit  # runs parser, discovery, analysis, and debug adapter unit tests
```

3. Build the VSIX (from repository root):

```powershell
vsce package
```

4. Verify the generated `.vsix` contains `bin/blinter.exe` and `assets/`:

```powershell
# unzip and inspect (VSIX is a zip file)
mkdir vsix_inspect
Copy-Item .\blinter-*.vsix .\vsix.zip
Expand-Archive .\vsix.zip .\vsix_inspect
Get-ChildItem .\vsix_inspect -Recurse | Select-Object FullName
```

Notes and recommendations

- If you want smaller package sizes, consider shipping platform-specific builds (Windows-only VSIX with `bin/blinter.exe`) or provide download-on-first-run logic. Bundling the exe makes installation frictionless for Windows users.
- Ensure your `package.json` `publisher` field is set before publishing to the marketplace.
- If your CI runs `vsce package`, make sure CI checks out binary artifacts or copies `bin/` into the workspace before packaging.

Troubleshooting

- If `blinter.exe` is missing from the VSIX, check `.vscodeignore` for patterns that exclude `bin/` or the file; remove them.
- If the extension fails to execute the binary after install, verify the binary is not blocked by Windows (right-click > Properties > Unblock) and is a compatible architecture.
