// 3D view: the terrain model as a surface, with NASA imagery draped over it,
// the planned route, the stops, and sunlight from the real sun direction.
//
// Built with three.js. Distances are in metres: x = east, y = up, z = south.
// Heights can be exaggerated (slider) so gentle relief is easier to see.

const View3D = (() => {
  let host, renderer, scene, camera, controls, raf = 0;
  let area = null;            // { south, west, north, east, widthM, heightM, zMin, grid }
  let terrainMesh, routeMesh, markers, sun, photoTexture, slopeTexture;
  let routePoints = [];       // [{lat, lon}] along the route
  let exaggeration = 2, fly = null, opts = null;

  const MAX_GRID = 420;       // most vertices along one side of the surface

  // ----- coordinates -----
  const xOf = lon => ((lon - area.west) / (area.east - area.west) - 0.5) * area.widthM;
  const zOf = lat => ((area.north - lat) / (area.north - area.south) - 0.5) * area.heightM;
  function yOf(lat, lon) {
    // Height from the surface grid (so things sit exactly on the drawn terrain).
    const g = area.grid;
    const i = Math.max(0, Math.min(g.w - 1, Math.round((lon - area.west) / (area.east - area.west) * (g.w - 1))));
    const j = Math.max(0, Math.min(g.h - 1, Math.round((area.north - lat) / (area.north - area.south) * (g.h - 1))));
    const z = g.z[j * g.w + i];
    return ((z === z ? z : area.zMin) - area.zMin) * exaggeration;
  }
  const at = (lat, lon, liftM = 0) => new THREE.Vector3(xOf(lon), yOf(lat, lon) + liftM, zOf(lat));

  // ----- imagery -----
  // Stitch Mars Trek tiles covering the area into one picture.
  async function buildPhoto() {
    const lonSpan = area.east - area.west, latSpan = area.north - area.south;
    const cv = document.createElement("canvas");
    const pxPerDeg = Math.min(2048 / lonSpan, 2048 / latSpan);
    cv.width = Math.round(lonSpan * pxPerDeg); cv.height = Math.round(latSpan * pxPerDeg);
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#6b5a4c"; ctx.fillRect(0, 0, cv.width, cv.height);

    for (const def of LAYERS.filter(l => l.kind === "base")) {
      // Deepest zoom that is useful for this picture size, within what the layer has.
      const want = Math.ceil(Math.log2(pxPerDeg * 180 / 256));
      const z = Math.max(0, Math.min(def.maxNativeZoom, want));
      const tileDeg = 180 / 2 ** z;
      const x0 = Math.floor((area.west + 180) / tileDeg), x1 = Math.floor((area.east + 180) / tileDeg);
      const y0 = Math.floor((90 - area.north) / tileDeg), y1 = Math.floor((90 - area.south) / tileDeg);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 150) continue;
      const jobs = [];
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        jobs.push(new Promise(done => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            const px = (x * tileDeg - 180 - area.west) * pxPerDeg, py = (90 - y * tileDeg - area.north) * -pxPerDeg;
            ctx.drawImage(img, px, py, tileDeg * pxPerDeg + 0.5, tileDeg * pxPerDeg + 0.5);
            done();
          };
          img.onerror = done;   // tiles outside a layer's coverage simply do not exist
          img.src = def.url.replace("{z}", z).replace("{y}", y).replace("{x}", x);
        }));
      }
      await Promise.all(jobs);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8;
    return tex;
  }

  // The slope hazard picture covers the whole terrain model: cut out this area's part.
  function buildSlopeTexture() {
    return new Promise(done => {
      const img = new Image();
      img.onload = () => {
        const [[s, w], [n, e]] = Terrain.bounds();
        const cv = document.createElement("canvas");
        cv.width = 1024; cv.height = Math.round(1024 * area.heightM / area.widthM);
        const sx = (area.west - w) / (e - w) * img.width, sy = (n - area.north) / (n - s) * img.height;
        const sw = (area.east - area.west) / (e - w) * img.width, sh = (area.north - area.south) / (n - s) * img.height;
        cv.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
        const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding;
        done(tex);
      };
      img.onerror = () => done(null);
      img.src = Terrain.slopeImage();
    });
  }

  // ----- scene pieces -----
  function buildTerrain() {
    const g = area.grid;
    const geo = new THREE.PlaneGeometry(area.widthM, area.heightM, g.w - 1, g.h - 1);
    geo.rotateX(-Math.PI / 2);          // lay the plane flat: its rows now run north to south
    const pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const z = g.z[k];
      pos.setY(k, ((z === z ? z : area.zMin) - area.zMin) * exaggeration);
    }
    geo.computeVertexNormals();
    if (terrainMesh) { scene.remove(terrainMesh); terrainMesh.geometry.dispose(); }
    terrainMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: photoTexture || null, color: 0xffffff }));
    scene.add(terrainMesh);
    if (slopeMesh) { scene.remove(slopeMesh); slopeMesh = null; }
    applySlope();
  }

  // Slope colours are a second, see-through copy of the surface just above the first.
  let slopeMesh = null, slopeOn = false;
  function applySlope() {
    if (slopeMesh) slopeMesh.visible = slopeOn;
    if (!slopeOn || slopeMesh || !slopeTexture || !terrainMesh) return;
    slopeMesh = new THREE.Mesh(terrainMesh.geometry, new THREE.MeshBasicMaterial({ map: slopeTexture, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    scene.add(slopeMesh);
  }

  function label(text, colour, shape) {
    const cv = document.createElement("canvas"); cv.width = cv.height = 128;
    const c = cv.getContext("2d");
    c.fillStyle = colour; c.strokeStyle = "#14110f"; c.lineWidth = 10;
    c.beginPath();
    if (shape === "square") c.roundRect(14, 14, 100, 100, 16); else c.arc(64, 64, 50, 0, Math.PI * 2);
    c.fill(); c.stroke();
    c.fillStyle = "#14110f"; c.font = "700 64px 'IBM Plex Mono', monospace"; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(text, 64, 68);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false }));
    sprite.renderOrder = 10;
    return sprite;
  }

  function buildRouteAndMarkers() {
    if (routeMesh) { scene.remove(routeMesh); routeMesh.geometry.dispose(); routeMesh = null; }
    if (markers) scene.remove(markers);
    markers = new THREE.Group();
    const size = Math.max(area.widthM, area.heightM);

    const inside = p => p.lat > area.south && p.lat < area.north && p.lon > area.west && p.lon < area.east;
    const pts = routePoints.filter(inside).map(p => at(p.lat, p.lon, size * 0.0025));
    if (pts.length > 1) {
      const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.1);
      routeMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.min(4000, pts.length * 2), size * 0.0018, 6, false), new THREE.MeshBasicMaterial({ color: 0xe48a5c }));
      routeMesh.userData.curve = curve;
      scene.add(routeMesh);
    }

    const pole = new THREE.LineBasicMaterial({ color: 0xffffff });
    const addPin = (p, text, colour, shape) => {
      if (!inside(p)) return;
      const base = at(p.lat, p.lon), top = base.clone(); top.y += size * 0.035;
      markers.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([base, top]), pole));
      const s = label(text, colour, shape); s.position.copy(top); s.scale.setScalar(size * 0.028);
      markers.add(s);
    };
    addPin(opts.habitat, "H", "#ffffff", "square");
    opts.stops.forEach((s, i) => addPin(s, String(i + 1), s.custom ? "#ffffff" : "#e48a5c", s.isDepot ? "square" : "circle"));
    scene.add(markers);
  }

  // Sunlight from where the sun really is at the chosen local solar time.
  function setSunTime(ltst) {
    const p = MarsTime.sunPosition(opts.sunDeclination, opts.habitat.lat, ltst);
    const el = Math.max(p.elevation, 2) * Math.PI / 180, az = p.azimuth * Math.PI / 180;
    sun.position.set(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)).multiplyScalar(area.widthM);
    // Brightness rises smoothly from the horizon: no sudden jump at sunrise or sunset.
    sun.intensity = 0.08 + 1.02 * Math.max(0, Math.sin(p.elevation * Math.PI / 180));
    return p;
  }

  // ----- camera -----
  function homeCamera() {
    const size = Math.max(area.widthM, area.heightM);
    camera.position.set(0, size * 0.55, size * 0.75);     // from the south, looking north
    controls.target.set(0, 0, 0);
    controls.update();
  }

  // Walk the route: the camera follows the path from just behind and above.
  function toggleFly() {
    if (fly) { fly = null; controls.enabled = true; return false; }
    if (!routeMesh) return false;
    fly = { t: 0, last: performance.now(), seconds: Math.max(20, Math.min(70, routePoints.length / 12)) };
    controls.enabled = false;
    return true;
  }
  function stepFly(now) {
    const curve = routeMesh.userData.curve, size = Math.max(area.widthM, area.heightM);
    fly.t += (now - fly.last) / 1000 / fly.seconds; fly.last = now;
    if (fly.t >= 1) { fly = null; controls.enabled = true; opts.onFlyEnd && opts.onFlyEnd(); return; }
    const here = curve.getPointAt(fly.t), ahead = curve.getPointAt(Math.min(1, fly.t + 0.03));
    const back = here.clone().sub(ahead).setY(0).normalize().multiplyScalar(size * 0.06);
    const want = here.clone().add(back); want.y += size * 0.035;
    camera.position.lerp(want, 0.06);
    controls.target.lerp(ahead, 0.1);
    camera.lookAt(controls.target);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (fly) stepFly(now); else controls.update();
    renderer.render(scene, camera);
  }

  function resize() {
    if (!renderer) return;
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  // ----- public -----
  // o: { host, bounds:[[s,w],[n,e]], route:[{lat,lon}], stops, habitat, sunDeclination, ltst, onFlyEnd }
  async function show(o) {
    opts = o; host = o.host;
    const [[s, w], [n, e]] = o.bounds;
    const grid = Terrain.grid(s, w, n, e, MAX_GRID);
    let zMin = Infinity;
    for (const z of grid.z) if (z === z && z < zMin) zMin = z;
    area = { south: grid.south, west: grid.west, north: grid.north, east: grid.east, widthM: grid.widthM, heightM: grid.heightM, zMin, grid };
    routePoints = o.route;

    if (!renderer) {
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      renderer.outputEncoding = THREE.sRGBEncoding;
      host.appendChild(renderer.domElement);
      camera = new THREE.PerspectiveCamera(50, 1, 5, 400000);
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.maxPolarAngle = Math.PI * 0.49;      // do not go under the ground
      controls.enableDamping = true;
      window.addEventListener("resize", resize);
    }
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xc9a27e);   // butterscotch Martian sky
    scene.fog = new THREE.Fog(0xc9a27e, area.widthM * 1.2, area.widthM * 4);
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    sun = new THREE.DirectionalLight(0xfff1e0, 1);
    scene.add(sun);
    terrainMesh = routeMesh = markers = slopeMesh = null;
    photoTexture = slopeTexture = null;
    fly = null; controls.enabled = true;
    controls.minDistance = area.widthM * 0.02; controls.maxDistance = area.widthM * 2.5;

    buildTerrain();
    buildRouteAndMarkers();
    setSunTime(o.ltst);
    resize();
    homeCamera();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);

    // Imagery arrives a moment later and is swapped in.
    buildPhoto().then(tex => { photoTexture = tex; if (terrainMesh) { terrainMesh.material.map = tex; terrainMesh.material.needsUpdate = true; } });
    buildSlopeTexture().then(tex => { slopeTexture = tex; applySlope(); });
    return { widthKm: area.widthM / 1000, heightKm: area.heightM / 1000, cellM: grid.cellM };
  }

  function hide() { cancelAnimationFrame(raf); fly = null; }
  function setExaggeration(x) { exaggeration = x; if (!area) return; buildTerrain(); buildRouteAndMarkers(); }
  function setSlope(on) { slopeOn = on; applySlope(); }

  return { show, hide, setExaggeration, setSunTime, setSlope, toggleFly, homeCamera, resize };
})();
