# 바탕화면에 '장면캡처 도구' 아이콘(토끼) 만들기 — 누르면 확장 관리 페이지가 열림
$ErrorActionPreference = 'Stop'
$tools = Split-Path -Parent $MyInvocation.MyCommand.Path
$ico = Join-Path $tools 'icons\clip-bunny.ico'
$vbs = Join-Path $tools 'open-clip-tool.vbs'
$desk = [Environment]::GetFolderPath('Desktop')

Write-Host ''
Write-Host '=== 장면캡처 도구 바탕화면 아이콘 ===' -ForegroundColor Cyan
foreach ($f in @($ico, $vbs, (Join-Path $tools 'open-clip-tool.ps1'))) {
  if (-not (Test-Path -LiteralPath $f)) {
    Write-Host ('  파일이 없어요: ' + $f) -ForegroundColor Red
    Write-Host '  zip을 Documents\won-tools 폴더에 풀었는지 확인해 주세요.'
    exit 1
  }
}

$p = Join-Path $desk '장면캡처 도구.lnk'
$sh = New-Object -ComObject WScript.Shell
$l = $sh.CreateShortcut($p)
$l.TargetPath = $vbs
$l.WorkingDirectory = $tools
$l.IconLocation = ($ico + ',0')
$l.Description = '장면 캡처 도구 — 관리 페이지 열기'
$l.Save()
if (Test-Path -LiteralPath $p) { Write-Host ('  만듦: ' + $p) -ForegroundColor Green } else { Write-Host '  실패' -ForegroundColor Red; exit 1 }

# 아이콘 새로 그리기 (예전 그림이 남아 보일 때)
Start-Process -FilePath 'ie4uinit.exe' -ArgumentList '-show' -WindowStyle Hidden -ErrorAction SilentlyContinue
Write-Host ''
Write-Host '완료. 바탕화면의 토끼 아이콘을 더블클릭해 보세요.' -ForegroundColor Cyan
