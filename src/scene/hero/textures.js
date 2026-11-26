// Procedural, seamlessly tileable water normal map (no external assets).
// Height field = sum of periodic value-noise octaves + a few integer-frequency
// directional swells, then central-difference normals with wrap-around.
import { CanvasTexture, RepeatWrapping, NoColorSpace, LinearMipmapLinearFilter, LinearFilter } from 'three';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { mulberry32 };

function periodicValueNoise(size, period, rand) {
  // lattice of period x period random values, sampled with quintic interpolation; wraps exactly
  const lat = new Float32Array(period * period);
  for (let i = 0; i < lat.length; i++) lat[i] = rand() * 2 - 1;
  const out = new Float32Array(size * size);
  const s = period / size;
  for (let y = 0; y < size; y++) {
    const fy = y * s; const y0 = Math.floor(fy); const ty = fy - y0;
    const uy = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
    const ya = (y0 % period) * period; const yb = ((y0 + 1) % period) * period;
    for (let x = 0; x < size; x++) {
      const fx = x * s; const x0 = Math.floor(fx); const tx = fx - x0;
      const ux = tx * tx * tx * (tx * (tx * 6 - 15) + 10);
      const xa = x0 % period; const xb = (x0 + 1) % period;
      const a = lat[ya + xa], b = lat[ya + xb], c = lat[yb + xa], d = lat[yb + xb];
      out[y * size + x] = (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy;
    }
  }
  return out;
}

export function createWaterNormals(size = 512, seed = 7) {
  const rand = mulberry32(seed);
  const h = new Float32Array(size * size);
  // noise octaves (periods must divide nothing in particular: wrapping is by lattice modulo)
  const octaves = [
    { p: 4, a: 1.0 },
    { p: 8, a: 0.55 },
    { p: 16, a: 0.3 },
    { p: 32, a: 0.16 },
    { p: 64, a: 0.08 }
  ];
  for (const o of octaves) {
    const n = periodicValueNoise(size, o.p, rand);
    for (let i = 0; i < h.length; i++) h[i] += n[i] * o.a;
  }
  // directional swells with integer frequencies (tile-safe) to give the river a flow direction
  const swells = [
    { kx: 3, ky: 9, a: 0.12, ph: rand() * 6.28 },
    { kx: -5, ky: 13, a: 0.08, ph: rand() * 6.28 },
    { kx: 11, ky: 21, a: 0.05, ph: rand() * 6.28 }
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (const w of swells) v += Math.sin(((w.kx * x + w.ky * y) / size) * Math.PI * 2 + w.ph) * w.a;
      h[y * size + x] += v;
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const strength = size / 64; // slope scale
  for (let y = 0; y < size; y++) {
    const ym = ((y - 1 + size) % size) * size, yp = ((y + 1) % size) * size, yc = y * size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size, xp = (x + 1) % size;
      const dx = (h[yc + xp] - h[yc + xm]) * strength;
      const dy = (h[yp + x] - h[ym + x]) * strength;
      let nx = -dx, ny = -dy, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const i = (yc + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = NoColorSpace;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}
