@echo off
chcp 65001 > nul
title Fix Transcriber Permissions
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\elsha\Transcriber\_fix.ps1"
echo.
pause