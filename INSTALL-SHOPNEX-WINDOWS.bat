@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0INSTALL-SHOPNEX-WINDOWS.ps1"
exit /b %ERRORLEVEL%
