@echo off
for %%d in (*.vsix) do set oldBlinter=%%d
if defined oldBlinter (
	move "%oldBlinter%" releases
	if errorlevel 1 (
			echo Failed to move "%oldBlinter%" to releases.
			pause >nul
			exit /b 1
		)
) else (
	echo No .vsix file found to move.
)

set /p "patch=enter the patch number: "

setlocal enabledelayedexpansion
for %%d in (bin\blinter-*.exe) do (
    set "oldExeName=%%~nxd"
    ren "%%d" "Blinter.exe"
)

::dd mm yyyy 
for /f "tokens=1-3 delims=/" %%a in ('date /t') do (
	set dd=%%a
	if "!dd:~0,1!"=="0" set dd=!dd:0=!
	set mm=%%b
	if "!mm:~0,1!"=="0" set mm=!mm:0=!
	set x=!mm!.!dd!%patch%
	)
:: hh mm ss
for /f "tokens=1-3 delims=:" %%a in ('time /t') do (
	set hh=%%b
	if "!hh:~0,1!"=="0" set hh=!hh:0=!
	set y=!hh!
	)
if not defined x set x=0.0
if not defined y set y=00
echo writing version info...
ren "package.json" "package0.json"
set /a "count=0"
for /f "delims=" %%a in (package0.json) do (
	set /a count+=1
    set "line=%%a"
	if !count! lss 7 (
		echo . >nul
		(
		echo !line! | find /i "version" >nul
		) && (
			set "line=  "version": "1.!x!","
			echo 1.!x!>version.txt
		)
	) 
    echo !line!>>package.json
)

del package0.json
cmd /c "npm run package:vsix"

if defined oldExeName (
	ren "bin\Blinter.exe" "!oldExeName!"
)

:: release_v1.!x!-build!y!.extension
if exist blinter.vsix (
	ren "blinter.vsix" "blinter_v1.!x!-build!y!.vsix"
) else (
	echo build failed
	endlocal
	exit /b 1
	)
endlocal
exit /b 0

