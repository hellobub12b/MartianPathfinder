# Martian Pathfinder

**Live site:** https://hellobub12b.github.io/MartianPathfinder/

> In this repository the website sits at the top level (`index.html`, `css/`, `js/`, `data/`) so GitHub Pages can serve it. Where the notes below say `site/`, read it as the top level, and run the local server with `serve.ps1` or `python -m http.server 8765`.

A layered map and EVA planner for Jezero Crater on Mars, built for the NASA Space Apps challenge. It stacks data from several NASA missions over one site, finds a safe walking route between science stops, and checks the plan against daylight, terrain, weather and what a spacesuit can carry.

## What it does

- **Layered map.** Orbital imagery, slope hazards, mapped sand, rock units, mineral maps, thermal inertia, surface dust, air pressure, an animated wind layer, and Perseverance's track.
- **Science stops.** Every place Perseverance sealed a sample (from NASA's sample list), plus the Three Forks sample depot, with the samples taken at each.
- **Route finding.** The fastest walking route on real terrain that never crosses ground steeper than 15°, prefers smooth ground, and steers around mapped sand.
- **Go / no-go.** Checks for EVA length, daylight, walk-back time, terrain, sand, suit consumables, dust and temperature, with the reason for each caution or no-go and what to do about it.
- **Preset missions.** Three ready-made walks.
- **Conditions.** Perseverance weather matched to the current Mars season, a 13-Mars-year dust record, hourly wind, atmosphere and radiation.
- **3D view.** The terrain with NASA imagery draped on it, the route, a sun-time slider and a fly-through.

## Run it

The site is plain HTML, CSS and JavaScript. It needs a web server and an internet connection (map imagery and the rover track load live from NASA).

Windows, nothing installed:

```
powershell -ExecutionPolicy Bypass -File serve.ps1
```

With Python: `python -m http.server 8765 --directory site`

Then open http://localhost:8765.

## Files

| File | What it does |
| --- | --- |
| `site/index.html` | The page: top bar, tabbed side panel, map, 3D view. |
| `site/css/style.css` | Look and layout. |
| `site/js/config.js` | Map layers, missions, limits and every assumption. Most edits happen here. |
| `site/js/places.js` | Sample sites and place names. Generated: do not edit by hand. |
| `site/js/app.js` | Map, panels, route plan, safety checks. |
| `site/js/terrain.js` | Loads the terrain models, computes slope and roughness, finds routes. |
| `site/js/marstime.js` | Mars clock, season, sunrise, sunset and sun position (Mars24 equations). |
| `site/js/wind.js` | The animated wind layer. |
| `site/js/view3d.js` | The 3D view (three.js). |
| `site/data/` | Prepared data files (see below). |
| `data-prep/` | Scripts that rebuild each data file from its source. |
| `serve.ps1` | Small local web server for Windows. |
| `SOURCES.md` | Every dataset, paper and tool, with links, and what is assumed. |

## Data files and how to rebuild them

| File in `site/data/` | Source | Rebuild with |
| --- | --- | --- |
| `jezero_ctx_dtm_20m.tif` | MRO CTX terrain model, 20 m (USGS) | Download from the link in `SOURCES.md` |
| `hirise_5m.bin`, `.json` | MRO HiRISE terrain model, sampled to 5 m over the main walking area (USGS) | `data-prep/get-hirise.ps1` |
| `weather_meda.json` | Perseverance MEDA temperature and pressure, sols 1356–1385 (NASA PDS) | `data-prep/get-weather.ps1 -LastSol 1385 -Sols 30` |
| `wind_meda.json` | Perseverance MEDA wind, sols 36–65 (NASA PDS) | `data-prep/get-wind.ps1` |
| `dust_climatology.json` | Dust optical depth over Jezero, Mars Years 24–36 (Montabone et al.) | `data-prep/get-dust.ps1` |
| `themis_ti.bin`, `.json` | Mars Odyssey THEMIS thermal inertia (USGS) | `data-prep/get-thermal-inertia.ps1` |
| `geology.geojson` | USGS geologic map SIM 3464: rock units and mapped sand | `data-prep/export-geology.html` (see below) |
| `crism/` | Nine MRO CRISM mineral images and their corner coordinates (NASA PDS) | Download from the link in `SOURCES.md` |
| `../js/places.js` | NASA sample list, rover waypoints, IAU place names | `data-prep/get-places.ps1` |

Run a script from the project folder, for example `powershell -ExecutionPolicy Bypass -File data-prep\get-wind.ps1`.

**Weather season.** The weather sols were chosen because Mars was then in the same season as in mid-November 2026; NASA's archive does not reach the present. For a much later date, pick sols about 669 (one Mars year) before that date's sol.

**Geologic map.** USGS publishes it only as an ArcGIS geodatabase. To convert it: download `sim3464_database.zip` from https://pubs.usgs.gov/sim/3464/, zip its `Geodatabase/Nili.gdb` folder as `data-prep/work/Nili.gdb.zip`, run `data-prep/prep-server.ps1`, and open http://localhost:8770. The page converts it with GDAL running in the browser.

## How the route is found

1. The 20 m terrain model gives every cell an elevation and a slope. Inside the HiRISE area, each cell's slope is sharpened with 5 m detail and given a roughness value.
2. Cells steeper than 15° are off-limits. Steep, rough and sandy cells cost extra.
3. An A* search finds the cheapest path between stops. Walking time uses NASA's Apollo-based suited walking speed: 0.75 m/s on level ground, 0.01 m/s slower per degree of slope.
4. If a stop itself sits on ground over 15°, the route ends at the nearest allowed ground and says how far short it stops.

## What is measured and what is assumed

Measured or published data: imagery, terrain, slopes, sand and rock units, mineral images, thermal inertia, the rover track, sample sites, weather, wind, the dust record, atmospheric composition, and the suit consumable use rates.

Team assumptions, not NASA figures:

- The safety limits (EVA length, walk-back time, time spare before sunset), the 15° slope rule, the dust and temperature thresholds, and the reserve levels for consumables.
- The habitat's location (Perseverance's landing spot).
- Minutes of work per stop, and the preset missions' names and goals.

Known limits:

- Walking speeds and consumable rates come from Moon-gravity tests. NASA found suited walking much harder at Mars gravity.
- Weather, wind and dust are past measurements matched to the season, not live readings.
- Radiation was measured at Gale Crater, not Jezero.
- The wind animation spreads one measured value over the whole map.
- Routes cannot see hazards smaller than the terrain grid, such as single boulders.
- Several numbers still need checking against their original papers. `SOURCES.md` lists each one.

## Notes

- Coordinates are planetocentric latitude and east-positive longitude (IAU Mars 2000 sphere, radius 3,396.19 km).
- Mars Trek tiles are equirectangular, so the map uses Leaflet's `EPSG4326` grid.
- This project was built with help from AI assistants (Anthropic's Claude; Google Gemini for the EVA safety limits).
