# 받아쓰기 서버 자동 실행 + 바탕화면 아이콘 설정
$ErrorActionPreference = 'Stop'
$asr = Join-Path $env:USERPROFILE 'Documents\won-tools\asr'
$vbs = Join-Path $asr 'start-asr.vbs'
$startup = [Environment]::GetFolderPath('Startup')
$desk = [Environment]::GetFolderPath('Desktop')
$ico = Join-Path $env:USERPROFILE 'Documents\won-tools\icons\asr-restart.ico'

Write-Host ''
Write-Host '=== 받아쓰기 서버 자동 실행 설정 ===' -ForegroundColor Cyan

# 1) 자동 실행은 이미 설정됨 (다시 덮어써도 무해)
Copy-Item -LiteralPath $vbs -Destination (Join-Path $startup 'won-asr-server.vbs') -Force
Write-Host '[1/2] 컴퓨터 켤 때 자동으로 켜지게 설정했습니다.' -ForegroundColor Green

# 2) 바탕화면 아이콘 (창 없이 서버 껐다 켜기)
$sh = New-Object -ComObject WScript.Shell
# 바로가기 저장 기능이 한글 파일 이름을 못 써서, 영어 이름으로 만든 뒤 이름을 바꾼다
$tmp = Join-Path $desk 'asr-restart-tmp.lnk'
$final = Join-Path $desk '받아쓰기 서버 재시작.lnk'
$l = $sh.CreateShortcut($tmp)
$l.TargetPath = Join-Path $asr 'restart-asr.bat'
$l.WorkingDirectory = $asr
$l.WindowStyle = 7
if (Test-Path -LiteralPath $ico) { $l.IconLocation = $ico + ',0' }
$l.Description = '음성 받아쓰기 서버를 껐다 켭니다'
$l.Save()
if (Test-Path -LiteralPath $final) { Remove-Item -LiteralPath $final -Force }
Move-Item -LiteralPath $tmp -Destination $final -Force
Write-Host '[2/2] 바탕화면에 "받아쓰기 서버 재시작" 아이콘을 만들었습니다.' -ForegroundColor Green
Write-Host ''
Write-Host '완료. 이 창은 닫으셔도 됩니다.' -ForegroundColor Cyan
