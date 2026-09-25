@echo off
cd /d "%~dp0"

echo Starting SmartSplit...

where npm >nul 2>nul
if errorlevel 1 (
    echo Node.js and npm are not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

if not exist package.json (
    echo package.json not found in this folder.
    pause
    exit /b 1
)

if not exist node_modules (
    echo Installing project dependencies...
    call npm install
    if errorlevel 1 (
        echo Dependency installation failed.
        pause
        exit /b 1
    )
)

call npm start
