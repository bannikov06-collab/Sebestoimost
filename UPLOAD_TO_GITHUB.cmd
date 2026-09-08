@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo ERROR: Git is not installed or is not available in PATH.
  echo Install Git for Windows and run this file again.
  pause
  exit /b 1
)

if not exist ".git" git init
git branch -M main

git remote get-url origin >nul 2>nul
if errorlevel 1 (
  git remote add origin https://github.com/bannikov06-collab/Sebestoimost.git
) else (
  git remote set-url origin https://github.com/bannikov06-collab/Sebestoimost.git
)

git add -A
git diff --cached --quiet
if errorlevel 1 git commit -m "KLM v32: source, data, KD and cumulative patches through CHANGE 05U"

echo.
echo Uploading to GitHub. Git Credential Manager may ask you to sign in.
git push -u origin main
if errorlevel 1 (
  echo.
  echo ERROR: GitHub did not accept the upload.
  echo If the repository already contains files, send the final error lines to Codex.
  pause
  exit /b 1
)

echo.
echo DONE: https://github.com/bannikov06-collab/Sebestoimost
pause
