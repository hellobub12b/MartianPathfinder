# Builds site/data/hirise_5m.bin and hirise_5m.json: fine-scale elevation for the main
# walking area, from the MRO HiRISE stereo terrain model (1 m per pixel).
#
# Source: USGS, Mars 2020 Terrain Relative Navigation HiRISE DTM mosaic
#   https://planetarymaps.usgs.gov/mosaic/mars2020_trn/HiRISE/
# The file is 1.8 GB. It is an uncompressed GeoTIFF with one image row per strip, so
# any pixel sits at a known byte: 172609 + row x 85600 + column x 4. This script asks
# the server for every 5th row of the wanted area only, and averages each 5 pixels
# along the row, giving a 5 m grid. (Rows in between are skipped, not averaged.)
# Run:  powershell -ExecutionPolicy Bypass -File data-prep\get-hirise.ps1     (about 600 small requests)
param([double]$West = 77.385, [double]$East = 77.465, [double]$South = 18.420, [double]$North = 18.470, [int]$Step = 5)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
[Net.ServicePointManager]::DefaultConnectionLimit = 8
$url = 'https://planetarymaps.usgs.gov/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif'
# From the file's own tags: top-left corner (metres, equirectangular on a 3,396,190 m sphere), 1 m pixels.
$R = 3396190.0; $x0 = 4577366.0; $y0 = 1106618.0; $first = 172609L; $rowBytes = 85600L
$rad = [Math]::PI / 180

$c0 = [int][Math]::Floor($R * $West * $rad - $x0); $c1 = [int][Math]::Ceiling($R * $East * $rad - $x0)
$r0 = [int][Math]::Floor($y0 - $R * $North * $rad); $r1 = [int][Math]::Ceiling($y0 - $R * $South * $rad)
$w = [int][Math]::Floor(($c1 - $c0) / $Step); $h = [int][Math]::Floor(($r1 - $r0) / $Step)
$out = New-Object byte[] ($w * $h * 2)
Write-Host "columns $c0-$c1, rows $r0-$r1 -> $w x $h cells of $Step m"

for ($j = 0; $j -lt $h; $j++) {
  $row = $r0 + $j * $Step + [int]($Step / 2)
  $bytes = $null
  for ($try = 0; $try -lt 4 -and -not $bytes; $try++) {
    try {
      $req = [Net.HttpWebRequest]::Create($url); $from = $first + $row * $rowBytes + $c0 * 4L
      $req.AddRange($from, $from + $w * $Step * 4L - 1); $req.Timeout = 60000
      $resp = $req.GetResponse(); $ms = New-Object IO.MemoryStream; $resp.GetResponseStream().CopyTo($ms); $resp.Close(); $bytes = $ms.ToArray()
    } catch { Start-Sleep -Seconds 2 }
  }
  if (-not $bytes) { throw "row $row could not be read" }
  for ($i = 0; $i -lt $w; $i++) {
    $sum = 0.0; $n = 0
    for ($k = 0; $k -lt $Step; $k++) { $v = [BitConverter]::ToSingle($bytes, ($i * $Step + $k) * 4); if ($v -gt -10000 -and $v -lt 10000) { $sum += $v; $n++ } }
    # Stored as tenths of a metre above -5000 m, in 16 bits. 0 = no data.
    $q = 0; if ($n) { $q = [int][Math]::Round(($sum / $n + 5000) * 10) }
    $o = ($j * $w + $i) * 2; $out[$o] = $q -band 0xFF; $out[$o + 1] = ($q -shr 8) -band 0xFF
  }
  if ($j % 50 -eq 0) { Write-Host "row $j of $h" }
}

$dir = Join-Path $PSScriptRoot '..\site\data'
[IO.File]::WriteAllBytes((Join-Path $dir 'hirise_5m.bin'), $out)
$meta = [ordered]@{
  source = 'USGS Mars 2020 Terrain Relative Navigation HiRISE DTM mosaic (MRO HiRISE stereo), sampled to 5 m'
  url = 'https://planetarymaps.usgs.gov/mosaic/mars2020_trn/HiRISE/'
  width = $w; height = $h; cellM = $Step
  format = '16-bit little-endian; elevation in metres = value / 10 - 5000; 0 = no data; rows north to south'
  # Edges of the grid, in the same projected metres as the CTX terrain model.
  x0 = $x0 + $c0; y0 = $y0 - $r0
  bounds = @(@((($y0 - $r0 - $h * $Step) / $R / $rad), (($x0 + $c0) / $R / $rad)), @((($y0 - $r0) / $R / $rad), (($x0 + $c0 + $w * $Step) / $R / $rad)))
}
[IO.File]::WriteAllText((Join-Path $dir 'hirise_5m.json'), ($meta | ConvertTo-Json -Depth 4), (New-Object Text.UTF8Encoding $false))
Write-Host "Wrote hirise_5m.bin ($w x $h)"
