@echo off
chcp 65001 > nul
title 받아쓰기 큰 모델 받기
cd /d "%~dp0"
if exist "models\ggml-large-v3-q5_0.bin.off" ren "models\ggml-large-v3-q5_0.bin.off" "ggml-large-v3-q5_0.bin"
if exist "models\ggml-large-v3-q5_0.bin" (
  echo.
  echo  큰 모델이 이미 있어요. 받아쓰기 서버만 큰 모델로 다시 켭니다.
  goto restart
)
echo.
echo  받아쓰기를 더 정확하게 하는 큰 모델(약 1.1GB)을 받습니다.
echo  인터넷 속도에 따라 몇 분 걸려요. 받는 동안 이 창을 닫지 마세요.
echo.
curl -L --fail --retry 3 -o "models\ggml-large-v3-q5_0.bin.part" "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-q5_0.bin"
if errorlevel 1 goto fail
set SZ=0
for %%A in ("models\ggml-large-v3-q5_0.bin.part") do set SZ=%%~zA
if %SZ% LSS 1000000000 goto fail
move /y "models\ggml-large-v3-q5_0.bin.part" "models\ggml-large-v3-q5_0.bin" > nul
:restart
echo.
echo  받아쓰기 서버를 큰 모델로 다시 켭니다...
rem 컴퓨터 켤 때 자동 실행되는 복사본도 새 start-asr.vbs로 (모델 고르는 판)
set "STUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
if exist "%STUP%\won-asr-server.vbs" copy /y "%~dp0start-asr.vbs" "%STUP%\won-asr-server.vbs" > nul
taskkill /IM whisper-server.exe /F > nul 2>&1
timeout /t 2 > nul
wscript.exe "%~dp0start-asr.vbs"
echo.
echo  완료! 30초쯤 뒤부터 큰 모델로 받아써요 (한 번에 1~2초 걸릴 수 있어요).
echo  예전 빠른 모델로 돌아가려면 "받아쓰기 빠른 모델로 되돌리기.bat"
echo.
pause
exit /b 0
:fail
echo.
echo  ===== 받기 실패 =====
echo  인터넷 연결을 확인하고 이 파일을 다시 실행해 주세요.
del "models\ggml-large-v3-q5_0.bin.part" > nul 2>&1
pause
exit /b 1
