# Sources

Every dataset, service, tool and reference the Marswalk Planner uses, for the Space Apps submission. Add a row whenever something new goes into the project.

## NASA data used in the site

| What | Mission · instrument | Provider | Link | Used for |
| --- | --- | --- | --- | --- |
| Jezero detail imagery, 25 cm/px | MRO · HiRISE | NASA Mars Trek | https://trek.nasa.gov/tiles/Mars/EQ/JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd/1.0.0/WMTSCapabilities.xml | Base map, zoomed in |
| Jezero context imagery, 6 m/px | MRO · CTX | NASA Mars Trek | https://trek.nasa.gov/tiles/Mars/EQ/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0/1.0.0/WMTSCapabilities.xml | Base map |
| Global color mosaic, 232 m/px | Viking Orbiter · MDIM 2.1 | NASA Mars Trek | https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/WMTSCapabilities.xml | Base map, zoomed out |
| Global color elevation, 463 m/px | MGS · MOLA | NASA Mars Trek | https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/WMTSCapabilities.xml | Elevation overlay |
| Night infrared mosaic, 100 m/px | Mars Odyssey · THEMIS | NASA Mars Trek | https://trek.nasa.gov/tiles/Mars/EQ/THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018/1.0.0/WMTSCapabilities.xml | Night-time heat overlay (rock vs. dust) |
| Day infrared mosaic, 100 m/px | Mars Odyssey · THEMIS | NASA Mars Trek | https://trek.nasa.gov/tiles/Mars/EQ/THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018/1.0.0/WMTSCapabilities.xml | Day-time heat overlay |
| Jezero terrain model, 20 m/cell | MRO · CTX stereo (Mars 2020 Terrain Relative Navigation mosaic) | USGS Astrogeology | https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif | Slope hazard layer, route finding, elevation profile |
| Perseverance traverse path | Mars 2020 | NASA/JPL-Caltech (mission map) | https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json | Rover track on the map |
| Perseverance waypoints | Mars 2020 | NASA/JPL-Caltech (mission map) | https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json | Rover position, science stop locations |
| Surface weather: air temperature, pressure | Mars 2020 · MEDA | NASA Planetary Data System, Atmospheres Node | https://pds-atmospheres.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/ | Conditions panel, temperature check, daily temperature chart |
| Dust in the air by season, Mars Years 24–36 (column dust optical depth) | MGS · TES, Mars Odyssey · THEMIS, MRO · Mars Climate Sounder | Montabone et al. dust climatology v2, hosted by LMD (France) | https://www-mars.lmd.jussieu.fr/mars/dust_climatology/ | Dust chart, dust scenarios and the dust go/no-go check |
| Surface dust cover, 3.5 km/px | MGS · TES Dust Cover Index (Ruff & Christensen 2002) | NASA Mars Trek | https://trek.nasa.gov/tiles/Mars/EQ/tes_ruffdust/1.0.0/WMTSCapabilities.xml | Surface dust cover overlay |
| Geologic map of Jezero crater and Nili Planum (SIM 3464), eolian bedform unit | Sun & Stack (2020), built on MRO CTX and HiRISE | USGS | https://pubs.usgs.gov/sim/3464/ | Sand and ripples layer (144 mapped eolian bedform areas) and the Rock units layer (11 units), clipped to Jezero |
| Mineral maps: CRISM browse products MAF, CAR and PHY for observations FRT00005C5E (2007), FRT000047A3 (2007) and FRT0001FB74 (2011), 18 m/px | MRO · CRISM | NASA Planetary Data System, Geosciences Node | https://pds-geosciences.wustl.edu/mro/mro-m-crism-5-rdr-mptargeted-v1/mrocr_4001/browse/ | The three mineral layers |
| Perseverance sample list: names, sample numbers, sols and dates sealed, rock types, where each tube is now (page dated 20 June 2026) | Mars 2020 | NASA Science | https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples/ | Science stop names, the samples listed at each stop, the depot contents |
| Official names and coordinates: Jezero, Neretva Vallis, Sava Vallis, Pliva Vallis, Belva, Nili Planum | IAU Gazetteer of Planetary Nomenclature | USGS Astrogeology | https://planetarynames.wr.usgs.gov/ | Blue place-name pins |
| Surface wind speed and direction, derived wind files (DER_WS), sols 36–65 | Mars 2020 · MEDA wind sensor | NASA Planetary Data System, Atmospheres Node | https://pds-atmospheres.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_derived_env/ | Wind panel (speed, direction by hour) and the wind flow animation |
| Thermal inertia, quantitative mosaic tile 00N060E, 100 m/px (method: Fergason et al. 2006; stated accuracy about 20%) | Mars Odyssey · THEMIS | USGS Astrogeology | https://astrogeology.usgs.gov/search/map/themis_thermal_inertia_mosaic_quantitative_00n060e_100mpp | Thermal inertia layer, the value in the cursor read-out and in each stop's popup |
| Jezero HiRISE terrain model, 1 m/px (Mars 2020 Terrain Relative Navigation mosaic), sampled to 5 m over the main walking area | MRO · HiRISE stereo | USGS Astrogeology | https://planetarymaps.usgs.gov/mosaic/mars2020_trn/HiRISE/ | Sharper slope and a roughness measure for routing near the habitat (the energy-budget rule) |
| Atmospheric composition, scale height (11.0 km) | NASA Mars Fact Sheet | NASA NSSDC (Goddard) | https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html | Atmosphere panel; the scale height turns measured pressure into the Air pressure layer |
| Daily weather feed (backup only) | Mars 2020 · MEDA | NASA/JPL-Caltech | https://mars.nasa.gov/rss/api/?feed=weather&category=mars2020&feedtype=json | Used only if the archive summary is missing |

## NASA tools and portals used to find the data

| What | Link | Used for |
| --- | --- | --- |
| NASA Mars Trek | https://trek.nasa.gov/mars/ | Finding the Jezero map layers and their tile addresses. Also the wording of what the CRISM colours mean |
| Mars Orbital Data Explorer (ODE) REST service | https://oderest.rsl.wustl.edu/ | Finding which CRISM observations cover the delta |
| TWO FIGURES SUPPLIED BY THE TEAM (screenshots): a three-panel location map of Jezero with Belva crater, Western fan, Kodiak, Three Forks, Séítah fm and Máaz fm; and a map of abrasion sites with an elevation chart | CITATION NEEDED: add the paper each figure comes from | Positions of the informal names Western fan, Kodiak, Séítah formation and Máaz formation, read from the first figure's tick marks and scale bar |
| Mars 2020 MEDA archive page | https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html | Finding the weather files |
| MEDA release notes | https://pds-atmospheres.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/document/meda_release_notes.txt | Checking which measurements exist (no dust opacity, no wind after sol 315) |

## Methods and references

| What | Link | Used for |
| --- | --- | --- |
| Mars24 algorithm (Allison & McEwen 2000), NASA GISS | https://www.giss.nasa.gov/tools/mars24/help/algorithm.html | Mars local time, season, sunrise and sunset |
| "A Consolidated Tool for Planning and Analyzing Simulated Exploration Traverses and Associated Metabolic Workload", Kim et al., NASA JSC, ICES-2025-129 | https://ntrs.nasa.gov/citations/20250006519 | Suited walking speed model (V = −0.01·S + 0.75 m/s) and the 20° slope limit |
| "Automated astronaut traverses with minimum metabolic workload", Peña-Asensio et al., Acta Astronautica 214 (2024) | https://doi.org/10.1016/j.actaastro.2023.10.010 | Original source of that speed model (fit to Apollo 12 and 14 walking data). Full text not yet read: check whether S is degrees or percent |
| "The Walkback Test: A Study to Evaluate Suit and Life Support System Performance Requirements for a 10 Kilometer Traverse in a Planetary Suit", NASA JSC (2007) | https://ntrs.nasa.gov/citations/20070016007 | Measured suited pace: 10 km in 95.8 min (3.94 mph), 6 astronauts, MKIII suit, lunar gravity |
| "Feasibility of Suited 10-km Ambulation 'Walkback' on the Moon", Norcross et al., NASA (2008) | https://ntrs.nasa.gov/citations/20080014853 | Same test: suit mass 121 kg, study limits, and the finding that the suit was "extremely limited" at Mars gravity |
| "The Effects of Terrain and Navigation on Human Extravehicular Activity Walkback Performance on the Moon", Norcross et al., NASA (2008) | https://ntrs.nasa.gov/citations/20080014286 | Real paths 7% longer than straight lines (up to 21%): used for the straight-line fallback |
| "Metabolic and Subjective Results Review of the Integrated Suit Test Series", Norcross et al., NASA (2009) | https://ntrs.nasa.gov/citations/20090007828 | NASA planning pace bands: 1.5–3 km/h within a site, 4–5 km/h between sites, over 6.5 km/h walkback |
| NASA Technical Reports Server | https://ntrs.nasa.gov/ | Finding the reports above |
| Same walkback report (Norcross et al. 2008), "Planning / PLSS Sizing Data" table | https://ntrs.nasa.gov/citations/20080014853 | Suit consumable use rates. Walkback test: oxygen 0.4 lb/h, cooling water 3.1 lb/h, 599 kcal/h. Apollo average: oxygen 0.15 lb/h, cooling water 0.98 lb/h, 233 kcal/h |
| Hassler et al., "Mars' Surface Radiation Environment Measured with the Mars Science Laboratory's Curiosity Rover", Science (online Dec 2013) | https://doi.org/10.1126/science.1244797 | Radiation panel: 0.21 mGy/day absorbed dose, 0.64 mSv/day dose equivalent at Gale Crater. DOI and the 0.64 value are from memory (a press release says 0.67): verify |
| Apollo backpack (PLSS) capacities for Apollo 15–17: cooling water 11.5 lb, battery 390 Wh, 8-hour EVA | https://en.wikipedia.org/wiki/Primary_life_support_system (found via search; NASA original: Apollo Lunar Surface Journal, https://www.nasa.gov/wp-content/uploads/static/history/alsj/plss.html) | Tank sizes in the Suit consumables panel. Replace the Wikipedia link with the NASA page after checking the numbers there |
| Montabone et al. (2015), "Eight-year climatology of dust optical depth on Mars", Icarus | https://doi.org/10.1016/j.icarus.2014.12.034 | How the dust record was made. Also the source to check for the 2.6 infrared-to-visible conversion factor used in the site |
| Montabone et al. (2020), "Martian Year 34 Column Dust Climatology from Mars Climate Sounder Observations", JGR Planets | https://doi.org/10.1029/2019JE006111 | The Mars Year 34–36 part of the dust record (2018 global storm). DOI from memory: verify |
| Ruff & Christensen (2002), "Bright and dark regions on Mars: Particle size and mineralogical characteristics based on TES data", JGR 107(E12), 5127 | Citation as given by NASA Mars Trek | The Dust Cover Index |

## Open-source software

| What | Link | Used for |
| --- | --- | --- |
| Leaflet 1.9.4 | https://leafletjs.com/ | The map |
| geotiff.js 2.1.3 | https://geotiffjs.github.io/ | Reading the terrain model in the browser |
| three.js 0.147.0 | https://threejs.org/ | The 3D view |
| gdal3.js 2.8.1 (GDAL compiled for the browser) | https://github.com/bugra9/gdal3.js | Data prep only: converting the USGS geodatabase to GeoJSON |
| Google Fonts: Archivo, IBM Plex Sans, IBM Plex Mono | https://fonts.google.com/ | Typefaces |

## Looked at, not used

| What | Link | Why not |
| --- | --- | --- |
| Jezero HiRISE terrain model, 1 m/cell | https://planetarymaps.usgs.gov/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif | 1.8 GB: needs cropping before a browser can load it |
| Canadian Space Agency open data portal | https://donnees-data.asc-csa.gc.ca/en/dataset/ | Not yet checked for Mars data |

## Not from a data source

These are in the site but are not measured data. Say so in the submission.

- Dust: the values are real orbital measurements from past Mars years, matched to today's season. They are not a live reading for today. The "custom value" scenario is hand-set. The infrared-to-visible factor (2.6) is from memory of Montabone et al. (2015) and needs checking.
- Looked for and not found at Jezero: mapped dune fields (USGS Mars Global Digital Dune Database on Mars Trek has none there; it only lists fields over about 1 km²).
- EVA safety limits: EVA length (ideal up to 6 h, maximum 8 h), walk-back (ideal up to 1 h, maximum 2 h), sunset margin (ideal 2 h, minimum 1 h). The team chose these from a Google Gemini summary that described them as based on Apollo and ISS practice. Gemini gave no references, so these have no citable source yet. Find a NASA document for each before submitting, or present them as team assumptions.
- Other thresholds (dust, temperature, minutes per stop): team assumptions in `site/js/config.js`. The slope limit and walking speeds come from the NASA reports above.
- The walking speed model is from Apollo (Moon gravity). NASA's test found walking in the MKIII suit much harder at Mars gravity, and gave no Mars speed figure that we could extract. Say this in the submission.
- Science stops: names, samples, dates, sols and rock types are NASA's. Each position is the rover's recorded position on (or just before) the sol the first sample there was sealed, so it is the rover's parking spot, within a few metres of the outcrop. The one-line context notes (`SITE_NOTES` in `config.js`) are written by the team from memory of NASA news and need fact-checking.
- NASA's sample page does not use the name "Three Forks" or give the depot's tube count. "Three Forks" comes from the team's figure; the count (9 samples plus 1 witness tube) is tallied from NASA's table.
- Samples 29 (Bell Island) and 30 (Gallants) are not on the map: NASA's page gives no seal sol for them yet.
- The abrasion sites in the team's second figure (Dourbes, Quartier, Montpezat, Solva, Solitude Lake, Ouzel Falls, Lake Haiyaha, Gabletop Mountain, Thunderbolt Peak, Amherst Point, Bill's Bay, Castle Geyser, Old Faithful Geyser) are not pinned: the figure has no coordinates to read them from.
- 3D view: the surface is the same MRO CTX 20 m terrain model, with the same Mars Trek imagery (Viking, CTX, HiRISE) draped on it. Heights are exaggerated (2× by default, adjustable), so slopes look steeper than they are. Sunlight direction is computed for the chosen local time on today's date with the Mars24 equations, but hills do not cast shadows, and the imagery already contains the shadows from when each photo was taken. The sky colour is decorative.
- Energy-budget rule: the 15° limit and the 10° caution level are the team's rule (NASA's traverse model uses 20°). Where HiRISE detail exists, a 20 m cell's slope is the larger of the CTX slope and the slope that three quarters of its 5 m HiRISE patches stay under; roughness is the spread of those 5 m slopes. Both definitions, and the penalties that make the route prefer gentle, smooth ground, are the team's. The HiRISE grid takes every fifth row of the 1 m model, so it can miss narrow features. When a stop itself sits on ground over 15° (Skinner Ridge does, at about 22° in the HiRISE data), the route ends at the nearest allowed ground within 100 m and says how far short it stops.
- Air pressure layer: computed, not measured everywhere. It is Perseverance's average measured pressure, moved to each spot's elevation with p = p₀·e^(−Δz/H), H = 11 km. It ignores weather and time of day.
- Radiation: measured at Gale Crater, not Jezero, in 2012–13. Jezero is about 1.9 km higher than Gale's floor, so its true dose is probably a little higher. No map layer was made because the dose barely varies across a few kilometres.
- Suit consumables: the use rates are NASA's, but they are for a 1960s–2000s suit in Moon gravity. The oxygen tank size (1.8 lb) is from memory and unverified. Battery drain is assumed steady (390 Wh over 8 hours). Sliding the walking rate between the Apollo average and the walkback rate by pace is the team's assumption, and so are the 25% and 10% reserve levels. Slopes do not change the use rate.
- Sand avoidance: the sand areas are USGS's. How strongly the route avoids them (sand counted as 5 times slower when choosing a path) and the 100 m caution threshold are team values. Walking time is not increased on sand, because we have no measured suited speed on sand.
- Thermal inertia: the values are USGS's. The plain-word reading of a value ("sand", "rocky ground") uses rule-of-thumb break points from memory, not from the USGS product; check against Fergason et al. (2006). The layer's colours stretch between the 2nd and 98th percentile of values in the Jezero window (182 to 569).
- Wind flow animation: simulated. The speed and direction are real hourly averages from Perseverance (30 sols in 2021, early northern spring, the only season-matched wind NASA has: the sensor was damaged after sol 315). The animation spreads that single measured value over the whole map and adds random wobble; it does not model wind bending around terrain. The direction is read as "blowing from, clockwise from north"; the file label does not state the convention, but the result (afternoon wind from the east, night wind from the west) matches published descriptions of Jezero. Verify in the MEDA data guide.
- Preset missions: the stops, names and goals are the team's. What each "gathers" is counted from NASA's sample table (the samples Perseverance took at those stops). The link between a mission and its mineral map is the team's suggestion, not a NASA statement.
- Weather season: the temperature and pressure readings are from sols 1356–1385, the same season one Mars year before mid-November 2026.
- Mineral layers: the site also blurs them slightly, mutes their colours and blends them with the photo beneath. The colours suggest minerals but do not prove them, and the images are contrast-stretched by the site (2nd to 98th percentile per colour) because the NASA files display very dark. They are noisy.
- Mars clock checks made on 14 Nov 2026: sol number, local mean time and local true solar time match a MEDA file timestamp (sol 1859 start) to within about 10 seconds; season (Ls) matches NASA's weather feed and the Mars24 worked example; sunrise and sunset match NASA's feed for sol 1133 to the minute.
