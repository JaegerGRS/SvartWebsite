@echo off
REM Svart Suite Demo & Security Testing Launcher
REM Opens project in VS Code and runs security tests

cls
echo.
echo ============================================================
echo   SVART SUITE SECURITY DEMONSTRATION & TESTING SUITE
echo ============================================================
echo.
echo This script will:
echo   1. Open the project in Visual Studio Code
echo   2. Run automated security tests
echo   3. Use VS Code Live Server to preview the site
echo.

REM Check if VS Code is installed
where code >nul 2>&1
if errorlevel 1 (
    echo ERROR: Visual Studio Code is not installed or not in PATH
    echo.
    echo Please install VS Code from: https://code.visualstudio.com/
    pause
    exit /b 1
)

echo VS Code detected
echo.

REM Check if Python is installed (needed for security tests)
python --version >nul 2>&1
if errorlevel 1 (
    echo WARNING: Python is not installed - security tests will be skipped
    echo Install Python from: https://www.python.org/downloads/
    echo.
    echo Opening project in VS Code...
    code .
    pause
    exit /b 0
)

echo Python detected (for security tests)
echo.

REM Open project in VS Code
echo Opening project in Visual Studio Code...
echo Use Live Server extension to preview the site.
echo.
start "" code .

REM Wait a moment for VS Code to open
timeout /t 3 /nobreak >nul

REM Start security tests in main window
echo.
echo Starting automated security test suite...
echo.
echo Preview the site using VS Code Live Server extension.
echo.
python security-test.py

pause
