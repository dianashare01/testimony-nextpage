# 파노라마 폴더를 한 장의 대지(contact sheet)로 붙입니다.
#   .\sheet.ps1 -In <폴더> -Out <파일.jpg> [-Cols 5] [-Cell 400]
param(
  [Parameter(Mandatory=$true)][string]$In,
  [Parameter(Mandatory=$true)][string]$Out,
  [int]$Cols = 5,
  [int]$Cell = 400
)
Add-Type -AssemblyName System.Drawing
$files = Get-ChildItem $In -Filter *.jpg | Sort-Object Name
$rows = [math]::Ceiling($files.Count / $Cols)
$ch = [int]($Cell/2) + 18
$sheet = New-Object System.Drawing.Bitmap (($Cols*$Cell), ($rows*$ch))
$g = [System.Drawing.Graphics]::FromImage($sheet)
$g.Clear([System.Drawing.Color]::FromArgb(20,16,28))
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$font = New-Object System.Drawing.Font 'Consolas',11
$br = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(230,220,235))
for ($i=0; $i -lt $files.Count; $i++) {
  $x = ($i % $Cols) * $Cell; $y = [int]($i / $Cols) * $ch
  $im = New-Object System.Drawing.Bitmap $files[$i].FullName
  $g.DrawImage($im, $x, ($y+16), $Cell, [int]($Cell/2))
  $im.Dispose()
  $tag = $files[$i].BaseName -replace '.*_00_',''
  $g.DrawString("$($i+1).  $tag", $font, $br, $x+3, $y+1)
}
$g.Dispose()
$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters 1
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter -ArgumentList ([System.Drawing.Imaging.Encoder]::Quality), ([long]82)
$sheet.Save($Out,$enc,$ep); $sheet.Dispose()
Write-Host "$Out  ($($files.Count)장)"
