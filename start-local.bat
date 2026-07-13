@echo off
cd /d "%~dp0"
where python >nul 2>nul
if %errorlevel% neq 0 (
  echo May chua co Python. Hay cai Python hoac dung GitHub Pages.
  pause
  exit /b 1
)
start "" http://localhost:8080
python -m http.server 8080
