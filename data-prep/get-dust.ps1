# Builds site/data/dust_climatology.json: daily dust optical depth over Jezero
# for Mars Years 24-36, from the Montabone et al. dust climatology.
#
# That dataset is gridded maps of column dust optical depth built from NASA
# instruments: MGS TES, Mars Odyssey THEMIS and MRO Mars Climate Sounder.
#   https://www-mars.lmd.jussieu.fr/mars/dust_climatology/
#   Montabone et al. (2015) Icarus, doi:10.1016/j.icarus.2014.12.034
#   Montabone et al. (2020) JGR Planets, doi:10.1029/2019JE006111
#
# Run:  powershell -ExecutionPolicy Bypass -File data-prep\get-dust.ps1
# Each yearly file is about 55 MB. It is downloaded, read, then deleted.
# Add -InspectOnly to print one file's variables and stop.
param([double]$Lat = 18.44, [double]$LonE = 77.45, [switch]$InspectOnly)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Add-Type -TypeDefinition @'
using System; using System.Collections.Generic; using System.IO; using System.Text;
// Minimal reader for NetCDF "classic" files (the CDF-1 / CDF-2 format).
public class NcVar { public string Name; public int[] Dims; public int Type; public long Begin; public long VSize; public bool IsRecord; }
public class NcFile {
  public int NumRecs; public List<string> DimNames = new List<string>(); public List<int> DimLens = new List<int>();
  public List<NcVar> Vars = new List<NcVar>(); public long RecSize; byte[] d; int p; bool v2;
  int I32() { int v = (d[p] << 24) | (d[p+1] << 16) | (d[p+2] << 8) | d[p+3]; p += 4; return v; }
  long Off() { if (!v2) return (uint)I32(); long hi = (uint)I32(); long lo = (uint)I32(); return (hi << 32) | lo; }
  string Name() { int n = I32(); string s = Encoding.ASCII.GetString(d, p, n); p += (n + 3) & ~3; return s; }
  static int Size(int t) { return t == 1 || t == 2 ? 1 : t == 3 ? 2 : t == 6 ? 8 : 4; }
  void SkipAtts() { int tag = I32(); int n = I32(); for (int i = 0; i < n; i++) { Name(); int t = I32(); int c = I32(); p += (c * Size(t) + 3) & ~3; } }
  public NcFile(byte[] data) {
    d = data; if (d[0] != 'C' || d[1] != 'D' || d[2] != 'F') throw new Exception("not a classic NetCDF file");
    v2 = d[3] == 2; p = 4; NumRecs = I32();
    I32(); int nd = I32(); for (int i = 0; i < nd; i++) { DimNames.Add(Name()); DimLens.Add(I32()); }
    SkipAtts();
    I32(); int nv = I32();
    for (int i = 0; i < nv; i++) {
      var v = new NcVar(); v.Name = Name(); int k = I32(); v.Dims = new int[k];
      for (int j = 0; j < k; j++) v.Dims[j] = I32();
      SkipAtts(); v.Type = I32(); v.VSize = (uint)I32(); v.Begin = Off();
      v.IsRecord = k > 0 && DimLens[v.Dims[0]] == 0; if (v.IsRecord) RecSize += v.VSize; Vars.Add(v);
    }
  }
  public NcVar Var(string name) { foreach (var v in Vars) if (v.Name == name) return v; return null; }
  double At(NcVar v, long pos) {
    if (v.Type == 5) { var b = new byte[] { d[pos+3], d[pos+2], d[pos+1], d[pos] }; return BitConverter.ToSingle(b, 0); }
    if (v.Type == 6) { var b = new byte[8]; for (int i = 0; i < 8; i++) b[i] = d[pos + 7 - i]; return BitConverter.ToDouble(b, 0); }
    if (v.Type == 4) return (d[pos] << 24) | (d[pos+1] << 16) | (d[pos+2] << 8) | d[pos+3];
    if (v.Type == 3) return (short)((d[pos] << 8) | d[pos+1]);
    return d[pos];
  }
  int Len(int dim) { return DimLens[dim] == 0 ? NumRecs : DimLens[dim]; }
  // All values of a 1-D variable.
  public double[] Read1D(string name) {
    var v = Var(name); int n = Len(v.Dims[0]); var o = new double[n];
    for (int i = 0; i < n; i++) o[i] = At(v, v.IsRecord ? v.Begin + i * RecSize : v.Begin + (long)i * Size(v.Type));
    return o;
  }
  // One grid cell of a (time, lat, lon) variable, for every time step.
  public double[] ReadCell(string name, int iLat, int iLon) {
    var v = Var(name); int nt = Len(v.Dims[0]); int nLon = Len(v.Dims[2]); int nLat = Len(v.Dims[1]); int sz = Size(v.Type);
    var o = new double[nt]; long cell = ((long)iLat * nLon + iLon) * sz;
    for (int t = 0; t < nt; t++) o[t] = At(v, (v.IsRecord ? v.Begin + t * RecSize : v.Begin + (long)t * nLat * nLon * sz) + cell);
    return o;
  }
  public string Describe() {
    var sb = new StringBuilder(); sb.AppendLine("records: " + NumRecs);
    for (int i = 0; i < DimNames.Count; i++) sb.AppendLine("dim " + DimNames[i] + " = " + DimLens[i]);
    foreach (var v in Vars) { var names = new List<string>(); foreach (int k in v.Dims) names.Add(DimNames[k]); sb.AppendLine("var " + v.Name + "(" + string.Join(",", names.ToArray()) + ") type " + v.Type + (v.IsRecord ? " record" : "")); }
    return sb.ToString();
  }
}
'@

$base = 'https://www-mars.lmd.jussieu.fr/mars/dust_climatology/dataset_v2'
$files = [ordered]@{ '24'='v2-0'; '25'='v2-0'; '26'='v2-0'; '27'='v2-0'; '28'='v2-0'; '29'='v2-0'; '30'='v2-0'; '31'='v2-0'; '32'='v2-0'; '33'='v2-1'; '34'='v2-5'; '35'='v2-5'; '36'='v2-5' }
$tmp = Join-Path $env:TEMP 'marswalk_dust.nc'
$wc = New-Object Net.WebClient

function Nearest($arr, $x) { $best = 0; for ($i = 1; $i -lt $arr.Length; $i++) { if ([Math]::Abs($arr[$i] - $x) -lt [Math]::Abs($arr[$best] - $x)) { $best = $i } }; return $best }

$years = @()
foreach ($my in $files.Keys) {
  $name = "dustscenario_MY${my}_$($files[$my]).nc"
  Write-Host "MY$my  downloading $name ..."
  $wc.DownloadFile("$base/$name", $tmp)
  $nc = New-Object NcFile (,[IO.File]::ReadAllBytes($tmp))
  if ($InspectOnly) { Write-Host $nc.Describe(); Remove-Item $tmp -Confirm:$false; return }
  $lats = $nc.Read1D('latitude'); $lons = $nc.Read1D('longitude')
  $lonWanted = $LonE; if (($lons | Measure-Object -Minimum).Minimum -lt 0 -and $LonE -gt 180) { $lonWanted = $LonE - 360 }
  $iLat = Nearest $lats $Lat; $iLon = Nearest $lons $lonWanted
  $ls = $nc.Read1D('Ls')
  $c610 = $nc.ReadCell('cdodtot', $iLat, $iLon)
  $years += [ordered]@{ marsYear = [int]$my; version = $files[$my]; gridLat = $lats[$iLat]; gridLon = $lons[$iLon]
    ls = @($ls | ForEach-Object { [Math]::Round($_, 2) }); cdod = @($c610 | ForEach-Object { [Math]::Round($_, 4) }) }
  Write-Host ("      cell {0}N {1}E  {2} sols  mean {3:N3}  max {4:N3}" -f $lats[$iLat], $lons[$iLon], $c610.Length, ($c610 | Measure-Object -Average).Average, ($c610 | Measure-Object -Maximum).Maximum)
  Remove-Item $tmp -Confirm:$false
}

$out = [ordered]@{
  source = 'Montabone et al. dust climatology v2 (dust scenario files), built from MGS TES, Mars Odyssey THEMIS and MRO MCS observations'
  url = 'https://www-mars.lmd.jussieu.fr/mars/dust_climatology/'
  quantity = 'Column dust optical depth, infrared absorption at 9.3 micron, total down to the local surface (variable cdodtot)'
  site = [ordered]@{ lat = $Lat; lonE = $LonE }
  years = $years
}
$dest = Join-Path $PSScriptRoot '..\site\data\dust_climatology.json'
[IO.File]::WriteAllText($dest, ($out | ConvertTo-Json -Depth 6 -Compress), (New-Object Text.UTF8Encoding $false))
Write-Host "Wrote $dest"
