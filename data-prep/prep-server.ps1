# Local server for the data-prep pages (export-geology.html).
# Serves this folder, and lets a page save a result into ..\site\data by sending
#   PUT /out/<name>.geojson
# Only .geojson and .json names are accepted. Use it for data prep only, not to show the site.
# Run:  powershell -ExecutionPolicy Bypass -File data-prep\prep-server.ps1
param([int]$Port = $(if ($env:PORT) { [int]$env:PORT } else { 8770 }))

$root = $PSScriptRoot
$outDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\site\data'))
$types = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript'; '.json'='application/json'; '.zip'='application/zip'; '.wasm'='application/wasm' }

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Prep server at http://localhost:$Port  (Ctrl+C to stop)"

while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
        $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
        if ($ctx.Request.HttpMethod -eq 'PUT' -and $rel -match '^out/([A-Za-z0-9_\-]+\.(geojson|json))$') {
            $dest = Join-Path $outDir $Matches[1]
            $fs = [IO.File]::Create($dest); $ctx.Request.InputStream.CopyTo($fs); $fs.Close()
            Write-Host "saved $dest"
            $ctx.Response.StatusCode = 201
        } elseif ($ctx.Request.HttpMethod -eq 'GET') {
            if ($rel -eq '') { $rel = 'export-geology.html' }
            $path = [IO.Path]::GetFullPath((Join-Path $root $rel))
            if ($path.StartsWith($root) -and (Test-Path $path -PathType Leaf)) {
                $ext = [IO.Path]::GetExtension($path).ToLower()
                $ctx.Response.ContentType = if ($types[$ext]) { $types[$ext] } else { 'application/octet-stream' }
                $fs = [IO.File]::OpenRead($path); $ctx.Response.ContentLength64 = $fs.Length; $fs.CopyTo($ctx.Response.OutputStream); $fs.Close()
            } else { $ctx.Response.StatusCode = 404 }
        } else { $ctx.Response.StatusCode = 405 }
    } catch { $ctx.Response.StatusCode = 500 } finally { $ctx.Response.Close() }
}
