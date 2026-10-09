# 최근 녹음/녹화 파일을 PC 전체에서 찾아 로그로 남긴다
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$log  = Join-Path $root "_find_log.txt"
$lines = New-Object System.Collections.ArrayList
function L($m) { $null = $lines.Add($m); Write-Host $m }

L ""
L "=== 녹음 파일 찾는 중... 잠시만 기다리세요 ==="
L ""
$null = $lines.Add("시각: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
$null = $lines.Add("USERPROFILE: $env:USERPROFILE")

# OBS 설정에서 저장 경로 읽기
$null = $lines.Add("")
$null = $lines.Add("--- OBS 녹화 저장 경로 ---")
$obsDir = Join-Path $env:APPDATA "obs-studio\basic\profiles"
if (Test-Path $obsDir) {
  foreach ($prof in (Get-ChildItem $obsDir -Directory -ErrorAction SilentlyContinue)) {
    $ini = Join-Path $prof.FullName "basic.ini"
    if (Test-Path $ini) {
      $hit = Get-Content $ini -Encoding UTF8 -ErrorAction SilentlyContinue |
             Where-Object { $_ -match '^(FilePath|RecFilePath|MuxerCustom)' }
      foreach ($h in $hit) { $null = $lines.Add("  [$($prof.Name)] $h") }
    }
  }
} else { $null = $lines.Add("  OBS 설정 폴더 없음: $obsDir") }

# 탐색 대상
$roots = New-Object System.Collections.ArrayList
foreach ($k in @('MyDocuments','MyVideos','MyMusic','Desktop','UserProfile')) {
  $p = [Environment]::GetFolderPath($k)
  if ($p) { $null = $roots.Add($p) }
}
foreach ($n in @("Documents","Videos","Music","Downloads","Desktop",
                 "OneDrive\Documents","OneDrive\Videos","OneDrive\Desktop","OneDrive\Music")) {
  $null = $roots.Add((Join-Path $env:USERPROFILE $n))
}
$uniq = @($roots | Where-Object { $_ -and (Test-Path -LiteralPath $_ -ErrorAction SilentlyContinue) } |
          ForEach-Object { (Resolve-Path -LiteralPath $_).Path } | Select-Object -Unique)

$null = $lines.Add("")
$null = $lines.Add("--- 탐색한 폴더 ---")
foreach ($r in $uniq) { $null = $lines.Add("  $r") }

$exts = @(".mp3",".m4a",".wav",".flac",".ogg",".opus",".mp4",".mkv",".webm",".aac",".wma",".mov",".flv",".ts")
$cut  = (Get-Date).AddDays(-7)
$found = New-Object System.Collections.ArrayList

foreach ($r in $uniq) {
  try {
    Get-ChildItem -LiteralPath $r -File -Recurse -Depth 3 -Force -ErrorAction SilentlyContinue |
      Where-Object { $exts -contains $_.Extension.ToLower() -and $_.LastWriteTime -gt $cut -and $_.Length -gt 100KB } |
      ForEach-Object { $null = $found.Add($_) }
  } catch { }
}

$res = @($found | Sort-Object FullName -Unique | Sort-Object LastWriteTime -Descending)

$null = $lines.Add("")
$null = $lines.Add("--- 최근 7일 내 녹음/녹화 후보 ($($res.Count)개) ---")
L ""
if ($res.Count -eq 0) {
  L "최근 7일 안에 만들어진 녹음/녹화 파일을 찾지 못했습니다."
} else {
  L "찾은 파일 $($res.Count)개:"
  L ""
  $i = 0
  foreach ($f in $res) {
    $i++
    $line = "  {0}. {1}`n      크기: {2} MB  |  시각: {3}`n      위치: {4}" -f `
            $i, $f.Name, [math]::Round($f.Length/1MB,1), $f.LastWriteTime.ToString("MM/dd HH:mm"), $f.DirectoryName
    L $line
    if ($i -ge 20) { L "  ... (이하 생략)"; break }
  }
}
L ""
L "결과를 파일로 남겼습니다: $log"
$lines | Out-File -FilePath $log -Encoding utf8
