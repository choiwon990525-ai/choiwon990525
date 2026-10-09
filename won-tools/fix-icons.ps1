# 바탕화면 아이콘 강제 적용 (아이콘 캐시 청소 + 탐색기 재시작)
$ErrorActionPreference = 'Continue'
$here  = Split-Path -Parent $MyInvocation.MyCommand.Path
$tools = Join-Path $env:USERPROFILE 'Documents\won-tools'
$icons = Join-Path $tools 'icons'
$asrDir = Join-Path $tools 'asr'
$desk  = [Environment]::GetFolderPath('Desktop')

Write-Host ''
Write-Host '=== 바탕화면 아이콘 적용 ===' -ForegroundColor Cyan
Write-Host ('바탕화면: ' + $desk)
Write-Host ''

# 1. 새 아이콘 파일 복사
New-Item -ItemType Directory -Path $icons -Force | Out-Null
foreach ($n in @('clip-tool.ico','asr-restart.ico','sort-clips.ico')) {
  $src = Join-Path $here $n
  if (Test-Path -LiteralPath $src) { Copy-Item -LiteralPath $src -Destination (Join-Path $icons $n) -Force; Write-Host ('  아이콘 복사: ' + $n) -ForegroundColor DarkGray }
}

# 2. 탐색기 종료 (아이콘 캐시 파일 잠금 해제)
Write-Host '탐색기 종료...' -ForegroundColor Yellow
Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# 3. 아이콘 캐시 삭제
Write-Host '아이콘 캐시 삭제...' -ForegroundColor Yellow
$cacheDir = Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\Explorer'
Get-ChildItem -LiteralPath $cacheDir -Filter 'iconcache*' -Force -ErrorAction SilentlyContinue | ForEach-Object {
  Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
}
Get-ChildItem -LiteralPath $cacheDir -Filter 'thumbcache*' -Force -ErrorAction SilentlyContinue | ForEach-Object {
  Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
}
Remove-Item -LiteralPath (Join-Path $env:LOCALAPPDATA 'IconCache.db') -Force -ErrorAction SilentlyContinue

# 4. 바로가기 삭제 후 재생성
Write-Host '바로가기 다시 만들기...' -ForegroundColor Yellow
foreach ($old in @('장면캡처 도구.lnk','받아쓰기 서버 재시작.lnk','관전캡처 정리.lnk','장면캡처 도구.url','받아쓰기 서버 켜기.vbs','받아쓰기 서버 다시 켜기.bat','관전캡처 정리.bat','TEST 기본아이콘.lnk')) {
  $p = Join-Path $desk $old
  if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue }
}

$sh = New-Object -ComObject WScript.Shell
function Make-Lnk($name, $target, $ico, $style, $desc) {
  $p = Join-Path $desk $name
  $l = $sh.CreateShortcut($p)
  $l.TargetPath = $target
  $l.WorkingDirectory = Split-Path -Parent $target
  $l.IconLocation = ($ico + ',0')
  if ($style) { $l.WindowStyle = $style }
  $l.Description = $desc
  $l.Save()
  if (Test-Path -LiteralPath $p) { Write-Host ('  만듦: ' + $name) -ForegroundColor Green } else { Write-Host ('  실패: ' + $name) -ForegroundColor Red }
}
Make-Lnk '장면캡처 도구.lnk'        (Join-Path $tools 'open-clip-tool.vbs')     (Join-Path $icons 'clip-bunny.ico')  1 '장면 캡처 도구 — 관리 페이지 열기'
Make-Lnk '받아쓰기 서버 재시작.lnk' (Join-Path $asrDir 'restart-asr.bat')       (Join-Path $icons 'asr-restart.ico') 7 '음성 받아쓰기 서버를 껐다 켭니다'
Make-Lnk '관전캡처 정리.lnk'        (Join-Path $tools 'sort-clips.bat')         (Join-Path $icons 'sort-clips.ico')  7 '다운로드 폴더의 캡처를 경기별 폴더로 정리'

# 5. test123 정리
$t = Join-Path $desk 'test123'
if (Test-Path -LiteralPath $t) { Remove-Item -LiteralPath $t -Recurse -Force -ErrorAction SilentlyContinue; Write-Host '  test123 폴더 정리' -ForegroundColor DarkGray }

# 6. 탐색기 재시작
Write-Host '탐색기 재시작...' -ForegroundColor Yellow
Start-Process explorer.exe
Start-Sleep -Seconds 3

Write-Host ''
Write-Host '완료. 아이콘이 바뀌었는지 확인하세요.' -ForegroundColor Cyan
Write-Host '아무 키나 누르면 닫힙니다.'
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')