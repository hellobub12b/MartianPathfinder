# Builds site/data/themis_ti.bin and themis_ti.json: thermal inertia over Jezero.
#
# Source: USGS "THEMIS Thermal Inertia Mosaic Quantitative 00N060E 100mpp", made from
# Mars Odyssey THEMIS night-time infrared images with the method of Fergason et al. (2006).
#   https://astrogeology.usgs.gov/search/map/themis_thermal_inertia_mosaic_quantitative_00n060e_100mpp
# Stated absolute accuracy: about 20%.
#
# The cube is 2.5 GB, but it is stored as 128 x 128 pixel tiles, so this script asks the
# server for only the tiles that cover the site (a few hundred KB).
# Run:  powershell -ExecutionPolicy Bypass -File data-prep\get-thermal-inertia.ps1
param([double]$West = 77.16, [double]$East = 77.70, [double]$South = 18.21, [double]$North = 18.72)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$url = 'https://asc-astropedia.s3.us-west-2.amazonaws.com/Mars/Odyssey/THEMIS-Global-Thermal-Inertia-Mosaic/Quantitative-32-Bit/THEMIS_TI_Mosaic_Quant_00N060E_100mpp.cub'

# From the cube's label: simple cylindrical, 592.74697523306 pixels per degree,
# top-left corner at 30 N, 60 E, 35566 x 17783 pixels, 32-bit little-endian reals,
# tiles of 128 x 128, pixel data starting at byte 65537 (1-based).
$ppd = 592.74697523306; $lon0 = 60.0; $lat0 = 30.0; $samples = 35566; $tile = 128; $start = 65536
$tilesPerRow = [Math]::Ceiling($samples / $tile)

function GetBytes([long]$from, [long]$count) {
  $req = [Net.HttpWebRequest]::Create($url); $req.AddRange($from, $from + $count - 1); $req.Timeout = 120000
  $resp = $req.GetResponse(); $ms = New-Object IO.MemoryStream; $resp.GetResponseStream().CopyTo($ms); $resp.Close(); return ,$ms.ToArray()
}

$s0 = [int][Math]::Floor(($West - $lon0) * $ppd); $s1 = [int][Math]::Ceiling(($East - $lon0) * $ppd)
$l0 = [int][Math]::Floor(($lat0 - $North) * $ppd); $l1 = [int][Math]::Ceiling(($lat0 - $South) * $ppd)
$w = $s1 - $s0; $h = $l1 - $l0
$grid = New-Object 'single[]' ($w * $h)

for ($tr = [Math]::Floor($l0 / $tile); $tr -le [Math]::Floor(($l1 - 1) / $tile); $tr++) {
  $tc0 = [Math]::Floor($s0 / $tile); $tc1 = [Math]::Floor(($s1 - 1) / $tile)
  # Tiles in one row sit next to each other in the file: fetch the run in one request.
  $bytes = GetBytes ($start + ([long]$tr * $tilesPerRow + $tc0) * $tile * $tile * 4) (($tc1 - $tc0 + 1) * $tile * $tile * 4)
  for ($tc = $tc0; $tc -le $tc1; $tc++) {
    $base = ($tc - $tc0) * $tile * $tile * 4
    for ($y = 0; $y -lt $tile; $y++) {
      $line = $tr * $tile + $y; if ($line -lt $l0 -or $line -ge $l1) { continue }
      for ($x = 0; $x -lt $tile; $x++) {
        $samp = $tc * $tile + $x; if ($samp -lt $s0 -or $samp -ge $s1) { continue }
        $grid[($line - $l0) * $w + ($samp - $s0)] = [BitConverter]::ToSingle($bytes, $base + ($y * $tile + $x) * 4)
      }
    }
  }
  Write-Host "tile row $tr done"
}

# Store as 16-bit whole numbers; 0 marks "no data" (ISIS special pixels are huge negatives).
$out = New-Object byte[] ($w * $h * 2); $valid = New-Object Collections.Generic.List[single]
for ($i = 0; $i -lt $grid.Length; $i++) {
  $v = $grid[$i]; $n = 0
  if ($v -gt 0 -and $v -lt 30000) { $n = [int][Math]::Round($v); $valid.Add($v) }
  $out[$i * 2] = $n -band 0xFF; $out[$i * 2 + 1] = ($n -shr 8) -band 0xFF
}
$valid.Sort()
$dir = Join-Path $PSScriptRoot '..\site\data'
[IO.File]::WriteAllBytes((Join-Path $dir 'themis_ti.bin'), $out)
$meta = [ordered]@{
  source = 'USGS THEMIS Thermal Inertia Mosaic Quantitative 00N060E 100mpp (Mars Odyssey THEMIS; Fergason et al. 2006 method)'
  url = 'https://astrogeology.usgs.gov/search/map/themis_thermal_inertia_mosaic_quantitative_00n060e_100mpp'
  units = 'J m^-2 K^-1 s^-1/2'; accuracy = 'about 20% (USGS)'
  width = $w; height = $h; format = '16-bit little-endian whole numbers, rows north to south, 0 = no data'
  bounds = @(@(($lat0 - $l1 / $ppd), ($lon0 + $s0 / $ppd)), @(($lat0 - $l0 / $ppd), ($lon0 + $s1 / $ppd)))
  validPixels = $valid.Count
  p02 = [Math]::Round($valid[[int]($valid.Count * 0.02)]); median = [Math]::Round($valid[[int]($valid.Count * 0.5)]); p98 = [Math]::Round($valid[[int]($valid.Count * 0.98)])
  min = [Math]::Round($valid[0]); max = [Math]::Round($valid[$valid.Count - 1])
}
[IO.File]::WriteAllText((Join-Path $dir 'themis_ti.json'), ($meta | ConvertTo-Json -Depth 4), (New-Object Text.UTF8Encoding $false))
Write-Host ("{0} x {1} pixels, {2} valid. 2%: {3}  median: {4}  98%: {5}  max: {6}" -f $w, $h, $valid.Count, $meta.p02, $meta.median, $meta.p98, $meta.max)
