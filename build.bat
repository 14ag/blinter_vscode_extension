@echo off
setlocal
for /d %%d in (bin\blinter-*) do (
    set "blinter_version=%%d"
    ren %%d Blinter.exe
)
npm run package:vsix
ren Blinter.exe %blinter_version%
endlocal
pause
exit /b