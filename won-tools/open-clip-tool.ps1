# 장면 캡처 도구 열기 — 크롬에 압축해제로 올린 확장(clip-extension)의 관리 페이지를 연다
# 확장 ID는 PC마다 달라서 크롬 프로필 설정 파일에서 이 폴더로 올린 확장을 찾는다
$ErrorActionPreference = 'SilentlyContinue'
$tools = Split-Path -Parent $MyInvocation.MyCommand.Path
$extDir = Join-Path $tools 'clip-extension'
$ud = Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data'

function Find-Ext {
  $want = '"path":"' + ($extDir.TrimEnd('\') -replace '\\', '\\') + '"'
  $dirs = @(Get-ChildItem -LiteralPath $ud -Directory | Where-Object { $_.Name -eq 'Default' -or $_.Name -like 'Profile *' })
  foreach ($d in $dirs) {
    foreach ($fn in 'Secure Preferences', 'Preferences') {
      $f = Join-Path $d.FullName $fn
      if (-not (Test-Path -LiteralPath $f)) { continue }
      $raw = [IO.File]::ReadAllText($f)
      $at = $raw.IndexOf($want, [StringComparison]::OrdinalIgnoreCase)
      if ($at -lt 0) { continue }
      # "path" 바로 앞에 있는 가장 가까운 확장 ID 키("a~p 32자":{)가 이 확장
      $ms = [regex]::Matches($raw.Substring(0, $at), '"([a-p]{32})":\{')
      if ($ms.Count) { return @{ id = $ms[$ms.Count - 1].Groups[1].Value; prof = $d.Name } }
    }
  }
  return $null
}

function Find-Chrome {
  foreach ($p in @(
      (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
      (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
      (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'))) {
    if ($p -and (Test-Path -LiteralPath $p)) { return $p }
  }
  return 'chrome.exe'
}

$chrome = Find-Chrome
$hit = Find-Ext
if ($hit) {
  Start-Process -FilePath $chrome -ArgumentList @('--profile-directory="' + $hit.prof + '"', ('chrome-extension://' + $hit.id + '/manage.html'))
} else {
  Start-Process -FilePath $chrome -ArgumentList @('https://www.youtube.com/')
  $sh = New-Object -ComObject WScript.Shell
  $null = $sh.Popup("크롬에서 장면 캡처 도구 확장을 못 찾았어요.`n`nchrome://extensions 에서 '장면 캡처 도구'가 켜져 있는지,`n" + $extDir + " 폴더로 올렸는지 확인해 주세요.`n`n유튜브 영상 페이지에서는 도구가 그대로 뜹니다.", 0, '장면 캡처 도구', 48)
}
