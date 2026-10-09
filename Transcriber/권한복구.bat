@echo off
chcp 65001 > nul
title Fix Transcriber Permissions
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_fix.ps1"
echo.
pause