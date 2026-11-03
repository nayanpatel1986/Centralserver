@echo off
setlocal
cd /d "%~dp0.."
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%CD%\Invoke-CMRF-Launcher.ps1" -Action Stop
if errorlevel 1 (
  echo.
  echo CRMF could not stop. Review the PowerShell error above.
  pause
)
