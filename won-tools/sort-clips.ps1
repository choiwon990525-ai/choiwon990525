# 유튜브 관전 캡처 정리 스크립트 v2
$ErrorActionPreference = 'Stop'
$Downloads = "C:\Users\elsha\Downloads"
$Root      = Join-Path $Downloads "관전캡처"
$TitleMap  = Join-Path $Root "_경기이름.txt"

if (-not (Test-Path -LiteralPath $Root)) { New-Item -ItemType Directory -Path $Root | Out-Null }

$names = @{}
if (Test-Path -LiteralPath $TitleMap) {
  foreach ($line in (Get-Content -LiteralPath $TitleMap -Encoding UTF8)) {
    if ($line -match '^\s*([A-Za-z0-9_\-]{5,})\s*=\s*(.+?)\s*$') { $names[$Matches[1]] = $Matches[2] }
  }
}

$pattern    = '^(?<id>[A-Za-z0-9_\-]{5,})_(?<t>\d{2}-\d{2}-\d{2})_(?<n>\d{3})\.jpg$'
$logPattern = '^(?<id>[A-Za-z0-9_\-]{5,})_clip-log.*\.md$'

$all = @(Get-ChildItem -LiteralPath $Downloads -File)
$items = @()
foreach ($f in $all) {
  $id = $null
  if ($f.Name -match $pattern) { $id = $Matches['id'] }
  elseif ($f.Name -match $logPattern) { $id = $Matches['id'] }
  if ($id) { $items += [pscustomobject]@{ Id = $id; Path = $f.FullName; Name = $f.Name; When = $f.LastWriteTime } }
}

if ($items.Count -eq 0) { Write-Host "옮길 캡처 파일이 없습니다." -ForegroundColor Yellow; return }

$moved = 0
foreach ($grp in ($items | Group-Object Id)) {
  $vid   = [string]$grp.Name
  $date  = ($grp.Group | Sort-Object When | Select-Object -First 1).When.ToString('yyyy-MM-dd')
  $label = if ($names.ContainsKey($vid)) { [string]$names[$vid] } else { $vid }
  $safe  = ($label -replace '[\\/:*?"<>|]', '_').Trim()
  if ([string]::IsNullOrWhiteSpace($safe)) { $safe = $vid }
  $dest  = [IO.Path]::Combine($Root, ($date + '_' + $safe))
  if (-not (Test-Path -LiteralPath $dest)) { New-Item -ItemType Directory -Path $dest | Out-Null }

  foreach ($it in $grp.Group) {
    $target = [IO.Path]::Combine($dest, [string]$it.Name)
    if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Force }
    Move-Item -LiteralPath ([string]$it.Path) -Destination $target
    $moved++
  }
  Write-Host ("[{0}] {1}개 -> {2}" -f $vid, $grp.Group.Count, $dest) -ForegroundColor Green
}

Write-Host ""
Write-Host ("총 {0}개 파일을 정리했습니다." -f $moved) -ForegroundColor Cyan
Write-Host ("폴더: {0}" -f $Root)
