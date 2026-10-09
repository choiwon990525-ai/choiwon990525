# -*- coding: utf-8 -*-
# 수업 녹음 -> 텍스트 전사 (Faster-Whisper-XXL / large-v3 / GPU)
param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Files)

# 콘솔 한글 깨짐 방지 (시스템 로캘이 en-US 라 명시적으로 지정해야 한다)
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
try { $OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$ErrorActionPreference = "Stop"
$root   = Split-Path -Parent $MyInvocation.MyCommand.Path
try { Set-Location -LiteralPath $root -ErrorAction Stop } catch { }

$engine = Join-Path $root "engine\faster-whisper-xxl.exe"
$recDir = Join-Path $root "녹음"
$outDir = Join-Path $root "전사"
$vocabF = Join-Path $root "용어집.txt"

if (-not (Test-Path $engine)) { Write-Host "[오류] 엔진을 찾을 수 없습니다: $engine" -ForegroundColor Red; exit 1 }
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
New-Item -ItemType Directory -Force -Path $recDir | Out-Null

$exts = @(".mp3",".m4a",".wav",".flac",".ogg",".opus",".mp4",".mkv",".webm",".aac",".wma")

# 전사본을 복사해 둘 바탕화면 폴더 (바탕화면\수업\전사)
$shareDir = $null
$deskCands = @()
$dd = [Environment]::GetFolderPath('Desktop')
if ($dd) { $deskCands += $dd }
if ($env:USERPROFILE) { foreach ($n in @("OneDrive\Desktop","Desktop")) { $deskCands += (Join-Path $env:USERPROFILE $n) } }
foreach ($d in ($deskCands | Select-Object -Unique)) {
  if ($d -and (Test-Path -LiteralPath $d)) { $shareDir = Join-Path $d "수업\전사"; break }
}
if ($shareDir) { New-Item -ItemType Directory -Force -Path $shareDir -ErrorAction SilentlyContinue | Out-Null }

# ---- 용어집 ----
$hot = ""; $terms = @()
if (Test-Path $vocabF) {
  $terms = @(Get-Content $vocabF -Encoding UTF8 |
             Where-Object { $_.Trim() -ne "" -and -not $_.TrimStart().StartsWith("#") } |
             ForEach-Object { $_.Trim() })
  if ($terms.Count -gt 0) { $hot = ($terms -join ", ") }
}

function Get-Audio($dir) {
  if (-not (Test-Path $dir)) { return @() }
  return @(Get-ChildItem -LiteralPath $dir -File -ErrorAction SilentlyContinue |
           Where-Object { $exts -contains $_.Extension.ToLower() })
}
function Need-Work($f) {
  return -not (Test-Path (Join-Path $outDir ($f.BaseName + ".txt")))
}

# ---- 대상 수집 ----
$targets = @()
$fromWin = @()
$script:scanned = @()

if ($Files -and $Files.Count -gt 0) {
  # 드래그앤드롭
  $targets = @($Files | Where-Object { Test-Path $_ } | ForEach-Object { Get-Item $_ })
} else {
  # 1) 내 '녹음' 폴더
  $targets = @(Get-Audio $recDir | Where-Object { Need-Work $_ })

  # 2) 윈도우 녹음기 기본 저장 폴더 자동 탐색
  $docs = [Environment]::GetFolderPath('MyDocuments')
  $cands = @()
  foreach ($n in @("소리 녹음","사운드 레코딩","Sound Recordings","사운드 녹음","녹음")) {
    if ($docs) { $cands += (Join-Path $docs $n) }
  }
  $up = $env:USERPROFILE
  if ($up) {
    foreach ($n in @("사운드 레코딩","Sound Recordings")) {
      $cands += (Join-Path $up "Documents\$n")
      $cands += (Join-Path $up "OneDrive\Documents\$n")
    }
    # OBS 기본 녹화 저장 위치 (비디오 폴더)
    foreach ($v in @("Videos","비디오","OneDrive\Videos","OneDrive\비디오")) {
      $cands += (Join-Path $up $v)
    }
  }
  $vid = [Environment]::GetFolderPath('MyVideos')
  if ($vid) { $cands += $vid }

  foreach ($c in ($cands | Select-Object -Unique)) {
    if ((Test-Path $c) -and ((Resolve-Path $c).Path -ne (Resolve-Path $recDir).Path)) {
      $script:scanned += $c
      $fromWin += @(Get-Audio $c | Where-Object { Need-Work $_ })
    }
  }
  $fromWin = @($fromWin | Sort-Object FullName -Unique)
}

if (($targets.Count + $fromWin.Count) -eq 0) {
  Write-Host ""
  Write-Host "새로 전사할 파일이 없습니다." -ForegroundColor Yellow
  Write-Host ""
  Write-Host " 확인한 폴더:" -ForegroundColor DarkGray
  Write-Host "   - $recDir" -ForegroundColor DarkGray
  foreach ($s in $script:scanned) { Write-Host "   - $s (윈도우 녹음기)" -ForegroundColor DarkGray }
  if ($script:scanned.Count -eq 0) {
    Write-Host "   (윈도우 녹음기 폴더를 못 찾았습니다. 파일을 직접 '녹음' 폴더에 넣어주세요)" -ForegroundColor DarkGray
  }
  Write-Host ""
  Write-Host " 파일을 'Transcribe.bat' 위로 끌어다 놓아도 됩니다."
  exit 0
}

# ---- 윈도우 녹음기 폴더에서 찾은 것 확인 ----
if ($fromWin.Count -gt 0) {
  Write-Host ""
  Write-Host "윈도우 녹음기 폴더에서 아직 전사하지 않은 파일 $($fromWin.Count)개를 찾았습니다:" -ForegroundColor Yellow
  foreach ($f in $fromWin) {
    Write-Host ("   - {0}  ({1} MB, {2})" -f $f.Name, [math]::Round($f.Length/1MB,1), $f.LastWriteTime.ToString("MM/dd HH:mm"))
  }
  Write-Host ""
  $ans = Read-Host "이 파일들도 함께 전사할까요? (Y/n)"
  if ($ans -match '^\s*[Nn]') { Write-Host "건너뜁니다." -ForegroundColor DarkGray }
  else { $targets += $fromWin }
}

$targets = @($targets | Sort-Object FullName -Unique)
if ($targets.Count -eq 0) { Write-Host "처리할 파일이 없습니다."; exit 0 }

# 윈도우 녹음기 폴더에서 온 파일 목록 (전사 후 녹음 폴더로 이동시킬 대상)
$winSet = @{}
foreach ($w in $fromWin) { $winSet[$w.FullName] = $true }

function Move-ToRecDir($file) {
  $destName = $file.Name
  $dest = Join-Path $recDir $destName
  $i = 1
  while (Test-Path $dest) {
    $dest = Join-Path $recDir ($file.BaseName + "_$i" + $file.Extension)
    $i++
  }
  Move-Item -LiteralPath $file.FullName -Destination $dest -ErrorAction Stop
  return $dest
}

Write-Host ""
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host " 수업 녹음 전사 시작 ($($targets.Count)개 파일)" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host " 모델   : large-v3 (GPU)"
Write-Host " 용어집 : $($terms.Count)개 단어"
Write-Host " 결과   : $outDir"
Write-Host ""

$total = [Diagnostics.Stopwatch]::StartNew()
$okCount = 0; $failCount = 0

foreach ($f in $targets) {
  $done = Join-Path $outDir ($f.BaseName + ".txt")
  if (Test-Path $done) { Write-Host "[건너뜀] $($f.Name) - 이미 전사됨" -ForegroundColor DarkGray; continue }

  Write-Host "[처리중] $($f.Name)" -ForegroundColor White
  $sw = [Diagnostics.Stopwatch]::StartNew()

  $argv = @(
    $f.FullName,
    "--model","large-v3",
    "--language","ko",
    "--device","cuda",
    "--compute_type","float16",
    "--batched",
    "--batch_size","8",
    "--output_dir",$outDir,
    "--output_format","txt",
    "--sentence",
    "--beep_off",
    "--print_progress"
  )
  if ($hot -ne "") { $argv += @("--hotwords",$hot) }

  # 엔진이 간헐적으로 로딩에 실패하는 경우가 있어 최대 3회 재시도한다
  for ($try = 1; $try -le 3; $try++) {
    & $engine @argv
    Start-Sleep -Milliseconds 700
    if (Test-Path $done) { break }
    if ($try -lt 3) {
      Write-Host ("         엔진 로딩 실패. {0}초 후 재시도 ({1}/3)..." -f (3*$try), $try) -ForegroundColor Yellow
      Start-Sleep -Seconds (3*$try)
    }
  }
  $sw.Stop()

  # 파일 쓰기 완료 대기
  $waited = 0
  while (-not (Test-Path $done) -and $waited -lt 30) { Start-Sleep -Milliseconds 500; $waited++ }
  if (Test-Path $done) {
    $prev = -1
    for ($k = 0; $k -lt 20; $k++) {
      $cur = (Get-Item $done).Length
      if ($cur -eq $prev -and $cur -gt 0) { break }
      $prev = $cur; Start-Sleep -Milliseconds 300
    }
  }

  if (Test-Path $done) {
    $chars = (Get-Content $done -Encoding UTF8 -Raw).Length
    Write-Host ("[완료]   {0}  ({1}분 소요, {2}자)" -f $f.Name, [math]::Round($sw.Elapsed.TotalMinutes,1), $chars) -ForegroundColor Green
    $okCount++

    # 전사본을 바탕화면\수업\전사 로 복사
    if ($shareDir -and (Test-Path -LiteralPath $shareDir)) {
      try {
        Copy-Item -LiteralPath $done -Destination (Join-Path $shareDir (Split-Path $done -Leaf)) -Force -ErrorAction Stop
        Write-Host ("[복사]   바탕화면\수업\전사 에 복사했습니다") -ForegroundColor DarkCyan
      } catch {
        Write-Host ("[주의]   바탕화면 복사 실패: {0}" -f $_.Exception.Message) -ForegroundColor Yellow
      }
    }

    # 윈도우 녹음기 폴더에서 온 원본은 '녹음' 폴더로 옮긴다 (OneDrive 밖으로 이동)
    if ($winSet.ContainsKey($f.FullName)) {
      try {
        $moved = Move-ToRecDir $f
        Write-Host ("[이동]   원본을 녹음 폴더로 옮겼습니다 -> {0}" -f (Split-Path $moved -Leaf)) -ForegroundColor DarkCyan
      } catch {
        Write-Host ("[주의]   원본을 옮기지 못했습니다: {0}" -f $_.Exception.Message) -ForegroundColor Yellow
        Write-Host ("         전사는 정상 완료됐습니다. 원본은 그대로 남아 있습니다:") -ForegroundColor Yellow
        Write-Host ("         {0}" -f $f.FullName) -ForegroundColor Yellow
      }
    }
  } else {
    Write-Host "[실패]   $($f.Name)" -ForegroundColor Red
    $failCount++
  }
  Write-Host ""
}

$total.Stop()
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host (" 전체 완료: 성공 {0} / 실패 {1} / 총 {2}분" -f $okCount, $failCount, [math]::Round($total.Elapsed.TotalMinutes,1)) -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""
if ($okCount -gt 0) { Start-Process explorer.exe $outDir }








