@echo off
echo ========================================
echo  OBS BRB Shorts - Build Script
echo ========================================
echo.

:: Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js not found. Please install Node.js first.
    echo https://nodejs.org/
    pause
    exit /b 1
)

:: Check for npm
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: npm not found. Please install Node.js first.
    pause
    exit /b 1
)

echo [1/4] Installing dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo ERROR: npm install failed
    pause
    exit /b 1
)

echo.
echo [2/4] Installing pkg globally...
call npm install -g pkg
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to install pkg
    pause
    exit /b 1
)

echo.
echo [3/4] Building executable...
if not exist dist mkdir dist
call pkg . --targets node18-win-x64 --output dist/OBS-BRB-Shorts.exe
if %ERRORLEVEL% neq 0 (
    echo ERROR: pkg build failed
    pause
    exit /b 1
)

echo.
echo [4/4] Build complete!
echo.
echo Executable created: dist\OBS-BRB-Shorts.exe
echo.
echo Next steps:
echo   1. Download Inno Setup from https://jrsoftware.org/isdl.php
echo   2. Create an icon.ico file (or remove SetupIconFile from installer.iss)
echo   3. Open installer.iss in Inno Setup Compiler
echo   4. Click Build ^> Compile
echo   5. Find your installer in the "installer" folder
echo.
pause
