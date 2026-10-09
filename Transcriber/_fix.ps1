# 전사 도구 권한 복구
# Low 무결성 라벨 때문에 엔진이 실행되지 않는 문제를 고친다.
$ErrorActionPreference = "Continue"
$root = "C:\Users\elsha\Transcriber"

Write-Host ""
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host " 전사 도구 권한 복구" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $root)) {
  Write-Host "[오류] 폴더를 찾을 수 없습니다: $root" -ForegroundColor Red
  exit 1
}

Write-Host " 현재 실행 권한 확인..." -ForegroundColor White
$il = (& whoami /groups | Select-String "Mandatory Label") -replace '\s+',' '
Write-Host "   $il" -ForegroundColor DarkGray
if ($il -match "Low Mandatory") {
  Write-Host ""
  Write-Host " [오류] 이 창이 Low 권한으로 실행됐습니다. 복구할 수 없습니다." -ForegroundColor Red
  Write-Host " 바탕화면에서 직접 더블클릭해서 실행해주세요." -ForegroundColor Red
  exit 1
}

$before = (& icacls (Join-Path $root "engine\faster-whisper-xxl.exe") 2>&1 | Select-String "Low Mandatory").Count
Write-Host ""
Write-Host " 복구 전 상태: $(if($before -gt 0){'Low 라벨 있음 (문제 있음)'}else{'라벨 없음 (이미 정상)'})" -ForegroundColor $(if($before -gt 0){"Yellow"}else{"Green"})

Write-Host ""
Write-Host " 파일 약 5,200개의 권한을 고치는 중입니다. 1~3분 걸립니다..." -ForegroundColor White
Write-Host " (창이 멈춘 것처럼 보여도 정상입니다)" -ForegroundColor DarkGray

$sw = [Diagnostics.Stopwatch]::StartNew()
# 1단계: 폴더(상속용) + 파일 개별 라벨을 둘 다 Medium 으로
& icacls $root /setintegritylevel "(OI)(CI)M" /C /Q 2>&1 | Out-Null
& icacls "$root\*" /setintegritylevel M /T /C /Q 2>&1 | Select-Object -Last 1 | ForEach-Object { Write-Host "   $_" -ForegroundColor DarkGray }

# 2단계: 그래도 exe 에 Low 가 남아 있으면 engine 폴더를 새로 복사한다
# (새로 만든 파일은 부모 폴더의 Medium 라벨을 물려받는다)
$exeChk = Join-Path $root "engine\faster-whisper-xxl.exe"
if (& icacls $exeChk 2>&1 | Select-String "Low Mandatory") {
  Write-Host ""
  Write-Host " 라벨이 남아 있어 엔진을 새로 복사합니다 (4.3GB, 1~3분)..." -ForegroundColor Yellow
  $eng    = Join-Path $root "engine"
  $engNew = Join-Path $root "engine_new"
  $engOld = Join-Path $root "engine_old"
  foreach ($p in @($engNew,$engOld)) { if (Test-Path $p) { Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue } }
  & robocopy $eng $engNew /E /COPY:DT /DCOPY:DT /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null
  if (Test-Path (Join-Path $engNew "faster-whisper-xxl.exe")) {
    Rename-Item $eng "engine_old"
    Rename-Item $engNew "engine"
    Remove-Item $engOld -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "   엔진 재복사 완료" -ForegroundColor Green
  } else {
    Write-Host "   [오류] 엔진 복사 실패" -ForegroundColor Red
  }
}
$sw.Stop()
Write-Host " 소요 시간: $([math]::Round($sw.Elapsed.TotalSeconds,0))초" -ForegroundColor DarkGray

# 검증
Write-Host ""
Write-Host " 검증 중..." -ForegroundColor White
$exe = Join-Path $root "engine\faster-whisper-xxl.exe"
$after = (& icacls $exe 2>&1 | Select-String "Low Mandatory").Count
Write-Host "   라벨 상태: $(if($after -gt 0){'아직 Low 라벨이 남아 있음'}else{'정상 (Low 라벨 제거됨)'})" -ForegroundColor $(if($after -gt 0){"Yellow"}else{"Green"})

$ver = & $exe --version 2>&1
$okRun = ($LASTEXITCODE -eq 0)
Write-Host "   엔진 실행 : $(if($okRun){"정상 ($ver)"}else{'실패'})" -ForegroundColor $(if($okRun){"Green"}else{"Red"})

# 콘솔 한글 깨짐 방지 설정 (신규 콘솔 창에 적용)
Write-Host ""
Write-Host " 콘솔 한글 표시 설정 중..." -ForegroundColor White
try {
  if (-not (Test-Path "HKCU:\Console")) { New-Item -Path "HKCU:\Console" -Force | Out-Null }
  New-ItemProperty -Path "HKCU:\Console" -Name "CodePage" -Value 65001 -PropertyType DWord -Force -ErrorAction Stop | Out-Null
  New-ItemProperty -Path "HKCU:\Console" -Name "FaceName" -Value "Consolas" -PropertyType String -Force -ErrorAction Stop | Out-Null
  New-ItemProperty -Path "HKCU:\Console" -Name "FontFamily" -Value 54 -PropertyType DWord -Force -ErrorAction Stop | Out-Null
  Write-Host "   완료 (CodePage 65001, Consolas)" -ForegroundColor Green
} catch {
  Write-Host "   [주의] 실패: $($_.Exception.Message)" -ForegroundColor Yellow
}

# 바탕화면 바로가기 다시 만들기 (새 경로 기준)
Write-Host ""
Write-Host " 바탕화면 바로가기를 새 경로로 다시 만듭니다..." -ForegroundColor White
$desk = $null
$cands = @([Environment]::GetFolderPath('Desktop'))
if ($env:USERPROFILE) { $cands += (Join-Path $env:USERPROFILE "OneDrive\Desktop"); $cands += (Join-Path $env:USERPROFILE "Desktop") }
foreach ($d in ($cands | Select-Object -Unique)) { if ($d -and (Test-Path $d)) { $desk = $d; break } }

if ($desk) {
  try {
    $ws = New-Object -ComObject WScript.Shell
    $tmpL = Join-Path $desk "Transcriber.lnk"
    foreach ($x in @($tmpL, (Join-Path $desk "전사.lnk"))) { if (Test-Path -LiteralPath $x) { Remove-Item -LiteralPath $x -Force -ErrorAction SilentlyContinue } }
    $s = $ws.CreateShortcut($tmpL)
    $s.TargetPath       = (Join-Path $root "Transcribe.bat")
    $s.WorkingDirectory = $root
    $s.IconLocation     = "$env:SystemRoot\System32\SHELL32.dll,116"
    $s.Description      = "Transcribe audio to text"
    $s.Hotkey           = "CTRL+ALT+T"
    $s.Save()
    $fin = Join-Path $desk "전사.lnk"
    $ok = $false
    try { Rename-Item -LiteralPath $tmpL -NewName "전사.lnk" -ErrorAction Stop; $ok = $true } catch { }
    if (-not $ok) { try { [System.IO.File]::Move($tmpL, $fin); $ok = $true } catch { } }
    Write-Host "   바로가기: $(if($ok){"'전사' 생성 완료 (Ctrl+Alt+T)"}else{"'Transcriber' 생성 완료"})" -ForegroundColor Green
  } catch {
    Write-Host "   [주의] 바로가기 생성 실패: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

Write-Host ""
if ($okRun -and $after -eq 0) {
  Write-Host "=======================================" -ForegroundColor Green
  Write-Host " 복구 완료! 이제 전사가 됩니다." -ForegroundColor Green
  Write-Host "=======================================" -ForegroundColor Green
  Write-Host ""
  Write-Host " 바탕화면 '전사' 아이콘을 눌러보세요. (또는 Ctrl+Alt+T)"
} else {
  Write-Host "=======================================" -ForegroundColor Yellow
  Write-Host " 일부 항목이 복구되지 않았습니다." -ForegroundColor Yellow
  Write-Host "=======================================" -ForegroundColor Yellow
  Write-Host ""
  Write-Host " 이 파일을 우클릭 -> '관리자 권한으로 실행' 으로 다시 시도해보세요."
}
Write-Host ""
