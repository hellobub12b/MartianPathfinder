# Builds site/data/weather_meda.json from Perseverance's MEDA weather files
# in NASA's Planetary Data System (Atmospheres node).
#
# Run:  powershell -ExecutionPolicy Bypass -File data-prep\get-weather.ps1 -LastSol 1859 -Sols 30
# Raw files are read straight from NASA and not kept (each is 2-4 MB per sol).
#
# What it computes, per sol:
#   air temperature  = the coolest of the three mast sensors (ATS 1-3, 1.45 m up),
#                      averaged per minute, then the sol's lowest and highest minute.
#                      The coolest sensor is used because the rover warms the others.
#   pressure         = mean, lowest and highest of the per-second readings.
# It also averages air temperature by local hour across all the sols.
param([int]$LastSol = 1859, [int]$Sols = 30)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Add-Type -TypeDefinition @'
using System; using System.Collections.Generic; using System.Globalization; using System.IO; using System.Net;
public static class Meda {
  static string Get(string url) { using (var w = new WebClient()) { return w.DownloadString(url); } }
  static bool Num(string s, out double v) { return double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out v); }

  // Returns: tmin, tmax (deg C), then 24 hourly sums and 24 hourly counts.
  public static double[] Air(string url) {
    var sum = new Dictionary<int, double>(); var cnt = new Dictionary<int, int>();
    using (var r = new StringReader(Get(url))) {
      r.ReadLine(); string line;
      while ((line = r.ReadLine()) != null) {
        var f = line.Split(','); if (f.Length < 6) continue;
        int m = f[1].IndexOf('M'); if (m < 0 || f[1].Length < m + 6) continue;
        int minute = int.Parse(f[1].Substring(m + 1, 2)) * 60 + int.Parse(f[1].Substring(m + 4, 2));
        double best = double.NaN, v;
        for (int i = 3; i <= 5; i++) if (Num(f[i], out v) && v > 100 && v < 350 && !(v >= best)) best = v;
        if (double.IsNaN(best)) continue;
        double s; sum.TryGetValue(minute, out s); sum[minute] = s + best;
        int c; cnt.TryGetValue(minute, out c); cnt[minute] = c + 1;
      }
    }
    var o = new double[50]; o[0] = double.MaxValue; o[1] = double.MinValue;
    foreach (var k in sum.Keys) {
      double t = sum[k] / cnt[k] - 273.15;
      if (t < o[0]) o[0] = t; if (t > o[1]) o[1] = t;
      int h = Math.Min(23, k / 60); o[2 + h] += t; o[26 + h] += 1;
    }
    return o;
  }

  // Returns: mean, min, max pressure (Pa).
  public static double[] Pressure(string url) {
    double s = 0, lo = double.MaxValue, hi = double.MinValue; long n = 0;
    using (var r = new StringReader(Get(url))) {
      r.ReadLine(); string line;
      while ((line = r.ReadLine()) != null) {
        var f = line.Split(','); double v;
        if (f.Length < 4 || !Num(f[3], out v) || v < 300 || v > 1500) continue;
        s += v; n++; if (v < lo) lo = v; if (v > hi) hi = v;
      }
    }
    return n == 0 ? null : new double[] { s / n, lo, hi };
  }

  public static string StartDate(string url) {
    string x = Get(url); int i = x.IndexOf("<start_date_time>");
    return i < 0 ? "" : x.Substring(i + 17, 10);
  }
}
'@

$base = 'https://pds-atmospheres.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda'
function SolFolder($sol) {
  # Archive folders: 0-89, 90-179, then blocks of 120 sols.
  if ($sol -lt 90) { return 'sol_0000_0089' } elseif ($sol -lt 180) { return 'sol_0090_0179' }
  $a = 180 + [Math]::Floor(($sol - 180) / 120) * 120
  return ('sol_{0:D4}_{1:D4}' -f [int]$a, [int]($a + 119))
}

$rows = @(); $hourSum = New-Object double[] 24; $hourCnt = New-Object double[] 24
for ($sol = $LastSol - $Sols + 1; $sol -le $LastSol; $sol++) {
  $s4 = '{0:D4}' -f $sol; $g = SolFolder $sol
  $ats = "$base/data_calibrated_env/$g/sol_$s4/WE__${s4}___________CAL_ATS_________________P01.CSV"
  $ps  = "$base/data_derived_env/$g/sol_$s4/WE__${s4}___________DER_PS__________________P01.CSV"
  try {
    $a = [Meda]::Air($ats); $p = [Meda]::Pressure($ps); $d = [Meda]::StartDate(($ats -replace 'CSV$', 'xml'))
    for ($h = 0; $h -lt 24; $h++) { $hourSum[$h] += $a[2 + $h]; $hourCnt[$h] += $a[26 + $h] }
    $rows += [ordered]@{ sol = $sol; date = $d; minC = [Math]::Round($a[0], 1); maxC = [Math]::Round($a[1], 1)
      pressurePa = [Math]::Round($p[0], 1); pressureMinPa = [Math]::Round($p[1], 1); pressureMaxPa = [Math]::Round($p[2], 1) }
    Write-Host ("sol {0}  {1}  {2,6:N1} to {3,6:N1} C  {4:N0} Pa" -f $sol, $d, $a[0], $a[1], $p[0])
  } catch { Write-Host "sol $sol skipped: $($_.Exception.Message)" }
}

$hourly = for ($h = 0; $h -lt 24; $h++) { if ($hourCnt[$h]) { [Math]::Round($hourSum[$h] / $hourCnt[$h], 1) } else { $null } }
$out = [ordered]@{
  source = 'NASA PDS Atmospheres Node, Mars 2020 MEDA bundle (calibrated ATS, derived PS)'
  url = "$base/"
  method = 'Air temperature: coolest of mast sensors ATS 1-3, per-minute means, sol min and max. Pressure: per-second readings.'
  sols = $rows
  hourlyMeanC = $hourly
}
$dest = Join-Path $PSScriptRoot '..\site\data\weather_meda.json'
[IO.File]::WriteAllText($dest, ($out | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding $false))
Write-Host "Wrote $dest ($($rows.Count) sols)"
