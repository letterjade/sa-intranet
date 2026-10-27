@echo off
REM Starts SA Intranet on this computer, port 8080. Keep this window open.
REM Everyone opens http://<this-computer-IP>:8080/
cd /d "%~dp0"
where py >nul 2>nul && (py -3 server.py --port 8080) || (python server.py --port 8080)
pause
