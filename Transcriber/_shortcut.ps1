# 바탕화면에 '수업 전사' 바로가기 만들기 (진단 로그 포함)
param([string]$DestOverride = "")

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$log  = Join-Path $root "_shortcut_log.txt"
$lines = New-Object System.Collections.ArrayList

function L($m) {
  $null = $lines.Add($m)
  Write-Host $m
}
function LQ($m) { $null = $lines.Add($m) }

L ""
L "=== 바로가기 생성 진단 ==="
LQ "시각: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
LQ "PS버전: $($PSVersionTable.PSVersion)"
LQ "USERPROFILE: $env:USERPROFILE"
LQ "스크립트 위치: $root"

$target = Join-Path $root "Transcribe.bat"
LQ "타겟: $target (존재: $(Test-Path $target))"
if (-not (Test-Path $target)) {
  L "[오류] Transcribe.bat 을 찾을 수 없습니다."
  $lines | Out-File -FilePath $log -Encoding utf8
  exit 1
}

# 바로가기 아이콘: 바탕화면 아이콘 세트(WON 전략 보드·근무 위젯·장면캡처 도구)와 같은 캐릭터, 호박색 + 마이크 배지
# 세트처럼 모든 크기를 PNG 로 넣은 .ico 를 쓴다 (작은 크기를 BMP 로 넣었던 근무 위젯 아이콘은 빈 종이로 나왔다)
$ico = Join-Path $root "won-transcribe.ico"
$iconLoc = if (Test-Path -LiteralPath $ico) { "$ico,0" } else { "$env:SystemRoot\System32\SHELL32.dll,116" }
LQ "아이콘: $iconLoc"

# 바탕화면 후보를 전부 조사
$cands = New-Object System.Collections.ArrayList
function AddC($p, $why) {
  if ($p -and $p.Trim() -ne "") { $null = $cands.Add([PSCustomObject]@{ Path=$p; Why=$why }) }
}
AddC ([Environment]::GetFolderPath('Desktop')) "GetFolderPath(Desktop)"
AddC ([Environment]::GetFolderPath('DesktopDirectory')) "GetFolderPath(DesktopDirectory)"
try {
  $reg = (Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders" -Name Desktop -ErrorAction Stop).Desktop
  AddC ([Environment]::ExpandEnvironmentVariables($reg)) "레지스트리 Shell Folders"
} catch { }
if ($env:USERPROFILE) {
  foreach ($n in @("OneDrive\Desktop","Desktop","OneDrive\바탕 화면","바탕 화면")) {
    AddC (Join-Path $env:USERPROFILE $n) "USERPROFILE\$n"
  }
}
if ($DestOverride) { AddC $DestOverride "수동 지정" }

LQ ""
LQ "--- 바탕화면 후보 조사 ---"
$valid = New-Object System.Collections.ArrayList
$seen = @{}
foreach ($c in $cands) {
  $ex = $false
  try { $ex = Test-Path -LiteralPath $c.Path } catch { }
  LQ ("  [{0}] {1}  ({2})" -f $(if($ex){"있음"}else{"없음"}), $c.Path, $c.Why)
  if ($ex -and -not $seen.ContainsKey($c.Path.ToLower())) {
    $seen[$c.Path.ToLower()] = $true
    $null = $valid.Add($c.Path)
  }
}

if ($valid.Count -eq 0) {
  L ""
  L "[오류] 존재하는 바탕화면 폴더를 하나도 찾지 못했습니다."
  $lines | Out-File -FilePath $log -Encoding utf8
  exit 1
}

L ""
L "존재하는 바탕화면 폴더 $($valid.Count)곳에 모두 만들어 봅니다."

$okAny = $false
foreach ($desk in $valid) {
  LQ ""
  LQ "--- 대상: $desk ---"
  $tempPath  = Join-Path $desk "ClassTranscribe.lnk"
  $finalPath = Join-Path $desk "수업 전사.lnk"
  foreach ($p in @($tempPath,$finalPath)) {
    if (Test-Path -LiteralPath $p) { try { Remove-Item -LiteralPath $p -Force -ErrorAction Stop } catch { LQ "  기존 파일 삭제 실패: $p" } }
  }

  # 권한복구가 만들던 '전사' 바로가기는 이 도구를 가리킬 때만 지운다 (단축키가 겹치지 않게)
  # 한글 이름 .lnk 는 WScript.Shell 로 못 열어서, 영문 이름 복사본으로 대상을 확인한다
  foreach ($old in @("전사.lnk","Transcriber.lnk")) {
    $op = Join-Path $desk $old
    if (-not (Test-Path -LiteralPath $op)) { continue }
    $peek = Join-Path $env:TEMP "ClassTranscribe_peek.lnk"
    try {
      Copy-Item -LiteralPath $op -Destination $peek -Force -ErrorAction Stop
      $tp = (New-Object -ComObject WScript.Shell).CreateShortcut($peek).TargetPath
      if ($tp -like "*\Transcribe.bat") {
        Remove-Item -LiteralPath $op -Force -ErrorAction Stop
        L "  예전 바로가기 정리: $op"
      }
    } catch {
      LQ "  예전 바로가기 확인 실패: $op ($($_.Exception.Message))"
    } finally {
      Remove-Item -LiteralPath $peek -Force -ErrorAction SilentlyContinue
    }
  }

  $made = $false
  try {
    $ws = New-Object -ComObject WScript.Shell
    $s = $ws.CreateShortcut($tempPath)
    $s.TargetPath       = $target
    $s.WorkingDirectory = $root
    $s.IconLocation     = $iconLoc
    $s.Description      = "Transcribe class recordings"
    $s.Hotkey           = "CTRL+ALT+T"
    $s.Save()
    $made = Test-Path -LiteralPath $tempPath
    LQ "  생성 시도: $(if($made){'성공'}else{'저장됐다는데 파일 없음'})"
  } catch {
    LQ "  생성 실패: $($_.Exception.Message)"
  }

  if ($made) {
    $renamed = $false
    try { Rename-Item -LiteralPath $tempPath -NewName "수업 전사.lnk" -ErrorAction Stop; $renamed = $true } catch { LQ "  Rename-Item 실패: $($_.Exception.Message)" }
    if (-not $renamed) {
      try { [System.IO.File]::Move($tempPath, $finalPath); $renamed = $true } catch { LQ "  IO.Move 실패: $($_.Exception.Message)" }
    }
    $resultPath = if ($renamed) { $finalPath } else { $tempPath }
    if (Test-Path -LiteralPath $resultPath) {
      $okAny = $true
      L "  -> 만들었습니다: $resultPath"
    }
  }
}

L ""
if ($okAny) {
  # 아이콘 새로 그리기 (예전 그림이 남아 보일 때)
  Start-Process -FilePath 'ie4uinit.exe' -ArgumentList '-show' -WindowStyle Hidden -ErrorAction SilentlyContinue
  L "======================================="
  L " 완료! 바탕화면을 확인하세요."
  L "======================================="
  L " 아이콘 이름: 수업 전사"
  L " 단축키    : Ctrl+Alt+T"
} else {
  L "[실패] 바로가기를 만들지 못했습니다."
  L ""
  L " 수동 방법: 이 폴더의 'Transcribe' 를 오른쪽 클릭"
  L " -> (Win11이면) 추가 옵션 표시 -> 보내기 -> 바탕 화면(바로 가기 만들기)"
}
L ""
L "진단 로그를 남겼습니다: $log"
$lines | Out-File -FilePath $log -Encoding utf8
