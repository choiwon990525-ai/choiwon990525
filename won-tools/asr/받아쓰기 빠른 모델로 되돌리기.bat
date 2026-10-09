@echo off
chcp 65001 > nul
title 받아쓰기 빠른 모델로 되돌리기
cd /d "%~dp0"
if exist "models\ggml-large-v3-q5_0.bin" ren "models\ggml-large-v3-q5_0.bin" "ggml-large-v3-q5_0.bin.off"
rem 컴퓨터 켤 때 자동 실행되는 복사본도 새 start-asr.vbs로 (모델 고르는 판)
set "STUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
if exist "%STUP%\won-asr-server.vbs" copy /y "%~dp0start-asr.vbs" "%STUP%\won-asr-server.vbs" > nul
taskkill /IM whisper-server.exe /F > nul 2>&1
timeout /t 2 > nul
wscript.exe "%~dp0start-asr.vbs"
echo.
echo  빠른 모델로 되돌렸어요. 큰 모델을 다시 쓰려면 "받아쓰기 정확도 올리기 (큰 모델 받기).bat" (다시 받지 않고 바로 켜져요)
echo.
pause
