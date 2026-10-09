@echo off
chcp 65001 > nul
echo Restarting dictation server...
taskkill /IM whisper-server.exe /F > nul 2>&1
timeout /t 2 > nul
wscript.exe "%USERPROFILE%\Documents\won-tools\asr\start-asr.vbs"
echo Done. Model loads in about 20 seconds.
timeout /t 4 > nul
