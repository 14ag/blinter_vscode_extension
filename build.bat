@echo off
setlocal enabledelayedexpansion
del blinter.vsix 2>nul
for %%d in (bin\blinter-*.exe) do (
    set "blinter_version=%%~nxd"
    ren "%%d" "Blinter.exe"
)

cmd /c "npm run package:vsix"
ren "bin\Blinter.exe" "!blinter_version!"
endlocal
exit /b
