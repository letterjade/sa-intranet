@echo off
REM Gets the latest version of SA Intranet from GitHub, then restart the server window.
cd /d "%~dp0"
git pull
pause
