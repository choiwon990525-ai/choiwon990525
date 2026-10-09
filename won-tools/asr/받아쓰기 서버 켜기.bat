@echo off
chcp 65001 > nul
title 받아쓰기 서버 (이 창을 닫으면 서버도 꺼집니다)
taskkill /IM whisper-server.exe /F > nul 2>&1
cd /d "%~dp0"
set "BIN="
if exist "%~dp0bin-gpu\whisper-server.exe" set "BIN=%~dp0bin-gpu"
if not defined BIN if exist "%~dp0bin-gpu\Release\whisper-server.exe" set "BIN=%~dp0bin-gpu\Release"
if not defined BIN if exist "%~dp0bin2\whisper-server.exe" set "BIN=%~dp0bin2"
if not defined BIN set "BIN=%~dp0bin"
set "MDL=%~dp0models\ggml-large-v3-turbo-q5_0.bin"
if exist "%~dp0models\ggml-large-v3-q5_0.bin" set "MDL=%~dp0models\ggml-large-v3-q5_0.bin"
set "PATH=%BIN%;%PATH%"
echo.
echo  실행 파일 위치: %BIN%
echo  모델: %MDL%
echo  받아쓰기 서버를 켜는 중... "listening" 이 나오면 켜진 것입니다.
echo  그래픽카드 버전이면 위쪽에 "CUDA" / "RTX 4070" 글자가 보입니다.
echo.
"%BIN%\whisper-server.exe" -m "%MDL%" --host 127.0.0.1 --port 5005 -l ko -t %NUMBER_OF_PROCESSORS% -bs 5 -nt
echo.
echo  ===== 서버가 멈췄습니다 =====
echo  위에 나온 글자(특히 error, failed 줄)를 캡처해서 Claude에게 보내주세요.
pause
