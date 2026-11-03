@echo off
setlocal
cd /d "%~dp0.."
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%CD%\Invoke-CMRF-Launcher.ps1" -Action Start
if errorlevel 1 (
  echo.
  echo CRMF could not start. Review the PowerShell error above and files in logs\.
  pause
)
