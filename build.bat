@echo off
setlocal enabledelayedexpansion

for %%d in (bin\blinter-*.exe) do (
    set "blinter_version=%%~nxd"
    ren "%%d" "Blinter.exe"
)

cmd /c "npm run package:vsix"
ren "bin\Blinter.exe" "!blinter_version!"
pause
endlocal
exit /b
