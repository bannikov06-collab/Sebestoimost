@echo off
setlocal
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0SYNC_CURRENT_PC_AND_UPLOAD.ps1"
exit /b %ERRORLEVEL%
