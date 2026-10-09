@echo off
chcp 65001 > nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%USERPROFILE%\Documents\won-tools\sort-clips.ps1"
echo.
echo Press any key to close...
pause > nul
