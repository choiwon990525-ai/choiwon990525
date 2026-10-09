@echo off
taskkill /IM whisper-server.exe /F > nul 2>&1
echo ASR server stopped.
timeout /t 2 > nul
