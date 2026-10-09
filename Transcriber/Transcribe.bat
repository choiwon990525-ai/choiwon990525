@echo off
chcp 65001 > nul
title Class Recording Transcriber
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_transcribe.ps1" %*
echo.
pause