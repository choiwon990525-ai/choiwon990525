# 받아쓰기 서버 권한 복구
# 샌드박스(Low 권한)가 설치한 파일에 붙은 "Low 무결성 라벨" 때문에
# whisper-server.exe 가 ggml.dll 을 못 읽는 문제를 고친다.
$ErrorActionPreference = "Continue"
$root = "C:\Users\elsha\Documents\won-tools"
$ext  = "C:\Users\elsha\OneDrive\Desktop\장면저장도구-확장"

Write-Host ""
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host " 받아쓰기 서버 권한 복구" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

$il = (& whoami /groups | Select-String "Mandatory Label") -replace '\s+',' '
if ($il -match "Low Mandatory") {
  Write-Host " [오류] 이 창이 Low 권한으로 실행됐습니다." -ForegroundColor Red
  Write-Host " 바탕화면 '수업' 폴더에서 직접 더블클릭해주세요." -ForegroundColor Red
  exit 1
}

Write-Host " 1) 서버 끄기..." -ForegroundColor White
& taskkill /IM whisper-server.exe /F 2>&1 | Out-Null
Start-Sleep -Seconds 1

Write-Host " 2) 권한 고치는 중 (10~30초)..." -ForegroundColor White
& icacls $root /setintegritylevel "(OI)(CI)M" /T /C /Q 2>&1 | Select-Object -Last 1 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
if (Test-Path $ext) { & icacls $ext /setintegritylevel "(OI)(CI)M" /T /C /Q 2>&1 | Out-Null }

$dll = Join-Path $root "asr\bin\ggml.dll"
$left = (& icacls $dll 2>&1 | Select-String "Low Mandatory").Count
Write-Host "    라벨: $(if($left -gt 0){'아직 남아 있음'}else{'정상'})" -ForegroundColor $(if($left -gt 0){"Yellow"}else{"Green"})

Write-Host " 3) 서버 켜는 중 (모델 로딩 약 20초)..." -ForegroundColor White
& wscript.exe (Join-Path $root "asr\start-asr.vbs")
$ok = $false
for ($i = 0; $i -lt 45; $i++) {
  Start-Sleep -Seconds 1
  try { $r = Invoke-WebRequest -Uri "http://127.0.0.1:5005/" -UseBasicParsing -TimeoutSec 2; $ok = $true; break } catch { }
  Write-Host "." -NoNewline
}
Write-Host ""

if ($ok -and $left -eq 0) {
  Write-Host "=======================================" -ForegroundColor Green
  Write-Host " 복구 완료! 받아쓰기 서버가 켜졌습니다." -ForegroundColor Green
  Write-Host "=======================================" -ForegroundColor Green
  Write-Host " 유튜브 탭을 새로고침하면 '서버 연결됨' 알림이 뜹니다."
} else {
  Write-Host "=======================================" -ForegroundColor Yellow
  Write-Host " 서버 응답이 없습니다." -ForegroundColor Yellow
  Write-Host "=======================================" -ForegroundColor Yellow
  Write-Host " 이 파일을 우클릭 -> '관리자 권한으로 실행' 으로 다시 해보세요."
  Write-Host " 그래도 안 되면 뜨는 오류창을 캡처해서 보내주세요."
}
Write-Host ""
