@echo off
setlocal
cd /d "%~dp0server"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 20 or newer, then run this file again.
  pause
  exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0])<20)process.exit(1)"
if errorlevel 1 (
  echo Node.js 20 or newer is required.
  pause
  exit /b 1
)
if not exist "node_modules\ws\package.json" (
  call npm.cmd ci
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)
if not defined PORT set "PORT=3001"
echo Open http://localhost:%PORT% in your browser.
echo Keep this window open while playing. Press Ctrl+C to stop.
node index.js
if errorlevel 1 (
  echo Server stopped with an error. If the port is in use, close the old server first.
  pause
)
endlocal
