This folder contains a minimal scaffold and instructions to create a Visual Studio (IDE) extension that wraps the Blinter executable.

Notes
- Visual Studio (IDE) uses a different extension model than Visual Studio Code. Building and testing a Visual Studio extension requires Visual Studio with the Extensibility workload and the Visual Studio SDK.
- The files here are a starting point; building a fully integrated Visual Studio extension requires customizing commands, tool windows, and registration in the VSIX manifest.

Suggested approach
1. Open Visual Studio (2019/2022) on Windows with the Visual Studio Extensibility workload.
2. Create a new "VSIX Project" (C#).
3. Add the `blinter.exe` binary as a content file in the VSIX project (set Copy to Output Directory: Always).
4. Add an Editor Command or Tool Window that invokes the bundled `blinter.exe` on the current active file. Use System.Diagnostics.Process to start the exe with required args.
5. Parse the output and integrate results into Visual Studio's Error List by creating ErrorTask objects.

Minimal manifest (provided)
- `source.extension.vsixmanifest` (below) is a minimal file to guide packaging — you must edit it inside Visual Studio or with the VSIX Authoring tooling.

Limitations and next steps
- I can scaffold a working C# VSIX project (with sample command that runs `blinter.exe` and reports errors into the Error List), but I cannot compile it in this environment. If you'd like, I can generate the project files and instructions and you can open them in Visual Studio to build and test.
