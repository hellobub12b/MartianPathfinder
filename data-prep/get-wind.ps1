# Builds site/data/wind_meda.json: average wind by local hour at Jezero, from
# Perseverance's MEDA wind sensor (derived wind files, NASA Planetary Data System).
#
# The wind sensor was damaged early in the mission: NASA's archive has derived wind
# only for sols 36 to 315. The default range, sols 36-65, is the part of that record
# closest in season to northern spring (Ls about 23 to 37 degrees).
#
# Run:  powershell -ExecutionPolicy Bypass -File data-prep\get-wind.ps1 -FirstSol 36 -LastSol 65
# Per local hour it stores: mean speed, the speed 95% of readings stay under, and the
# mean direction (a vector average weighted by speed), using readings taken while the
# rover was still.
param([int]$FirstSol = 36, [int]$LastSol = 65)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Add-Type -TypeDefinition @'
using System; using System.Collections.Generic; using System.Globalization; using System.IO; using System.Net;
public static class Wind {
  public static double[] SumE = new double[24], SumN = new double[24], SumSpeed = new double[24];
  public static long[] Count = new long[24];
  public static List<float>[] Speeds = new List<float>[24];
  static Wind() { for (int i = 0; i < 24; i++) Speeds[i] = new List<float>(); }
  // Adds one sol's file. Returns the number of readings used.
  public static int Add(string url) {
    string text; using (var w = new WebClient()) { text = w.DownloadString(url); }
    int used = 0;
    using (var r = new StringReader(text)) {
      r.ReadLine(); string line;
      while ((line = r.ReadLine()) != null) {
        var f = line.Split(','); if (f.Length < 11) continue;
        double s, d;
        if (!double.TryParse(f[3], NumberStyles.Float, CultureInfo.InvariantCulture, out s) || s < 0 || s > 100) continue;
        if (!double.TryParse(f[7], NumberStyles.Float, CultureInfo.InvariantCulture, out d) || d < 0 || d > 360) continue;
        if (f[10].Trim() != "1") continue;                       // rover still
        int m = f[1].IndexOf('M'); if (m < 0) continue;
        int h = int.Parse(f[1].Substring(m + 1, 2)); if (h > 23) continue;
        double a = d * Math.PI / 180;
        SumE[h] += s * Math.Sin(a); SumN[h] += s * Math.Cos(a); SumSpeed[h] += s; Count[h]++; Speeds[h].Add((float)s); used++;
      }
    }
    return used;
  }
  public static double P95(int h) { var l = Speeds[h]; if (l.Count == 0) return 0; l.Sort(); return l[(int)(l.Count * 0.95)]; }
}
'@

$base = 'https://pds-atmospheres.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_derived_env'
function SolFolder($sol) {
  if ($sol -lt 90) { return 'sol_0000_0089' } elseif ($sol -lt 180) { return 'sol_0090_0179' }
  $a = 180 + [Math]::Floor(($sol - 180) / 120) * 120
  return ('sol_{0:D4}_{1:D4}' -f [int]$a, [int]($a + 119))
}

$used = @()
for ($sol = $FirstSol; $sol -le $LastSol; $sol++) {
  $dir = "$base/$(SolFolder $sol)/sol_$('{0:D4}' -f $sol)/"
  try {
    $file = (Invoke-WebRequest -Uri $dir -UseBasicParsing -TimeoutSec 60).Links | ForEach-Object { $_.href } | Where-Object { $_ -match 'DER_WS.*\.CSV$' } | Select-Object -First 1
    if (-not $file) { Write-Host "sol $sol  no wind file"; continue }
    $n = [Wind]::Add($dir + $file)
    if ($n -gt 0) { $used += $sol }
    Write-Host "sol $sol  $n readings"
  } catch { Write-Host "sol $sol skipped: $($_.Exception.Message)" }
}

$hours = for ($h = 0; $h -lt 24; $h++) {
  $c = [Wind]::Count[$h]
  if ($c -eq 0) { [ordered]@{ hour = $h; readings = 0 } } else {
    $dirDeg = ([Math]::Atan2([Wind]::SumE[$h], [Wind]::SumN[$h]) * 180 / [Math]::PI + 360) % 360
    [ordered]@{ hour = $h; readings = $c; meanSpeed = [Math]::Round([Wind]::SumSpeed[$h] / $c, 2); p95Speed = [Math]::Round([Wind]::P95($h), 2); directionFrom = [Math]::Round($dirDeg, 0) }
  }
}
$out = [ordered]@{
  source = 'NASA PDS Atmospheres Node, Mars 2020 MEDA bundle, derived wind (DER_WS)'
  url = "$base/"
  note = 'directionFrom: degrees clockwise from north that the wind blows FROM (assumed meteorological convention: check the MEDA data guide).'
  firstSol = ($used | Select-Object -First 1); lastSol = ($used | Select-Object -Last 1); solsUsed = $used.Count
  hours = $hours
}
$dest = Join-Path $PSScriptRoot '..\site\data\wind_meda.json'
[IO.File]::WriteAllText($dest, ($out | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding $false))
Write-Host "Wrote $dest ($($used.Count) sols)"
