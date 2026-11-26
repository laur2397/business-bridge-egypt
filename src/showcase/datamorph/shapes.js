// CPU-side target generation for the five DataMorph states.
// Every state is a Float32Array(N*4). Static particles store (x, y, z, kind + f) where the
// brightness is 1 - f (f in [0, .9]). Curve ("flowing") particles store
// (curveRow, u0, 1 + round(b*8) + lateral, kind) and are evaluated on the GPU every frame.
import * as THREE from 'three';
import { feature } from 'topojson-client';
import { EGYPT_RINGS } from '../../scene/globe/egypt.js';
import { buildMasks, buildLandDots } from '../../scene/globe/landmask.js';
import { mulberry32, gauss, resampleCurve, pointInRing, distToPolyline, samplePolyline } from './rand.js';

export const K = {
  AMBIENT: 0, NEBULA: 1, FILL: 2, OUTLINE: 3, NILE: 4, CAIRO: 5, COAST: 6, BANK: 7, SEA: 8,
  SHIP: 9, LANE: 10, ARC: 11, GRID: 12, BLOCK: 13, PORT: 14, LAND: 15, OCEAN: 16, EGLAND: 17,
  GARC: 18, RIM: 19, TEXT: 20, DELTA: 21, RIPPLE: 22, ZONE: 23, GARCS: 24, GCITY: 25,
};
export const KIND_COUNT = 26;
export const CURVE_RES = 256;

// ---------------------------------------------------------------- buffers
class StateBuf {
  constructor(N, rng) { this.N = N; this.a = new Float32Array(N * 4); this.n = 0; this.rng = rng; }
  get left() { return this.N - this.n; }
  push(x, y, z, kind, bright = 1) {
    if (this.n >= this.N) return;
    const i = this.n++ * 4;
    const f = Math.min(0.9, Math.max(0, 1 - bright));
    this.a[i] = x; this.a[i + 1] = y; this.a[i + 2] = z; this.a[i + 3] = kind + f;
  }
  pushV(v, kind, bright) { this.push(v[0], v[1], v[2], kind, bright); }
  pushCurve(row, u0, lateral, kind, bright = 1) {
    if (this.n >= this.N) return;
    const i = this.n++ * 4;
    this.a[i] = row; this.a[i + 1] = u0;
    this.a[i + 2] = 1 + Math.round(Math.max(0, Math.min(1, bright)) * 8) + Math.min(0.99, Math.max(0, lateral));
    this.a[i + 3] = kind;
  }
  budget(frac) { return Math.min(this.left, Math.round(this.N * frac)); }
  ambient() {
    const r = this.rng;
    while (this.n < this.N) {
      const x = -9.5 + r() * 17, y = -5.5 + r() * 11, z = -8 + r() * 10.5;
      this.push(x, y, z, K.AMBIENT, 0.35 + 0.65 * r());
    }
  }
  shuffle() {
    const a = this.a, r = this.rng;
    for (let i = this.N - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      for (let k = 0; k < 4; k++) { const t = a[i * 4 + k]; a[i * 4 + k] = a[j * 4 + k]; a[j * 4 + k] = t; }
    }
    return a;
  }
}

class Curves {
  constructor() { this.rows = []; }
  /** pts in final (state) coordinates. speed in world units / second. */
  add(pts, speed) {
    const { pts: s, length } = resampleCurve(pts, CURVE_RES);
    this.rows.push({ s, uSpeed: speed / Math.max(1e-6, length), length });
    return { row: this.rows.length - 1, length };
  }
  texture() {
    const h = Math.max(1, this.rows.length);
    const data = new Float32Array(CURVE_RES * h * 4);
    this.rows.forEach((r, y) => {
      for (let i = 0; i < CURVE_RES; i++) {
        const o = (y * CURVE_RES + i) * 4;
        data[o] = r.s[i * 3]; data[o + 1] = r.s[i * 3 + 1]; data[o + 2] = r.s[i * 3 + 2]; data[o + 3] = r.uSpeed;
      }
    });
    const t = new THREE.DataTexture(data, CURVE_RES, h, THREE.RGBAFormat, THREE.FloatType);
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
  }
}

function mat(rx, ry, rz = 0) {
  const m = new THREE.Matrix4().makeRotationX(rx);
  m.multiply(new THREE.Matrix4().makeRotationY(ry));
  if (rz) m.multiply(new THREE.Matrix4().makeRotationZ(rz));
  return m;
}
function xf(m, x, y, z = 0) {
  const v = new THREE.Vector3(x, y, z).applyMatrix4(m);
  return [v.x, v.y, v.z];
}

// ---------------------------------------------------------------- text sampling
function sampleText(text, n, rng, { width = 6.6, z = -3.2, y = 0, x = 0 } = {}) {
  if (typeof document === 'undefined' || !n) return [];
  const c = document.createElement('canvas');
  c.width = 1400; c.height = 420;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const setFont = (px) => {
    ctx.font = `200 ${px}px "Archivo Variable", "Archivo", sans-serif`;
    try { ctx.fontStretch = 'extra-condensed'; } catch (e) { /* older engines */ }
  };
  setFont(330);
  const w = ctx.measureText(text).width;
  const scale = Math.min(1, 1300 / Math.max(1, w));
  setFont(Math.round(330 * scale));
  ctx.fillText(text, c.width / 2, c.height / 2 + 10);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const px = [];
  for (let yy = 0; yy < c.height; yy += 2) for (let xx = 0; xx < c.width; xx += 2) if (d[(yy * c.width + xx) * 4] > 140) px.push(xx, yy);
  if (!px.length) return [];
  const s = width / c.width;
  const out = [];
  for (let i = 0; i < n; i++) {
    const k = Math.floor(rng() * (px.length / 2)) * 2;
    out.push([x + (px[k] + rng() * 2 - c.width / 2) * s, y - (px[k + 1] + rng() * 2 - c.height / 2) * s, z + (rng() - 0.5) * 0.05]);
  }
  return out;
}

// ---------------------------------------------------------------- geography helpers
const EG = EGYPT_RINGS[0];
const D2R = Math.PI / 180;
const LON0 = 30.8, LAT0 = 26.85, MS = 0.5, CLAT = Math.cos(LAT0 * D2R);
const proj = (lon, lat) => [(lon - LON0) * CLAT * MS, (lat - LAT0) * MS];

// Nile course (lon, lat), south to north — Lake Nasser, Aswan, Qena bend, Asyut, Cairo, Delta apex.
const NILE_STEM = [
  [31.30, 21.80], [31.62, 22.30], [31.95, 22.66], [32.25, 23.05], [32.56, 23.45], [32.86, 23.96],
  [32.90, 24.09], [32.93, 24.47], [32.87, 24.98], [32.55, 25.29], [32.64, 25.69], [32.73, 26.12],
  [32.50, 26.12], [32.24, 26.06], [31.70, 26.56], [31.18, 27.18], [30.84, 27.73], [30.75, 28.10],
  [30.92, 28.60], [31.10, 29.07], [31.30, 29.70], [31.23, 30.04], [31.12, 30.20],
];
const LAKE_NASSER = NILE_STEM.slice(0, 6);
const ROSETTA = [[31.12, 30.20], [30.97, 30.45], [30.83, 30.80], [30.70, 31.05], [30.52, 31.26], [30.40, 31.42], [30.34, 31.52]];
const DAMIETTA = [[31.12, 30.20], [31.20, 30.47], [31.32, 30.75], [31.38, 31.04], [31.58, 31.28], [31.74, 31.44], [31.80, 31.52]];
const CAIRO = [31.235, 30.044];

function coastLat(lon) { // Mediterranean coast latitude across the Delta (from the 110m outline)
  const pts = [[30.095, 31.474], [30.977, 31.557], [31.689, 31.43], [32.193, 31.26]];
  for (let i = 0; i < pts.length - 1; i++) if (lon <= pts[i + 1][0]) {
    const f = (lon - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
    return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * Math.max(0, f);
  }
  return 31.3;
}

function coastPolylines(topo, bbox) {
  const geo = feature(topo, topo.objects.land);
  const lines = [];
  const inB = (p) => p[0] >= bbox[0] && p[0] <= bbox[2] && p[1] >= bbox[1] && p[1] <= bbox[3];
  for (const f of geo.features || [geo]) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const poly of polys) for (const ring of poly) {
      let cur = [];
      for (let i = 0; i < ring.length; i++) {
        if (inB(ring[i])) cur.push(ring[i]);
        else { if (cur.length > 1) lines.push(cur); cur = []; }
      }
      if (cur.length > 1) lines.push(cur);
    }
  }
  return { lines, geo };
}

function landRaster(geo, bbox, res) {
  const W = Math.round((bbox[2] - bbox[0]) / res), H = Math.round((bbox[3] - bbox[1]) / res);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#fff';
  ctx.beginPath();
  for (const f of geo.features || [geo]) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const poly of polys) for (const ring of poly) {
      let ok = false;
      for (const p of ring) if (p[0] > bbox[0] - 20 && p[0] < bbox[2] + 20 && p[1] > bbox[1] - 20 && p[1] < bbox[3] + 20) { ok = true; break; }
      if (!ok) continue;
      ring.forEach((p, i) => {
        const x = ((p[0] - bbox[0]) / res), y = ((bbox[3] - p[1]) / res);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
    }
  }
  ctx.fill('evenodd');
  const d = ctx.getImageData(0, 0, W, H).data;
  const land = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) land[i] = d[i * 4] > 127 ? 1 : 0;
  // chamfer distance (in cells) from any land cell
  const dist = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) dist[i] = land[i] ? 0 : 1e9;
  const pass = (x, y, dx, dy, w) => {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) return;
    const v = dist[ny * W + nx] + w;
    if (v < dist[y * W + x]) dist[y * W + x] = v;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { pass(x, y, -1, 0, 1); pass(x, y, 0, -1, 1); pass(x, y, -1, -1, 1.41); pass(x, y, 1, -1, 1.41); }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { pass(x, y, 1, 0, 1); pass(x, y, 0, 1, 1); pass(x, y, 1, 1, 1.41); pass(x, y, -1, 1, 1.41); }
  return {
    land: (lon, lat) => { const x = Math.floor((lon - bbox[0]) / res), y = Math.floor((bbox[3] - lat) / res); return x >= 0 && y >= 0 && x < W && y < H ? land[y * W + x] : 0; },
    dist: (lon, lat) => { const x = Math.floor((lon - bbox[0]) / res), y = Math.floor((bbox[3] - lat) / res); return x >= 0 && y >= 0 && x < W && y < H ? dist[y * W + x] * res : 9; },
  };
}

// ---------------------------------------------------------------- state builders
function buildDust(N, rng) {
  const b = new StateBuf(N, rng);
  const nArms = b.budget(0.6), nCloud = b.budget(0.14), nStars = b.budget(0.08);
  for (let i = 0; i < nArms; i++) {
    const arm = i % 3;
    const t = Math.pow(rng(), 0.8);
    const r = 0.25 + 5.6 * t;
    const a = arm * (Math.PI * 2 / 3) + t * 3.4 + gauss(rng) * 0.18;
    const spread = (0.04 + 0.26 * t) * (rng() < 0.75 ? 1 : 2.6);
    const x = r * Math.cos(a) + gauss(rng) * spread, y = r * Math.sin(a) + gauss(rng) * spread;
    const z = gauss(rng) * (0.2 + 0.45 * t);
    b.push(x, y, z, K.NEBULA, Math.min(1, (0.35 + 0.65 * rng()) * (1.25 - t * 0.6)));
  }
  // clumpy clouds
  const clumps = [];
  for (let i = 0; i < 26; i++) {
    const r = 0.6 + rng() * 5.2, a = rng() * Math.PI * 2;
    clumps.push([r * Math.cos(a), r * Math.sin(a), gauss(rng) * 0.3, 0.25 + rng() * 0.6]);
  }
  for (let i = 0; i < nCloud; i++) {
    const c = clumps[Math.floor(rng() * clumps.length)];
    b.push(c[0] + gauss(rng) * c[3], c[1] + gauss(rng) * c[3], c[2] + gauss(rng) * c[3] * 0.5, K.NEBULA, 0.3 + 0.5 * rng());
  }
  for (let i = 0; i < nStars; i++) {
    const r = Math.sqrt(rng()) * 7.5, a = rng() * Math.PI * 2;
    b.push(r * Math.cos(a), r * Math.sin(a), gauss(rng) * 0.8, K.NEBULA, 0.15 + 0.5 * rng());
  }
  // out-of-focus foreground bokeh
  const nBok = b.budget(0.012);
  for (let i = 0; i < nBok; i++) b.push(-6 + rng() * 10, -3.5 + rng() * 7, 2.5 + rng() * 5, K.NEBULA, 0.5 + 0.5 * rng());
  // bright core
  const nCore = b.budget(0.04);
  for (let i = 0; i < nCore; i++) b.push(gauss(rng) * 0.35, gauss(rng) * 0.35, gauss(rng) * 0.15, K.NEBULA, 1);
  b.ambient();
  return b.shuffle();
}

export const EGYPT_TILT = mat(-0.46, 0.2, 0.02);

function buildEgypt(N, rng, curves, topo, text) {
  const b = new StateBuf(N, rng);
  const M = EGYPT_TILT;
  const P = (lon, lat, z = 0) => { const [x, y] = proj(lon, lat); return xf(M, x, y, z); };

  // --- outline (crisp, dense) + soft glow halo
  const nOut = b.budget(0.12);
  const ringPts = samplePolyline(EG, nOut, rng);
  for (let i = 0; i < nOut; i++) {
    const [lon, lat] = ringPts[i];
    const soft = rng() < 0.18;
    const j = soft ? 0.05 : 0.006;
    b.pushV(P(lon + gauss(rng) * j, lat + gauss(rng) * j), K.OUTLINE, soft ? 0.45 : 0.75 + 0.25 * rng());
  }

  // --- interior fill: sparse uniform + Nile valley / Delta concentration
  const nFill = b.budget(0.19);
  const stemAndDelta = NILE_STEM.slice(6);
  let made = 0, guard = 0;
  while (made < nFill && guard++ < nFill * 60) {
    const lon = 24.6 + rng() * 12.4, lat = 21.9 + rng() * 9.8;
    if (!pointInRing(EG, lon, lat)) continue;
    const dn = Math.min(distToPolyline(stemAndDelta, lon, lat), distToPolyline(ROSETTA, lon, lat), distToPolyline(DAMIETTA, lon, lat));
    const inDelta = lat > 30.15 && lat < coastLat(lon) && lon > 29.9 + (31.5 - lat) * 0.2 && lon < 32.25 - (31.5 - lat) * 0.6;
    const pAccept = 0.17 + (inDelta ? 0.9 : 0) + 0.85 * Math.exp(-dn / 0.12);
    if (rng() > pAccept) continue;
    const near = dn < 0.3 || inDelta;
    b.pushV(P(lon, lat), K.FILL, near ? 0.6 + 0.4 * rng() : 0.25 + 0.45 * rng());
    made++;
  }

  // --- Nile: flowing curves (two branches share the stem), Delta fan, Lake Nasser
  const nileRows = [];
  for (const branch of [ROSETTA, DAMIETTA]) {
    const pts = [...NILE_STEM, ...branch.slice(1)].map(([lo, la]) => P(lo, la, 0.02));
    nileRows.push(curves.add(pts, 0.22).row);
  }
  const nNile = b.budget(0.085);
  for (let i = 0; i < nNile; i++) {
    const row = nileRows[i % 2];
    const hot = rng() < 0.25;
    b.pushCurve(row, rng(), hot ? 0.004 : 0.008 + rng() * 0.016, K.NILE, hot ? 1 : 0.45 + 0.4 * rng());
  }
  const fanRows = [];
  const fanEnds = [29.95, 30.55, 30.85, 31.1, 31.4, 31.6, 32.05];
  for (const lonEnd of fanEnds) {
    const latEnd = coastLat(lonEnd) - 0.02;
    const mid = [(31.12 + lonEnd) / 2 + (rng() - 0.5) * 0.1, 30.2 + (latEnd - 30.2) * 0.55];
    const pts = [[31.12, 30.2], mid, [lonEnd, latEnd]].map(([lo, la]) => P(lo, la, 0.015));
    fanRows.push(curves.add(pts, 0.12).row);
  }
  const nFan = b.budget(0.04);
  for (let i = 0; i < nFan; i++) b.pushCurve(fanRows[i % fanRows.length], rng(), 0.006 + rng() * 0.02, K.DELTA, 0.35 + 0.5 * rng());
  const nLake = b.budget(0.012);
  const lakePts = samplePolyline(LAKE_NASSER, nLake, rng);
  for (let i = 0; i < nLake; i++) b.pushV(P(lakePts[i][0] + gauss(rng) * 0.05, lakePts[i][1] + gauss(rng) * 0.04, 0.01), K.SEA, 0.9);

  // --- Suez canal hint
  const nCanal = b.budget(0.004);
  for (let i = 0; i < nCanal; i++) {
    const t = rng();
    b.pushV(P(32.31 + (32.55 - 32.31) * t + gauss(rng) * 0.006, 31.26 - (31.26 - 29.95) * t), K.LANE, 0.8);
  }

  // --- Cairo: hot core + ripples
  const cp = P(CAIRO[0], CAIRO[1], 0.03);
  const nCai = b.budget(0.002);
  for (let i = 0; i < nCai; i++) {
    const s = rng() < 0.5 ? 0.01 : 0.03;
    b.push(cp[0] + gauss(rng) * s, cp[1] + gauss(rng) * s, cp[2] + gauss(rng) * s, K.CAIRO, 1);
  }
  const nRip = b.budget(0.01);
  for (let i = 0; i < nRip; i++) b.push(cp[0], cp[1], cp[2], K.RIPPLE, 1);

  // --- neighbouring coasts (Mediterranean / Red Sea / Gulfs) and sea suggestion
  const bbox = [23.4, 21.0, 38.8, 33.7];
  const { lines, geo } = coastPolylines(topo, bbox);
  const segs = [];
  let total = 0;
  for (const l of lines) for (let i = 0; i < l.length - 1; i++) {
    const len = Math.hypot(l[i + 1][0] - l[i][0], l[i + 1][1] - l[i][1]);
    segs.push([l[i], l[i + 1], len]); total += len;
  }
  const nCoast = b.budget(0.05);
  made = 0; guard = 0;
  while (made < nCoast && guard++ < nCoast * 20 && segs.length) {
    let s = rng() * total, k = 0;
    while (k < segs.length - 1 && s > segs[k][2]) { s -= segs[k][2]; k++; }
    const [a, c] = segs[k];
    const f = rng();
    const lon = a[0] + (c[0] - a[0]) * f, lat = a[1] + (c[1] - a[1]) * f;
    if (distToPolyline(EG, lon, lat) < 0.12) continue;
    const edge = Math.min(lon - bbox[0], bbox[2] - lon, lat - bbox[1], bbox[3] - lat);
    if (rng() > Math.min(1, edge / 1.6)) continue;
    b.pushV(P(lon + gauss(rng) * 0.01, lat + gauss(rng) * 0.01), K.COAST, 0.6 + 0.4 * rng());
    made++;
  }
  const ras = landRaster(geo, bbox, 0.05);
  const nSea = b.budget(0.1);
  made = 0; guard = 0;
  while (made < nSea && guard++ < nSea * 80) {
    const lon = bbox[0] + rng() * (bbox[2] - bbox[0]), lat = bbox[1] + rng() * (bbox[3] - bbox[1]);
    if (ras.land(lon, lat)) continue;
    const d = ras.dist(lon, lat);
    const edge = Math.min(lon - bbox[0], bbox[2] - lon, lat - bbox[1], bbox[3] - lat);
    const p = Math.exp(-d / 0.35) * Math.min(1, edge / 1.4);
    if (rng() > p) continue;
    b.pushV(P(lon, lat, -0.01), K.SEA, 0.25 + 0.6 * Math.exp(-d / 0.15) * rng());
    made++;
  }

  if (text) for (const p of sampleText(text, b.budget(0.045), rng, { width: 7.2, z: -3.6, y: 0.1 })) b.pushV(p, K.TEXT, 0.5 + 0.5 * rng());
  b.ambient();
  return b.shuffle();
}

// ---- Suez schematic (plane coords x: east, y: north)
const CANAL = [[0.0, 2.24], [0.0, 1.5], [-0.03, 0.9], [-0.06, 0.42], [0.0, 0.0], [0.08, -0.5], [0.12, -1.0], [0.18, -1.5], [0.28, -2.02]];
const medCoast = (x) => 2.2 + 0.09 * Math.sin(x * 1.1 + 0.4) + 0.045 * Math.sin(x * 2.7 + 1.0) - 0.08 * Math.exp(-((x + 1.2) ** 2) / 0.6);
const GULF_L = [[0.2, -2.02], [0.42, -2.45], [0.75, -2.9], [1.1, -3.35], [1.45, -3.85]];
const GULF_R = [[0.38, -2.0], [0.62, -2.3], [1.05, -2.65], [1.65, -3.05], [2.3, -3.55]];

export const SUEZ_TILT = mat(-0.62, 0.12, 0.04);

function canalLine(off) { return CANAL.map(([x, y]) => [x + off, y, 0]); }

function buildSuez(N, rng, curves, text) {
  const b = new StateBuf(N, rng);
  const M = SUEZ_TILT;
  const P = (x, y, z = 0) => xf(M, x * 0.88, y * 0.88 - 0.3, z * 0.88);

  // banks (two gold lines) + lakes
  const nBank = b.budget(0.06);
  const left = canalLine(-0.15).map((p) => [p[0], p[1]]), right = canalLine(0.15).map((p) => [p[0], p[1]]);
  const lakes = [[-0.06, 0.42, 0.24, 0.16], [0.1, -0.72, 0.3, 0.32], [0.15, -1.18, 0.2, 0.14]];
  for (let i = 0; i < nBank; i++) {
    const r = rng();
    if (r < 0.78) {
      const [p] = samplePolyline(i % 2 ? left : right, 1, rng);
      b.pushV(P(p[0] + gauss(rng) * 0.004, p[1], 0.005), K.BANK, 0.7 + 0.3 * rng());
    } else {
      const L = lakes[Math.floor(rng() * lakes.length)];
      const a = rng() * Math.PI * 2;
      b.pushV(P(L[0] + Math.cos(a) * L[2], L[1] + Math.sin(a) * L[3], 0.003), K.BANK, 0.55);
    }
  }
  // lake water
  const nLakeW = b.budget(0.012);
  for (let i = 0; i < nLakeW; i++) {
    const L = lakes[Math.floor(rng() * lakes.length)];
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng());
    b.pushV(P(L[0] + Math.cos(a) * L[2] * r, L[1] + Math.sin(a) * L[3] * r, 0), K.SEA, 0.6);
  }
  // Port Said breakwaters + harbour lights
  const nBw = b.budget(0.006);
  for (let i = 0; i < nBw; i++) {
    const t = rng(), s = i % 2 ? 1 : -1;
    b.pushV(P(s * (0.16 + 0.07 * t), medCoast(0) + 0.42 * t, 0.004), K.BANK, 0.85);
  }

  // Mediterranean coast line + sea field
  const nCoast = b.budget(0.05);
  for (let i = 0; i < nCoast; i++) {
    const r = rng();
    if (r < 0.55) {
      const x = -3.9 + rng() * 7.8;
      if (Math.abs(x) < 0.15) continue;
      const fade = Math.min(1, (3.9 - Math.abs(x)) / 1.2);
      b.pushV(P(x, medCoast(x) + gauss(rng) * 0.006), K.COAST, (0.45 + 0.55 * rng()) * fade);
    } else {
      const line = r < 0.78 ? GULF_L : GULF_R;
      const [p] = samplePolyline(line, 1, rng);
      b.pushV(P(p[0] + gauss(rng) * 0.006, p[1]), K.COAST, 0.5 + 0.5 * rng());
    }
  }
  const nSea = b.budget(0.2);
  for (let i = 0; i < nSea; i++) {
    if (rng() < 0.68) {
      const x = -4.1 + rng() * 8.2;
      const d = -Math.log(1 - rng() * 0.98) * 0.55;
      const fade = Math.min(1, (4.1 - Math.abs(x)) / 1.5);
      b.pushV(P(x, medCoast(x) + 0.02 + d, -0.005 - d * 0.02), K.SEA, (0.3 + 0.7 * Math.exp(-d / 0.3)) * fade);
    } else {
      const t = rng();
      const [pl] = samplePolyline(GULF_L, 1, () => t), [pr] = samplePolyline(GULF_R, 1, () => t);
      const f = rng();
      b.pushV(P(pl[0] + (pr[0] - pl[0]) * f, pl[1] + (pr[1] - pl[1]) * f, -0.005), K.SEA, 0.3 + 0.5 * rng());
    }
  }
  // desert dust hugging the canal (Sinai east, Africa west)
  const nLand = b.budget(0.06);
  for (let i = 0; i < nLand; i++) {
    const y = -2.0 + rng() * 4.1;
    const side = rng() < 0.5 ? -1 : 1;
    const off = 0.2 + -Math.log(1 - rng() * 0.97) * 0.55;
    const x = side * off + 0.05 * y * -1;
    if (y > medCoast(x) - 0.04) continue;
    b.pushV(P(x, y, 0), K.FILL, 0.25 + 0.6 * Math.exp(-off / 0.5) * rng());
  }
  // schematic land grid
  const nGrid = b.budget(0.07);
  for (let i = 0; i < nGrid; i++) {
    const gx = Math.round((-3.4 + rng() * 6.8) / 0.25) * 0.25, gy = Math.round((-3.2 + rng() * 5.2) / 0.25) * 0.25;
    if (gy > medCoast(gx) - 0.1) continue;
    const arm = (rng() - 0.5) * 0.06;
    const horiz = rng() < 0.5;
    const fade = Math.min(1, (3.6 - Math.abs(gx)) / 1.5) * Math.min(1, (gy + 3.4) / 1.2);
    b.pushV(P(gx + (horiz ? arm : 0), gy + (horiz ? 0 : arm), 0), K.GRID, 0.9 * fade);
  }

  // shipping: northbound (+x lane) and southbound (−x lane) with trade arcs at both ends
  const north = [[0.06, 2.62, 0.04]];
  const tops = [
    [[-0.5, 3.05, 0.25], [-2.1, 3.55, 0.7], [-4.9, 4.0, 1.3]],
    [[0.4, 3.05, 0.25], [1.7, 3.6, 0.7], [4.4, 4.3, 1.3]],
    [[-0.15, 3.15, 0.3], [-0.8, 4.0, 0.8], [-1.5, 5.2, 1.4]],
  ];
  const bottoms = [
    [[0.72, -2.55, 0.0], [1.1, -3.05, 0.1], [1.7, -3.6, 0.35], [2.9, -4.4, 0.8], [5.0, -5.3, 1.4]],
    [[0.68, -2.55, 0.0], [1.0, -3.1, 0.1], [1.35, -3.7, 0.35], [1.75, -4.7, 0.8], [2.1, -6.0, 1.4]],
    [[0.7, -2.55, 0.0], [1.15, -3.0, 0.1], [2.0, -3.4, 0.4], [3.6, -3.6, 0.9], [5.6, -3.4, 1.4]],
  ];
  const shipRows = [];
  for (let v = 0; v < 3; v++) {
    for (const dir of [1, -1]) {
      const lane = canalLine(0.06 * dir);
      const bot = bottoms[(v + (dir > 0 ? 0 : 1)) % 3].map((p) => [p[0] + 0.06 * dir, p[1], p[2]]);
      const top = tops[(v + (dir > 0 ? 0 : 2)) % 3];
      let pts = [...bot.slice().reverse(), ...lane, ...north.map((p) => [p[0] + 0.06 * dir, p[1], p[2]]), ...top];
      if (dir < 0) pts = pts.reverse();
      pts = pts.map((p) => P(p[0], p[1], p[2]));
      const c = curves.add(pts, 0.42);
      shipRows.push(c);
    }
  }
  const nShip = b.budget(0.07);
  const shipsPerCurve = 9;
  const nShipCore = Math.floor(nShip * 0.4);
  for (let i = 0; i < nShipCore; i++) {
    const ci = i % shipRows.length;
    const { row, length } = shipRows[ci];
    const k = Math.floor(rng() * shipsPerCurve);
    const shipLen = 0.07 / length;
    const u = (k + 0.37 * (ci % 3)) / shipsPerCurve + (rng() - 0.5) * shipLen;
    b.pushCurve(row, u, 0.003 + rng() * 0.007, K.SHIP, 0.75 + 0.25 * rng());
  }
  for (let i = nShipCore; i < nShip; i++) { // wakes + sparse trail
    const ci = i % shipRows.length;
    const { row, length } = shipRows[ci];
    const k = Math.floor(rng() * shipsPerCurve);
    const back = Math.pow(rng(), 1.6) * 0.45 / length;
    const u = (k + 0.37 * (ci % 3)) / shipsPerCurve - 0.035 / length - back;
    b.pushCurve(row, u, 0.006 + rng() * 0.012, K.SHIP, 0.3 * (1 - back * length / 0.45) + 0.05);
  }
  // static glowing lanes + dotted arcs
  const nLane = b.budget(0.04);
  for (let i = 0; i < nLane; i++) {
    const [p] = samplePolyline(canalLine(i % 2 ? 0.06 : -0.06).map((q) => [q[0], q[1]]), 1, rng);
    b.pushV(P(p[0] + gauss(rng) * 0.004, p[1], 0.002), K.LANE, 0.5 + 0.5 * rng());
  }
  const nArc = b.budget(0.06);
  for (let i = 0; i < nArc; i++) {
    const r = shipRows[i % shipRows.length].row;
    const s = curves.rows[r].s;
    const u = rng();
    const j = Math.min(CURVE_RES - 2, Math.floor(u * (CURVE_RES - 1)));
    const f = u * (CURVE_RES - 1) - j;
    const x = s[j * 3] + (s[j * 3 + 3] - s[j * 3]) * f, y = s[j * 3 + 1] + (s[j * 3 + 4] - s[j * 3 + 1]) * f, z = s[j * 3 + 2] + (s[j * 3 + 5] - s[j * 3 + 2]) * f;
    const endFade = Math.min(1, Math.min(u, 1 - u) / 0.12);
    b.push(x + gauss(rng) * 0.006, y + gauss(rng) * 0.006, z + gauss(rng) * 0.006, K.ARC, (0.35 + 0.5 * rng()) * endFade);
  }
  // port nodes: Port Said (north) + Suez (south)
  const nNode = b.budget(0.008);
  for (let i = 0; i < nNode; i++) {
    const c = i % 2 ? [0.0, 2.24] : [0.3, -2.02];
    const s = rng() < 0.5 ? 0.015 : 0.05;
    b.pushV(P(c[0] + gauss(rng) * s, c[1] + gauss(rng) * s, 0.02), K.PORT, 0.9);
  }
  if (text) for (const p of sampleText(text, b.budget(0.045), rng, { width: 6.8, z: -3.6, y: 0.1 })) b.pushV(p, K.TEXT, 0.5 + 0.5 * rng());
  b.ambient();
  return b.shuffle();
}

// ---- SCZONE: 4 zones + 6 ports along the canal (schematic plan, plane coords; z = height)
export const SCZ_TILT = mat(-0.92, 0, 0.24);
const SCZ_CANAL = [[0.0, 4.1], [0.0, 3.0], [-0.05, 1.8], [0.0, 0.6], [0.1, -0.6], [0.15, -1.6], [0.25, -2.35], [0.7, -3.3], [1.2, -4.2]];
export const ZONES = [
  { name: 'East Port Said', c: [1.05, 3.05], w: 1.5, h: 0.9, nx: 5, ny: 3 },
  { name: 'Qantara West', c: [-0.9, 1.65], w: 1.0, h: 0.8, nx: 3, ny: 3 },
  { name: 'East Ismailia', c: [0.95, 0.25], w: 1.1, h: 1.0, nx: 4, ny: 3 },
  { name: 'Ain Sokhna', c: [-1.1, -2.9], w: 1.6, h: 1.1, nx: 5, ny: 4 },
];
export const PORTS = [
  { name: 'West Port Said', c: [-0.45, 3.75] },
  { name: 'East Port Said', c: [0.55, 3.85] },
  { name: 'Al Arish', c: [2.85, 3.55] },
  { name: 'Adabiya', c: [-0.15, -2.15] },
  { name: 'Ain Sokhna', c: [-0.15, -3.3] },
  { name: 'El Tor', c: [1.55, -3.6] },
];

function buildSCZone(N, rng, text) {
  const b = new StateBuf(N, rng);
  const M = SCZ_TILT;
  const P = (x, y, z = 0) => xf(M, x * 0.92 + 0.15, y * 0.92 + 0.25, z * 0.92);
  const snap = (v, s = 0.05) => Math.round(v / s) * s;

  // floor lattice
  const nGrid = b.budget(0.11);
  const G = 0.25;
  for (let i = 0; i < nGrid; i++) {
    const horiz = rng() < 0.5;
    let x, y;
    if (horiz) { y = snap(-4.2 + rng() * 8.6, G); x = -3.4 + rng() * 6.8; }
    else { x = snap(-3.4 + rng() * 6.8, G); y = -4.2 + rng() * 8.6; }
    const node = rng() < 0.25;
    if (node) { x = snap(x, G); y = snap(y, G); }
    const fade = Math.min(1, (3.4 - Math.abs(x)) / 1.4) * Math.min(1, (4.4 - Math.abs(y - 0.1)) / 1.4);
    const major = (Math.abs(x / 1.0 - Math.round(x / 1.0)) < 0.01 && !horiz) || (Math.abs(y / 1.0 - Math.round(y / 1.0)) < 0.01 && horiz);
    b.pushV(P(x, y, 0), K.GRID, (node ? 0.9 : major ? 0.7 : 0.35) * fade);
  }
  // canal + gulf
  const nCanal = b.budget(0.045);
  const cl = SCZ_CANAL.map((p) => [p[0], p[1]]);
  for (let i = 0; i < nCanal; i++) {
    const [p] = samplePolyline(cl, 1, rng);
    const side = i % 3 === 0 ? 0 : (i % 3 === 1 ? 0.06 : -0.06);
    b.pushV(P(p[0] + side + gauss(rng) * 0.004, p[1], 0.003), K.LANE, side === 0 ? 1 : 0.6);
  }
  // seas (Med at the top, Gulf of Suez bottom)
  const nSea = b.budget(0.07);
  for (let i = 0; i < nSea; i++) {
    if (rng() < 0.6) {
      const x = snap(-3.4 + rng() * 6.8, 0.1), y = snap(4.15 + Math.pow(rng(), 1.5) * 1.3, 0.1);
      b.pushV(P(x, y, 0), K.SEA, 0.25 + 0.5 * rng() * Math.min(1, (3.4 - Math.abs(x)) / 1.4));
    } else {
      const t = rng();
      const y = -2.35 - t * 2.2, cx = 0.25 + t * 1.0, w = 0.15 + t * 0.6;
      b.pushV(P(snap(cx + (rng() - 0.5) * 2 * w, 0.1), snap(y, 0.1), 0), K.SEA, 0.3 + 0.4 * rng());
    }
  }
  // zones: outline + extruded blocks
  const nZone = b.budget(0.06);
  for (let i = 0; i < nZone; i++) {
    const Z = ZONES[i % ZONES.length];
    const per = 2 * (Z.w + Z.h);
    let s = rng() * per, x, y;
    const x0 = Z.c[0] - Z.w / 2, y0 = Z.c[1] - Z.h / 2;
    if (s < Z.w) { x = x0 + s; y = y0; }
    else if ((s -= Z.w) < Z.h) { x = x0 + Z.w; y = y0 + s; }
    else if ((s -= Z.h) < Z.w) { x = x0 + Z.w - s; y = y0 + Z.h; }
    else { s -= Z.w; x = x0; y = y0 + Z.h - s; }
    const halo = rng() < 0.2;
    b.pushV(P(x + (halo ? gauss(rng) * 0.03 : 0), y + (halo ? gauss(rng) * 0.03 : 0), 0.004), K.ZONE, halo ? 0.4 : 0.85 + 0.15 * rng());
  }
  const blocks = [];
  ZONES.forEach((Z, zi) => {
    const gap = 0.07;
    const bw = (Z.w - gap * (Z.nx + 1)) / Z.nx, bh = (Z.h - gap * (Z.ny + 1)) / Z.ny;
    for (let ix = 0; ix < Z.nx; ix++) for (let iy = 0; iy < Z.ny; iy++) {
      if (rng() < 0.12) continue;
      const x0 = Z.c[0] - Z.w / 2 + gap + ix * (bw + gap), y0 = Z.c[1] - Z.h / 2 + gap + iy * (bh + gap);
      const hgt = snap(0.06 + Math.pow(rng(), 2) * (zi === 3 ? 0.55 : 0.38), 0.03);
      blocks.push([x0, y0, bw, bh, hgt]);
    }
  });
  const nBlock = b.budget(0.2);
  for (let i = 0; i < nBlock; i++) {
    const [x0, y0, w, h, hg] = blocks[i % blocks.length];
    const r = rng();
    let x, y, z, br;
    if (r < 0.5) { // top edges
      const per = 2 * (w + h); let s = rng() * per;
      if (s < w) { x = x0 + s; y = y0; } else if ((s -= w) < h) { x = x0 + w; y = y0 + s; } else if ((s -= h) < w) { x = x0 + w - s; y = y0 + h; } else { s -= w; x = x0; y = y0 + h - s; }
      z = hg; br = 0.85 + 0.15 * rng();
    } else if (r < 0.72) { // vertical edges
      const c = Math.floor(rng() * 4);
      x = x0 + (c & 1 ? w : 0); y = y0 + (c & 2 ? h : 0); z = rng() * hg; br = 0.55;
    } else if (r < 0.9) { // top face lattice
      x = x0 + snap(rng() * w, 0.04); y = y0 + snap(rng() * h, 0.04); z = hg; br = 0.35;
    } else { // footprint
      const per = 2 * (w + h); let s = rng() * per;
      if (s < w) { x = x0 + s; y = y0; } else if ((s -= w) < h) { x = x0 + w; y = y0 + s; } else if ((s -= h) < w) { x = x0 + w - s; y = y0 + h; } else { s -= w; x = x0; y = y0 + h - s; }
      z = 0; br = 0.45;
    }
    b.pushV(P(x, y, z), K.BLOCK, br);
  }
  // ports: core + ring + light pillar
  const nPort = b.budget(0.045);
  for (let i = 0; i < nPort; i++) {
    const Pt = PORTS[i % PORTS.length];
    const r = rng();
    if (r < 0.35) b.pushV(P(Pt.c[0] + gauss(rng) * 0.025, Pt.c[1] + gauss(rng) * 0.025, 0.01), K.PORT, 1);
    else if (r < 0.7) { const a = rng() * Math.PI * 2; b.pushV(P(Pt.c[0] + Math.cos(a) * 0.13, Pt.c[1] + Math.sin(a) * 0.13, 0.005), K.PORT, 0.55); }
    else b.pushV(P(Pt.c[0] + gauss(rng) * 0.006, Pt.c[1] + gauss(rng) * 0.006, Math.pow(rng(), 1.4) * 0.8), K.PORT, 0.5);
  }
  // links port -> nearest zone (dashed)
  const nLink = b.budget(0.025);
  for (let i = 0; i < nLink; i++) {
    const Pt = PORTS[i % PORTS.length];
    let best = ZONES[0], bd = 1e9;
    for (const Z of ZONES) { const d = Math.hypot(Z.c[0] - Pt.c[0], Z.c[1] - Pt.c[1]); if (d < bd) { bd = d; best = Z; } }
    const t = rng();
    if ((t * bd * 12) % 1 > 0.55) continue;
    b.pushV(P(Pt.c[0] + (best.c[0] - Pt.c[0]) * t, Pt.c[1] + (best.c[1] - Pt.c[1]) * t, 0.01 + Math.sin(Math.PI * t) * 0.12), K.ARC, 0.7);
  }
  if (text) for (const p of sampleText(text, b.budget(0.045), rng, { width: 6.4, z: -3.6, y: 0.2 })) b.pushV(p, K.TEXT, 0.5 + 0.5 * rng());
  b.ambient();
  return b.shuffle();
}

// ---- Globe (local coordinates; rotated on the GPU)
export const GLOBE_R = 2.3;
const CITIES = [
  [51.5, -0.13], [40.7, -74.0], [25.2, 55.3], [31.2, 121.5], [1.35, 103.8], [6.5, 3.4], [-1.3, 36.8],
  [19.1, 72.9], [24.7, 46.7], [50.1, 8.7], [55.8, 37.6], [-26.2, 28.0], [-23.5, -46.6], [35.7, 139.7],
  [41.0, 29.0], [33.9, -6.9], [48.9, 2.35],
];
const ll2v = (lat, lng, r = 1) => { const cl = Math.cos(lat * D2R); return [cl * Math.sin(lng * D2R) * r, Math.sin(lat * D2R) * r, cl * Math.cos(lng * D2R) * r]; };

function buildGlobe(N, rng, curves, topo, text) {
  const b = new StateBuf(N, rng);
  const R = GLOBE_R;
  const masks = buildMasks(topo);
  const want = Math.round(N * 0.42);
  let rows = Math.round(Math.sqrt(want / 0.36));
  let dots = buildLandDots(masks, rows);
  if (dots.count > want * 1.15 || dots.count < want * 0.85) {
    rows = Math.round(rows * Math.sqrt(want / dots.count));
    dots = buildLandDots(masks, rows);
  }
  const idx = [...Array(dots.count).keys()];
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const nLand = Math.min(dots.count, b.budget(0.45));
  for (let k = 0; k < nLand; k++) {
    const i = idx[k];
    const eg = dots.flags[i * 2] > 0.5;
    const r = R * (1 + (eg ? 0.006 : 0));
    b.push(dots.positions[i * 3] * r, dots.positions[i * 3 + 1] * r, dots.positions[i * 3 + 2] * r, eg ? K.EGLAND : K.LAND, eg ? 1 : 0.55 + 0.45 * dots.flags[i * 2 + 1]);
  }
  // ocean: fibonacci sphere, sparse
  const nOcean = b.budget(0.06);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < nOcean; i++) {
    const y = 1 - (2 * (i + 0.5)) / nOcean, rr = Math.sqrt(1 - y * y), th = golden * i;
    b.push(Math.cos(th) * rr * R * 0.995, y * R * 0.995, Math.sin(th) * rr * R * 0.995, K.OCEAN, 0.4 + 0.6 * rng());
  }
  // atmosphere shell (only the limb is shown, see shader)
  const nRim = b.budget(0.05);
  for (let i = 0; i < nRim; i++) {
    const u = rng() * 2 - 1, a = rng() * Math.PI * 2, rr = Math.sqrt(1 - u * u);
    const h = R * (1.01 + Math.pow(rng(), 2.2) * 0.12);
    b.push(Math.cos(a) * rr * h, u * h, Math.sin(a) * rr * h, K.RIM, 0.4 + 0.6 * rng());
  }
  // arcs from Cairo
  const c0 = ll2v(CAIRO[1], CAIRO[0]);
  const arcRows = [];
  for (const [lat, lng] of CITIES) {
    const c1 = ll2v(lat, lng);
    const ang = Math.acos(Math.max(-1, Math.min(1, c0[0] * c1[0] + c0[1] * c1[1] + c0[2] * c1[2])));
    const lift = 0.06 + 0.32 * (ang / Math.PI);
    const pts = [];
    const S = 32;
    for (let i = 0; i <= S; i++) {
      const t = i / S;
      const s0 = Math.sin((1 - t) * ang) / Math.sin(ang), s1 = Math.sin(t * ang) / Math.sin(ang);
      const v = [c0[0] * s0 + c1[0] * s1, c0[1] * s0 + c1[1] * s1, c0[2] * s0 + c1[2] * s1];
      const h = R * (1.004 + lift * Math.sin(Math.PI * t));
      pts.push([v[0] * h, v[1] * h, v[2] * h]);
    }
    arcRows.push({ ...curves.add(pts, 0.55), pts, c1 });
  }
  const nArc = b.budget(0.07);
  const comets = 3;
  for (let i = 0; i < nArc; i++) {
    const a = arcRows[i % arcRows.length];
    const k = Math.floor(rng() * comets);
    const back = Math.pow(rng(), 2) * 0.22;
    b.pushCurve(a.row, (k + (i % 7) * 0.13) / comets - back, 0.003 + rng() * 0.006, K.GARC, 1 - back / 0.22 * 0.85);
  }
  const nArcS = b.budget(0.03);
  for (let i = 0; i < nArcS; i++) {
    const a = arcRows[i % arcRows.length];
    const t = rng();
    const s = curves.rows[a.row].s;
    const j = Math.min(CURVE_RES - 2, Math.floor(t * (CURVE_RES - 1)));
    b.push(s[j * 3], s[j * 3 + 1], s[j * 3 + 2], K.GARCS, (0.4 + 0.5 * rng()) * Math.min(1, t / 0.12));
  }
  const nCity = b.budget(0.01);
  for (let i = 0; i < nCity; i++) {
    const a = arcRows[i % arcRows.length];
    const s = rng() < 0.5 ? 0.012 : 0.035;
    b.push(a.c1[0] * R + gauss(rng) * s, a.c1[1] * R + gauss(rng) * s, a.c1[2] * R + gauss(rng) * s, K.GCITY, 0.9);
  }
  const nCai = b.budget(0.0015);
  for (let i = 0; i < nCai; i++) {
    const s = rng() < 0.5 ? 0.01 : 0.03;
    b.push(c0[0] * R * 1.01 + gauss(rng) * s, c0[1] * R * 1.01 + gauss(rng) * s, c0[2] * R * 1.01 + gauss(rng) * s, K.CAIRO, 1);
  }
  if (text) for (const p of sampleText(text, b.budget(0.045), rng, { width: 6.4, z: -4.2, y: 0.1 })) b.pushV(p, K.TEXT, 0.5 + 0.5 * rng());
  b.ambient();
  return b.shuffle();
}

/**
 * @param {number} N particle count
 * @param {{texts?: (string|null)[]}} opts numeral strings per state (null to skip)
 */
export async function buildStates(N, { texts = [] } = {}) {
  const topo = (await import('world-atlas/land-110m.json')).default;
  const curves = new Curves();
  const states = [
    buildDust(N, mulberry32(11)),
    buildEgypt(N, mulberry32(22), curves, topo, texts[1]),
    buildSuez(N, mulberry32(33), curves, texts[2]),
    buildSCZone(N, mulberry32(44), texts[3]),
    buildGlobe(N, mulberry32(55), curves, topo, texts[4]),
  ];
  const cairoMap = xf(EGYPT_TILT, ...proj(CAIRO[0], CAIRO[1]), 0.03);
  const mapX = new THREE.Vector3(1, 0, 0).applyMatrix4(EGYPT_TILT);
  const mapY = new THREE.Vector3(0, 1, 0).applyMatrix4(EGYPT_TILT);
  return { states, curveTex: curves.texture(), curveRows: curves.rows.length, cairoMap, mapX, mapY, cairoGlobe: ll2v(CAIRO[1], CAIRO[0], GLOBE_R) };
}
