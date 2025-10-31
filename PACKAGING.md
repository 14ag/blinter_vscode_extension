# Packaging and VSIX inclusion notes for Blinter extension

This document explains how to package the extension so Windows users receive the bundled native `blinter.exe` and any bundled Python assets.

Checklist before packaging

- Ensure `bin/blinter.exe` (Windows native) is present in the repository root under `bin/` (or `bins/` if you've renamed the folder).
- Ensure `.vscodeignore` does **not** exclude `bin/` or the executable. The repository’s ignore settings already keep it.
- The extension no longer ships or references Python scripts; only the native executable is required.

Third-party license & redistribution notes
-----------------------------------------
The bundled native executable is a third-party project (Blinter) authored by
`tboy1337` and licensed under the GNU AGPL-3.0. The executable included in this
repository at the time of writing is `bin/Blinter-v1.0.94.exe` (Blinter v1.0.94).

Important: redistributing AGPL-licensed binaries carries strong copyleft
obligations. If you redistribute a VSIX containing the AGPL binary, you must
ensure recipients have access to the corresponding source (upstream Blinter
source is available at https://github.com/tboy1337/Blinter). Review legal
requirements for AGPL before publishing this extension to the Marketplace or
any other distribution channel.

If shipping an AGPL binary is not acceptable for your distribution, consider
one of the following alternatives:

- Do not bundle the executable in the VSIX; instead provide an installer or
	post-install download step that fetches the binary directly from the
	upstream project (ensuring they accept the license and distribution method).
- Use the pip-installable Python package approach (recommended by upstream) and
	invoke `python -m blinter` rather than bundling the PyInstaller executable.
- Replace the executable with a user-provided path and surface a clear
	configuration option for users to point to an installed Blinter binary.
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
