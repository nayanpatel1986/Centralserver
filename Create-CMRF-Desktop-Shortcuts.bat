@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Create-CMRF-Desktop-Shortcuts.ps1"
if errorlevel 1 (
  echo.
  echo Failed to create CRMF desktop shortcuts.
  pause
  exit /b 1
)
echo.
echo Rig-icon Start CRMF and Stop CRMF shortcuts were added to this folder and the desktop.
pause

