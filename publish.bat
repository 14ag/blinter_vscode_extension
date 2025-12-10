@echo off

setlocal enabledelayedexpansion

set /a "count=0"
set "file=%userprofile%\sauce\notes\inline.txt"
set "versionInfoFile=version.txt"
set "notesFile=release_notes.md"

for /f "delims=" %%a in (%file%) do (
	set /a count+=1
	if !count! gtr 20 goto :break
    set "line0=%%a"
    echo !line0! | find /i "ovsx_token" >nul && (
        for /f "tokens=2 delims==" %%b in ("!line0!") do (
            set "ovsx_token=%%b"
        )
    )
    echo !line0! | find /i "vsce_token" >nul && (
        for /f "tokens=2 delims==" %%b in ("!line0!") do (
            set "vsce_token=%%b"
        )
)   )
:break

for /f "delims=" %%a in (%versionInfoFile%) do (
    set "line0=%%a"
    for /f "tokens=1,2,3 delims=." %%b in ("!line0!") do (
        set "version=%%b.%%c.%%d"
        set "tag=%%c.%%d"
    )

    
)


for %%a in (*.vsix) do (
    echo publishing to OpenVSX...
    npx ovsx publish --packagePath %%a --pat %ovsx_token%
    echo.
    echo publishing to VS Code Marketplace
    npx vsce publish --packagePath %%a --pat %vsce_token%
    echo.
    echo publishing github release
    gh release create "%tag%" --notes-file "%notesFile%" --title "v%version%" --draft
    gh release upload "%tag%" %%a
    gh release edit "%tag%" --draft=false --latest

)
echo done
endlocal
exit /b
