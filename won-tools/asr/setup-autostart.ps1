# 받아쓰기 서버 자동 실행 + 바탕화면 아이콘 설정
$ErrorActionPreference = 'Stop'
$asr = Join-Path $env:USERPROFILE 'Documents\won-tools\asr'
$vbs = Join-Path $asr 'start-asr.vbs'
$startup = [Environment]::GetFolderPath('Startup')
$desk = [Environment]::GetFolderPath('Desktop')
$ico = Join-Path $env:USERPROFILE 'Documents\won-tools\icons\asr-restart.ico'

Write-Host ''
Write-Host '=== 받아쓰기 서버 자동 실행 설정 ===' -ForegroundColor Cyan

# 1) 컴퓨터 켤 때 자동 실행 (예전 경로를 보던 파일을 새 것으로 교체)
Copy-Item -LiteralPath $vbs -Destination (Join-Path $startup 'won-asr-server.vbs') -Force
Write-Host '[1/2] 컴퓨터 켤 때 자동으로 켜지게 설정했습니다.' -ForegroundColor Green

# 2) 바탕화면 아이콘 (창 없이 서버 껐다 켜기)
$sh = New-Object -ComObject WScript.Shell
$l = $sh.CreateShortcut((Join-Path $desk '받아쓰기 서버 재시작.lnk'))
$l.TargetPath = Join-Path $asr 'restart-asr.bat'
$l.WorkingDirectory = $asr
$l.WindowStyle = 7
if (Test-Path -LiteralPath $ico) { $l.IconLocation = $ico + ',0' }
$l.Description = '음성 받아쓰기 서버를 껐다 켭니다'
$l.Save()
Write-Host '[2/2] 바탕화면에 "받아쓰기 서버 재시작" 아이콘을 만들었습니다.' -ForegroundColor Green
Write-Host ''
Write-Host '완료. 이 창은 닫으셔도 됩니다.' -ForegroundColor Cyan
