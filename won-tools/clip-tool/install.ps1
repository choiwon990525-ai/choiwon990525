# 경기 장면 캡처 도구 - 받아쓰기 서버 설치
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ''
Write-Host '=== 경기 장면 캡처 도구 설치 ===' -ForegroundColor Cyan
Write-Host ''

$tools = Join-Path $env:USERPROFILE 'Documents\won-tools'
$asr   = Join-Path $tools 'asr'
New-Item -ItemType Directory -Path $asr -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $asr 'models') -Force | Out-Null

# 1. 음성인식 실행파일
$exe = Join-Path $asr 'bin\whisper-server.exe'
if (-not (Test-Path -LiteralPath $exe)) {
  Write-Host '[1/4] 음성인식 프로그램 받는 중 (약 8MB)...' -ForegroundColor Yellow
  $zip = Join-Path $env:TEMP 'whisper-bin-x64.zip'
  $pp = $ProgressPreference; $ProgressPreference = 'SilentlyContinue'
  Invoke-WebRequest -Uri 'https://github.com/ggml-org/whisper.cpp/releases/download/b5130/whisper-bin-x64.zip' -OutFile $zip -UseBasicParsing
  $ProgressPreference = $pp
  Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $asr 'bin') -Force
  $rel = Join-Path $asr 'bin\Release'
  if (Test-Path -LiteralPath $rel) {
    Get-ChildItem -LiteralPath $rel -File | Move-Item -Destination (Join-Path $asr 'bin') -Force
    Remove-Item -LiteralPath $rel -Recurse -Force
  }
  Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
} else { Write-Host '[1/4] 음성인식 프로그램 - 이미 있음' -ForegroundColor Green }

# 2. 한국어 모델
$model = Join-Path $asr 'models\ggml-small-q5_1.bin'
if (-not (Test-Path -LiteralPath $model)) {
  Write-Host '[2/4] 한국어 음성 모델 받는 중 (약 181MB, 2~5분 걸립니다)...' -ForegroundColor Yellow
  $pp = $ProgressPreference; $ProgressPreference = 'SilentlyContinue'
  Invoke-WebRequest -Uri 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin' -OutFile $model -UseBasicParsing
  $ProgressPreference = $pp
} else { Write-Host '[2/4] 음성 모델 - 이미 있음' -ForegroundColor Green }

# 3. 실행 스크립트 / 바탕화면 아이콘
Write-Host '[3/4] 실행 스크립트 만드는 중...' -ForegroundColor Yellow
$vbsPath = Join-Path $asr 'start-asr.vbs'
$q = [char]34
$vbsLines = @(
  'Set sh = CreateObject(' + $q + 'WScript.Shell' + $q + ')',
  'sh.Run ' + $q + $q + $q + $exe + $q + $q + ' -m ' + $q + $q + $model + $q + $q + ' --host 127.0.0.1 --port 5005 -l ko -t 8 -nt' + $q + ', 0, False'
)
Set-Content -LiteralPath $vbsPath -Value $vbsLines -Encoding ASCII

$sortSrc = Join-Path $here 'sort-clips.ps1'
if (Test-Path -LiteralPath $sortSrc) { Copy-Item -LiteralPath $sortSrc -Destination (Join-Path $tools 'sort-clips.ps1') -Force }

$desktop = [Environment]::GetFolderPath('Desktop')
Copy-Item -LiteralPath $vbsPath -Destination (Join-Path $desktop '받아쓰기 서버 켜기.vbs') -Force

$sortBatLines = @(
  '@echo off',
  'chcp 65001 > nul',
  'powershell -NoProfile -ExecutionPolicy Bypass -File ' + $q + '%USERPROFILE%\Documents\won-tools\sort-clips.ps1' + $q,
  'echo.',
  'echo Press any key to close...',
  'pause > nul'
)
Set-Content -LiteralPath (Join-Path $desktop '관전캡처 정리.bat') -Value $sortBatLines -Encoding ASCII

$startup = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
if (Test-Path -LiteralPath $startup) { Copy-Item -LiteralPath $vbsPath -Destination (Join-Path $startup 'won-asr-server.vbs') -Force }

# 4. 서버 켜기
Write-Host '[4/4] 받아쓰기 서버 켜는 중...' -ForegroundColor Yellow
Start-Process -FilePath 'wscript.exe' -ArgumentList ($q + $vbsPath + $q)
Start-Sleep -Seconds 12
$ok = $false
try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:5005/' -TimeoutSec 5 -UseBasicParsing; if ($r.StatusCode -eq 200) { $ok = $true } } catch {}

Write-Host ''
if ($ok) { Write-Host '설치 완료! 받아쓰기 서버가 켜졌습니다.' -ForegroundColor Green }
else { Write-Host '설치는 끝났습니다. 서버 응답 확인 실패 - 바탕화면 받아쓰기 서버 켜기 를 더블클릭해 보세요.' -ForegroundColor Yellow }
Write-Host ''
Write-Host '다음: 방금 열린 안내 페이지에서 빨간 버튼을 북마크바로 끌어다 놓으세요.' -ForegroundColor Cyan
Write-Host ''

$guide = Join-Path $here '2-시작하기.html'
if (Test-Path -LiteralPath $guide) { Start-Process $guide }

Write-Host '아무 키나 누르면 창이 닫힙니다.'
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')