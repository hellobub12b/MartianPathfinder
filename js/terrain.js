// Terrain: loads the Jezero elevation model, computes slope,
// and finds the fastest safe walking route between two points.
//
// Data: MRO CTX stereo terrain model, 20 m per cell, made by USGS for
// Mars 2020 landing navigation. It is an equirectangular grid in metres
// on a sphere of radius 3,396,190 m, so  x = R × longitude,  y = R × latitude
// (angles in radians).

const Terrain = (() => {
  const R = SITE.marsRadiusM;
  const RAD = Math.PI / 180;
  let W = 0, H = 0, elev = null, slope = null;
  let x0 = 0, y0 = 0, resX = 0, resY = 0;   // top-left corner and cell size (resY is negative)
  let dx = 0, dy = 0;                        // true ground size of one cell, metres
  let ready = false;

  async function load(url) {
    const buf = await (await fetch(url)).arrayBuffer();
    const tiff = await GeoTIFF.fromArrayBuffer(buf);
    const img = await tiff.getImage();
    W = img.getWidth(); H = img.getHeight();
    [x0, y0] = img.getOrigin();
    [resX, resY] = img.getResolution();
    const noData = img.getGDALNoData();
    elev = await img.readRasters({ samples: [0], interleave: true });
    for (let i = 0; i < elev.length; i++) {
      const z = elev[i];
      if (!(z > -1e4 && z < 1e5) || z === noData) elev[i] = NaN;
    }
    // East-west cells shrink with latitude on a lat/lon grid.
    const midLat = (y0 + resY * H / 2) / R;
    dx = Math.abs(resX) * Math.cos(midLat);
    dy = Math.abs(resY);
    computeSlope();
    ready = true;
    if (sandFeatures) buildSandMask();
  }

  // Fine detail from the HiRISE terrain model (5 m grid) for the main walking area.
  // The route finder still works on the 20 m grid, but each 20 m cell that HiRISE covers
  // now knows how steep and how bumpy the ground inside it is:
  //   steepness = the slope that three quarters of its 5 m patches stay under
  //   roughness = how much those 5 m slopes differ from each other (degrees)
  // A cell's slope becomes the larger of the CTX slope and this HiRISE steepness.
  let rough = null, fineCells = 0;
  async function loadFine(metaUrl, binUrl) {
    const m = await fetch(metaUrl).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
    const v = new Uint16Array(await fetch(binUrl).then(r => r.arrayBuffer()));
    const z = (i, j) => { const q = v[j * m.width + i]; return q ? q / 10 - 5000 : NaN; };
    const midLat = (m.y0 - m.height * m.cellM / 2) / R;
    const fx = m.cellM * Math.cos(midLat), fy = m.cellM;
    const bins = new Map();   // 20 m cell index -> list of 5 m slopes inside it
    for (let j = 1; j < m.height - 1; j++) for (let i = 1; i < m.width - 1; i++) {
      const gx = (z(i + 1, j) - z(i - 1, j)) / (2 * fx), gy = (z(i, j - 1) - z(i, j + 1)) / (2 * fy);
      const s = Math.atan(Math.hypot(gx, gy)) / RAD;
      if (s !== s) continue;
      const c = Math.floor((m.x0 + (i + 0.5) * m.cellM - x0) / resX), r = Math.floor((m.y0 - (j + 0.5) * m.cellM - y0) / resY);
      if (!inside(c, r)) continue;
      const k = r * W + c;
      if (!bins.has(k)) bins.set(k, []);
      bins.get(k).push(s);
    }
    rough = new Float32Array(W * H);
    for (const [k, list] of bins) {
      if (list.length < 8) continue;
      list.sort((a, b) => a - b);
      const mean = list.reduce((a, b) => a + b, 0) / list.length;
      rough[k] = Math.sqrt(list.reduce((a, b) => a + (b - mean) ** 2, 0) / list.length);
      slope[k] = Math.max(slope[k], list[Math.floor(list.length * 0.75)]);
      fineCells++;
    }
    return { cells: fineCells, bounds: m.bounds };
  }

  // Elevations for a rectangle of the map, thinned so no side has more than maxN points.
  // Used by the 3D view. The rectangle is trimmed to what the terrain model covers.
  function grid(south, west, north, east, maxN) {
    const cA = Math.max(1, colOf(west)), cB = Math.min(W - 2, colOf(east));
    const rA = Math.max(1, rowOf(north)), rB = Math.min(H - 2, rowOf(south));
    const step = Math.max(1, Math.ceil(Math.max(cB - cA, rB - rA) / (maxN - 1)));
    const w = Math.floor((cB - cA) / step) + 1, h = Math.floor((rB - rA) / step) + 1;
    const z = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) z[j * w + i] = elev[(rA + j * step) * W + cA + i * step];
    return {
      w, h, z, cellM: dy * step,
      west: lonOf(cA), east: lonOf(cA + (w - 1) * step), north: latOf(rA), south: latOf(rA + (h - 1) * step),
      widthM: (w - 1) * step * dx, heightM: (h - 1) * step * dy,
    };
  }

  // A coloured picture of any quantity that depends only on elevation (used for pressure).
  function elevationImage(valueAt, lo, hi, ramp) {
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d"), im = ctx.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      const z = elev[i];
      if (z !== z) continue;
      const t = Math.max(0, Math.min(0.9999, (valueAt(z) - lo) / (hi - lo))) * (ramp.length - 1), k = Math.floor(t), f = t - k;
      for (let ch = 0; ch < 3; ch++) im.data[i * 4 + ch] = ramp[k][ch] + (ramp[k + 1][ch] - ramp[k][ch]) * f;
      im.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(im, 0, 0);
    return cv.toDataURL("image/png");
  }
  function elevationRange() {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < elev.length; i++) { const z = elev[i]; if (z === z) { if (z < lo) lo = z; if (z > hi) hi = z; } }
    return [lo, hi];
  }

  // Mapped sand (GeoJSON polygons in latitude/longitude). The polygons are painted onto
  // a picture the size of the terrain grid; every painted cell counts as sand.
  let sand = null, sandFeatures = null;
  function setSand(features) {
    sandFeatures = features;
    if (ready) buildSandMask();
  }
  function buildSandMask() {
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    ctx.beginPath();
    for (const f of sandFeatures) {
      const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [];
      for (const poly of polys) for (const ring of poly) {
        ring.forEach(([lon, lat], i) => {
          const x = (R * lon * RAD - x0) / resX, y = (R * lat * RAD - y0) / resY;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        });
        ctx.closePath();
      }
    }
    ctx.fill("evenodd");   // holes in a polygon stay unpainted
    const px = ctx.getImageData(0, 0, W, H).data;
    sand = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) sand[i] = px[i * 4 + 3] > 127 ? 1 : 0;
  }
  const onSand = (lat, lon) => { const c = colOf(lon), r = rowOf(lat); return !!(sand && inside(c, r) && sand[r * W + c]); };

  // Steepness of the ground at each cell, in degrees.
  function computeSlope() {
    slope = new Float32Array(W * H).fill(NaN);
    for (let r = 1; r < H - 1; r++) {
      for (let c = 1; c < W - 1; c++) {
        const i = r * W + c;
        const gx = (elev[i + 1] - elev[i - 1]) / (2 * dx);
        const gy = (elev[i - W] - elev[i + W]) / (2 * dy);
        slope[i] = Math.atan(Math.hypot(gx, gy)) / RAD;
      }
    }
  }

  const colOf = lon => Math.round((R * lon * RAD - x0) / resX - 0.5);
  const rowOf = lat => Math.round((R * lat * RAD - y0) / resY - 0.5);
  const lonOf = c => (x0 + (c + 0.5) * resX) / R / RAD;
  const latOf = r => (y0 + (r + 0.5) * resY) / R / RAD;
  const inside = (c, r) => c >= 1 && r >= 1 && c < W - 1 && r < H - 1;

  function bounds() {
    return [[latOf(H - 0.5), lonOf(-0.5)], [latOf(-0.5), lonOf(W - 0.5)]];
  }

  function elevationAt(lat, lon) {
    const c = colOf(lon), r = rowOf(lat);
    return inside(c, r) ? elev[r * W + c] : NaN;
  }

  // Suited walking speed in km/h for a given grade (rise over run), from NASA's
  // Apollo-based model in config.js: fastest on level ground, slower on any slope.
  // This is the speed at the base pace; the pace slider scales it afterwards.
  const walkKmh = grade => {
    const slopeDeg = Math.abs(Math.atan(grade)) / RAD;
    return Math.max(SUIT.minSpeedMs, SUIT.levelSpeedMs - SUIT.lossPerDegreeMs * slopeDeg) * 3.6;
  };
  const topKmh = SUIT.levelSpeedMs * 3.6;

  // A* search for the fastest route. Each cell links to its 8 neighbours.
  // Step cost = walking time, raised on steep ground. Cells steeper than
  // ROUTING.maxSlopeDeg are off-limits.
  function search(c0, r0, c1, r1, margin) {
    const cMin = Math.max(1, Math.min(c0, c1) - margin), cMax = Math.min(W - 2, Math.max(c0, c1) + margin);
    const rMin = Math.max(1, Math.min(r0, r1) - margin), rMax = Math.min(H - 2, Math.max(r0, r1) + margin);
    const w = cMax - cMin + 1, h = rMax - rMin + 1, n = w * h;
    const g = new Float32Array(n).fill(Infinity);
    const parent = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const start = (r0 - rMin) * w + (c0 - cMin), goal = (r1 - rMin) * w + (c1 - cMin);

    const heur = k => {
      const ddx = ((k % w) - (c1 - cMin)) * dx, ddy = (Math.floor(k / w) - (r1 - rMin)) * dy;
      return Math.hypot(ddx, ddy) / 1000 / topKmh; // hours at top speed: never an overestimate
    };

    // Binary min-heap of [priority, cell].
    const hp = [], hk = [];
    const push = (p, k) => {
      let i = hp.length; hp.push(p); hk.push(k);
      while (i > 0) {
        const up = (i - 1) >> 1;
        if (hp[up] <= p) break;
        hp[i] = hp[up]; hk[i] = hk[up]; i = up;
      }
      hp[i] = p; hk[i] = k;
    };
    const pop = () => {
      const top = hk[0], p = hp.pop(), k = hk.pop(), len = hp.length;
      if (len) {
        let i = 0;
        for (;;) {
          let ch = 2 * i + 1;
          if (ch >= len) break;
          if (ch + 1 < len && hp[ch + 1] < hp[ch]) ch++;
          if (hp[ch] >= p) break;
          hp[i] = hp[ch]; hk[i] = hk[ch]; i = ch;
        }
        hp[i] = p; hk[i] = k;
      }
      return top;
    };

    const stepLen = [dx, dx, dy, dy, Math.hypot(dx, dy), Math.hypot(dx, dy), Math.hypot(dx, dy), Math.hypot(dx, dy)];
    const stepC = [1, -1, 0, 0, 1, 1, -1, -1], stepR = [0, 0, 1, -1, 1, -1, 1, -1];

    g[start] = 0; push(heur(start), start);
    while (hp.length) {
      const k = pop();
      if (closed[k]) continue;
      closed[k] = 1;
      if (k === goal) break;
      const kc = k % w, kr = (k - kc) / w;
      const zi = elev[(kr + rMin) * W + kc + cMin];
      for (let d = 0; d < 8; d++) {
        const nc = kc + stepC[d], nr = kr + stepR[d];
        if (nc < 0 || nr < 0 || nc >= w || nr >= h) continue;
        const nk = nr * w + nc;
        if (closed[nk]) continue;
        const gi = (nr + rMin) * W + nc + cMin;
        const s = slope[gi], z = elev[gi];
        if (z !== z || s !== s) continue;                       // no data
        if (s > ROUTING.maxSlopeDeg && nk !== goal) continue;   // too steep
        const hours = stepLen[d] / 1000 / walkKmh((z - zi) / stepLen[d]);
        let cost = hours * (1 + ROUTING.steepPenalty * (s / ROUTING.maxSlopeDeg) ** 2);
        if (rough && rough[gi]) cost *= 1 + ROUTING.roughPenalty * Math.min(1, rough[gi] / ROUTING.roughFullDeg); // prefer smooth ground
        if (sand && sand[gi]) cost *= ROUTING.sandPenalty;      // go around mapped sand if a detour is short enough
        const ng = g[k] + cost;
        if (ng < g[nk]) { g[nk] = ng; parent[nk] = k; push(ng + heur(nk), nk); }
      }
    }
    if (!closed[goal]) return null;
    const cells = [];
    for (let k = goal; k !== -1; k = parent[k]) cells.push([k % w + cMin, Math.floor(k / w) + rMin]);
    return cells.reverse();
  }

  // The closest cell (within 5 cells, about 100 m) that is not steeper than the limit.
  function nearestAllowed(c, r) {
    if (!(slope[r * W + c] > ROUTING.maxSlopeDeg)) return { cell: [c, r], shortM: 0 };
    let best = null;
    for (let dr = -5; dr <= 5; dr++) for (let dc = -5; dc <= 5; dc++) {
      const cc = c + dc, rr = r + dr;
      if (!inside(cc, rr)) continue;
      const s = slope[rr * W + cc], d = Math.hypot(dc * dx, dr * dy);
      if (s === s && s <= ROUTING.maxSlopeDeg && (!best || d < best.shortM)) best = { cell: [cc, rr], shortM: d };
    }
    return best || { cell: [c, r], shortM: 0 };
  }

  // Route between two {lat, lon} points. Returns null if no safe route exists.
  // hoursAtBasePace is walking time at the base pace, before the pace slider is applied.
  function route(from, to) {
    if (!ready) return null;
    let c0 = colOf(from.lon), r0 = rowOf(from.lat), c1 = colOf(to.lon), r1 = rowOf(to.lat);
    if (!inside(c0, r0) || !inside(c1, r1)) return null;
    // If an end point sits on ground steeper than the limit, walk to the nearest
    // allowed cell beside it instead (the crew works from the foot of the slope).
    const a = nearestAllowed(c0, r0), b = nearestAllowed(c1, r1);
    [c0, r0] = a.cell; [c1, r1] = b.cell;
    const margin = Math.round(ROUTING.searchMarginM / dy);
    const cells = search(c0, r0, c1, r1, margin) || search(c0, r0, c1, r1, Math.max(W, H));
    if (!cells) return null;

    const out = { latlngs: [], profile: [], lengthM: 0, ascentM: 0, descentM: 0, hoursAtBasePace: 0, maxSlopeDeg: 0, sandM: 0, shortM: b.shortM };
    let prev = null;
    for (const [c, r] of cells) {
      const z = elev[r * W + c];
      if (prev) {
        const run = Math.hypot((c - prev.c) * dx, (r - prev.r) * dy), rise = z - prev.z;
        out.lengthM += Math.hypot(run, rise);
        if (rise > 0) out.ascentM += rise; else out.descentM -= rise;
        out.hoursAtBasePace += run / 1000 / walkKmh(rise / run);
        out.maxSlopeDeg = Math.max(out.maxSlopeDeg, slope[r * W + c]);
        if (sand && sand[r * W + c]) out.sandM += run;
      }
      out.latlngs.push([latOf(r), lonOf(c)]);
      out.profile.push([out.lengthM, z]);
      prev = { c, r, z };
    }
    return out;
  }

  // Slope hazard picture for the map: clear = easy, yellow to red = steeper.
  function slopeImage() {
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d"), im = ctx.createImageData(W, H), px = im.data;
    for (let i = 0; i < W * H; i++) {
      const s = slope[i];
      let c = null;
      if (s > ROUTING.maxSlopeDeg) c = [214, 48, 49, 200];
      else if (s > ROUTING.cautionSlopeDeg) c = [235, 130, 50, 160];
      else if (s > 5) c = [240, 220, 110, 90];
      if (c) px.set(c, i * 4);
    }
    ctx.putImageData(im, 0, 0);
    return cv.toDataURL("image/png");
  }

  return { load, route, elevationAt, bounds, slopeImage, walkKmh, setSand, onSand, hasSand: () => !!sand, loadFine, hasFine: () => fineCells > 0, grid, elevationImage, elevationRange, isReady: () => ready, cellSizeM: () => dy };
})();
