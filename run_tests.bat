@echo off
setlocal
set LOGFILE=project_logs.log

echo Running lint and unit tests, capturing output to %LOGFILE%...
echo ======================================== > %LOGFILE%
echo Test run started: %DATE% %TIME% >> %LOGFILE%
echo ======================================== >> %LOGFILE%
echo. >> %LOGFILE%

echo [1/2] Running ESLint...
call npm run lint >> %LOGFILE% 2>&1
set LINT_EXIT=%ERRORLEVEL%

echo [2/2] Running unit tests...
call npm run test:unit >> %LOGFILE% 2>&1
set TEST_EXIT=%ERRORLEVEL%

echo. >> %LOGFILE%
echo ======================================== >> %LOGFILE%
echo Test run completed: %DATE% %TIME% >> %LOGFILE%
echo Lint exit code: %LINT_EXIT% >> %LOGFILE%
echo Unit tests exit code: %TEST_EXIT% >> %LOGFILE%
echo ======================================== >> %LOGFILE%

if %LINT_EXIT% neq 0 (
    echo Lint failed with exit code %LINT_EXIT%
    exit /b %LINT_EXIT%
)

if %TEST_EXIT% neq 0 (
    echo Unit tests failed with exit code %TEST_EXIT%
    exit /b %TEST_EXIT%
)

echo All tests passed
endlocal
exit /b 0
