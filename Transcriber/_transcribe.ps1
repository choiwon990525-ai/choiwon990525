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
  if (-not (Test-Path -LiteralPath $dir)) { return @() }
  return @(Get-ChildItem -LiteralPath $dir -File -ErrorAction SilentlyContinue |
           Where-Object { $exts -contains $_.Extension.ToLower() })
}

# ---- 이 녹음의 전사본 ----
# 윈도우 녹음기는 '녹음.m4a' 같은 이름을 다시 쓴다. 이름만 보면 오늘 녹음을 예전 전사본으로 착각하므로,
# 녹음 시각을 붙인 전사본(녹음_2026-10-09_1902.txt)이 있거나
# 같은 이름 전사본이 녹음보다 나중에 만들어졌을 때만 '전사됨'으로 본다.
function Get-Stamp($f) { return $f.LastWriteTime.ToString("yyyy-MM-dd_HHmm") }
function Find-Txt($f) {
  $stamped = Join-Path $outDir ($f.BaseName + "_" + (Get-Stamp $f) + ".txt")
  if (Test-Path -LiteralPath $stamped) { return $stamped }
  $plain = Join-Path $outDir ($f.BaseName + ".txt")
  if ((Test-Path -LiteralPath $plain) -and ((Get-Item -LiteralPath $plain).LastWriteTime -ge $f.LastWriteTime)) { return $plain }
  return $null
}
# 새 전사본 이름: 같은 이름 전사본이 이미 있으면 녹음 시각을 붙여 예전 것을 덮어쓰지 않는다
function New-TxtPath($f) {
  $plain = Join-Path $outDir ($f.BaseName + ".txt")
  if (-not (Test-Path -LiteralPath $plain)) { return $plain }
  return (Join-Path $outDir ($f.BaseName + "_" + (Get-Stamp $f) + ".txt"))
}
function Norm($p) { try { return [IO.Path]::GetFullPath($p).TrimEnd('\').ToLower() } catch { return "" } }

# 탐색기 창에서 파일 직접 고르기 (여러 개 가능)
function Pick-Files($initDir) {
  Add-Type -AssemblyName System.Windows.Forms
  $dlg = New-Object System.Windows.Forms.OpenFileDialog
  $dlg.Title = "전사할 녹음 파일을 고르세요 (Ctrl 을 누른 채 여러 개 고를 수 있어요)"
  $dlg.Filter = "녹음·녹화 파일|" + (($exts | ForEach-Object { "*" + $_ }) -join ";") + "|모든 파일|*.*"
  $dlg.Multiselect = $true
  if ($initDir -and (Test-Path -LiteralPath $initDir)) { $dlg.InitialDirectory = $initDir }
  # 까만 창 뒤에 숨지 않게 맨 위에 띄운다
  $top = New-Object System.Windows.Forms.Form
  $top.TopMost = $true
  $r = $dlg.ShowDialog($top)
  $top.Dispose()
  if ($r -ne [System.Windows.Forms.DialogResult]::OK) { return @() }
  return @($dlg.FileNames | ForEach-Object { Get-Item -LiteralPath $_ })
}

# ---- 대상 고르기 ----
$targets = @()
$fromWin = @{}   # 윈도우 녹음기·OBS 기본 폴더에서 온 파일 (전사 후 '녹음' 폴더로 옮긴다)

if ($Files -and $Files.Count -gt 0) {
  # 드래그앤드롭
  $targets = @($Files | Where-Object { Test-Path -LiteralPath $_ } | ForEach-Object { Get-Item -LiteralPath $_ })
} else {
  # 1) 윈도우 녹음기 / OBS 기본 저장 폴더 (예전과 같은 곳)
  $docs = [Environment]::GetFolderPath('MyDocuments')
  $winDirs = @()
  foreach ($n in @("소리 녹음","사운드 레코딩","Sound Recordings","사운드 녹음","녹음")) {
    if ($docs) { $winDirs += (Join-Path $docs $n) }
  }
  $up = $env:USERPROFILE
  if ($up) {
    foreach ($n in @("사운드 레코딩","Sound Recordings")) {
      $winDirs += (Join-Path $up "Documents\$n")
      $winDirs += (Join-Path $up "OneDrive\Documents\$n")
    }
    foreach ($v in @("Videos","비디오","OneDrive\Videos","OneDrive\비디오")) {
      $winDirs += (Join-Path $up $v)
    }
  }
  $vid = [Environment]::GetFolderPath('MyVideos')
  if ($vid) { $winDirs += $vid }

  # 2) 그 밖에 녹음이 있을 만한 곳: 바탕화면·다운로드·문서·음악·비디오와 OBS 설정의 저장 폴더 (최근 30일, 하위 폴더 2단계)
  $wideDirs = @()
  foreach ($k in @('Desktop','MyDocuments','MyMusic','MyVideos')) { $p = [Environment]::GetFolderPath($k); if ($p) { $wideDirs += $p } }
  if ($up) { foreach ($n in @("Downloads","OneDrive\Desktop","OneDrive\Documents")) { $wideDirs += (Join-Path $up $n) } }
  if ($env:APPDATA) {
    $obsProf = Join-Path $env:APPDATA "obs-studio\basic\profiles"
    if (Test-Path -LiteralPath $obsProf) {
      foreach ($ini in @(Get-ChildItem -LiteralPath $obsProf -Recurse -Filter "basic.ini" -ErrorAction SilentlyContinue)) {
        foreach ($ln in @(Get-Content -LiteralPath $ini.FullName -Encoding UTF8 -ErrorAction SilentlyContinue)) {
          if ($ln -match '^\s*(FilePath|RecFilePath)\s*=\s*(.+?)\s*$') { $wideDirs += $Matches[2] }
        }
      }
    }
  }

  $found = @{}
  foreach ($f in (Get-Audio $recDir)) { $found[$f.FullName.ToLower()] = $f }
  $recN = Norm $recDir
  foreach ($d in ($winDirs | Select-Object -Unique)) {
    try {
      if (-not $d -or (Norm $d) -eq $recN -or -not (Test-Path -LiteralPath $d)) { continue }
      foreach ($f in (Get-Audio $d)) { $k = $f.FullName.ToLower(); $found[$k] = $f; $fromWin[$k] = $true }
    } catch { }
  }
  $skip = @((Norm (Join-Path $root "engine")), (Norm $outDir))   # 엔진·전사 폴더는 뒤지지 않는다
  $cut = (Get-Date).AddDays(-30)
  foreach ($d in ($wideDirs | Select-Object -Unique)) {
    try {
      if (-not $d -or -not (Test-Path -LiteralPath $d)) { continue }
      foreach ($f in @(Get-ChildItem -LiteralPath $d -File -Recurse -Depth 2 -ErrorAction SilentlyContinue |
                       Where-Object { $exts -contains $_.Extension.ToLower() -and $_.LastWriteTime -gt $cut -and $_.Length -gt 100KB })) {
        $dn = Norm $f.DirectoryName
        $bad = $false
        foreach ($s in $skip) { if ($s -and ($dn -eq $s -or $dn.StartsWith($s + '\'))) { $bad = $true } }
        $k = $f.FullName.ToLower()
        if (-not $bad -and -not $found.ContainsKey($k)) { $found[$k] = $f }
      }
    } catch { }
  }

  # 3) 새 것부터 보여주고 고르게 한다. Enter = 최근 7일 안의 가장 새 '새 녹음'
  $list = @($found.Values | Sort-Object LastWriteTime -Descending | Select-Object -First 12)
  $def = $null
  for ($i = 0; $i -lt $list.Count; $i++) {
    if (-not (Find-Txt $list[$i]) -and $list[$i].LastWriteTime -gt (Get-Date).AddDays(-7)) { $def = $i; break }
  }

  Write-Host ""
  Write-Host "=======================================" -ForegroundColor Cyan
  Write-Host " 최근 녹음·녹화 파일 (새 것부터)" -ForegroundColor Cyan
  Write-Host "=======================================" -ForegroundColor Cyan
  if ($list.Count -eq 0) { Write-Host " 최근 녹음 파일을 찾지 못했습니다. F 로 직접 골라 주세요." -ForegroundColor Yellow }
  for ($i = 0; $i -lt $list.Count; $i++) {
    $f = $list[$i]; $t = Find-Txt $f
    $mark = if ($t) { "전사됨" } else { "새 녹음" }
    $col = if ($t) { "DarkGray" } elseif ($i -eq $def) { "Green" } else { "White" }
    Write-Host ("{0,3}. {1}  {2}  ({3} MB)  [{4}]" -f ($i + 1), $f.LastWriteTime.ToString("MM/dd HH:mm"), $f.Name, [math]::Round($f.Length / 1MB, 1), $mark) -ForegroundColor $col
    Write-Host ("       {0}" -f $f.DirectoryName) -ForegroundColor DarkGray
  }
  Write-Host ""
  if ($null -ne $def) { Write-Host (" Enter : {0}번 전사 (가장 최근 새 녹음)" -f ($def + 1)) -ForegroundColor Green }
  else { Write-Host " Enter : 파일 직접 고르기 (최근 7일 안에 새 녹음이 없어요)" -ForegroundColor Green }
  Write-Host " 번호  : 그 파일 전사 (여러 개는 1,3 처럼)"
  Write-Host " F     : 목록에 없는 파일 직접 고르기"
  Write-Host " Q     : 끝내기"
  Write-Host ""
  $ans = "" + (Read-Host "고르세요")
  $ans = $ans.Trim()
  $initDir = if ($list.Count -gt 0) { $list[0].DirectoryName } else { $docs }
  if ($ans -match '^[Qqㅂ]$') { exit 0 }
  elseif ($ans -eq "") {
    if ($null -ne $def) { $targets = @($list[$def]) } else { $targets = @(Pick-Files $initDir) }
  }
  elseif ($ans -match '^[Ffㄹ]$') { $targets = @(Pick-Files $initDir) }
  else {
    foreach ($tok in ($ans -split '[\s,]+')) {
      $n = 0
      if ([int]::TryParse($tok, [ref]$n) -and $n -ge 1 -and $n -le $list.Count) { $targets += $list[$n - 1] }
      elseif ($tok) { Write-Host ("  '{0}' 는 목록에 없는 번호라 건너뜁니다." -f $tok) -ForegroundColor Yellow }
    }
  }
}

# 같은 파일을 두 번 고른 경우 한 번만
$seen = @{}
$targets = @($targets | Where-Object { $k = $_.FullName.ToLower(); if ($seen.ContainsKey($k)) { $false } else { $seen[$k] = $true; $true } })
if ($targets.Count -eq 0) { Write-Host ""; Write-Host "고른 파일이 없습니다." -ForegroundColor Yellow; exit 0 }

# 녹음 폴더로 옮길 때 전사본과 같은 이름으로 (다음에 '전사됨'으로 바로 보이게)
function Move-ToRecDir($file, $baseName) {
  $dest = Join-Path $recDir ($baseName + $file.Extension)
  $i = 1
  while (Test-Path -LiteralPath $dest) {
    $dest = Join-Path $recDir ($baseName + "_$i" + $file.Extension)
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
$okCount = 0; $failCount = 0; $already = 0
# 엔진은 '원래이름.txt' 로 쓰므로 작업 폴더에서 받은 뒤 정해 둔 이름으로 옮긴다 (예전 전사본을 덮어쓰지 않게)
$work = Join-Path $outDir "_work"

foreach ($f in $targets) {
  $have = Find-Txt $f
  if ($have) {
    Write-Host ("[이미 전사됨] {0}  ->  전사\{1}" -f $f.Name, (Split-Path $have -Leaf)) -ForegroundColor DarkGray
    $already++
    continue
  }
  $done = New-TxtPath $f
  New-Item -ItemType Directory -Force -Path $work | Out-Null
  $workTxt = Join-Path $work ($f.BaseName + ".txt")
  if (Test-Path -LiteralPath $workTxt) { Remove-Item -LiteralPath $workTxt -Force }

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
    "--output_dir",$work,
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
    if (Test-Path -LiteralPath $workTxt) { break }
    if ($try -lt 3) {
      Write-Host ("         엔진 로딩 실패. {0}초 후 재시도 ({1}/3)..." -f (3*$try), $try) -ForegroundColor Yellow
      Start-Sleep -Seconds (3*$try)
    }
  }
  $sw.Stop()

  # 파일 쓰기 완료 대기
  $waited = 0
  while (-not (Test-Path -LiteralPath $workTxt) -and $waited -lt 30) { Start-Sleep -Milliseconds 500; $waited++ }
  if (Test-Path -LiteralPath $workTxt) {
    $prev = -1
    for ($k = 0; $k -lt 20; $k++) {
      $cur = (Get-Item -LiteralPath $workTxt).Length
      if ($cur -eq $prev -and $cur -gt 0) { break }
      $prev = $cur; Start-Sleep -Milliseconds 300
    }
    Move-Item -LiteralPath $workTxt -Destination $done -Force
  }

  if (Test-Path -LiteralPath $done) {
    $chars = (Get-Content -LiteralPath $done -Encoding UTF8 -Raw).Length
    Write-Host ("[완료]   {0}  ({1}분 소요, {2}자)  ->  전사\{3}" -f $f.Name, [math]::Round($sw.Elapsed.TotalMinutes,1), $chars, (Split-Path $done -Leaf)) -ForegroundColor Green
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
    if ($fromWin.ContainsKey($f.FullName.ToLower())) {
      try {
        $moved = Move-ToRecDir $f ([IO.Path]::GetFileNameWithoutExtension($done))
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
if ((Test-Path -LiteralPath $work) -and @(Get-ChildItem -LiteralPath $work -Force).Count -eq 0) { Remove-Item -LiteralPath $work -Force }
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host (" 전체 완료: 성공 {0} / 실패 {1} / 총 {2}분" -f $okCount, $failCount, [math]::Round($total.Elapsed.TotalMinutes,1)) -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""
if ($okCount -gt 0 -or $already -gt 0) { Start-Process explorer.exe $outDir }








