# .insp (어안 두 장) -> 360 사진(정방형 파노라마) 일괄 변환
#   .\pano.ps1 -In <폴더 또는 파일> -Out <나올 폴더> [-Width 4096] [-Fov 196] [-Quality 85]
param(
  [Parameter(Mandatory=$true)][string]$In,
  [Parameter(Mandatory=$true)][string]$Out,
  [int]$Width = 4096,
  [double]$Fov = 196,
  [double]$Yaw = 0,
  [int]$Quality = 85
)
Add-Type -AssemblyName System.Drawing
$tools = Split-Path -Parent $MyInvocation.MyCommand.Path
$stitch = Join-Path $tools 'insp-to-pano.js'
if (-not (Test-Path $Out)) { New-Item -ItemType Directory -Force $Out | Out-Null }
$tmp = Join-Path $env:TEMP 'pano-work'
if (-not (Test-Path $tmp)) { New-Item -ItemType Directory -Force $tmp | Out-Null }
$raw = Join-Path $tmp 'full.raw'
$bmp = Join-Path $tmp 'flat.bmp'

$files = if (Test-Path $In -PathType Container) {
  Get-ChildItem $In -Filter *.insp | Sort-Object Name
} else { Get-Item $In }

$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters 1
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter -ArgumentList ([System.Drawing.Imaging.Encoder]::Quality), ([long]$Quality)

$i = 0
foreach ($f in $files) {
  $i++
  $dst = Join-Path $Out ($f.BaseName + '.jpg')
  if (Test-Path $dst) { Write-Host "[$i/$($files.Count)] $($f.Name) 건너뜀(이미 있음)"; continue }
  $src = New-Object System.Drawing.Bitmap $f.FullName
  $w = $src.Width; $h = $src.Height
  $rect = New-Object System.Drawing.Rectangle 0,0,$w,$h
  $d = $src.LockBits($rect,[System.Drawing.Imaging.ImageLockMode]::ReadOnly,[System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $fs = [System.IO.File]::Create($raw)
  $buf = New-Object byte[] ($d.Stride*128)
  for ($y=0; $y -lt $h; $y+=128) {
    $rows=[Math]::Min(128,$h-$y); $n=$d.Stride*$rows
    [System.Runtime.InteropServices.Marshal]::Copy([System.IntPtr]::Add($d.Scan0,$d.Stride*$y),$buf,0,$n)
    $fs.Write($buf,0,$n)
  }
  $fs.Close(); $src.UnlockBits($d)
  $stride = $d.Stride
  $src.Dispose()

  & node $stitch $raw $bmp $Width $Fov $Yaw $w $h $stride | Out-Null
  $flat = New-Object System.Drawing.Bitmap $bmp
  $flat.Save($dst,$enc,$ep)
  $flat.Dispose()
  Write-Host "[$i/$($files.Count)] $($f.Name) -> $(Split-Path -Leaf $dst)  ($([math]::Round((Get-Item $dst).Length/1KB))KB)"
}
Remove-Item $raw,$bmp -ErrorAction SilentlyContinue
Write-Host "끝. $Out"
