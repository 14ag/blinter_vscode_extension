@echo off
setlocal

:: Configuration
set BLINTER_VERSION=1.0.112
set VENDOR_DIR=%~dp0vendor\Blinter
set ZIP_FILE=%TEMP%\Blinter-%BLINTER_VERSION%-src.zip
set EXTRACT_DIR=%TEMP%\Blinter-src-extract

echo [Blinter] Setting up vendor sources (v%BLINTER_VERSION%)...

:: Create vendor directory if it doesn't exist
if not exist "%VENDOR_DIR%" mkdir "%VENDOR_DIR%"

:: Download source from GitHub
echo [Blinter] Downloading source zipball...
powershell -Command "Invoke-WebRequest -Uri 'https://api.github.com/repos/tboy1337/Blinter/zipball/v%BLINTER_VERSION%' -OutFile '%ZIP_FILE%' -UseBasicParsing"

if %ERRORLEVEL% neq 0 (
    echo [Error] Failed to download Blinter source.
    exit /b %ERRORLEVEL%
)

:: Extract
echo [Blinter] Extracting...
if exist "%EXTRACT_DIR%" rmdir /s /q "%EXTRACT_DIR%"
mkdir "%EXTRACT_DIR%"
powershell -Command "Expand-Archive -Path '%ZIP_FILE%' -DestinationPath '%EXTRACT_DIR%' -Force"

:: Find the extracted folder (GitHub adds a hash to the folder name)
for /d %%i in ("%EXTRACT_DIR%\*") do set "SRC_FOLDER=%%i"

:: Copy files to vendor/Blinter
echo [Blinter] Copying files to %VENDOR_DIR%...
xcopy "%SRC_FOLDER%\*" "%VENDOR_DIR%\" /s /e /y /q

:: Cleanup
echo [Blinter] Cleaning up...
del "%ZIP_FILE%"
rmdir /s /q "%EXTRACT_DIR%"

echo [Blinter] Setup complete! Core v%BLINTER_VERSION% is ready in vendor\Blinter.
pause
