// Small deterministic helpers shared by the shape builders.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gauss(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Catmull-Rom through pts (array of [x,y,z]) then resampled to `res` samples at uniform arc length. */
export function resampleCurve(pts, res, sub = 24) {
  const dense = [];
  const P = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let s = 0; s < sub; s++) {
      const t = s / sub, t2 = t * t, t3 = t2 * t;
      const o = [0, 0, 0];
      for (let k = 0; k < 3; k++) {
        o[k] = 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      }
      dense.push(o);
    }
  }
  dense.push(pts[pts.length - 1].slice());
  const cum = [0];
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1], b = dense[i];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  const L = cum[cum.length - 1];
  const out = new Float32Array(res * 3);
  let j = 0;
  for (let i = 0; i < res; i++) {
    const s = (L * i) / (res - 1);
    while (j < dense.length - 2 && cum[j + 1] < s) j++;
    const f = (s - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
    for (let k = 0; k < 3; k++) out[i * 3 + k] = dense[j][k] + (dense[j + 1][k] - dense[j][k]) * f;
  }
  return { pts: out, length: L };
}

export function pointInRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function distToPolyline(line, x, y) {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const ax = line[i][0], ay = line[i][1], bx = line[i + 1][0], by = line[i + 1][1];
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    const d = Math.hypot(ax + dx * t - x, ay + dy * t - y);
    if (d < best) best = d;
  }
  return best;
}

/** Sample `n` points evenly (by length) along a polyline of [x,y] pairs. Returns array of [x,y]. */
export function samplePolyline(line, n, rng) {
  const cum = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  const L = cum[cum.length - 1];
  const out = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = rng ? rng() * L : (L * i) / n;
    j = 0;
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] < s) lo = m; else hi = m; }
    j = lo;
    const f = (s - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
    out.push([line[j][0] + (line[j + 1][0] - line[j][0]) * f, line[j][1] + (line[j + 1][1] - line[j][1]) * f]);
  }
  return out;
}
