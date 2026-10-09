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

# 바로가기 아이콘: 코치 시그니처 강아지
# 이 PC 바탕화면은 .ico 파일을 바로 가리키는 바로가기를 빈 종이로 보여준다(근무 위젯·전략 보드와 같은 증상).
# 그래서 ClassPen 처럼 아이콘을 작은 실행 파일(TranscribeIcon.exe) 안에 넣고 그 파일을 가리킨다.
# 더블클릭하면 같은 폴더의 Transcribe.bat 을 여는 실행 파일이라, 잘못 눌러도 전사가 켜질 뿐이다.
$ico     = Join-Path $root "transcribe-dog.ico"
$iconExe = Join-Path $root "TranscribeIcon.exe"
$iconLoc = "$env:SystemRoot\System32\SHELL32.dll,116"
if (Test-Path -LiteralPath $ico) {
  $stale = (-not (Test-Path -LiteralPath $iconExe)) -or ((Get-Item -LiteralPath $iconExe).LastWriteTime -lt (Get-Item -LiteralPath $ico).LastWriteTime)
  if ($stale) {
    $csc = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"
    if (-not (Test-Path -LiteralPath $csc)) { $csc = Join-Path $env:WINDIR "Microsoft.NET\Framework\v4.0.30319\csc.exe" }
    $code = @'
// 수업 전사 바로가기의 강아지 아이콘을 담는 작은 실행 파일.
// 더블클릭하면 같은 폴더의 Transcribe.bat 을 연다 (위에 끌어다 놓은 파일도 넘긴다).
using System;
using System.Diagnostics;
using System.IO;

static class TranscribeIcon
{
    static void Main(string[] args)
    {
        string dir = AppDomain.CurrentDomain.BaseDirectory;
        string line = "/c \"\"" + Path.Combine(dir, "Transcribe.bat") + "\"";
        foreach (string a in args) line += " \"" + a + "\"";
        line += "\"";
        ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", line);
        psi.WorkingDirectory = dir;
        Process.Start(psi);
    }
}
'@
    $cs = Join-Path $env:TEMP "TranscribeIcon.cs"
    [System.IO.File]::WriteAllText($cs, $code, (New-Object System.Text.UTF8Encoding($true)))
    if (Test-Path -LiteralPath $csc) {
      $out = & $csc /nologo /target:winexe /optimize+ /codepage:65001 "/out:$iconExe" "/win32icon:$ico" $cs 2>&1
      LQ "아이콘 실행 파일 빌드 (종료 코드 $LASTEXITCODE)"
      foreach ($o in @($out)) { LQ "  $o" }
    } else {
      LQ "C# 컴파일러 없음: $csc"
    }
    Remove-Item -LiteralPath $cs -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $iconExe) {
    $iconLoc = "$iconExe,0"
  } else {
    L "[주의] 강아지 아이콘 실행 파일을 만들지 못했습니다. 아이콘이 빈 종이로 보이면 진단 로그를 보내주세요."
    $iconLoc = "$ico,0"
  }
}
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
  L " 아이콘 이름: 수업 전사 (강아지)"
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
