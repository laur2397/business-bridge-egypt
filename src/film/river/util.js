// Small math / timeline helpers for the river chapter.
export const DEG = Math.PI / 180;
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const dampK = (lambda, dt) => 1 - Math.exp(-lambda * dt);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Keyframed parameter table. keys: [{ p, a: number, b: [r,g,b], ... }] sorted by p.
 * Values are blended with a smoothstep between neighbouring keys (no overshoot).
 */
export function sampleKeys(keys, p, out = {}) {
  let i = 0;
  while (i < keys.length - 2 && p > keys[i + 1].p) i++;
  const k0 = keys[i], k1 = keys[i + 1];
  const t0 = clamp((p - k0.p) / (k1.p - k0.p));
  const t = t0 * t0 * (3 - 2 * t0);
  for (const name in k0) {
    if (name === 'p') continue;
    const a = k0[name], b = k1[name] ?? a;
    if (Array.isArray(a)) {
      const o = out[name] || (out[name] = new Array(a.length));
      for (let j = 0; j < a.length; j++) o[j] = a[j] + (b[j] - a[j]) * t;
    } else out[name] = a + (b - a) * t;
  }
  return out;
}

/**
 * Non-uniform cubic Hermite (Catmull-Rom tangents) over keys [{p, v:[...] }].
 * Smooth C1 path through every key, parameterised by progress.
 */
export function hermiteKeys(keys, p, out) {
  const n = keys.length;
  if (p <= keys[0].p) { for (let j = 0; j < out.length; j++) out[j] = keys[0].v[j]; return out; }
  if (p >= keys[n - 1].p) { for (let j = 0; j < out.length; j++) out[j] = keys[n - 1].v[j]; return out; }
  let i = 0;
  while (i < n - 2 && p > keys[i + 1].p) i++;
  const k0 = keys[i], k1 = keys[i + 1];
  const km = keys[Math.max(0, i - 1)], kp = keys[Math.min(n - 1, i + 2)];
  const h = k1.p - k0.p;
  const t = (p - k0.p) / h;
  const t2 = t * t, t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
  for (let j = 0; j < out.length; j++) {
    // tangents (per unit progress), zero at the path ends so the move eases in/out
    const m0 = i === 0 ? 0 : (k1.v[j] - km.v[j]) / (k1.p - km.p);
    const m1 = i + 1 === n - 1 ? 0 : (kp.v[j] - k0.v[j]) / (kp.p - k0.p);
    out[j] = h00 * k0.v[j] + h10 * h * m0 + h01 * k1.v[j] + h11 * h * m1;
  }
  return out;
}

// 1D smooth value noise for handheld camera motion
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const h = (n) => { const s = Math.sin((n + seed * 57.13) * 127.1) * 43758.5453; return s - Math.floor(s); };
  const u = f * f * (3 - 2 * f);
  return (h(i) * (1 - u) + h(i + 1) * u) * 2 - 1;
}
