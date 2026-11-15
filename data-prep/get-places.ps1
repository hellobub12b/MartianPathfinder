# Builds site/js/places.js: sample sites and landmarks for the map.
#
# Sample table: transcribed from NASA's "Mars Rock Samples" page (page dated 20 June 2026)
#   https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples/
# Positions: Perseverance's own position on the sol each first sample was sealed, from
#   https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json
# Official place names and coordinates: IAU Gazetteer of Planetary Nomenclature (USGS)
#   https://planetarynames.wr.usgs.gov/
#
# Run:  powershell -ExecutionPolicy Bypass -File data-prep\get-places.ps1
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# no, name, type, date sealed, sol sealed, sampling location, feature, rock type, where it is now
$samples = @'
1|Roubion|Atmospheric|2021-08-06|164|Polygon Valley|Roubion|n/a|Sample Depot
2|Montdenier|Rock core|2021-09-06|194|Artuby Ridge|Rochette|Igneous|Sample Depot
3|Montagnac|Rock core|2021-09-08|196|Artuby Ridge|Rochette|Igneous|Perseverance Rover
4|Salette|Rock core|2021-11-15|262|South Séítah|Brac|Igneous|Perseverance Rover
5|Coulettes|Rock core|2021-11-24|271|South Séítah|Brac|Igneous|Sample Depot
6|Robine|Rock core|2021-12-22|298|South Séítah|Issole|Igneous|Perseverance Rover
7|Malay|Rock core|2022-01-31|337|South Séítah|Issole|Igneous|Sample Depot
8|Ha'ahóni|Rock core|2022-03-07|371|Octavia E. Butler Landing / Ch'ał outcrop|Sid|Igneous|Perseverance Rover
9|Atsá|Rock core|2022-03-13|377|Octavia E. Butler Landing / Ch'ał outcrop|Sid|Igneous|Sample Depot
10|Swift Run|Rock core|2022-07-07|490|Delta Front|Skinner Ridge|Sedimentary|Perseverance Rover
11|Skyland|Rock core|2022-07-12|495|Delta Front|Skinner Ridge|Sedimentary|Sample Depot
12|Hazeltop|Rock core|2022-07-27|509|Delta Front|Wildcat Ridge|Sedimentary|Perseverance Rover
13|Bearwallow|Rock core|2022-08-03|516|Delta Front|Wildcat Ridge|Sedimentary|Sample Depot
14|Shuyak|Rock core|2022-10-02|575|Delta Front|Amalik|Sedimentary|Perseverance Rover
15|Mageik|Rock core|2022-11-16|619|Delta Front|Amalik|Sedimentary|Sample Depot
16|Kukaklek|Rock core|2022-11-29|631|Delta Front|Hidden Harbor|Sedimentary|Perseverance Rover
17|Atmo Mountain|Regolith|2022-12-02|634|Delta Front|Observation Mountain|Likely mixed sedimentary and igneous grains|Perseverance Rover
18|Crosswind Lake|Regolith|2022-12-07|639|Delta Front|Observation Mountain|Likely mixed sedimentary and igneous grains|Sample Depot
19|Melyn|Rock core|2023-03-30|749|Upper Fan|Berea|Sedimentary|Perseverance Rover
20|Otis Peak|Rock core|2023-06-23|832|Upper Fan|Emerald Lake|Sedimentary|Perseverance Rover
21|Pilot Mountain|Rock core|2023-09-15|913|Upper Fan|Dream Lake|Sedimentary|Perseverance Rover
22|Pelican Point|Rock core|2023-09-25|923|Margin Unit|Hans Amundsen Memorial Workspace|Sedimentary|Perseverance Rover
23|Lefroy Bay|Rock core|2023-10-21|949|Margin Unit|Turquoise Bay|Sedimentary|Perseverance Rover
24|Comet Geyser|Rock core|2024-03-12|1088|Margin Unit|Bunsen Peak|Silica-cemented carbonate|Perseverance Rover
25|Sapphire Canyon|Rock core|2024-07-21|1215|Neretva Vallis|Cheyava Falls|Sedimentary|Perseverance Rover
26|Silver Mountain|Rock core|2025-01-28|1401|Crater Rim (Witch Hazel Hill)|Shallow Bay|Igneous/impactite|Perseverance Rover
27|Green Gardens|Rock core|2025-03-02|1433|Crater Rim (Witch Hazel Hill)|Tablelands|Serpentinite|Perseverance Rover
28|Main River|Rock core|2025-03-10|1441|Crater Rim (Witch Hazel Hill)|Broom Point|Igneous/impactite|Perseverance Rover
'@ -split "`r?`n" | Where-Object { $_ } | ForEach-Object {
  $f = $_ -split '\|'
  [pscustomobject]@{ no=[int]$f[0]; name=$f[1]; type=$f[2]; date=$f[3]; sol=[int]$f[4]; location=$f[5]; feature=$f[6]; rock=$f[7]; now=$f[8] }
}
# Samples 29 (Bell Island, Pine Pond) and 30 (Gallants, Salmon Point) have no seal sol
# on NASA's page yet, so they cannot be placed and are left out.

$wc = New-Object Net.WebClient; $wc.Encoding = [Text.Encoding]::UTF8
$wps = ($wc.DownloadString('https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json') | ConvertFrom-Json).features | ForEach-Object { $_.properties }
function RoverAt($sol) { $best = $null; foreach ($w in $wps) { if ($w.sol -le $sol) { $best = $w } }; return $best }

$sites = @()
foreach ($g in $samples | Group-Object feature) {
  $first = $g.Group | Sort-Object sol | Select-Object -First 1
  $w = RoverAt $first.sol
  $sites += [ordered]@{
    id = ($g.Name.ToLower() -replace "[^a-z0-9]+", '-').Trim('-'); name = $g.Name; region = $first.location
    lat = [Math]::Round($w.lat, 6); lon = [Math]::Round($w.lon, 6); elev = [Math]::Round($w.elev_geoid, 1); positionSol = $w.sol
    samples = @($g.Group | Sort-Object no | ForEach-Object { [ordered]@{ no=$_.no; name=$_.name; type=$_.type; date=$_.date; sol=$_.sol; rock=$_.rock; now=$_.now } })
  }
}
$sites = $sites | Sort-Object { $_.samples[0].no }

$landing = RoverAt 13; $depot = RoverAt 670
$hill = $sites | Where-Object { $_.region -like 'Crater Rim*' }
$landmarks = @(
  # Official names: IAU Gazetteer centre coordinates and sizes.
  [ordered]@{ id='jezero'; name='Jezero Crater'; kind='Crater'; lat=18.41; lon=77.69; source='IAU'; detail='Impact crater 47.5 km across. Name approved by the IAU in 2007, after a town in Bosnia and Herzegovina.' }
  [ordered]@{ id='neretva'; name='Neretva Vallis'; kind='Valley'; lat=18.55; lon=77.20; source='IAU'; detail='Valley 17 km long entering Jezero from the west. Name approved in 2020, after a river in Bosnia and Herzegovina.' }
  [ordered]@{ id='sava'; name='Sava Vallis'; kind='Valley'; lat=19.09; lon=77.13; source='IAU'; detail='Valley 62 km long reaching Jezero from the north. Name approved in 2020, after a river in Slovenia.' }
  [ordered]@{ id='pliva'; name='Pliva Vallis'; kind='Valley'; lat=18.67; lon=78.35; source='IAU'; detail='Valley 30 km long leaving Jezero on its east side. Name approved in 2020, after a river in Bosnia and Herzegovina.' }
  [ordered]@{ id='belva'; name='Belva Crater'; kind='Crater'; lat=18.48; lon=77.38; source='IAU'; detail='Small crater 0.9 km across, on top of the western fan. Name approved in 2020, after a town in West Virginia, USA.' }
  [ordered]@{ id='nili'; name='Nili Planum'; kind='Plain'; lat=18.60; lon=77.10; source='IAU'; detail='The plateau west of Jezero, about 129 km across. Name approved in 2020.' }
  # Places the rover has been: its own recorded position.
  [ordered]@{ id='landing'; name='Octavia E. Butler Landing'; kind='Landing site'; lat=[Math]::Round($landing.lat,6); lon=[Math]::Round($landing.lon,6); source='Rover'; detail='Where Perseverance touched down on 18 February 2021 (sol 0). Position: first rover localisation, sol 13.' }
  [ordered]@{ id='three-forks'; name='Three Forks'; kind='Sample depot'; lat=[Math]::Round($depot.lat,6); lon=[Math]::Round($depot.lon,6); source='Rover'; detail='Flat ground at the foot of the western fan where Perseverance laid out its backup sample depot. Position: rover on sol 670.' }
  [ordered]@{ id='witch-hazel'; name='Witch Hazel Hill'; kind='Crater rim'; lat=[Math]::Round((($hill | ForEach-Object { $_.lat } | Measure-Object -Average).Average),6); lon=[Math]::Round((($hill | ForEach-Object { $_.lon } | Measure-Object -Average).Average),6); source='Rover'; detail='Outcrops on the outer side of the crater rim, sampled on sols 1401 to 1441. Position: average of the three sample sites there.' }
  # Informal names placed from Figure 1c supplied by the team (tick marks 77.408 E, 18.460 N,
  # 1 km scale bar). Checked against the rover: the figure's Three Forks and landing site
  # marks fall within about 40 m of the rover's recorded positions.
  [ordered]@{ id='western-fan'; name='Western fan (delta)'; kind='River delta'; lat=18.4856; lon=77.4110; source='Figure'; detail='The fan-shaped deposit a river built where it entered the ancient Jezero lake.' }
  [ordered]@{ id='kodiak'; name='Kodiak'; kind='Butte'; lat=18.4399; lon=77.4085; source='Figure'; detail='Isolated flat-topped hill south of the fan front, a leftover piece of the delta.' }
  [ordered]@{ id='seitah'; name='Séítah formation'; kind='Rock formation'; lat=18.4444; lon=77.4372; source='Figure'; detail='Crater-floor area of ridges and sand ripples. NASA lists the cores taken at its southern edge (Brac, Issole) as igneous.' }
  [ordered]@{ id='maaz'; name='Máaz formation'; kind='Rock formation'; lat=18.4755; lon=77.4477; source='Figure'; detail='The crater-floor rock unit around the landing site. NASA lists the cores taken from it (Rochette, Sid) as igneous.' }
)

$js = @"
// GENERATED by data-prep/get-places.ps1 on $(Get-Date -Format 'yyyy-MM-dd'). Do not edit by hand: change the script and rerun it.
// Sample table: NASA "Mars Rock Samples" page. Positions: Perseverance waypoints (M20_waypoints.json).
// Official names: IAU Gazetteer of Planetary Nomenclature. See SOURCES.md.

const SAMPLE_SITES = $($sites | ConvertTo-Json -Depth 6);

const DEPOT = { lat: $([Math]::Round($depot.lat,6)), lon: $([Math]::Round($depot.lon,6)), elev: $([Math]::Round($depot.elev_geoid,1)), positionSol: $($depot.sol),
  samples: $(@($samples | Where-Object now -eq 'Sample Depot' | ForEach-Object { [ordered]@{ no=$_.no; name=$_.name; type=$_.type; feature=$_.feature; rock=$_.rock } }) | ConvertTo-Json -Depth 4) };

const LANDMARKS = $($landmarks | ConvertTo-Json -Depth 4);
"@
$dest = Join-Path $PSScriptRoot '..\site\js\places.js'
[IO.File]::WriteAllText($dest, $js, (New-Object Text.UTF8Encoding $false))
Write-Host "Wrote $dest"
$sites | ForEach-Object { Write-Host ("{0,-34} {1,-28} {2:N5}N {3:N5}E  {4,7:N1} m  sol {5}" -f $_.name, $_.region, $_.lat, $_.lon, $_.elev, $_.positionSol) }
