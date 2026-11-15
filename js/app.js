// Marswalk Planner: map, route and go/no-go dashboard.
// Settings live in config.js. Mars clock maths live in marstime.js.
// Slope and route finding live in terrain.js.

const $ = id => document.getElementById(id);
const getCss = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const LIMIT_KEYS = ["evaIdealH", "evaLimitH", "walkBackIdealH", "walkBackLimitH", "sunsetMarginIdealH", "sunsetMarginMinH"];

const state = {
  order: STOPS.filter(s => s.on).map(s => s.id), // stop ids in visiting order
  custom: [],                                    // waypoints the user clicked onto the map
  nextWaypoint: 1,
  adding: false,                                 // true while map clicks add waypoints
  mode: "simple",                                // time settings: "simple" or "enhanced"
  startLTST: ASSUME.startLTST,
  minutesPerStop: ASSUME.minutesPerStop,
  paceKmh: ASSUME.paceKmh,                       // enhanced only
  stopMinutes: {},                               // enhanced only: minutes per stop id
  limits: Object.fromEntries(LIMIT_KEYS.map(k => [k, ASSUME[k]])), // enhanced only
  dustScenario: "typical",
  tau: SAMPLE_WEATHER.tau,                       // custom dust value
  dust: null,
  wind: null,
  windHour: Math.floor(ASSUME.startLTST),
  mission: null,                                 // id of the preset mission in use, if any
  weather: { ...SAMPLE_WEATHER, real: false },
};

// Simple mode always uses NASA's base pace and the default limits.
const enhanced = () => state.mode === "enhanced";
const pace = () => enhanced() ? state.paceKmh : ASSUME.paceKmh;
const limits = () => enhanced() ? state.limits : ASSUME;
const stopById = id => STOPS.find(s => s.id === id) || state.custom.find(s => s.id === id);
const defaultMinutes = stop => stop.custom ? 0 : state.minutesPerStop;
const minutesFor = stop => enhanced() && state.stopMinutes[stop.id] != null ? state.stopMinutes[stop.id] : defaultMinutes(stop);

// ---------- Map ----------

// Mars Trek tiles are plain latitude/longitude (equirectangular),
// which is what Leaflet's EPSG4326 grid expects: 2 tiles wide at zoom 0.
const map = L.map("map", {
  crs: L.CRS.EPSG4326, center: SITE.center, zoom: SITE.zoom,
  minZoom: 4, maxZoom: 18, zoomSnap: 0.5, attributionControl: true,
});
map.attributionControl.setPrefix(false).addAttribution("NASA Mars Trek · USGS · NASA/JPL-Caltech");

const BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
const mapLayers = {};
for (const def of LAYERS) {
  const layer = def.vector || def.crism ? L.layerGroup()
    : def.derived ? L.imageOverlay(BLANK, JEZERO_CTX_BOUNDS, { opacity: def.opacity, interactive: false })
    : L.tileLayer(def.url, {
        maxNativeZoom: def.maxNativeZoom, maxZoom: 18, noWrap: true,
        bounds: def.bounds, opacity: def.opacity ?? 1,
      });
  // A group of images has no opacity of its own: pass the slider on to each image.
  if (def.crism) layer.setOpacity = o => layer.eachLayer(l => l.setOpacity(o));
  mapLayers[def.id] = layer;
  if (def.kind === "base" || def.on) layer.addTo(map);
}

// Scale bar in Mars metres: Leaflet assumes Earth's radius, so correct it.
const scale = L.control.scale({ imperial: false, maxWidth: 140 }).addTo(map);
const baseUpdate = scale._updateMetric.bind(scale);
scale._updateMetric = m => baseUpdate(m * SITE.marsRadiusM / 6378137);
scale._update();

// Cursor read-out: position, plus elevation once the terrain model is in.
const coords = L.control({ position: "bottomright" });
coords.onAdd = () => { const d = L.DomUtil.create("div", "coords"); d.textContent = "Move over the map"; return d; };
coords.addTo(map);
map.on("mousemove", e => {
  const z = Terrain.isReady() ? Terrain.elevationAt(e.latlng.lat, e.latlng.lng) : NaN;
  coords.getContainer().textContent =
    `${e.latlng.lat.toFixed(4)}°N  ${e.latlng.lng.toFixed(4)}°E` + (z === z ? `  ${z.toFixed(0)} m` : "")
    + (thermalAt(e.latlng.lat, e.latlng.lng) ? `  TI ${thermalAt(e.latlng.lat, e.latlng.lng)}` : "")
    + (z === z && pressureRef ? `  ${pressureAt(z).toFixed(0)} Pa` : "");
});

// ---------- Layer panel ----------

function buildLayerPanel() {
  const box = $("layer-list");
  let group = "";
  for (const def of LAYERS) {
    if (def.group !== group) {
      group = def.group;
      box.insertAdjacentHTML("beforeend", group === "Base"
        ? `<div class="group-name">Base map · always on</div>
           <p class="hint">The photo of Mars under everything else. Three NASA image sets are stacked, and sharper ones take over as you zoom in. They cannot be switched off.</p>`
        : `<div class="group-name">${group}</div>`);
    }
    const row = document.createElement("div");
    row.className = "layer";
    if (def.kind === "base") {
      // No checkbox: these are always shown. A plain line each, with when it is used.
      row.className = "layer base";
      row.innerHTML = `<span class="bname">${def.label}</span><span class="src">${def.source}</span><span class="note">${def.when}</span>`;
    } else {
      row.innerHTML = `
        <label><input type="checkbox" id="lyr-${def.id}" ${def.on ? "checked" : ""}>${def.label}</label>
        <span class="src" id="src-${def.id}">${def.source}</span>
        <span class="note">${def.note || ""}</span>` + (def.vector ? "" :
        `<input type="range" id="op-${def.id}" min="0.1" max="1" step="0.05" value="${def.opacity}" aria-label="${def.label} opacity">`);
      row.querySelector("input[type=checkbox]").addEventListener("change", e => {
        e.target.checked ? mapLayers[def.id].addTo(map) : mapLayers[def.id].remove();
        roverLayer.eachLayer(l => l.bringToFront && l.bringToFront());
        routeLine.bringToFront(); // keep the tracks above any map areas just switched on
      });
      const slider = row.querySelector("input[type=range]");
      if (slider) slider.addEventListener("input", e => mapLayers[def.id].setOpacity(+e.target.value));
    }
    box.appendChild(row);
  }
  // The rover track is a vector layer, added once it loads.
  box.insertAdjacentHTML("beforeend", `
    <div class="layer">
      <label><input type="checkbox" id="lyr-rover" checked>Perseverance track</label>
      <span class="src" id="rover-src">Mars 2020 · loading…</span>
    </div>`);
}

// ---------- Data loading ----------

const roverLayer = L.layerGroup().addTo(map);

async function loadRover() {
  try {
    const [trav, wps] = await Promise.all([
      fetch(ROVER.traverseUrl).then(r => r.json()),
      fetch(ROVER.waypointsUrl).then(r => r.json()),
    ]);
    L.geoJSON(trav, { style: { color: getCss("--rover"), weight: 2, opacity: 0.9 }, interactive: false }).addTo(roverLayer);
    const last = wps.features[wps.features.length - 1].properties;
    roverWaypoints = wps.features.map(f => f.properties);
    refreshPressure();
    L.circleMarker([last.lat, last.lon], { radius: 6, color: "#10130f", weight: 2, fillColor: getCss("--rover"), fillOpacity: 1 })
      .bindPopup(`<b>Perseverance</b><br>Latest mapped position.<span class="meta">Sol ${last.sol} · ${last.dist_km} km driven</span>`)
      .addTo(roverLayer);
    $("rover-src").textContent = `Mars 2020 · through sol ${last.sol} · ${last.dist_km} km`;
  } catch (err) {
    $("rover-src").textContent = "Mars 2020 · could not load";
    console.warn("Rover track failed to load:", err);
  }
}

// Newest sol from the archive summary; the public feed is the backup.
async function loadWeather() {
  try {
    const file = await fetch(WEATHER_FILE).then(r => r.json());
    const s = file.sols[file.sols.length - 1];
    state.weather = {
      real: true, source: "archive", sol: s.sol, date: s.date,
      highC: s.maxC, lowC: s.minC, pressurePa: s.pressurePa,
      hourlyC: file.hourlyMeanC, solCount: file.sols.length, firstSol: file.sols[0].sol,
      meanPressurePa: file.sols.reduce((a, x) => a + x.pressurePa, 0) / file.sols.length,
    };
    buildWeather();
    update();
    return;
  } catch (err) {
    console.warn("Weather file failed to load, trying NASA's feed:", err);
  }
  try {
    const feed = await fetch(WEATHER_FEED).then(r => r.json());
    const good = feed.sols.filter(s => typeof s.max_temp === "number" && typeof s.min_temp === "number");
    const s = good[good.length - 1];
    if (!s) throw new Error("no sol with temperatures");
    state.weather = {
      real: true, sol: s.sol, date: s.terrestrial_date, season: s.season,
      highC: s.max_temp, lowC: s.min_temp,
      pressurePa: typeof s.pressure === "number" ? s.pressure : null,
    };
  } catch (err) {
    console.warn("Weather feed failed to load:", err);
  }
  buildWeather();
  update();
}

async function loadTerrain() {
  try {
    await Terrain.load(TERRAIN.url);
    mapLayers.slope.setBounds(Terrain.bounds());
    mapLayers.slope.setUrl(Terrain.slopeImage());
    // Use the terrain model's heights everywhere so the numbers agree.
    for (const p of [HABITAT, ...STOPS, ...state.custom]) {
      const z = Terrain.elevationAt(p.lat, p.lon);
      if (z === z) p.elev = z;
    }
  } catch (err) {
    console.warn("Terrain model failed to load:", err);
  }
  update();
  refreshPressure();
  loadFineTerrain();
}

// HiRISE detail for the main walking area: sharper slopes, and a roughness measure.
async function loadFineTerrain() {
  if (!Terrain.isReady()) return;
  try {
    const fine = await Terrain.loadFine(FINE_TERRAIN.meta, FINE_TERRAIN.data);
    mapLayers.slope.setUrl(Terrain.slopeImage());
    L.rectangle(fine.bounds, { color: "#ffffff", weight: 1, opacity: 0.6, dashArray: "4 4", fill: false, interactive: false }).addTo(map); // the area with HiRISE detail
    legCache.clear();
    update();
  } catch (err) {
    console.warn("HiRISE detail not loaded (routes use the 20 m model only):", err);
  }
}

// Dust by season. For each 5-degree step of Ls: the middle, lowest and highest
// value across the Mars years on record, converted to visible optical depth.
async function loadDust() {
  try {
    const file = await fetch(DUST.file).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
    const nBins = 360 / DUST.binDeg;
    const bins = Array.from({ length: nBins }, (_, i) => ({ ls: (i + 0.5) * DUST.binDeg, perYear: [] }));
    let peak = { tau: 0 };
    for (const y of file.years) {
      const sum = new Float64Array(nBins), cnt = new Float64Array(nBins);
      y.ls.forEach((ls, i) => {
        const tau = y.cdod[i] * DUST.irToVisible;
        if (!(tau >= 0)) return;
        const b = Math.min(nBins - 1, Math.floor(((ls % 360) + 360) % 360 / DUST.binDeg));
        sum[b] += tau; cnt[b]++;
        if (tau > peak.tau) peak = { tau, marsYear: y.marsYear, ls };
      });
      for (let b = 0; b < nBins; b++) if (cnt[b]) bins[b].perYear.push({ tau: sum[b] / cnt[b], marsYear: y.marsYear });
    }
    for (const b of bins) {
      const sorted = b.perYear.map(p => p.tau).sort((x, y) => x - y);
      const worst = b.perYear.reduce((a, p) => p.tau > a.tau ? p : a, { tau: -1 });
      b.median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
      b.min = sorted[0]; b.max = worst.tau; b.maxYear = worst.marsYear;
    }
    state.dust = { bins, peak, years: file.years.map(y => y.marsYear) };
  } catch (err) {
    console.warn("Dust record failed to load:", err);
    state.dustScenario = "custom";
    $("dust-scenario").value = "custom";
  }
  update();
}

// Mapped sand from the USGS geologic map, once it has been exported to GeoJSON.
async function loadSand() {
  try {
    const gj = await fetch(SAND.file).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
    const sand = gj.features.filter(f => Object.values(f.properties || {}).some(v => typeof v === "string" && SAND.match.test(v)));
    L.geoJSON({ type: "FeatureCollection", features: sand }, {
      style: { color: "#ffffff", weight: 1, dashArray: "3 3", fillColor: "#b98f4e", fillOpacity: 0.55 },
    }).bindPopup("<b>Eolian bedform unit</b><br>Wind-blown sand mapped by USGS (SIM 3464).").addTo(mapLayers.sand);
    $("src-sand").textContent += ` · ${sand.length} mapped areas`;
    Terrain.setSand(sand);     // routes now steer around these areas
    legCache.clear();
    update();

    // The same file holds every rock unit of the map: one colour per unit.
    const names = [...new Set(gj.features.map(f => f.properties.name.replace("riim", "rim")))].sort();
    const colour = name => GEOLOGY_COLOURS[names.indexOf(name.replace("riim", "rim")) % GEOLOGY_COLOURS.length];
    L.geoJSON(gj, {
      style: f => ({ color: "#14110f", weight: 0.5, fillColor: colour(f.properties.name), fillOpacity: 0.5 }),
      onEachFeature: (f, layer) => layer.bindPopup(`<b>${f.properties.name.replace("riim", "rim")}</b><span class="meta">Map symbol ${f.properties.symbol} · USGS SIM 3464</span>`),
    }).addTo(mapLayers.geology);
    $("src-geology").textContent += ` · ${names.length} units`;
  } catch (err) {
    for (const id of ["sand", "geology"]) {
      $("src-" + id).textContent = "Map data missing: see README";
      $("lyr-" + id).disabled = true;
    }
  }
}

// CRISM mineral images. Each observation is a north-up picture with known corners.
// Its empty border is black, so black pixels are made see-through first.
async function loadCrism() {
  try {
    const obs = await fetch(CRISM_INDEX).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
    for (const def of LAYERS.filter(l => l.crism)) {
      for (const o of obs) {
        const img = new Image();
        img.src = `data/crism/${o.obs}_${def.crism}.png`;
        await img.decode();
        const cv = document.createElement("canvas");
        cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        const ctx = cv.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const px = ctx.getImageData(0, 0, cv.width, cv.height), d = px.data;
        // The files come out very dark, because a few bad pixels set their brightness
        // range. Stretch each colour channel between two percentiles, then pull the
        // colours part-way toward grey so the layer is easier on the eye.
        for (let ch = 0; ch < 3; ch++) {
          const hist = new Uint32Array(256);
          let n = 0;
          for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { hist[d[i + ch]]++; n++; }
          const cut = n * CRISM_LOOK.stretchPercent / 100;
          let lo = 0, hi = 255, sum = 0;
          for (let v = 0; v < 256; v++) { sum += hist[v]; if (sum >= cut) { lo = v; break; } }
          sum = 0;
          for (let v = 255; v >= 0; v--) { sum += hist[v]; if (sum >= cut) { hi = v; break; } }
          const span = Math.max(1, hi - lo);
          for (let i = 0; i < d.length; i += 4) if (d[i + 3]) d[i + ch] = Math.max(0, Math.min(255, (d[i + ch] - lo) * 255 / span));
        }
        for (let i = 0; i < d.length; i += 4) {
          const grey = (d[i] + d[i + 1] + d[i + 2]) / 3, k = CRISM_LOOK.keepColour;
          d[i] = grey + (d[i] - grey) * k; d[i + 1] = grey + (d[i + 1] - grey) * k; d[i + 2] = grey + (d[i + 2] - grey) * k;
        }
        ctx.putImageData(px, 0, 0);
        // Blur slightly: single noisy pixels merge into smooth patches.
        const soft = document.createElement("canvas");
        soft.width = cv.width; soft.height = cv.height;
        const sctx = soft.getContext("2d");
        sctx.filter = `blur(${CRISM_LOOK.blurPx}px)`;
        sctx.drawImage(cv, 0, 0);
        // In the tile pane with the "crism" class, the image tints the photo beneath it
        // (see style.css) so the terrain stays visible through the colours.
        L.imageOverlay(soft.toDataURL("image/png"), o.bounds, { opacity: def.opacity, interactive: false, pane: "tilePane", className: "crism" }).addTo(mapLayers[def.id]);

      }
      $("src-" + def.id).textContent += ` · ${obs.length} observations (${obs.map(o => o.date.slice(0, 4)).join(", ")})`;
    }
  } catch (err) {
    console.warn("CRISM mineral images failed to load:", err);
    for (const def of LAYERS.filter(l => l.crism)) { $("src-" + def.id).textContent = "Images missing"; $("lyr-" + def.id).disabled = true; }
  }
}

// Thermal inertia: how slowly the ground changes temperature. Loose dust and sand
// heat and cool fast (low values); solid rock holds its heat (high values).
let thermal = null;
function thermalAt(lat, lon) {
  if (!thermal) return 0;
  const [[s, w], [n, e]] = thermal.bounds;
  const x = Math.floor((lon - w) / (e - w) * thermal.width), y = Math.floor((n - lat) / (n - s) * thermal.height);
  return x >= 0 && y >= 0 && x < thermal.width && y < thermal.height ? thermal.values[y * thermal.width + x] : 0;
}
const thermalClass = v => THERMAL.classes.find(c => v < c.below).name;

async function loadThermal() {
  try {
    const meta = await fetch(THERMAL.meta).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
    const buf = await fetch(THERMAL.data).then(r => r.arrayBuffer());
    thermal = { ...meta, values: new Uint16Array(buf) };
    // Colour each pixel between the 2nd and 98th percentile values, along THERMAL.ramp.
    const cv = document.createElement("canvas");
    cv.width = meta.width; cv.height = meta.height;
    const ctx = cv.getContext("2d"), im = ctx.createImageData(meta.width, meta.height);
    const ramp = THERMAL.ramp, lo = meta.p02, hi = meta.p98;
    thermal.values.forEach((v, i) => {
      if (!v) return;
      const t = Math.max(0, Math.min(0.9999, (v - lo) / (hi - lo))) * (ramp.length - 1), k = Math.floor(t), f = t - k;
      for (let ch = 0; ch < 3; ch++) im.data[i * 4 + ch] = ramp[k][ch] + (ramp[k + 1][ch] - ramp[k][ch]) * f;
      im.data[i * 4 + 3] = 255;
    });
    ctx.putImageData(im, 0, 0);
    mapLayers.thermal.setBounds(meta.bounds);
    mapLayers.thermal.setUrl(cv.toDataURL("image/png"));
    const css = `linear-gradient(to right, ${ramp.map(c => `rgb(${c.join(",")})`).join(", ")})`;
    $("src-thermal").insertAdjacentHTML("afterend", `<span class="legend"><span>${lo}</span><span class="bar" style="background:${css}"></span><span>${hi}</span></span>`);
  } catch (err) {
    console.warn("Thermal inertia failed to load:", err);
    $("src-thermal").textContent = "Data missing"; $("lyr-thermal").disabled = true;
  }
}

// ---------- Places, stops and waypoints ----------

const stopMarkers = {};
const routeLine = L.polyline([], { color: getCss("--accent"), weight: 3 }).addTo(map);
const earthDate = iso => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const where = p => `${p.lat.toFixed(4)}°N ${p.lon.toFixed(4)}°E`;

function pinIcon(text, cls) {
  return L.divIcon({ className: "", html: `<div class="pin ${cls}">${text}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] });
}

// What a popup says about a sample site or the depot.
function stopPopup(s) {
  const inRoute = state.order.includes(s.id);
  const rows = s.samples.map(x => s.isDepot
    ? `<tr><td>${x.no}</td><td>${x.name}</td><td>${x.type === "Rock core" ? x.rock : x.type}</td><td>from ${x.feature}</td></tr>`
    : `<tr><td>${x.no}</td><td>${x.name}</td><td>${x.type}${x.rock !== "n/a" ? ", " + x.rock.toLowerCase() : ""}</td><td>sol ${x.sol}, ${earthDate(x.date)}</td><td>${x.now === "Sample Depot" ? "in the depot" : "on the rover"}</td></tr>`).join("");
  return `<b>${s.name}</b><span class="tagline">${s.region}</span>
    ${s.note ? `<p>${s.note}</p>` : ""}
    <p class="k">${s.isDepot ? "Tubes left here (NASA sample number, name, contents)" : "Samples NASA collected here"}</p>
    <table class="samples">${rows}</table>
    ${s.isDepot ? `<p>Plus one witness tube, making 10 tubes on the ground.</p>` : ""}
    ${thermalAt(s.lat, s.lon) ? `<p>Thermal inertia here: <b>${thermalAt(s.lat, s.lon)}</b> (${thermalClass(thermalAt(s.lat, s.lon))}).${Terrain.onSand(s.lat, s.lon) ? " On mapped sand." : ""}</p>` : ""}
    <span class="meta">${where(s)} · rover position on sol ${s.positionSol}</span>
    <button type="button" class="btn small" data-route="${s.id}">${inRoute ? "Remove from route" : "Add to route"}</button>`;
}

function buildStops() {
  L.marker([HABITAT.lat, HABITAT.lon], { icon: pinIcon("H", "hab"), zIndexOffset: 500 })
    .bindPopup(`<b>${HABITAT.name}</b><p>${HABITAT.why}</p><span class="meta">${where(HABITAT)}</span>`)
    .addTo(map);

  const seen = {};
  for (const s of STOPS) {
    // Two sites can share one rover parking spot: nudge the second pin so both can be clicked.
    const key = s.lat + "," + s.lon;
    seen[key] = (seen[key] || 0) + 1;
    s.nudge = (seen[key] - 1) * 16;
    stopMarkers[s.id] = L.marker([s.lat, s.lon], { icon: pinIcon("", ""), zIndexOffset: 200 })
      .bindPopup(() => stopPopup(s), { maxWidth: 380 })
      .bindTooltip(s.name, { direction: "top", offset: [s.nudge, -10] })
      .addTo(mapLayers.sites);
  }

  for (const p of LANDMARKS) {
    const from = { IAU: "official IAU name and coordinates (USGS Gazetteer)", Rover: "Perseverance's recorded position", Figure: "read from the published figure the team supplied; informal name" }[p.source];
    L.marker([p.lat, p.lon], { icon: L.divIcon({ className: "", html: `<div class="place"></div>`, iconSize: [20, 28], iconAnchor: [10, 27] }) })
      .bindPopup(`<b>${p.name}</b><span class="tagline">${p.kind}</span><p>${p.detail}</p><span class="meta">${where(p)} · ${from}</span>`, { offset: [0, -20] })
      .bindTooltip(p.name, { permanent: true, direction: p.id === "seitah" ? "left" : "right", offset: [p.id === "seitah" ? -8 : 8, -16], className: "place-label" }) // Séítah sits beside the landing site: label it on the other side
      .addTo(mapLayers.landmarks);
  }
}

// "Add to route" buttons inside popups.
map.on("popupopen", e => {
  const b = e.popup.getElement().querySelector("[data-route]");
  if (!b) return;
  b.addEventListener("click", () => {
    const id = b.dataset.route;
    if (state.order.includes(id)) state.order = state.order.filter(x => x !== id); else state.order.push(id);
    map.closePopup();
    update();
  });
});

function addWaypoint(latlng) {
  const z = Terrain.isReady() ? Terrain.elevationAt(latlng.lat, latlng.lng) : NaN;
  const wp = {
    id: "wp" + state.nextWaypoint, name: "Waypoint " + state.nextWaypoint, custom: true,
    lat: latlng.lat, lon: latlng.lng, elev: z === z ? z : HABITAT.elev,
  };
  state.nextWaypoint++;
  state.custom.push(wp);
  state.order.push(wp.id);
  const marker = L.marker([wp.lat, wp.lon], { icon: pinIcon("", "wp"), draggable: true, zIndexOffset: 300 }).addTo(map);
  marker.bindTooltip(wp.name);
  marker.on("dragend", () => {
    const p = marker.getLatLng(), h = Terrain.isReady() ? Terrain.elevationAt(p.lat, p.lng) : NaN;
    wp.lat = p.lat; wp.lon = p.lng; if (h === h) wp.elev = h;
    update();
  });
  stopMarkers[wp.id] = marker;
  update();
}

function removeFromRoute(id) {
  state.order = state.order.filter(x => x !== id);
  const wp = state.custom.find(s => s.id === id);
  if (wp) {
    state.custom = state.custom.filter(s => s.id !== id);
    stopMarkers[id].remove();
    delete stopMarkers[id];
    delete state.stopMinutes[id];
  }
  update();
}

function moveInRoute(id, step) {
  const i = state.order.indexOf(id), j = i + step;
  if (i < 0 || j < 0 || j >= state.order.length) return;
  [state.order[i], state.order[j]] = [state.order[j], state.order[i]];
  update();
}

function setAdding(on) {
  state.adding = on;
  $("add-wp").setAttribute("aria-pressed", on);
  $("add-wp").textContent = on ? "Done adding waypoints" : "Add waypoints on the map";
  $("add-wp-hint").hidden = !on;
  map.getContainer().classList.toggle("adding", on);
}

map.on("click", e => { if (state.adding) addWaypoint(e.latlng); });

function renderStopLists() {
  $("route-order").innerHTML = state.order.length ? state.order.map((id, i) => {
    const s = stopById(id);
    return `<li>
      <span class="n">${i + 1}</span><span class="nm">${s.name}</span>
      <button data-act="up" data-id="${id}" aria-label="Move ${s.name} earlier" ${i === 0 ? "disabled" : ""}>↑</button>
      <button data-act="down" data-id="${id}" aria-label="Move ${s.name} later" ${i === state.order.length - 1 ? "disabled" : ""}>↓</button>
      <button data-act="remove" data-id="${id}" aria-label="Remove ${s.name}">×</button>
    </li>`;
  }).join("") : `<li class="empty">No stops yet. Tick a science stop or add a waypoint.</li>`;

  let region = "";
  $("stop-list").innerHTML = STOPS.map(s => {
    const head = s.region !== region ? `<div class="group-name">${region = s.region}</div>` : "";
    const what = s.isDepot ? `${s.samples.length} sample tubes and 1 witness tube`
      : s.samples.map(x => x.name).join(", ") + " · " + [...new Set(s.samples.map(x => x.type === "Rock core" ? x.rock.toLowerCase() : x.type.toLowerCase()))].join(", ");
    return `${head}<div class="stop">
      <label><input type="checkbox" data-stop="${s.id}" ${state.order.includes(s.id) ? "checked" : ""}>${s.name}</label>
      <span class="why">${what}</span>
    </div>`;
  }).join("");
}

// ---------- Route ----------

// Great-circle distance on Mars, in metres.
function distanceM(a, b) {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * SITE.marsRadiusM * Math.asin(Math.sqrt(h));
}

// One leg, found on the terrain model. Results are remembered by position, because
// the path does not depend on the time settings (the pace only scales the time).
const legCache = new Map();
function findLeg(from, to) {
  const key = `${from.lat.toFixed(5)},${from.lon.toFixed(5)}>${to.lat.toFixed(5)},${to.lon.toFixed(5)}`;
  if (!legCache.has(key)) legCache.set(key, Terrain.route(from, to));
  return legCache.get(key);
}

// Used when there is no terrain model, or no safe path: a straight line.
function straightLeg(from, to) {
  const lengthM = distanceM(from, to) * ASSUME.routeWiggle, rise = to.elev - from.elev;
  return {
    straight: true, lengthM, maxSlopeDeg: NaN,
    ascentM: Math.max(rise, 0), descentM: Math.max(-rise, 0),
    hoursAtBasePace: lengthM / 1000 / Terrain.walkKmh(lengthM ? rise / lengthM : 0),
    latlngs: [[from.lat, from.lon], [to.lat, to.lon]],
    profile: [[0, from.elev], [lengthM, to.elev]],
  };
}

// The chosen pace as a multiple of NASA's base level speed (0.75 m/s = 2.7 km/h).
const paceFactor = () => pace() / (SUIT.levelSpeedMs * 3.6);

function planRoute(order = state.order) {
  const stops = order.map(stopById);
  const points = [HABITAT, ...stops, HABITAT];
  const useTerrain = Terrain.isReady();
  const legs = [];
  let clock = state.startLTST;

  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1], to = points[i];
    const path = (useTerrain && findLeg(from, to)) || straightLeg(from, to);
    const walkH = path.hoursAtBasePace / paceFactor();
    const workH = to === HABITAT ? 0 : minutesFor(to) / 60;
    clock += walkH + workH;
    legs.push({ from, to, path, walkH, workH, arriveLTST: clock - workH });
  }

  // Walk-back: the longest walk straight home from any stop.
  let walkBackH = 0, walkBackM = 0, walkBackFrom = null;
  for (const s of stops) {
    const home = (useTerrain && findLeg(s, HABITAT)) || straightLeg(s, HABITAT);
    const h = home.hoursAtBasePace / paceFactor();
    if (h > walkBackH) { walkBackH = h; walkBackM = home.lengthM; walkBackFrom = s; }
  }

  return {
    stops, legs, backLTST: clock, walkBackH, walkBackM, walkBackFrom,
    totalDist: legs.reduce((s, l) => s + l.path.lengthM, 0),
    totalH: clock - state.startLTST,
    maxSlopeDeg: Math.max(0, ...legs.map(l => l.path.maxSlopeDeg || 0)),
    sandM: legs.reduce((s, l) => s + (l.path.sandM || 0), 0),
    anyStraight: legs.some(l => l.path.straight),
    terrain: useTerrain,
  };
}

// ---------- Dust ----------

// The dust value in use, and a sentence saying where it comes from.
function currentDust(ls) {
  const d = state.dust;
  if (!d || state.dustScenario === "custom") {
    return { tau: state.tau, label: "Dust (custom value)", why: "set by hand" };
  }
  const bin = d.bins[Math.min(d.bins.length - 1, Math.floor(ls / DUST.binDeg))];
  const span = `Ls ${bin.ls - DUST.binDeg / 2}–${bin.ls + DUST.binDeg / 2}°`;
  if (state.dustScenario === "worst") {
    return { tau: bin.max, label: "Dust (worst on record for this season)", why: `highest for ${span}, in Mars Year ${bin.maxYear}`, bin };
  }
  if (state.dustScenario === "storm") {
    return { tau: d.peak.tau, label: "Dust (2018 global storm peak)", why: `peak over Jezero in Mars Year ${d.peak.marsYear}, at Ls ${d.peak.ls.toFixed(0)}°`, bin };
  }
  return { tau: bin.median, label: "Dust (typical for this season)", why: `middle value for ${span} across ${d.years.length} Mars years`, bin };
}

function drawDustChart(ls, dust) {
  const svg = $("dustchart"), d = state.dust;
  if (!d) { svg.style.display = "none"; $("dust-note").textContent = "The dust record could not be loaded, so only a custom value is available."; return; }
  svg.style.display = "";
  const W = 320, H = 110, pad = { l: 30, r: 10, t: 10, b: 20 };
  const maxY = Math.ceil(Math.max(...d.bins.map(b => b.max), dust.tau) + 0.2);
  const sx = x => pad.l + x / 360 * (W - pad.l - pad.r);
  const sy = y => H - pad.b - Math.min(y, maxY) / maxY * (H - pad.t - pad.b);
  const top = d.bins.map((b, i) => `${i ? "L" : "M"}${sx(b.ls).toFixed(1)},${sy(b.max).toFixed(1)}`).join(" ");
  const bottom = [...d.bins].reverse().map(b => `L${sx(b.ls).toFixed(1)},${sy(b.min).toFixed(1)}`).join(" ");
  const mid = d.bins.map((b, i) => `${i ? "L" : "M"}${sx(b.ls).toFixed(1)},${sy(b.median).toFixed(1)}`).join(" ");
  const line = (y, colour) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${sy(y)}" y2="${sy(y)}" stroke="${colour}" stroke-width="0.75" stroke-dasharray="3 3"/>`;
  svg.innerHTML = `
    <path d="${top} ${bottom} Z" fill="${getCss("--caution")}" fill-opacity="0.22"/>
    <path d="${mid}" fill="none" stroke="${getCss("--caution")}" stroke-width="1.5"/>
    ${line(ASSUME.tauAmber, getCss("--caution"))}${line(ASSUME.tauRed, getCss("--nogo"))}
    <line x1="${sx(ls)}" x2="${sx(ls)}" y1="${pad.t}" y2="${H - pad.b}" stroke="${getCss("--fg")}" stroke-width="0.75"/>
    <circle cx="${sx(ls)}" cy="${sy(dust.tau)}" r="3.5" fill="${getCss("--fg")}"/>
    <text x="4" y="${sy(maxY) + 3}">${maxY}</text><text x="4" y="${sy(0) + 3}">0</text>
    ${[0, 90, 180, 270, 360].map(x => `<text x="${sx(x)}" y="${H - 6}" text-anchor="${x === 0 ? "start" : x === 360 ? "end" : "middle"}">Ls ${x}°</text>`).join("")}`;
  $("dust-note").textContent = `Dust in the air over Jezero through the Mars year, Mars Years ${d.years[0]}–${d.years[d.years.length - 1]}. Line: typical. Band: lowest to highest on record. Dot: the value in use today (Ls ${ls.toFixed(0)}°). Dashed lines: caution and scrub thresholds.`;
}

// ---------- Go / no-go ----------

function runChecks(plan, sun, dust) {
  const fmtH = h => `${Math.floor(h)} h ${String(Math.round((h % 1) * 60) % 60).padStart(2, "0")} min`;
  const grade = (value, amberAt, redAt) => value >= redAt ? "nogo" : value >= amberAt ? "caution" : "go";
  const lim = limits();
  const checks = [];

  checks.push({
    name: "EVA duration",
    state: grade(plan.totalH, lim.evaIdealH, lim.evaLimitH),
    detail: `${fmtH(plan.totalH)} planned (ideal up to ${lim.evaIdealH} h, maximum ${lim.evaLimitH} h)`,
  });

  const marginH = sun.sunsetLTST - plan.backLTST;
  checks.push({
    name: "Daylight",
    state: marginH < lim.sunsetMarginMinH ? "nogo" : marginH < lim.sunsetMarginIdealH ? "caution" : "go",
    detail: `Back ${MarsTime.hhmm(plan.backLTST)}, sunset ${MarsTime.hhmm(sun.sunsetLTST)}: ${marginH >= 0 ? fmtH(marginH) + " spare" : "after dark"} (ideal ${lim.sunsetMarginIdealH} h, minimum ${lim.sunsetMarginMinH} h)`,
  });

  checks.push({
    name: "Walk-back",
    state: grade(plan.walkBackH, lim.walkBackIdealH, lim.walkBackLimitH),
    detail: plan.walkBackFrom
      ? `Longest walk home is ${(plan.walkBackM / 1000).toFixed(1)} km from ${plan.walkBackFrom.name}: ${fmtH(plan.walkBackH)} (ideal up to ${lim.walkBackIdealH} h, maximum ${lim.walkBackLimitH} h)`
      : "No stops selected",
  });

  if (plan.terrain) {
    checks.push({
      name: "Terrain",
      state: plan.anyStraight ? "nogo" : grade(plan.maxSlopeDeg, ROUTING.cautionSlopeDeg, ROUTING.maxSlopeDeg),
      detail: plan.anyStraight
        ? `No route under ${ROUTING.maxSlopeDeg}° found for at least one leg`
        : `Steepest ground on the route is ${plan.maxSlopeDeg.toFixed(0)}° (caution at ${ROUTING.cautionSlopeDeg}°, limit ${ROUTING.maxSlopeDeg}°)`,
    });
  }

  if (plan.terrain && Terrain.hasSand()) {
    checks.push({
      name: "Sand",
      state: plan.sandM > ROUTING.sandCautionM ? "caution" : "go",
      detail: plan.sandM > 0
        ? `The route crosses ${Math.round(plan.sandM)} m of mapped sand (caution above ${ROUTING.sandCautionM} m)`
        : "The route stays off mapped sand",
    });
  }

  const sup = supplies(plan);
  const lowest = Math.min(sup.oxygenLeft, sup.waterLeft, sup.batteryLeft);
  checks.push({
    name: "Suit consumables",
    state: lowest < SUIT_SUPPLY.minLeftPercent ? "nogo" : lowest < SUIT_SUPPLY.cautionLeftPercent ? "caution" : "go",
    detail: `At the end: oxygen ${sup.oxygenLeft.toFixed(0)}%, cooling water ${sup.waterLeft.toFixed(0)}%, battery ${sup.batteryLeft.toFixed(0)}% left (caution under ${SUIT_SUPPLY.cautionLeftPercent}%, no-go under ${SUIT_SUPPLY.minLeftPercent}%)`,
  });

  checks.push({
    name: dust.label,
    state: grade(dust.tau, ASSUME.tauAmber, ASSUME.tauRed),
    detail: `Optical depth ${dust.tau.toFixed(2)}, ${dust.why} (caution at ${ASSUME.tauAmber}, scrub at ${ASSUME.tauRed})`,
  });

  const w = state.weather;
  if (w.hourlyC) {
    // Coldest hour the crew is actually outside, from the hourly averages.
    let coldest = Infinity;
    for (let h = Math.floor(state.startLTST); h <= Math.min(23, Math.floor(plan.backLTST)); h++) {
      if (w.hourlyC[h] != null) coldest = Math.min(coldest, w.hourlyC[h]);
    }
    checks.push({
      name: "Temperature",
      state: coldest < ASSUME.tempMinC ? "nogo" : coldest < ASSUME.tempMinC + 10 ? "caution" : "go",
      detail: `Coldest hour during the EVA averages ${coldest.toFixed(0)} °C (limit ${ASSUME.tempMinC} °C)`,
    });
  } else {
    checks.push({
      name: "Temperature",
      state: w.lowC < ASSUME.tempMinC ? "caution" : "go",
      detail: `High ${w.highC} °C, low ${w.lowC} °C` + (w.real ? ` on sol ${w.sol}` : " (fallback values)"),
    });
  }

  return checks;
}

// ---------- Drawing ----------

function drawProfile(plan) {
  const W = 320, H = 110, pad = { l: 44, r: 10, t: 12, b: 20 };
  const pts = [], stopsAt = [];
  let offset = 0;
  for (const leg of plan.legs) {
    for (const [d, z] of leg.path.profile) pts.push([offset + d, z]);
    offset += leg.path.lengthM;
    stopsAt.push(pts[pts.length - 1]);
  }
  if (!plan.stops.length || !pts.length) { $("profile").innerHTML = ""; return; }
  const maxX = Math.max(offset, 1);
  let minY = Math.min(...pts.map(p => p[1])), maxY = Math.max(...pts.map(p => p[1]));
  if (maxY - minY < 20) { maxY += 10; minY -= 10; }
  const sx = x => pad.l + x / maxX * (W - pad.l - pad.r);
  const sy = y => H - pad.b - (y - minY) / (maxY - minY) * (H - pad.t - pad.b);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join(" ");
  const area = `${line} L${sx(maxX)},${H - pad.b} L${sx(0)},${H - pad.b} Z`;
  const accent = getCss("--accent");
  $("profile").innerHTML = `
    <path d="${area}" fill="${accent}" fill-opacity="0.15"/>
    <path d="${line}" fill="none" stroke="${accent}" stroke-width="1.5"/>
    ${stopsAt.slice(0, -1).map(p => `<circle cx="${sx(p[0])}" cy="${sy(p[1])}" r="3" fill="${accent}"/>`).join("")}
    <text x="4" y="${sy(maxY) + 3}">${maxY.toFixed(0)} m</text>
    <text x="4" y="${sy(minY) + 3}">${minY.toFixed(0)} m</text>
    <text x="${sx(0)}" y="${H - 6}">0 km</text>
    <text x="${sx(maxX)}" y="${H - 6}" text-anchor="end">${(maxX / 1000).toFixed(1)} km</text>`;
}

function renderTimeSettings(plan) {
  $("mode-simple").setAttribute("aria-pressed", !enhanced());
  $("mode-enhanced").setAttribute("aria-pressed", enhanced());
  $("simple-only").hidden = enhanced();
  $("enhanced-only").hidden = !enhanced();
  $("mode-note").textContent = enhanced()
    ? "Enhanced: you set the pace, the time at every stop and the safety limits. Limits are team assumptions; the pace bands are NASA's."
    : `Simple: every science stop gets the same work time, waypoints get none, the pace is NASA's Apollo-based ${ASSUME.paceKmh} km/h, and the default safety limits apply.`;
  $("start-out").textContent = MarsTime.hhmm(state.startLTST);
  $("stopmin-out").textContent = state.minutesPerStop + " min";
  $("pace-out").textContent = `${state.paceKmh.toFixed(1)} km/h · ${SUIT.bands.find(b => state.paceKmh <= b.upTo).name}`;
  if (!enhanced()) return;

  // Rebuild the per-stop inputs only when the list of stops changes, so typing is not interrupted.
  const signature = state.order.join("|");
  if ($("stop-times").dataset.sig !== signature) {
    $("stop-times").dataset.sig = signature;
    $("stop-times").innerHTML = plan.stops.length ? plan.stops.map(s => `
      <label class="field">${s.name}
        <span><input type="number" min="0" max="240" step="5" data-minutes="${s.id}" value="${minutesFor(s)}"> min</span>
      </label>`).join("") : `<p class="hint">No stops in the route yet.</p>`;
  }
}

function update() {
  const plan = planRoute();
  lastPlan = plan;
  const now = MarsTime.at(new Date(), HABITAT.lat, HABITAT.lon);
  const dust = currentDust(now.Ls);

  // Markers, lists and route line
  for (const s of [...STOPS, ...state.custom]) {
    const n = state.order.indexOf(s.id);
    const icon = pinIcon(n >= 0 ? n + 1 : "", s.custom ? "wp" : (n >= 0 ? "on" : "") + (s.isDepot ? " depot" : ""));
    if (s.nudge) icon.options.iconAnchor = [11 - s.nudge, 11];
    stopMarkers[s.id].setIcon(icon);
  }
  renderStopLists();
  routeLine.setLatLngs(plan.stops.length ? plan.legs.map(l => l.path.latlngs) : []);
  routeLine.setStyle({ dashArray: plan.terrain && !plan.anyStraight ? null : "6 6" });

  // Totals and legs
  $("tot-dist").textContent = (plan.totalDist / 1000).toFixed(1) + " km";
  $("tot-time").textContent = plan.totalH.toFixed(1) + " h";
  $("tot-back").textContent = MarsTime.hhmm(plan.backLTST);
  $("leg-list").innerHTML = plan.stops.length ? plan.legs.map(l => `
    <li>
      <span class="to">${l.to === HABITAT ? "Back to habitat" : l.to.name}</span>
      <span class="num">${(l.path.lengthM / 1000).toFixed(2)} km · ${Math.round(l.walkH * 60)} min</span>
      <span class="sub">up ${l.path.ascentM.toFixed(0)} m · down ${l.path.descentM.toFixed(0)} m${l.path.straight ? " · straight line" : ` · steepest ${l.path.maxSlopeDeg.toFixed(0)}°`}${l.path.sandM ? ` · sand ${Math.round(l.path.sandM)} m` : ""}${l.path.shortM ? ` · stops ${Math.round(l.path.shortM)} m short: the site is steeper than ${ROUTING.maxSlopeDeg}°` : ""} · arrive ${MarsTime.hhmm(l.arriveLTST)}${l.workH ? ` · work ${Math.round(l.workH * 60)} min` : ""}</span>
    </li>`).join("") : `<li><span class="sub">Tick a science stop or add a waypoint to plan a route.</span></li>`;
  $("route-note").textContent = !plan.terrain
    ? "Terrain model not loaded: showing straight lines between stops."
    : plan.anyStraight
      ? `Dashed legs have no route under ${ROUTING.maxSlopeDeg}° (or leave the terrain model) and are drawn as straight lines.`
      : `Energy-budget route on the 20 m CTX terrain model${Terrain.hasFine() ? ", sharpened with 5 m HiRISE detail inside the dashed box" : ""}, timed with NASA's Apollo-based suited walking speeds. Avoids slopes over ${ROUTING.maxSlopeDeg}°, prefers gentle ground${Terrain.hasSand() ? " and steers around mapped sand" : ""}. Hazards smaller than 20 m, such as boulders, are not seen.`;
  drawProfile(plan);
  drawTempChart(plan);
  drawDustChart(now.Ls, dust);
  renderTimeSettings(plan);
  renderMissions(now, dust);
  renderWind(plan);
  renderSupplies(plan);
  renderRadiation(plan);

  // Checks and verdict
  const checks = runChecks(plan, now, dust);
  renderVerdict(checks, plan);

  $("tau-wrap").hidden = state.dustScenario !== "custom";
  $("tau-out").textContent = state.tau.toFixed(1);
}

function tickClock() {
  const d = new Date();
  const t = MarsTime.at(d, HABITAT.lat, HABITAT.lon);
  $("clk-sol").textContent = MarsTime.missionSol(d, HABITAT.lon);
  $("clk-ltst").textContent = MarsTime.hhmm(t.ltst);
  $("clk-sun").textContent = t.sunElevation > 0 ? `${t.sunElevation.toFixed(0)}° up` : "Night";
  $("clk-season").textContent = `${MarsTime.season(t.Ls)} · Ls ${t.Ls.toFixed(0)}°`;
}

function buildWeather() {
  const w = state.weather;
  refreshPressure();
  $("wx").innerHTML = [
    ["High", `${w.highC} °C`], ["Low", `${w.lowC} °C`],
    ["Pressure", w.pressurePa ? `${w.pressurePa} Pa` : "n/a"],
    ["Measured", w.real ? `Sol ${w.sol}` : "n/a"],
  ].map(([k, v]) => `<div><span class="k">${k}</span><span class="v">${v}</span></div>`).join("");
  $("wx-badge").textContent = w.real ? "MEDA" : "fallback";
  const lsOn = iso => MarsTime.at(new Date(iso + "T12:00:00Z"), HABITAT.lat, HABITAT.lon).Ls.toFixed(0);
  const lsNow = MarsTime.at(new Date(), HABITAT.lat, HABITAT.lon).Ls.toFixed(0);
  $("wx-note").textContent = !w.real
    ? "No weather data could be loaded. These are stand-in values."
    : w.source === "archive"
      ? `Perseverance MEDA readings for sol ${w.sol} (${earthDate(w.date)}), when Mars was at Ls ${lsOn(w.date)}°. Today is Ls ${lsNow}°. `
        + (Math.abs(((lsOn(w.date) - lsNow + 540) % 360) - 180) < 30
          ? "These are from the same season one Mars year ago, because NASA's archive does not reach today yet."
          : "That is a different season from today, so expect different temperatures now.")
      : `Perseverance MEDA readings for sol ${w.sol} (${w.date}), from NASA's public feed.`;
}

// Air temperature through the day, with the planned EVA window shaded.
function drawTempChart(plan) {
  const w = state.weather, svg = $("tempchart");
  if (!w.hourlyC) { svg.style.display = "none"; return; }
  svg.style.display = "";
  const W = 320, H = 100, pad = { l: 44, r: 10, t: 10, b: 20 };
  const pts = w.hourlyC.map((t, h) => [h + 0.5, t]).filter(p => p[1] != null);
  const minY = Math.floor(Math.min(...pts.map(p => p[1])) / 10) * 10;
  const maxY = Math.ceil(Math.max(...pts.map(p => p[1])) / 10) * 10;
  const sx = x => pad.l + x / 24 * (W - pad.l - pad.r);
  const sy = y => H - pad.b - (y - minY) / (maxY - minY) * (H - pad.t - pad.b);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join(" ");
  const x0 = sx(state.startLTST), x1 = sx(Math.min(24, plan.backLTST));
  svg.innerHTML = `
    <rect x="${x0}" y="${pad.t}" width="${Math.max(0, x1 - x0)}" height="${H - pad.t - pad.b}" fill="${getCss("--accent")}" fill-opacity="0.18"/>
    <path d="${line}" fill="none" stroke="${getCss("--rover")}" stroke-width="1.5"/>
    <text x="4" y="${sy(maxY) + 3}">${maxY} °C</text>
    <text x="4" y="${sy(minY) + 3}">${minY} °C</text>
    ${[0, 6, 12, 18, 24].map(h => `<text x="${sx(h)}" y="${H - 6}" text-anchor="${h === 0 ? "start" : h === 24 ? "end" : "middle"}">${String(h).padStart(2, "0")}:00</text>`).join("")}
    <text x="${(x0 + x1) / 2}" y="${pad.t + 10}" text-anchor="middle">EVA</text>`;
  $("tempchart-note").textContent = `Mean air temperature by local hour, sols ${w.firstSol}–${w.sol} (${w.solCount} sols).`;
}

// ---------- Atmosphere, radiation and suit consumables ----------

// Pressure anywhere = the pressure Perseverance measured, adjusted for the height
// difference between that spot and where the rover was:  p = p_rover x e^(-(z - z_rover) / H)
let roverWaypoints = null, pressureRef = null;
const pressureAt = z => pressureRef.pa * Math.exp(-(z - pressureRef.z) / ATMOSPHERE.scaleHeightM);

function refreshPressure() {
  const w = state.weather;
  if (!Terrain.isReady() || !roverWaypoints || !w.meanPressurePa) return;
  const there = roverWaypoints.filter(p => p.sol >= w.firstSol && p.sol <= w.sol);
  const used = there.length ? there : [roverWaypoints.filter(p => p.sol <= w.sol).pop()];
  pressureRef = { pa: w.meanPressurePa, z: used.reduce((a, p) => a + p.elev_geoid, 0) / used.length };
  const [zLo, zHi] = Terrain.elevationRange();
  const lo = Math.floor(pressureAt(zHi)), hi = Math.ceil(pressureAt(zLo));
  mapLayers.pressure.setBounds(Terrain.bounds());
  mapLayers.pressure.setUrl(Terrain.elevationImage(pressureAt, lo, hi, ATMOSPHERE.ramp));
  document.querySelectorAll("#legend-pressure").forEach(e => e.remove());
  const css = `linear-gradient(to right, ${ATMOSPHERE.ramp.map(c => `rgb(${c.join(",")})`).join(", ")})`;
  $("src-pressure").insertAdjacentHTML("afterend", `<span class="legend" id="legend-pressure"><span>${lo} Pa</span><span class="bar" style="background:${css}"></span><span>${hi} Pa</span></span>`);
  renderAtmosphere();
}

function renderAtmosphere() {
  $("gas-list").innerHTML = ATMOSPHERE.gases.map(g => `
    <li><span class="gname">${g.name} <span class="muted">${g.formula}</span></span><span class="num">${g.percent}%</span>
      <span class="gbar"><span style="width:${Math.max(0.6, g.percent)}%"></span></span></li>`).join("");
  if (!pressureRef) { $("atm-note").textContent = "Pressure appears once the terrain and weather have loaded."; return; }
  const here = pressureAt(HABITAT.elev);
  $("atm-pressure").textContent = `${here.toFixed(0)} Pa`;
  $("atm-earth").textContent = `${(here / ATMOSPHERE.earthSeaLevelPa * 100).toFixed(2)}%`;
  $("atm-note").textContent = `Pressure at the habitat, worked out from Perseverance's average of ${pressureRef.pa.toFixed(0)} Pa over sols ${state.weather.firstSol}–${state.weather.sol}, when the rover was at ${pressureRef.z.toFixed(0)} m, using an 11 km scale height. The air is unbreathable: 95% carbon dioxide and under 1% of Earth's pressure, so the suit supplies all oxygen and pressure.`;
}

// Radiation dose for this walk, from Curiosity's surface measurements at Gale Crater.
function renderRadiation(plan) {
  const perHour = RADIATION.doseEquivalentMSvPerDay / RADIATION.hoursPerDay;
  $("rad-eva").textContent = `${(perHour * plan.totalH).toFixed(2)} mSv`;
  $("rad-day").textContent = `${RADIATION.doseEquivalentMSvPerDay} mSv`;
  $("rad-year").textContent = `${(RADIATION.doseEquivalentMSvPerDay * 365.25).toFixed(0)} mSv`;
}

// What the suit uses over the walk. Walking and working use at different rates.
function supplies(plan) {
  const S = SUIT_SUPPLY, a = S.apollo, b = S.walkback;
  // Between the Apollo average pace and the walkback-test pace, slide the rate in proportion.
  const f = Math.max(0, Math.min(1, (pace() - a.paceKmh) / (b.paceKmh - a.paceKmh)));
  const walking = k => a[k] + (b[k] - a[k]) * f;
  const walkH = plan.legs.reduce((s, l) => s + l.walkH, 0), workH = plan.legs.reduce((s, l) => s + l.workH, 0);
  const use = k => walkH * walking(k) + workH * a[k];
  const oxygenLb = use("oxygenLbPerH"), waterLb = use("waterLbPerH"), kcal = use("kcalPerH");
  const batteryWh = plan.totalH * S.batteryWh / S.batteryRatedH;
  const left = (used, tank) => Math.max(0, 100 * (1 - used / tank));
  return {
    oxygenLb, waterLb, kcal, batteryWh, walkH, workH,
    oxygenLeft: left(oxygenLb, S.oxygenLb), waterLeft: left(waterLb, S.waterLb), batteryLeft: left(batteryWh, S.batteryWh),
  };
}

function renderSupplies(plan) {
  const s = supplies(plan), S = SUIT_SUPPLY, kg = lb => (lb * S.lbToKg).toFixed(2);
  const level = v => v < S.minLeftPercent ? "nogo" : v < S.cautionLeftPercent ? "caution" : "go";
  const row = (name, leftPct, used, tank) => `
    <li data-state="${level(leftPct)}"><span class="sname">${name}</span><span class="num">${leftPct.toFixed(0)}% left</span>
      <span class="sbar"><span style="width:${leftPct}%"></span></span>
      <span class="sub">uses ${used} of ${tank}</span></li>`;
  $("supply-list").innerHTML =
    row("Oxygen", s.oxygenLeft, `${kg(s.oxygenLb)} kg`, `${kg(S.oxygenLb)} kg`) +
    row("Cooling water", s.waterLeft, `${kg(s.waterLb)} kg`, `${kg(S.waterLb)} kg`) +
    row("Battery", s.batteryLeft, `${s.batteryWh.toFixed(0)} Wh`, `${S.batteryWh} Wh`);
  $("supply-note").textContent = `Body energy used: about ${Math.round(s.kcal)} kcal (${s.walkH.toFixed(1)} h walking, ${s.workH.toFixed(1)} h working at stops).`;
}

// ---------- Verdict: what it is, and why ----------

// What to do about a check that is not green. Matched by the start of the check's name.
const TIPS = {
  "EVA duration": "Remove a stop, or shorten the work time at each stop.",
  "Daylight": "Start earlier, or shorten the walk.",
  "Walk-back": "Choose stops closer to the habitat.",
  "Terrain": "Pick stops on gentler ground, or add a waypoint around the steep part.",
  "Sand": "Add a waypoint to steer the route around the sand.",
  "Suit consumables": "Shorten the walk, or walk at a slower pace.",
  "Dust": "Wait for clearer air, or pick a calmer dust scenario.",
  "Temperature": "Start later in the morning, when the air has warmed.",
};
const STATE_WORD = { go: "OK", caution: "Caution", nogo: "No-go" };
const tipFor = name => (Object.entries(TIPS).find(([k]) => name.startsWith(k)) || [])[1] || "";

function renderVerdict(checks, plan) {
  const worst = worstOf(checks);
  const bad = checks.filter(c => c.state === "nogo"), warn = checks.filter(c => c.state === "caution");
  const shortName = c => c.name.replace(/ \(.*\)$/, "");

  // Top bar: the verdict and the reasons in a few words.
  $("verdict-box").dataset.state = worst;
  $("verdict").textContent = VERDICT[worst];
  $("verdict-reason").textContent = !plan.stops.length ? "No route yet"
    : worst === "go" ? "All checks passed"
    : [...bad, ...warn].map(shortName).join(" · ");
  $("tabdot").dataset.state = worst;

  // EVA status tab: a sentence, then the reasons spelled out.
  const headline = !plan.stops.length ? "Add a stop to plan a walk."
    : worst === "go" ? "This walk passes every safety check."
    : worst === "caution" ? `This walk is possible, but ${warn.length} ${warn.length === 1 ? "check needs" : "checks need"} attention.`
    : `This walk should not go ahead: ${bad.length} ${bad.length === 1 ? "check fails" : "checks fail"}${warn.length ? `, and ${warn.length} more ${warn.length === 1 ? "needs" : "need"} attention` : ""}.`;
  $("why").dataset.state = worst;
  $("why").innerHTML = `
    <div class="why-head"><span class="why-word">${VERDICT[worst]}</span><span>${headline}</span></div>
    ${[...bad, ...warn].map(c => `
      <div class="why-item" data-state="${c.state}">
        <span class="chip" data-state="${c.state}">${STATE_WORD[c.state]}</span>
        <div><b>${shortName(c)}</b><div class="detail">${c.detail}</div>${tipFor(c.name) ? `<div class="tip">What to do: ${tipFor(c.name)}</div>` : ""}</div>
      </div>`).join("")}`;

  // Full list: problems first, then everything that passed.
  const order = { nogo: 0, caution: 1, go: 2 };
  $("checks").innerHTML = [...checks].sort((a, b) => order[a.state] - order[b.state]).map(c => `
    <li data-state="${c.state}"><span class="chip" data-state="${c.state}">${STATE_WORD[c.state]}</span>
      <div><div class="name">${c.name}</div><div class="detail">${c.detail}</div></div></li>`).join("");
}

// Tabs in the side panel.
function showTab(name) {
  document.querySelectorAll(".tabs [role=tab]").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === name));
  document.querySelectorAll(".tabpanel").forEach(p => { p.hidden = p.id !== "tab-" + name; });
  document.querySelector(".panel").scrollTop = 0;
}

// ---------- Preset missions ----------
const VERDICT = { go: "GO", caution: "CAUTION", nogo: "NO-GO" };
const worstOf = checks => checks.some(c => c.state === "nogo") ? "nogo" : checks.some(c => c.state === "caution") ? "caution" : "go";

// What Perseverance sampled at a list of stops, counted from NASA's sample table.
function gathers(stopIds) {
  const count = {};
  for (const s of stopIds.map(stopById)) {
    for (const x of s.samples) {
      const kind = (x.type === "Rock core" ? x.rock + " rock" : x.type).toLowerCase();
      count[kind] = (count[kind] || 0) + 1;
    }
  }
  return Object.entries(count).map(([kind, n]) => `${n} ${kind}`).join(", ");
}

function renderMissions(now, dust) {
  $("mission-list").innerHTML = MISSIONS.map(m => {
    const plan = planRoute(m.stops);
    const verdict = worstOf(runChecks(plan, now, dust));
    const active = m.stops.join("|") === state.order.join("|");
    return `<button type="button" class="mission" data-mission="${m.id}" aria-pressed="${active}">
      <span class="mname">${m.name}<span class="chip" data-state="${verdict}">${VERDICT[verdict]}</span></span>
      <span class="mgoal">${m.goal}</span>
      <span class="mstat">${m.stops.map(id => stopById(id).name.replace(" sample depot", "")).join(" → ")}</span>
      <span class="mstat">Sampled at these stops by Perseverance: ${gathers(m.stops)}</span>
      <span class="mstat">${(plan.totalDist / 1000).toFixed(1)} km · ${plan.totalH.toFixed(1)} h</span>
    </button>`;
  }).join("");
}

function startMission(id) {
  const m = MISSIONS.find(x => x.id === id);
  // Drop any hand-placed waypoints, load the stops, and show this mission's mineral map only.
  for (const wp of [...state.custom]) { stopMarkers[wp.id].remove(); delete stopMarkers[wp.id]; }
  state.custom = [];
  state.order = [...m.stops];
  for (const def of LAYERS.filter(l => l.crism)) {
    const box = $("lyr-" + def.id), want = def.id === m.layer;
    if (!box.disabled && box.checked !== want) box.click();
  }
  update();
  map.fitBounds(L.latLngBounds([HABITAT, ...m.stops.map(stopById)].map(p => [p.lat, p.lon])).pad(0.25));
}

// ---------- Wind ----------

async function loadWind() {
  try {
    state.wind = await fetch(WIND_FILE).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
  } catch (err) {
    console.warn("Wind record failed to load:", err);
  }
  update();
}

const COMPASS = ["north", "north-northeast", "northeast", "east-northeast", "east", "east-southeast", "southeast", "south-southeast",
  "south", "south-southwest", "southwest", "west-southwest", "west", "west-northwest", "northwest", "north-northwest"];

function renderWind(plan) {
  const w = state.wind;
  $("windhour-out").textContent = String(state.windHour).padStart(2, "0") + ":00";
  if (!w) {
    $("wind-badge").textContent = "no data";
    $("wind-note").textContent = "The wind record could not be loaded.";
    WindLayer.set(null);
    return;
  }
  const h = w.hours[state.windHour];
  const has = h && h.readings > 0;
  $("wind-speed").textContent = has ? `${h.meanSpeed.toFixed(1)} m/s` : "no readings";
  $("wind-dir").textContent = has ? `${COMPASS[Math.round(h.directionFrom / 22.5) % 16]} (${h.directionFrom}°)` : "–";
  $("wind-gust").textContent = has ? `${h.p95Speed.toFixed(1)} m/s` : "–";
  // Compass: the arrow points the way the air is moving (away from where it comes from).
  $("compass").innerHTML = `
    <circle r="44" fill="none" stroke="${getCss("--line")}" stroke-width="2"/>
    ${["N", "E", "S", "W"].map((c, i) => `<text x="${[0, 37, 0, -37][i]}" y="${[-32, 4, 39, 4][i]}" text-anchor="middle" font-size="11" fill="${getCss("--muted")}">${c}</text>`).join("")}
    ${has ? `<g transform="rotate(${h.directionFrom + 180})"><path d="M0,24 L0,-22 M-7,-13 L0,-24 L7,-13" fill="none" stroke="${getCss("--rover")}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g>` : ""}`;
  WindLayer.set(has ? { speed: h.meanSpeed, from: h.directionFrom } : null);

  // Wind across the hours the crew is outside.
  const out = [];
  for (let hr = Math.floor(state.startLTST); hr <= Math.min(23, Math.floor(plan.backLTST)); hr++) if (w.hours[hr].readings) out.push(w.hours[hr]);
  $("wind-eva").textContent = out.length
    ? `During this EVA (${MarsTime.hhmm(state.startLTST)}–${MarsTime.hhmm(plan.backLTST)}): average ${Math.min(...out.map(x => x.meanSpeed)).toFixed(1)}–${Math.max(...out.map(x => x.meanSpeed)).toFixed(1)} m/s, strongest readings about ${Math.max(...out.map(x => x.p95Speed)).toFixed(1)} m/s.`
    : "";
  $("wind-note").textContent = `Averages by hour from Perseverance's wind sensor, sols ${w.firstSol}–${w.lastSol} (${w.solsUsed} sols in 2021, early northern spring). The sensor was damaged later, so NASA has no newer wind. Mars air is about 1% as dense as Earth's, so these winds push far less than the same speed on Earth.`;
}

// ---------- 3D view ----------

let lastPlan = null;
function open3D() {
  if (!Terrain.isReady()) return;
  // Show the part of the map on screen, trimmed to what the terrain model covers.
  const [[ts, tw], [tn, te]] = Terrain.bounds(), b = map.getBounds();
  const bounds = [[Math.max(ts, b.getSouth()), Math.max(tw, b.getWest())], [Math.min(tn, b.getNorth()), Math.min(te, b.getEast())]];
  if (bounds[0][0] >= bounds[1][0] || bounds[0][1] >= bounds[1][1]) return;
  const now = MarsTime.at(new Date(), HABITAT.lat, HABITAT.lon);
  $("view3d").hidden = false;
  $("v3-sun").value = state.startLTST;
  $("v3-sun-out").textContent = MarsTime.hhmm(state.startLTST);
  $("v3-fly").setAttribute("aria-pressed", "false"); $("v3-fly").textContent = "Walk the route";
  View3D.show({
    host: $("view3d-canvas"), bounds,
    route: lastPlan && lastPlan.stops.length ? lastPlan.legs.flatMap(l => l.path.latlngs).map(([lat, lon]) => ({ lat, lon })) : [],
    stops: lastPlan ? lastPlan.stops : [], habitat: HABITAT,
    sunDeclination: now.decl, ltst: state.startLTST,
    onFlyEnd: () => { $("v3-fly").setAttribute("aria-pressed", "false"); $("v3-fly").textContent = "Walk the route"; },
  }).then(info => {
    $("v3-note").textContent = `${info.widthKm.toFixed(1)} × ${info.heightKm.toFixed(1)} km of the MRO CTX terrain model, one point every ${info.cellM.toFixed(0)} m, with NASA imagery draped on top. Drag to turn, scroll to zoom, right-drag to move.`;
  });
}

function bind3D() {
  const open = L.control({ position: "topright" });
  open.onAdd = () => {
    const b = L.DomUtil.create("button", "btn open3d");
    b.type = "button"; b.textContent = "3D view";
    L.DomEvent.disableClickPropagation(b);
    b.addEventListener("click", open3D);
    return b;
  };
  open.addTo(map);
  // Keep map gestures from firing underneath the 3D view.
  L.DomEvent.disableClickPropagation($("view3d"));
  L.DomEvent.disableScrollPropagation($("view3d"));
  $("v3-back").addEventListener("click", () => { View3D.hide(); $("view3d").hidden = true; });
  $("v3-home").addEventListener("click", () => View3D.homeCamera());
  $("v3-fly").addEventListener("click", () => {
    const on = View3D.toggleFly();
    $("v3-fly").setAttribute("aria-pressed", on); $("v3-fly").textContent = on ? "Stop" : "Walk the route";
  });
  $("v3-exag").addEventListener("input", e => { $("v3-exag-out").textContent = e.target.value; View3D.setExaggeration(+e.target.value); });
  $("v3-sun").addEventListener("input", e => {
    const p = View3D.setSunTime(+e.target.value);
    $("v3-sun-out").textContent = `${MarsTime.hhmm(+e.target.value)} · ${p.elevation > 0 ? p.elevation.toFixed(0) + "° up" : "below horizon"}`;
  });
  $("v3-slope").addEventListener("change", e => View3D.setSlope(e.target.checked));
}

// ---------- Controls ----------
function bindSlider(id, key) {
  const el = $(id);
  el.value = state[key];
  el.addEventListener("input", () => { state[key] = +el.value; update(); });
}

function bindControls() {
  bindSlider("start", "startLTST");
  bindSlider("stopmin", "minutesPerStop");
  bindSlider("pace", "paceKmh");
  bindSlider("tau", "tau");
  bindSlider("windhour", "windHour");
  document.querySelector(".tabs").addEventListener("click", e => { const b = e.target.closest("[role=tab]"); if (b) showTab(b.dataset.tab); });
  $("verdict-box").addEventListener("click", () => showTab("eva"));

  $("mission-list").addEventListener("click", e => {
    const b = e.target.closest("[data-mission]");
    if (b) startMission(b.dataset.mission);
  });
  // The wind "layer" has nothing to draw itself: it switches the animation on and off.
  mapLayers.wind.on("add", () => WindLayer.show(true));
  mapLayers.wind.on("remove", () => WindLayer.show(false));

  $("lyr-rover").addEventListener("change", e => e.target.checked ? roverLayer.addTo(map) : roverLayer.remove());
  $("add-wp").addEventListener("click", () => setAdding(!state.adding));
  $("dust-scenario").addEventListener("change", e => { state.dustScenario = e.target.value; update(); });

  $("mode-simple").addEventListener("click", () => { state.mode = "simple"; update(); });
  $("mode-enhanced").addEventListener("click", () => { state.mode = "enhanced"; update(); });

  // Route order buttons and science stop checkboxes (the lists are rebuilt often,
  // so listen on their containers).
  $("route-order").addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.act === "remove") removeFromRoute(b.dataset.id);
    else moveInRoute(b.dataset.id, b.dataset.act === "up" ? -1 : 1);
  });
  $("stop-list").addEventListener("change", e => {
    const id = e.target.dataset.stop;
    if (!id) return;
    if (e.target.checked) state.order.push(id); else state.order = state.order.filter(x => x !== id);
    update();
  });

  // Enhanced: minutes at each stop, and the safety limits.
  $("stop-times").addEventListener("input", e => {
    const id = e.target.dataset.minutes;
    if (id) { state.stopMinutes[id] = Math.max(0, +e.target.value || 0); update(); }
  });
  for (const k of LIMIT_KEYS) {
    const el = $("lim-" + k);
    el.value = state.limits[k];
    el.addEventListener("input", () => { if (+el.value > 0) { state.limits[k] = +el.value; update(); } });
  }
}

// ---------- Start ----------

buildLayerPanel();
buildStops();
buildWeather();
WindLayer.attach(map);
WindLayer.show(false);
bindControls();
bind3D();
update();
tickClock();
setInterval(tickClock, 15000);
loadRover();
loadWeather();
loadTerrain();
loadDust();
loadSand();
loadCrism();
loadWind();
loadThermal();
