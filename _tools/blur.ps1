# tour/ 안의 파노라마가 얼마나 또렷한지 모두 재서 CSV 로 적습니다.
#   .\_tools\blur.ps1 -Tour <tour 폴더> -Out <결과.csv>
param(
  [Parameter(Mandatory=$true)][string]$Tour,
  [Parameter(Mandatory=$true)][string]$Out
)
Add-Type -AssemblyName System.Drawing
$tools = Split-Path -Parent $MyInvocation.MyCommand.Path
$blur = Join-Path $tools 'blur.js'
$raw = Join-Path $env:TEMP 'band.raw'

"room,file,p90,p99,bx,by" | Set-Content $Out -Encoding utf8
$files = Get-ChildItem $Tour -Directory | Sort-Object Name | ForEach-Object {
  Get-ChildItem $_.FullName -Filter *.jpg | Sort-Object Name
}
$i = 0
foreach ($f in $files) {
  $i++
  $bmp = New-Object System.Drawing.Bitmap $f.FullName
  $w = $bmp.Width; $h = $bmp.Height
  $y0 = [int]($h * 0.35); $y1 = [int]($h * 0.68); $rows = $y1 - $y0
  $rect = New-Object System.Drawing.Rectangle 0,0,$w,$h
  $d = $bmp.LockBits($rect,[System.Drawing.Imaging.ImageLockMode]::ReadOnly,[System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $buf = New-Object byte[] ($d.Stride*$rows)
  [System.Runtime.InteropServices.Marshal]::Copy([System.IntPtr]::Add($d.Scan0,$d.Stride*$y0),$buf,0,$buf.Length)
  $bmp.UnlockBits($d); $stride = $d.Stride; $bmp.Dispose()
  [System.IO.File]::WriteAllBytes($raw,$buf)

  $r = (& node $blur $raw $w $rows $stride) -split ' '
  "{0},{1},{2},{3},{4},{5}" -f $f.Directory.Name, $f.Name, $r[0], $r[1], $r[2], $r[3] | Add-Content $Out -Encoding utf8
  if ($i % 25 -eq 0) { Write-Host "$i / $($files.Count)" }
}
Remove-Item $raw -ErrorAction SilentlyContinue
Write-Host "끝 — $Out"
