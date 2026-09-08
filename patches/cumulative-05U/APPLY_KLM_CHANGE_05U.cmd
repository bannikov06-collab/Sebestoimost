@echo off
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0APPLY_KLM_CHANGE_05U.ps1"
