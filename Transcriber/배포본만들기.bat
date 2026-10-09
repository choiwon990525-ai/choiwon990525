@echo off
chcp 65001 > nul
title Build Release Package
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_build_release.ps1"
echo.
pause
