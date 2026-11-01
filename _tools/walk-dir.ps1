# 이웃한 360 사진들을 견주어 '어느 쪽으로 걸어갔는지'를 모두 계산합니다.
#   .\_tools\walk-dir.ps1 -In <펼친 360 사진 폴더>
#
# 지점 차례대로 앞·뒤 방향을 찍어 줍니다. make-tour.js 의 fwd·back 에 넣으면 됩니다.
param(
  [Parameter(Mandatory=$true)][string]$In,
  [int]$Size = 2048
)
Add-Type -AssemblyName System.Drawing
$tools = Split-Path -Parent $MyInvocation.MyCommand.Path
$walk = Join-Path $tools 'walk-dir.js'
$tmp = Join-Path $env:TEMP 'walk-work'
New-Item -ItemType Directory -Force $tmp | Out-Null

# 1) 사진들을 작게 줄여 날것으로 떠 놓습니다
$files = Get-ChildItem $In -Filter *.jpg | Sort-Object Name
$raws = @{}
$script:stride = $Size * 3   # 24비트라 가로 x 3. 2048 은 이미 4의 배수라 남는 칸이 없습니다
$h = [int]($Size/2)
foreach ($f in $files) {
  $raw = Join-Path $tmp ($f.BaseName + '.raw')
  $raws[$f.BaseName] = $raw
  if (Test-Path $raw) { continue }
  $src = New-Object System.Drawing.Bitmap $f.FullName
  $small = New-Object System.Drawing.Bitmap $Size,$h
  $g = [System.Drawing.Graphics]::FromImage($small)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($src, 0, 0, $Size, $h)
  $g.Dispose(); $src.Dispose()
  $rect = New-Object System.Drawing.Rectangle 0,0,$Size,$h
  $d = $small.LockBits($rect,[System.Drawing.Imaging.ImageLockMode]::ReadOnly,[System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $buf = New-Object byte[] ($d.Stride*$h)
  [System.Runtime.InteropServices.Marshal]::Copy($d.Scan0,$buf,0,$buf.Length)
  $small.UnlockBits($d)
  $script:stride = $d.Stride
  $small.Dispose()
  [System.IO.File]::WriteAllBytes($raw,$buf)
}

# 2) 이웃끼리 견줍니다
$names = $files | ForEach-Object { $_.BaseName }
Write-Host "지점   다음으로 가는 쪽      앞 지점으로 가는 쪽"
for ($i=0; $i -lt $names.Count; $i++) {
  $me = $names[$i]
  $fwd = ''; $back = ''
  if ($i -lt $names.Count-1) {
    $r = (& node $walk $raws[$me] $raws[$names[$i+1]] $Size $h $script:stride) -split ' '
    $fwd = "{0,5}도 (믿음 {1}, 폭 {2})" -f $r[0], $r[1], $r[2]
  }
  if ($i -gt 0) {
    $r = (& node $walk $raws[$me] $raws[$names[$i-1]] $Size $h $script:stride) -split ' '
    $back = "{0,5}도 (믿음 {1}, 폭 {2})" -f $r[0], $r[1], $r[2]
  }
  "{0,-6} {1,-30} {2}" -f $me, $fwd, $back
}
