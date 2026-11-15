// Mars clock and sun position.
// Equations from Allison & McEwen (2000), the same ones behind
// NASA GISS's Mars24 app: https://www.giss.nasa.gov/tools/mars24/help/algorithm.html

const MarsTime = (() => {
  const rad = d => d * Math.PI / 180;
  const deg = r => r * 180 / Math.PI;
  const mod = (x, n) => ((x % n) + n) % n;

  const SOL_IN_DAYS = 1.0274912517;
  const TT_MINUS_UTC_S = 69.184; // leap seconds (37) + 32.184

  function core(date) {
    const jdUT = 2440587.5 + date.getTime() / 86400000;
    const jdTT = jdUT + TT_MINUS_UTC_S / 86400;
    const dt = jdTT - 2451545.0;

    const M = 19.3871 + 0.52402073 * dt;            // mean anomaly
    const aFMS = 270.3871 + 0.524038496 * dt;       // fictitious mean sun
    const A = [0.0071, 0.0057, 0.0039, 0.0037, 0.0021, 0.0020, 0.0018];
    const tau = [2.2353, 2.7543, 1.1177, 15.7866, 2.1354, 2.4694, 32.8493];
    const phi = [49.409, 168.173, 191.837, 21.736, 15.704, 95.528, 49.095];
    let pbs = 0;
    for (let i = 0; i < 7; i++) pbs += A[i] * Math.cos(rad(0.985626 * dt / tau[i] + phi[i]));

    const Mr = rad(M);
    const nuMinusM = (10.691 + 3e-7 * dt) * Math.sin(Mr) + 0.623 * Math.sin(2 * Mr)
      + 0.050 * Math.sin(3 * Mr) + 0.005 * Math.sin(4 * Mr) + 0.0005 * Math.sin(5 * Mr) + pbs;

    const Ls = mod(aFMS + nuMinusM, 360);           // season: 0 = northern spring
    const LsR = rad(Ls);
    const eotDeg = 2.861 * Math.sin(2 * LsR) - 0.071 * Math.sin(4 * LsR)
      + 0.035 * Math.sin(6 * LsR) - nuMinusM;       // equation of time

    const msd = (jdTT - 2451549.5) / SOL_IN_DAYS + 44796.0 - 0.0009626; // Mars Sol Date
    const mst = mod(24 * msd, 24);                  // time at 0° longitude
    const decl = deg(Math.asin(0.42565 * Math.sin(LsR))) + 0.25 * Math.sin(LsR);

    return { Ls, eotH: eotDeg / 15, msd, mst, decl };
  }

  // Everything the dashboard needs for one place and moment.
  function at(date, latN, lonE) {
    const c = core(date);
    const lmst = mod(c.mst + lonE / 15, 24);        // local mean solar time
    const ltst = mod(lmst + c.eotH, 24);            // local true solar time (sundial time)

    const hourAngle = rad((ltst - 12) * 15);
    const sinEl = Math.sin(rad(c.decl)) * Math.sin(rad(latN))
      + Math.cos(rad(c.decl)) * Math.cos(rad(latN)) * Math.cos(hourAngle);
    const sunElevation = deg(Math.asin(sinEl));

    // Sunrise and sunset in true solar time (ignores terrain and refraction).
    const cosH = -Math.tan(rad(latN)) * Math.tan(rad(c.decl));
    const halfDayH = deg(Math.acos(Math.max(-1, Math.min(1, cosH)))) / 15;

    return {
      Ls: c.Ls, lmst, ltst, sunElevation, decl: c.decl,
      sunriseLTST: 12 - halfDayH, sunsetLTST: 12 + halfDayH,
      localSolNumber: Math.floor(c.msd + lonE / 360),
    };
  }

  // Mars 2020 mission sol: sol 0 is the local day of landing (18 Feb 2021).
  function missionSol(date, lonE) {
    const landing = new Date(Date.UTC(2021, 1, 18, 20, 55, 0));
    return at(date, 0, lonE).localSolNumber - at(landing, 0, lonE).localSolNumber;
  }

  // Where the sun is in the sky at a given local true solar time (hours).
  // decl = the sun's declination in degrees (from at().decl). Returns degrees:
  // elevation above the horizon, and azimuth clockwise from north.
  function sunPosition(decl, latN, ltst) {
    const d = rad(decl), p = rad(latN), H = rad((ltst - 12) * 15);
    const elevation = deg(Math.asin(Math.sin(d) * Math.sin(p) + Math.cos(d) * Math.cos(p) * Math.cos(H)));
    const azimuth = mod(deg(Math.atan2(-Math.cos(d) * Math.sin(H), Math.sin(d) * Math.cos(p) - Math.cos(d) * Math.sin(p) * Math.cos(H))), 360);
    return { elevation, azimuth };
  }

  function season(Ls) {
    return ["Northern spring", "Northern summer", "Northern autumn", "Northern winter"][Math.floor(Ls / 90) % 4];
  }

  function hhmm(hours) {
    const h = mod(hours, 24);
    const m = Math.round(h * 60);
    return String(Math.floor(m / 60) % 24).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  }

  return { at, missionSol, sunPosition, season, hhmm };
})();
