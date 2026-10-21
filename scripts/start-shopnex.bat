@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-shopnex.ps1"
exit /b %ERRORLEVEL%
