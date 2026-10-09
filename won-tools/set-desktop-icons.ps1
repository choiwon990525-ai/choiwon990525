# 바탕화면 바로가기 아이콘을 토끼 세트로 바꾸기 — 여는 대상(주소·파일)은 그대로 두고 그림만 바꾼다
$ErrorActionPreference = 'Continue'
$tools = Split-Path -Parent $MyInvocation.MyCommand.Path
$icons = Join-Path $tools 'icons'

# 바탕화면 이름(확장자 빼고) → 아이콘
$map = [ordered]@{
  'WON 전략 보드'           = 'won-board.ico'
  'WON 근무 위젯'           = 'won-work.ico'
  '근무 위젯'               = 'won-work.ico'
  '근무 시간표 (항상 최신)' = 'won-schedule.ico'
  '장면캡처 도구'           = 'clip-bunny.ico'
}

$desks = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('CommonDesktopDirectory')) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique
$sh = New-Object -ComObject WScript.Shell

Write-Host ''
Write-Host '=== 바탕화면 아이콘 바꾸기 ===' -ForegroundColor Cyan
foreach ($name in $map.Keys) {
  $ico = Join-Path $icons $map[$name]
  if (-not (Test-Path -LiteralPath $ico)) { Write-Host ('  아이콘 파일 없음: ' + $ico) -ForegroundColor Red; continue }
  $files = @(foreach ($d in $desks) { Get-ChildItem -LiteralPath $d -File | Where-Object { $_.BaseName.Trim() -eq $name -and $_.Extension -in '.lnk', '.url' } })
  if (-not $files.Count) { Write-Host ('  못 찾음 (건너뜀): ' + $name) -ForegroundColor DarkGray; continue }
  foreach ($f in $files) {
    try {
      if ($f.Extension -eq '.lnk') {
        $l = $sh.CreateShortcut($f.FullName)
        $l.IconLocation = ($ico + ',0')
        $l.Save()
      } else {
        # 인터넷 바로가기(.url): [InternetShortcut] 칸의 IconFile/IconIndex만 바꿈
        $enc = [Text.Encoding]::Default
        $lines = [IO.File]::ReadAllLines($f.FullName, $enc) | Where-Object { $_ -notmatch '^\s*Icon(File|Index)\s*=' }
        $out = New-Object System.Collections.Generic.List[string]
        $done = $false
        foreach ($ln in $lines) {
          $out.Add($ln)
          if (-not $done -and $ln -match '^\s*\[InternetShortcut\]\s*$') { $out.Add('IconFile=' + $ico); $out.Add('IconIndex=0'); $done = $true }
        }
        if (-not $done) { $out.Add('[InternetShortcut]'); $out.Add('IconFile=' + $ico); $out.Add('IconIndex=0') }
        [IO.File]::WriteAllLines($f.FullName, $out, $enc)
      }
      Write-Host ('  바꿈: ' + $f.Name + '  ->  ' + $map[$name]) -ForegroundColor Green
    } catch {
      Write-Host ('  실패: ' + $f.Name + ' (' + $_.Exception.Message + ')') -ForegroundColor Red
    }
  }
}

# 아이콘 새로 그리기
Start-Process -FilePath 'ie4uinit.exe' -ArgumentList '-show' -WindowStyle Hidden -ErrorAction SilentlyContinue
Write-Host ''
Write-Host '완료. 그림이 안 바뀐 아이콘은 바탕화면에서 F5(새로 고침)를 눌러 보세요.' -ForegroundColor Cyan
