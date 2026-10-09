# 배포본 빌더 - 실행하면 배포용 패키지를 만든다
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
try { Set-Location -LiteralPath $root -ErrorAction Stop } catch { }
# PowerShell 5.1 에는 -Encoding utf8BOM 이 없으므로 .NET 으로 직접 쓴다
function WriteBom($path, $text) {
  [System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($true)))
}

$out  = Join-Path $root "배포본"
$pkg  = Join-Path $out "Transcriber"

Write-Host ""
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host " 배포본 만들기" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

if (Test-Path $pkg) { Remove-Item $pkg -Recurse -Force }
New-Item -ItemType Directory -Force -Path $pkg | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $pkg "녹음") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $pkg "전사") | Out-Null

# ---------- 1) 전사 스크립트 (개인 경로 제거) ----------
$src = Get-Content (Join-Path $root "_transcribe.ps1") -Encoding UTF8 -Raw
$src = $src.Replace('Join-Path $d "수업\전사"', 'Join-Path $d "전사결과"')
WriteBom (Join-Path $pkg "_transcribe.ps1") $src
Write-Host "  [1/6] 전사 스크립트 - 개인 경로 제거 완료" -ForegroundColor Green

# ---------- 2) 실행 배치 ----------
$runBat = "@echo off`r`nchcp 65001 > nul`r`ntitle Transcriber`r`ncd /d `"%~dp0`"`r`npowershell -NoProfile -ExecutionPolicy Bypass -File `"%~dp0_transcribe.ps1`" %*`r`necho.`r`npause`r`n"
[System.IO.File]::WriteAllText((Join-Path $pkg "Transcribe.bat"), $runBat, [System.Text.Encoding]::ASCII)
Write-Host "  [2/6] 실행 배치" -ForegroundColor Green

# ---------- 3) 설치 스크립트 ----------
$setupText = @'
# 최초 1회 실행: 엔진과 AI 모델을 내려받아 설치한다
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
try { Set-Location -LiteralPath $root -ErrorAction Stop } catch { }
$eng = Join-Path $root "engine"

Write-Host ""
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host " 설치 - 엔진과 AI 모델을 내려받습니다" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host " 약 4.3GB를 받습니다. 인터넷 속도에 따라 5~30분 걸립니다."
Write-Host " 설치 후 차지하는 용량은 약 8GB입니다."
Write-Host ""

$gpu = $null
try { $gpu = & nvidia-smi --query-gpu=name --format=csv,noheader 2>$null } catch { }
if ($gpu) { Write-Host " GPU: $gpu" -ForegroundColor Green }
else { Write-Host " [주의] NVIDIA GPU를 찾지 못했습니다. CPU로 돌면 매우 느립니다." -ForegroundColor Yellow }

$ans = Read-Host " 계속할까요? (Y/n)"
if ($ans -match '^\s*[Nn]') { exit 0 }

New-Item -ItemType Directory -Force -Path $eng | Out-Null

# 1) 엔진
$engExe = Join-Path $eng "faster-whisper-xxl.exe"
if (-not (Test-Path $engExe)) {
  Write-Host ""
  Write-Host " [1/2] 엔진 내려받는 중 (1.4GB)..." -ForegroundColor White
  $url = "https://github.com/Purfview/whisper-standalone-win/releases/download/Faster-Whisper-XXL/Faster-Whisper-XXL_r245.4_windows.7z"
  $sz  = Join-Path $root "engine.7z"
  & curl.exe -L --retry 3 -# -o $sz $url
  if (-not (Test-Path $sz)) { Write-Host " [오류] 다운로드 실패" -ForegroundColor Red; exit 1 }
  Write-Host " 압축 푸는 중 (1~2분)..." -ForegroundColor White
  $tmpX = Join-Path $root "_x"
  if (Test-Path $tmpX) { Remove-Item $tmpX -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $tmpX | Out-Null
  tar -xf $sz -C $tmpX
  $inner = Get-ChildItem $tmpX -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
  $srcDir = if ($inner -and (Test-Path (Join-Path $inner.FullName "faster-whisper-xxl.exe"))) { $inner.FullName } else { $tmpX }
  Get-ChildItem $srcDir | ForEach-Object { Move-Item $_.FullName (Join-Path $eng $_.Name) -Force }
  Remove-Item $tmpX -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item $sz -Force -ErrorAction SilentlyContinue
  Write-Host " 엔진 설치 완료" -ForegroundColor Green
} else {
  Write-Host " [1/2] 엔진 이미 설치됨 - 건너뜀" -ForegroundColor DarkGray
}

# 2) 모델
$mdir = Join-Path $eng "_models\faster-whisper-large-v3"
if (-not (Test-Path (Join-Path $mdir "model.bin"))) {
  Write-Host ""
  Write-Host " [2/2] AI 모델 내려받는 중 (2.9GB)..." -ForegroundColor White
  New-Item -ItemType Directory -Force -Path $mdir | Out-Null
  $repo = "https://huggingface.co/Systran/faster-whisper-large-v3/resolve/main"
  foreach ($f in @("config.json","preprocessor_config.json","tokenizer.json","vocabulary.json","model.bin")) {
    Write-Host "   - $f"
    & curl.exe -L --retry 3 -# -o (Join-Path $mdir $f) "$repo/$f"
  }
  Write-Host " 모델 설치 완료" -ForegroundColor Green
} else {
  Write-Host " [2/2] 모델 이미 설치됨 - 건너뜀" -ForegroundColor DarkGray
}

# 3) 바탕화면 바로가기
Write-Host ""
Write-Host " 바탕화면 바로가기를 만듭니다..." -ForegroundColor White
$desk = $null
$cands = @([Environment]::GetFolderPath('Desktop'))
if ($env:USERPROFILE) { $cands += (Join-Path $env:USERPROFILE "OneDrive\Desktop"); $cands += (Join-Path $env:USERPROFILE "Desktop") }
foreach ($d in ($cands | Select-Object -Unique)) { if ($d -and (Test-Path $d)) { $desk = $d; break } }

if ($desk) {
  try {
    $ws = New-Object -ComObject WScript.Shell
    $tmpL = Join-Path $desk "Transcriber.lnk"
    if (Test-Path $tmpL) { Remove-Item $tmpL -Force }
    $s = $ws.CreateShortcut($tmpL)
    $s.TargetPath       = (Join-Path $root "Transcribe.bat")
    $s.WorkingDirectory = $root
    $s.IconLocation     = "$env:SystemRoot\System32\SHELL32.dll,116"
    $s.Description      = "Transcribe audio to text"
    $s.Hotkey           = "CTRL+ALT+T"
    $s.Save()
    $finL = Join-Path $desk "전사.lnk"
    if (Test-Path $finL) { Remove-Item $finL -Force }
    $ok = $false
    try { Rename-Item -LiteralPath $tmpL -NewName "전사.lnk" -ErrorAction Stop; $ok = $true } catch { }
    if (-not $ok) { try { [System.IO.File]::Move($tmpL, $finL); $ok = $true } catch { } }
    if ($ok) { Write-Host " 바탕화면에 '전사' 아이콘 생성 완료 (단축키 Ctrl+Alt+T)" -ForegroundColor Green }
    else { Write-Host " 바탕화면에 'Transcriber' 아이콘 생성 완료" -ForegroundColor Green }
  } catch {
    Write-Host " [주의] 바로가기 생성 실패. Transcribe.bat 을 직접 쓰세요." -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "=======================================" -ForegroundColor Green
Write-Host " 설치 완료" -ForegroundColor Green
Write-Host "=======================================" -ForegroundColor Green
Write-Host " 사용법.md 를 읽어보세요."
Write-Host ""
'@
WriteBom (Join-Path $pkg "_setup.ps1") $setupText
$setupBat = "@echo off`r`nchcp 65001 > nul`r`ntitle Setup`r`ncd /d `"%~dp0`"`r`npowershell -NoProfile -ExecutionPolicy Bypass -File `"%~dp0_setup.ps1`"`r`necho.`r`npause`r`n"
[System.IO.File]::WriteAllText((Join-Path $pkg "설치.bat"), $setupBat, [System.Text.Encoding]::ASCII)
Write-Host "  [3/6] 설치 스크립트 - 엔진/모델 자동 다운로드" -ForegroundColor Green

# ---------- 4) 용어집 템플릿 ----------
$vocabText = @'
# 용어집 - 자주 틀리게 인식되는 고유명사나 전문용어를 한 줄에 하나씩 적으세요
# #으로 시작하는 줄은 주석입니다.
#
# 주의: Whisper 프롬프트는 약 224토큰 제한이 있습니다.
# 40~50개를 넘기면 뒤쪽이 잘립니다. 자주 틀리는 것만 넣으세요.
#
# 처음부터 다 채우려 하지 말고, 전사 결과를 보다가
# 계속 틀리는 단어가 보이면 그때 추가하는 방식이 효율적입니다.
#
# 아래 예시는 지우고 본인 것으로 채우세요.

# 사내용어
# 제품명
# 자주나오는사람이름
'@
WriteBom (Join-Path $pkg "용어집.txt") $vocabText
Write-Host "  [4/6] 용어집 템플릿 - 개인 용어 제거" -ForegroundColor Green

# ---------- 5) 라이선스 고지 ----------
$licText = @'
# 라이선스 고지

이 패키지의 스크립트(_transcribe.ps1, _setup.ps1, Transcribe.bat, 설치.bat)는
자유롭게 사용/수정/배포할 수 있습니다.

## 설치 시 내려받는 구성요소

### Faster-Whisper-XXL (Purfview)
- MIT License
- Copyright (c) 2023 Guillaume Klein / SYSTRAN / Purfview
- https://github.com/Purfview/whisper-standalone-win
- 주의: Rev(Reverb) 화자분리 모델은 MIT가 아니라 별도의 비상업 라이선스입니다.
  이 패키지는 화자분리 기능을 사용하지 않습니다.

### Whisper large-v3 (CTranslate2 변환판)
- MIT License
- https://huggingface.co/Systran/faster-whisper-large-v3

### FFmpeg
- 엔진에 동봉된 빌드는 GPL v3 구성입니다 (--enable-gpl --enable-version3)
- https://www.gyan.dev/ffmpeg/builds/

## 배포 방식에 대하여

이 패키지는 위 구성요소를 직접 동봉하지 않고,
설치 시 공식 배포처에서 내려받는 방식입니다.

이유는 두 가지입니다.
1. FFmpeg가 GPL v3라서, 바이너리를 직접 재배포하면 소스 제공 의무가 따라옵니다.
   내려받게 하면 그 의무를 지지 않습니다.
2. 패키지 크기가 8GB에서 100KB 수준으로 줄어듭니다.

바이너리를 직접 동봉해 배포하려는 경우 FFmpeg GPL 조건을 반드시 확인하세요.
'@
WriteBom (Join-Path $pkg "LICENSE.md") $licText
Write-Host "  [5/6] 라이선스 고지" -ForegroundColor Green

# ---------- 6) 사용법 ----------
$readmeText = @'
# 음성 전사 도구

녹음 파일을 넣으면 텍스트로 바꿔주는 도구입니다.
완전 무료, 무제한, 오프라인. 설치 후에는 인터넷이 필요 없습니다.

OpenAI Whisper large-v3 모델을 내 PC의 GPU에서 직접 돌립니다.
음성이 클라우드로 올라가지 않으므로 민감한 녹음도 안전합니다.

## 필요 사양

- Windows 10/11
- NVIDIA 그래픽카드 (VRAM 6GB 이상 권장)
  없어도 돌아가지만 CPU로는 매우 느립니다
- 여유 공간 약 8GB

## 설치

1. 이 폴더를 원하는 위치에 두세요 (예: `C:\Transcriber`)
   - 바탕화면이 OneDrive와 동기화되는 환경이라면 바탕화면은 피하세요
2. **`설치.bat`** 더블클릭
3. 엔진과 AI 모델을 자동으로 내려받습니다 (약 4.3GB, 5~30분)
4. 끝나면 바탕화면에 **`전사`** 아이콘이 생깁니다

설치는 최초 1회만 하면 됩니다.

## 사용법

### 방법 1. 파일을 끌어다 놓기
전사할 파일을 **`전사` 아이콘** 또는 **`Transcribe.bat`** 위로 끌어다 놓으세요.

### 방법 2. 녹음 폴더에 넣고 실행
1. 파일들을 **`녹음`** 폴더에 넣습니다
2. `전사` 아이콘 더블클릭 (또는 **Ctrl + Alt + T**)

### 방법 3. 윈도우 녹음기를 쓴 경우
그냥 `전사` 아이콘만 누르세요.
윈도우 녹음기 기본 저장 폴더를 자동으로 찾아서 목록을 보여주고 물어봅니다.
Enter를 치면 진행합니다.

## 결과

**`전사`** 폴더에 타임스탬프가 붙은 텍스트가 생깁니다.

```
[00:00:04] 안녕하세요, 오늘 회의를 시작하겠습니다.
[00:00:09] 첫 번째 안건부터 보겠습니다.
```

바탕화면 **`전사결과`** 폴더에도 같은 파일이 복사됩니다.
AI 챗봇에 넣어 요약할 때 찾기 쉬우라고 만든 것입니다.

## 걸리는 시간

RTX 4070 SUPER 기준 실측 약 23배속입니다.

| 녹음 길이 | 예상 소요 |
|---|---|
| 1시간 | 약 3분 |
| 3시간 | 약 8분 |
| 8시간 | 약 20분 |

GPU를 쓰므로 돌리는 동안 게임이나 무거운 작업은 피하는 게 좋습니다.

## 용어집

`용어집.txt` 를 메모장으로 열어 한 줄에 하나씩 단어를 적으면
음성 인식이 그 단어를 우선해서 인식합니다.

**40~50개를 넘기지 마세요.** Whisper 프롬프트는 약 224토큰 제한이 있어서
넘치면 뒤쪽이 잘립니다. 자주 틀리는 것만 넣고, 나머지 교정은
AI 챗봇에 정리시킬 때 함께 처리하는 편이 효율적입니다.

## 지원 형식

mp3, m4a, wav, flac, ogg, opus, mp4, mkv, webm, aac, wma

## 알아둘 점

### 긴 녹음은 끊어서 하세요
Windows 녹음기는 중간 저장을 하지 않습니다.
앱이 꺼지거나 PC가 멈추면 그때까지 녹음한 것이 전부 사라집니다.
쉬는 시간마다 한 번 끊고 새로 시작하는 편이 안전합니다.
파일이 여러 개로 나뉘어도 전부 자동으로 처리됩니다.

### 무음 구간에서 이상한 문장이 나올 수 있습니다
Whisper의 알려진 현상입니다. 같은 문장이 수십 번 반복되거나
엉뚱한 경어체 문장이 끼어들면 그 구간은 실제 발화가 아닙니다.
중요한 부분이면 원본 녹음을 직접 확인하세요.

### 파일 이름을 잘 지으세요
결과 텍스트가 같은 이름으로 생깁니다.
`2026-09-19_주간회의.m4a` 처럼 날짜와 내용을 넣어두면 나중에 찾기 쉽습니다.

## 문제 해결

| 증상 | 확인할 것 |
|---|---|
| 창이 바로 닫힘 | 그냥 더블클릭인지 확인 (관리자 권한 불필요) |
| "새로 전사할 파일이 없습니다" | 화면에 '확인한 폴더' 목록이 나옵니다. 거기에 파일이 있는지 확인 |
| 아주 느림 (1배속 수준) | GPU 대신 CPU로 도는 중. 그래픽 드라이버 업데이트 후 재시도 |
| 단축키가 안 먹음 | 다른 프로그램과 충돌. 바로가기 속성에서 바꾸세요 |
| 설치 중 다운로드 실패 | 인터넷 확인 후 `설치.bat` 다시 실행. 받은 부분은 건너뜁니다 |

라이선스는 `LICENSE.md` 를 참고하세요.
'@
WriteBom (Join-Path $pkg "사용법.md") $readmeText
Write-Host "  [6/6] 사용법 문서" -ForegroundColor Green

# ---------- 개인정보 검사 ----------
Write-Host ""
Write-Host " 개인정보 검사 중..." -ForegroundColor White
$leakPatterns = @("elsha", "\bT1\b", "발로란트", "아카데미", "최원", "OneDrive\\Desktop\\수업", "\.aside", "리테이크", "킬조이")
$leaks = @()
foreach ($f in (Get-ChildItem $pkg -Recurse -File)) {
  if ($f.Extension -in @(".ps1",".md",".txt",".bat")) {
    $content = Get-Content $f.FullName -Encoding UTF8 -Raw -ErrorAction SilentlyContinue
    foreach ($pat in $leakPatterns) {
      if ($content -and ($content -match $pat)) { $leaks += "$($f.Name): '$pat'" }
    }
  }
}
if ($leaks.Count -eq 0) {
  Write-Host " 개인정보 없음 - 통과" -ForegroundColor Green
} else {
  Write-Host " [경고] 개인정보로 의심되는 문자열이 남아 있습니다:" -ForegroundColor Yellow
  $leaks | ForEach-Object { Write-Host "   - $_" -ForegroundColor Yellow }
}

# ---------- 압축 ----------
Write-Host ""
Write-Host " 압축하는 중..." -ForegroundColor White
$ProgressPreference = "SilentlyContinue"
$zip = Join-Path $out "Transcriber.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $pkg "*") -DestinationPath $zip -Force
$zipMB = [math]::Round((Get-Item $zip).Length/1KB,1)

Write-Host ""
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host " 배포본 완성" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " 폴더 : $pkg"
Write-Host " 압축 : $zip  ($zipMB KB)"
Write-Host ""
Write-Host " 받는 사람은 압축을 풀고 '설치.bat' 한 번만 누르면 됩니다."
Write-Host ""
Start-Process explorer.exe $out
