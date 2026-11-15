// Everything the team is likely to change lives in this file:
// map layers, science stops, and the assumptions behind the numbers.

const SITE = {
  name: "Jezero Crater",
  center: [18.445, 77.425],   // [lat, lon] planetocentric, east-positive
  zoom: 11,
  marsRadiusM: 3396190,       // IAU Mars 2000 sphere
};

// NASA Mars Trek tile servers (equirectangular, WMTS).
// maxNativeZoom = deepest zoom the server really has tiles for (tested by hand:
// it is 3 less than the level count in the layer's WMTSCapabilities.xml).
const TREK = name => ext =>
  `https://trek.nasa.gov/tiles/Mars/EQ/${name}/1.0.0/default/default028mm/{z}/{y}/{x}.${ext}`;

const JEZERO_CTX_BOUNDS = [[18.2110, 77.1605], [18.7212, 77.6992]];
const JEZERO_HIRISE_BOUNDS = [[18.3068, 77.2229], [18.6693, 77.5840]];

// "base" layers are always on and stack bottom to top.
// "overlay" layers get a checkbox and an opacity slider.
const LAYERS = [
  {
    id: "viking", kind: "base", group: "Base",
    label: "Global color mosaic", source: "Viking Orbiter · MDIM 2.1 · 232 m/px",
    when: "Seen when zoomed far out, and outside the crater.",
    url: TREK("Mars_Viking_MDIM21_ClrMosaic_global_232m")("jpg"), maxNativeZoom: 7,
  },
  {
    id: "ctx", kind: "base", group: "Base",
    label: "Context imagery", source: "MRO · CTX · 6 m/px",
    when: "Covers the whole crater: craters, ridges and the delta.",
    url: TREK("JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0")("png"),
    maxNativeZoom: 13, bounds: JEZERO_CTX_BOUNDS,
  },
  {
    id: "hirise", kind: "base", group: "Base",
    label: "Detail imagery", source: "MRO · HiRISE · 25 cm/px",
    when: "Covers the landing area and delta. Zoom in to see single boulders.",
    url: TREK("JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd")("png"),
    maxNativeZoom: 17, bounds: JEZERO_HIRISE_BOUNDS,
  },
  {
    // Not a tile layer: app.js draws it from the terrain model once that loads.
    id: "slope", kind: "overlay", group: "Safety", derived: true,
    label: "Slope hazard", source: "Computed from MRO terrain models · CTX 20 m, HiRISE 5 m near the habitat",
    opacity: 0.8, on: true,
    note: "Clear: under 5°. Yellow: 5–10°. Orange: 10–15°. Red: over 15°, off-limits under the energy-budget rule.",
  },
  {
    // Drawn by app.js from SAND.file (see below). No opacity slider.
    id: "sand", kind: "overlay", group: "Safety", vector: true,
    label: "Sand and ripples", source: "USGS geologic map SIM 3464 · eolian bedform unit",
    on: false,
    note: "Mapped wind-blown sand. Loose sand is slow to walk on and can hide rocks.",
  },
  {
    id: "dustcover", kind: "overlay", group: "Safety",
    label: "Surface dust cover", source: "MGS · TES Dust Cover Index · 3.5 km/px",
    url: TREK("tes_ruffdust")("png"), maxNativeZoom: 2,
    opacity: 0.5, on: false,
    note: "How much dust coats the ground (Ruff & Christensen 2002). Very coarse: a few pixels across the whole crater.",
  },
  {
    id: "mola", kind: "overlay", group: "Safety",
    label: "Elevation (color)", source: "MGS · MOLA · 463 m/px",
    url: TREK("Mars_MGS_MOLA_ClrShade_merge_global_463m")("jpg"), maxNativeZoom: 7,
    opacity: 0.55, on: false,
    note: "Blue is low, red is high. Coarse: good for the big picture only.",
  },
  {
    // Drawn by app.js from data/themis_ti.bin once it loads.
    id: "thermal", kind: "overlay", group: "Safety", derived: true,
    label: "Thermal inertia", source: "Mars Odyssey · THEMIS · USGS quantitative mosaic · 100 m/px",
    opacity: 0.65, on: false,
    note: "How well the ground holds heat, in J m⁻² K⁻¹ s⁻½. Low (blue): loose dust and sand. High (red): coarse, cemented or rocky ground. Accuracy about 20%.",
  },
  {
    id: "themis-night", kind: "overlay", group: "Safety",    label: "Night-time heat", source: "Mars Odyssey · THEMIS night IR · 100 m/px",
    url: TREK("THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018")("png"), maxNativeZoom: 9,
    opacity: 0.6, on: false,
    note: "Bright = stays warm at night = rock. Dark = cools fast = loose dust or sand.",
  },
  {
    id: "geology", kind: "overlay", group: "Science", vector: true,
    label: "Rock units", source: "USGS geologic map SIM 3464 (Sun & Stack 2020)",
    on: false,
    note: "Click an area for its unit name. Includes the two Jezero fan (delta) units and the crater floor.",
  },
  {
    id: "themis-day", kind: "overlay", group: "Science",
    label: "Day-time heat", source: "Mars Odyssey · THEMIS day IR · 100 m/px",
    url: TREK("THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018")("png"), maxNativeZoom: 9,
    opacity: 0.6, on: false,
    note: "Shows landforms clearly, without dust haze.",
  },
  // Mineral maps: CRISM "browse products" from three observations over the delta
  // (files in data/crism/, listed in data/crism/index.json). The colour meanings are
  // NASA's own descriptions of each product. Colours hint at minerals; they are not proof.
  {
    id: "crism-maf", kind: "overlay", group: "Minerals", crism: "brmafj",
    label: "Olivine and pyroxene", source: "MRO · CRISM · MAF product · 18 m/px",
    opacity: 0.6, on: false,
    note: "Red: olivine or iron-rich clay. Green to cyan: low-calcium pyroxene. Blue to magenta: high-calcium pyroxene.",
  },
  {
    id: "crism-car", kind: "overlay", group: "Minerals", crism: "brcarj",
    label: "Carbonates", source: "MRO · CRISM · CAR product · 18 m/px",
    opacity: 0.6, on: false,
    note: "Bluish or yellowish white: often carbonate. Red to magenta: may be iron-magnesium clays. Blue: other water-bearing minerals.",
  },
  {
    id: "crism-phy", kind: "overlay", group: "Minerals", crism: "brphyj",
    label: "Clays and hydrated minerals", source: "MRO · CRISM · PHY product · 18 m/px",
    opacity: 0.6, on: false,
    note: "Red to magenta: iron-magnesium clays. Green to cyan: aluminium clays or hydrated silica. Blue: other water-bearing minerals.",
  },
  {
    // Drawn by app.js: measured pressure, adjusted for each spot's elevation.
    id: "pressure", kind: "overlay", group: "Conditions", derived: true,
    label: "Air pressure", source: "Mars 2020 · MEDA pressure + terrain elevation",
    opacity: 0.6, on: false,
    note: "Pressure is higher on low ground and lower on high ground. Computed from Perseverance's measured pressure and each spot's elevation.",
  },
  {
    // Not map data: switching it on starts the animation in wind.js.
    id: "wind", kind: "overlay", group: "Conditions", vector: true,
    label: "Wind flow (simulated)", source: "Mars 2020 · MEDA wind sensor · hourly averages",
    on: false,
    note: "Streaks drift the way the wind blows; faster streaks mean stronger wind. One measured value is applied to the whole map, so it does not bend around hills.",
  },
  {
    id: "landmarks", kind: "overlay", group: "Places", vector: true,
    label: "Place names", source: "IAU Gazetteer (USGS) · rover positions · team figure",
    on: true,
    note: "Blue pins. Click one for what it is and where its position comes from.",
  },
  {
    id: "sites", kind: "overlay", group: "Places", vector: true,
    label: "Sample sites", source: "NASA Mars Rock Samples list · rover positions",
    on: true,
    note: "Round pins where Perseverance collected samples. Click one to see the samples and add it to the route.",
  },
];
// HiRISE 5 m elevation for the main walking area, built by data-prep/get-hirise.ps1.
const FINE_TERRAIN = { meta: "data/hirise_5m.json", data: "data/hirise_5m.bin" };

// Atmosphere. Composition and scale height: NASA Mars Fact Sheet (NSSDC).
const ATMOSPHERE = {
  scaleHeightM: 11000,     // pressure falls by a factor of e (2.72) for every 11 km climbed
  earthSeaLevelPa: 101325,
  gases: [
    { name: "Carbon dioxide", formula: "CO₂", percent: 95.1 },
    { name: "Nitrogen", formula: "N₂", percent: 2.59 },
    { name: "Argon", formula: "Ar", percent: 1.94 },
    { name: "Oxygen", formula: "O₂", percent: 0.16 },
    { name: "Carbon monoxide", formula: "CO", percent: 0.06 },
  ],
  ramp: [[70, 40, 120], [60, 110, 180], [80, 180, 170], [200, 220, 120], [250, 200, 90]],
};

// Radiation at the surface, measured by Curiosity's RAD instrument in Gale Crater
// (Hassler et al., Science, published online Dec 2013): galactic cosmic rays, near solar maximum.
// Used here as a stand-in for Jezero. CHECK the dose-equivalent value against the paper:
// 0.64 is from the paper as we recall it; one press release says 0.67.
const RADIATION = {
  absorbedMGyPerDay: 0.21, doseEquivalentMSvPerDay: 0.64, hoursPerDay: 24,
};

// Suit consumables.
// Use rates: NASA's EVA Walkback Test planning table (Norcross et al. 2008), which gives
// oxygen, cooling water and energy use for the 10 km suited walk and the Apollo average.
// Tank sizes: Apollo 15-17 backpack (cooling water 11.5 lb, battery 390 Wh, rated for an
// 8-hour EVA). The oxygen tank size (1.8 lb) is from memory and NOT verified.
// Battery drain is assumed steady: 390 Wh over the rated 8 hours.
const SUIT_SUPPLY = {
  apollo:   { paceKmh: 2.7, oxygenLbPerH: 0.15, waterLbPerH: 0.98, kcalPerH: 233 },  // Apollo surface EVA average
  walkback: { paceKmh: 6.3, oxygenLbPerH: 0.40, waterLbPerH: 3.10, kcalPerH: 599 },  // 10 km walkback test
  oxygenLb: 1.8, waterLb: 11.5, batteryWh: 390, batteryRatedH: 8,
  cautionLeftPercent: 25, minLeftPercent: 10,   // team values
  lbToKg: 0.4536,
};

const CRISM_INDEX = "data/crism/index.json";
// How the mineral images are softened for display (see loadCrism in app.js).
const CRISM_LOOK = { blurPx: 1.6, stretchPercent: 1, keepColour: 0.7 };

// Average wind by local hour, built by data-prep/get-wind.ps1 from MEDA sols 36-65.
const WIND_FILE = "data/wind_meda.json";

// Preset missions. Each lists stop ids from js/places.js in walking order, and the
// mineral map that suits it. What each mission gathers is worked out from NASA's
// sample table, not typed here. The names and goals are the team's.
const MISSIONS = [
  {
    id: "floor", name: "Volcanic crater floor", layer: "crism-maf",
    stops: ["sid", "rochette", "brac", "issole"],
    goal: "Igneous rock from four crater-floor outcrops, to date when the floor formed. The olivine and pyroxene map shows where those minerals are.",
  },
  {
    id: "lake", name: "Ancient lake sediments", layer: "crism-phy",
    stops: ["skinner-ridge", "wildcat-ridge", "hidden-harbor", "observation-mountain"],
    goal: "Sedimentary rock laid down by water at the delta front, plus loose regolith. The clay map shows water-altered minerals.",
  },
  {
    id: "depot", name: "Depot recovery", layer: "crism-car",
    stops: ["rochette", "three-forks", "amalik"],
    goal: "Pick up the ten tubes Perseverance cached, and add one igneous and one sedimentary outcrop on the way. The carbonate map is shown for context.",
  },
];

// Perseverance's track, straight from the mission's public map.
const ROVER = {
  traverseUrl: "https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json",
  waypointsUrl: "https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json",
};

// Elevation model used for slope and routing.
// MRO CTX stereo terrain model, 20 m/cell, from USGS Astrogeology:
// https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/
const TERRAIN = { url: "data/jezero_ctx_dtm_20m.tif" };

// How fast a suited astronaut walks. Numbers from NASA sources (see SOURCES.md).
const SUIT = {
  // NASA JSC traverse model (ICES-2025-129), "Lunar Walking Speed Model":
  //   V = -0.01 x S + 0.75   (V in m/s, S = slope)
  // a straight-line fit to Apollo 12 and 14 walking data (Pena-Asensio et al. 2024).
  // CHECK: the NASA slide does not say if S is degrees or percent, or if downhill
  // counts as negative. This site reads S as degrees and slows equally up and down.
  levelSpeedMs: 0.75,
  lossPerDegreeMs: 0.01,
  minSpeedMs: 0.2,
  // Pace bands from NASA's Integrated Suit Test planning tool (km/h on level ground),
  // and the measured average of the 10 km EVA Walkback Test (6 astronauts, MKIII suit,
  // 121 kg, simulated lunar gravity, level treadmill: 10 km in 95.8 min = 3.94 mph).
  bands: [
    { upTo: 3.0, name: "intrasite pace" },
    { upTo: 5.0, name: "site-to-site pace" },
    { upTo: 6.3, name: "walkback test pace" },
    { upTo: 99, name: "above anything NASA measured" },
  ],
};

// How the route finder treats the ground.
const ROUTING = {
  // Energy-budget rule: the crew never crosses ground steeper than 15 degrees, and the
  // route strongly prefers flat, smooth ground, saving effort for the work at each stop.
  // (NASA's own traverse model uses a looser limit of 20 degrees.)
  maxSlopeDeg: 15,       // steeper ground is off-limits
  cautionSlopeDeg: 10,   // the Terrain check turns amber above this
  steepPenalty: 4,       // how strongly to prefer gentle ground (0 = only speed matters)
  roughPenalty: 1,       // extra cost for bumpy ground, where HiRISE detail exists (team value)
  roughFullDeg: 6,       // roughness (spread of 5 m slopes, degrees) that earns the full rough penalty
  searchMarginM: 1500,   // how far outside the direct line the search may wander first
  sandPenalty: 5,        // mapped sand counts as 5 times slower when choosing a path (team value)
  sandCautionM: 100,     // caution if the route still crosses more than this much sand (team value)
};

// Thermal inertia from Mars Odyssey THEMIS (USGS mosaic), built by data-prep/get-thermal-inertia.ps1.
const THERMAL = {
  meta: "data/themis_ti.json", data: "data/themis_ti.bin",
  // Colour ramp from low to high, as [red, green, blue].
  ramp: [[38, 70, 150], [60, 150, 190], [150, 200, 140], [240, 210, 90], [230, 130, 50], [190, 50, 40]],
  // Rough plain-word reading of a value. These break points are a common rule of thumb,
  // not from the USGS product: check them against Fergason et al. (2006) before quoting.
  classes: [
    { below: 150, name: "dust or very fine loose material" },
    { below: 350, name: "sand or loose fine material" },
    { below: 800, name: "coarse, cemented or mixed rocky ground" },
    { below: Infinity, name: "mostly rock or bedrock" },
  ],
};

// Perseverance weather (MEDA instrument), summarised from NASA's Planetary
// Data System by data-prep/get-weather.ps1. Rerun that script to refresh it.
const WEATHER_FILE = "data/weather_meda.json";
// Backup if the file is missing: NASA's public daily feed (older sols only).
const WEATHER_FEED ="https://mars.nasa.gov/rss/api/?feed=weather&category=mars2020&feedtype=json";

// Dust in the air over Jezero, by season, for Mars Years 24-36.
// Built by data-prep/get-dust.ps1 from the Montabone et al. dust climatology,
// which combines MGS TES, Mars Odyssey THEMIS and MRO Mars Climate Sounder data.
const DUST = {
  file: "data/dust_climatology.json",
  binDeg: 5,          // season is grouped into 5-degree steps of Ls
  // The dataset gives infrared optical depth (absorption at 9.3 micron). Montabone
  // et al. (2015) convert it to the visible optical depth a person would notice by
  // multiplying by 2.6. CHECK this factor against the paper before submitting.
  irToVisible: 2.6,
};

// Rock units and mapped sand, from the USGS geologic map of Jezero (SIM 3464),
// converted to GeoJSON by data-prep/export-geology.html (see README).
// Any polygon with a text field matching `match` is drawn as sand.
const SAND = { file: "data/geology.geojson", match: /eolian/i };
// Colours for the rock units layer, handed out in alphabetical order of unit name.
// These are not the official USGS map colours.
const GEOLOGY_COLOURS = ["#7fb2d4", "#e48a5c", "#8fc77a", "#c79ad6", "#e0b04a", "#5fc4b8", "#d67a8f", "#9aa3b0", "#b5c75a", "#6f8fd6", "#d6a27a", "#7ad6a8"];

// Science stops come from js/places.js, which data-prep/get-places.ps1 builds from
// NASA's sample list and the rover's recorded positions. Edit that script, not this.
const HABITAT = {
  id: "habitat", name: "Habitat (Octavia E. Butler Landing)",
  lat: 18.44462715, lon: 77.45088572, elev: -2569.9, sol: 13,
  why: "Start and end of every EVA. Placed at Perseverance's landing spot on the flat crater floor. This location is the team's choice, not a NASA plan.",
};

// One line of context per site, written by the team from NASA mission news.
// The sample facts shown with each site come from NASA's table; these notes do not,
// so fact-check them before the submission.
const SITE_NOTES = {
  "roubion": "Perseverance's first coring attempt. The rock crumbled, so the tube was sealed holding only Martian air.",
  "rochette": "The first rock cores Perseverance collected successfully.",
  "brac": "Crater-floor rock the science team reported as rich in the mineral olivine.",
  "issole": "A second pair of cores from the same olivine-rich part of the crater floor.",
  "skinner-ridge": "The first cores from the delta: sedimentary rock laid down by water.",
  "wildcat-ridge": "Fine-grained rock in which the rover's instruments detected organic molecules.",
  "observation-mountain": "Regolith: loose sand and dust scooped from the surface, not a drilled core.",
  "cheyava-falls": "The rock with 'leopard spots' that NASA announced in 2024 as a possible sign of ancient microbial life, pending study on Earth.",
  "shallow-bay": "The first sample from the crater rim, among the oldest rock the rover has reached.",
};

// Stops ticked when the site first opens.
const DEFAULT_ROUTE = ["brac", "three-forks", "wildcat-ridge"];

const STOPS = (() => {
  const sites = SAMPLE_SITES.map(s => ({ ...s, note: SITE_NOTES[s.id] || "" }));
  const depot = {
    id: "three-forks", name: "Three Forks sample depot", region: "Sample depot", isDepot: true,
    lat: DEPOT.lat, lon: DEPOT.lon, elev: DEPOT.elev, positionSol: DEPOT.positionSol, samples: DEPOT.samples,
    note: "Perseverance's backup cache: one tube from each sampled rock up to then, laid on the ground. A crew could pick them up by hand.",
  };
  // Keep the list in the order the rover reached each place: the depot comes after the delta front.
  const at = sites.findIndex(s => s.region === "Upper Fan");
  sites.splice(at < 0 ? sites.length : at, 0, depot);
  return sites.map(s => ({ ...s, on: DEFAULT_ROUTE.includes(s.id) }));
})();

// Assumptions. None of these are NASA-approved limits:
// they are starting values to show on screen and adjust.
const ASSUME = {
  // EVA limits are tiered: green inside the ideal value, amber between ideal and
  // hard limit, red beyond the hard limit. The team chose these values from an AI
  // (Gemini) summary of Apollo and ISS practice. They have no cited source yet.
  evaIdealH: 6,            // ideal EVA is 4 to 6 hours
  evaLimitH: 8,            // 8 hours is the contingency maximum
  paceKmh: 2.7,            // walking pace on level ground: 0.75 m/s, the Apollo-based NASA value
  minutesPerStop: 30,      // work time at each stop
  routeWiggle: 1.21,       // fallback only (no terrain model): NASA's field walkback study found
                           // real paths 7% longer than straight lines on average, up to 21%
  walkBackIdealH: 1,       // ideal: no stop more than a 1-hour walk from the habitat
  walkBackLimitH: 2,       // emergency maximum walk home
  sunsetMarginIdealH: 2,   // ideal: back 2 hours before sunset
  sunsetMarginMinH: 1,     // minimum: back 1 hour before sunset
  startLTST: 9,            // EVA start, local true solar time (hours)
  tauAmber: 1.0,           // dust opacity where caution starts
  tauRed: 2.0,             // dust opacity where the EVA is scrubbed
  tempMinC: -90,           // coldest air temperature allowed during the EVA
};

// Fallback weather, shown only if NASA's feed cannot be reached.
// Dust opacity (tau) is not in the public feed, so the dashboard
// always treats it as a simulated value the user can drag.
const SAMPLE_WEATHER = {
  tau: 0.6, highC: -22, lowC: -82, pressurePa: 740,
};
