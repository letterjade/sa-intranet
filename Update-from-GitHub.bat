@echo off
REM Gets the latest version of Snyder Hub from GitHub, then restart the server window.
cd /d "%~dp0"
git pull
pause
