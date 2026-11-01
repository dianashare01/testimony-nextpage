# 펼친 360 사진들을 정육면체 여섯 면으로 바꿉니다.
#   .\_tools\cube.ps1 -In <jpg 폴더> -Out <나올 폴더> [-Size 1536] [-Quality 84]
#
# <나올 폴더>\<사진이름>\px.jpg … nz.jpg 가 생깁니다.
# -Preview 를 주면 흐릿한 미리보기(한 면 256)도 같이 만듭니다. 먼저 띄워 두는 용도입니다.
param(
  [Parameter(Mandatory=$true)][string]$In,
  [Parameter(Mandatory=$true)][string]$Out,
  [int]$Size = 1536,
  [int]$Quality = 84,
  [int]$Preview = 256
)
Add-Type -AssemblyName System.Drawing
$tools = Split-Path -Parent $MyInvocation.MyCommand.Path
$cube = Join-Path $tools 'equirect-to-cube.js'
$tmp = Join-Path $env:TEMP 'cube-work'
New-Item -ItemType Directory -Force $tmp | Out-Null
New-Item -ItemType Directory -Force $Out | Out-Null
$raw = Join-Path $tmp 'full.raw'

$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
function Save-Jpeg($bmp, $path, $q) {
  $ep = New-Object System.Drawing.Imaging.EncoderParameters 1
  $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter -ArgumentList ([System.Drawing.Imaging.Encoder]::Quality), ([long]$q)
  $bmp.Save($path, $enc, $ep)
}

$files = Get-ChildItem $In -Filter *.jpg | Sort-Object Name
$i = 0
foreach ($f in $files) {
  $i++
  $dst = Join-Path $Out $f.BaseName
  if (Test-Path (Join-Path $dst 'nz.jpg')) { Write-Host "[$i/$($files.Count)] $($f.Name) 건너뜀"; continue }

  # 1) 사진을 날것 그대로 떠냅니다. 큰 그림은 DrawImage 가 빈 그림을 만들어서 LockBits 를 씁니다.
  $src = New-Object System.Drawing.Bitmap $f.FullName
  $w = $src.Width; $h = $src.Height
  $rect = New-Object System.Drawing.Rectangle 0,0,$w,$h
  $d = $src.LockBits($rect,[System.Drawing.Imaging.ImageLockMode]::ReadOnly,[System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $fs = [System.IO.File]::Create($raw)
  $buf = New-Object byte[] ($d.Stride*64)
  for ($y=0; $y -lt $h; $y+=64) {
    $rows=[Math]::Min(64,$h-$y); $n=$d.Stride*$rows
    [System.Runtime.InteropServices.Marshal]::Copy([System.IntPtr]::Add($d.Scan0,$d.Stride*$y),$buf,0,$n)
    $fs.Write($buf,0,$n)
  }
  $fs.Close(); $src.UnlockBits($d); $stride = $d.Stride; $src.Dispose()

  # 2) 여섯 면으로 자릅니다
  & node $cube $raw $tmp $Size $w $h $stride | Out-Null

  # 3) 면들을 jpg 로. 미리보기도 함께
  New-Item -ItemType Directory -Force $dst | Out-Null
  foreach ($face in @('px','nx','py','ny','pz','nz')) {
    $bmp = New-Object System.Drawing.Bitmap (Join-Path $tmp "$face.bmp")
    Save-Jpeg $bmp (Join-Path $dst "$face.jpg") $Quality
    if ($Preview -gt 0) {
      $small = New-Object System.Drawing.Bitmap $Preview,$Preview
      $g = [System.Drawing.Graphics]::FromImage($small)
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.DrawImage($bmp, 0, 0, $Preview, $Preview)
      $g.Dispose()
      Save-Jpeg $small (Join-Path $dst "$face-s.jpg") 72
      $small.Dispose()
    }
    $bmp.Dispose()
  }
  $kb = [math]::Round((Get-ChildItem $dst -Filter *.jpg | Measure-Object Length -Sum).Sum/1KB)
  Write-Host "[$i/$($files.Count)] $($f.Name) -> $($f.BaseName)\  ($kb KB)"
}
Remove-Item (Join-Path $tmp '*') -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "끝. $Out"
