@echo off
REM Svart Suite Local Development - VS Code Only
REM Double-click this file to open the project in VS Code

echo.
echo ============================================================
echo  Svart Suite - Open in Visual Studio Code
echo ============================================================
echo.
echo All local development must be done through VS Code.
echo Use the "Live Server" extension to preview the site.
echo.

REM Check if VS Code is installed
where code >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Visual Studio Code is not installed or not in PATH
    echo.
    echo Please install VS Code from: https://code.visualstudio.com/
    echo.
    pause
    exit /b 1
)

echo Opening project in Visual Studio Code...
echo.
echo Once VS Code opens:
echo   1. Install "Live Server" extension (if not already installed)
echo   2. Right-click index.html
echo   3. Select "Open with Live Server"
echo.

code .

pause
