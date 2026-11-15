// Wind flow animation: streaks drifting across the map in the wind's direction.
//
// This is a SIMULATION for display. The direction and speed are one measured value
// (Perseverance's average for that hour of the day) applied to the whole map, with a
// little random wobble so it reads as moving air. Real wind bends around hills and
// crater walls; this does not.

const WindLayer = (() => {
  let map, canvas, ctx, raf = 0, shown = false;
  let wind = null;                 // { speed: m/s, from: degrees clockwise from north }
  let particles = [];
  const COUNT = 260;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function attach(leafletMap) {
    map = leafletMap;
    canvas = L.DomUtil.create("canvas", "wind-canvas", map.getContainer());
    ctx = canvas.getContext("2d");
    map.on("resize", resize);
    map.on("movestart zoomstart", () => ctx.clearRect(0, 0, canvas.width, canvas.height));
    resize();
  }

  function resize() {
    const s = map.getSize();
    canvas.width = s.x; canvas.height = s.y;
    particles = Array.from({ length: COUNT }, spawn);
    if (shown && still) drawArrows();
  }

  const spawn = () => ({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, age: Math.random() * 90 });

  // Screen direction the air moves toward: opposite of where it comes from.
  function heading() {
    const to = (wind.from + 180) * Math.PI / 180;
    return { x: Math.sin(to), y: -Math.cos(to) };
  }

  function frame() {
    raf = requestAnimationFrame(frame);
    if (!wind || !(wind.speed > 0)) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
    // Fade what is already drawn, so each streak leaves a short tail.
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0,0,0,0.07)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "rgba(235,242,255,0.75)";
    ctx.lineWidth = 1.2;
    const h = heading(), px = 0.5 + wind.speed * 0.32;   // pixels per frame: faster wind, faster streaks
    ctx.beginPath();
    for (const p of particles) {
      const wobble = (Math.random() - 0.5) * 0.5;
      const nx = p.x + (h.x - h.y * wobble) * px, ny = p.y + (h.y + h.x * wobble) * px;
      ctx.moveTo(p.x, p.y); ctx.lineTo(nx, ny);
      p.x = nx; p.y = ny; p.age++;
      if (p.age > 110 || nx < 0 || ny < 0 || nx > canvas.width || ny > canvas.height) Object.assign(p, spawn(), { age: 0 });
    }
    ctx.stroke();
  }

  // For people who ask for less motion: a still grid of arrows.
  function drawArrows() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!wind || !(wind.speed > 0)) return;
    const h = heading(), len = 10 + wind.speed * 2;
    ctx.strokeStyle = "rgba(235,242,255,0.8)"; ctx.lineWidth = 1.5;
    for (let y = 40; y < canvas.height; y += 70) for (let x = 40; x < canvas.width; x += 70) {
      const ex = x + h.x * len, ey = y + h.y * len;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey);
      ctx.lineTo(ex - h.x * 5 - h.y * 3, ey - h.y * 5 + h.x * 3); ctx.moveTo(ex, ey);
      ctx.lineTo(ex - h.x * 5 + h.y * 3, ey - h.y * 5 - h.x * 3); ctx.stroke();
    }
  }

  function show(on) {
    shown = on;
    canvas.style.display = on ? "" : "none";
    cancelAnimationFrame(raf);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!on) return;
    if (still) drawArrows(); else frame();
  }

  function set(w) {
    wind = w;
    if (shown && still) drawArrows();
  }

  return { attach, show, set };
})();
