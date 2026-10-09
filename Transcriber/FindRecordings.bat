@echo off
chcp 65001 > nul
title Find Recordings
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_find.ps1"
echo.
pause