// Builds the dotted-landmass point set for the globe.
// Land polygons (world-atlas / Natural Earth) are rasterised into an equirectangular
// canvas mask, then a latitude-ring dot grid is sampled against it. Egypt dots are
// flagged with a second mask drawn from the real Egypt outline.
import { feature } from 'topojson-client';
import { EGYPT_RINGS } from './egypt.js';

const MASK_W = 2048;
const MASK_H = 1024;

function drawRing(ctx, ring) {
  // Unwrap longitudes so rings crossing the antimeridian stay continuous,
  // then draw at -360/0/+360 offsets so the wrapped parts land on canvas.
  const pts = [];
  let prev = ring[0][0];
  let shift = 0;
  for (let i = 0; i < ring.length; i++) {
    let lng = ring[i][0];
    if (i > 0) {
      const d = lng + shift - prev;
      if (d > 180) shift -= 360;
      else if (d < -180) shift += 360;
    }
    lng += shift;
    prev = lng;
    pts.push(lng, ring[i][1]);
  }
  for (const off of [-360, 0, 360]) {
    ctx.moveTo(((pts[0] + off + 180) / 360) * MASK_W, ((90 - pts[1]) / 180) * MASK_H);
    for (let i = 2; i < pts.length; i += 2) {
      ctx.lineTo(((pts[i] + off + 180) / 360) * MASK_W, ((90 - pts[i + 1]) / 180) * MASK_H);
    }
    ctx.closePath();
  }
}

function makeCanvas() {
  const c = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(MASK_W, MASK_H)
    : Object.assign(document.createElement('canvas'), { width: MASK_W, height: MASK_H });
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, MASK_W, MASK_H);
  ctx.fillStyle = '#fff';
  return ctx;
}

function landMask(topo) {
  const ctx = makeCanvas();
  const geo = feature(topo, topo.objects.land);
  const feats = geo.features || [geo];
  ctx.beginPath();
  for (const f of feats) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const poly of polys) for (const ring of poly) drawRing(ctx, ring);
  }
  ctx.fill('evenodd');
  // Antarctica's ring is cut at the antimeridian and does not reach the pole.
  ctx.fillRect(0, ((90 + 84.5) / 180) * MASK_H, MASK_W, MASK_H);
  return ctx.getImageData(0, 0, MASK_W, MASK_H).data;
}

function egyptMask() {
  const ctx = makeCanvas();
  ctx.beginPath();
  for (const ring of EGYPT_RINGS) drawRing(ctx, ring);
  ctx.fill();
  return ctx.getImageData(0, 0, MASK_W, MASK_H).data;
}

function sample(data, lat, lng) {
  const x = Math.min(MASK_W - 1, Math.max(0, Math.floor(((lng + 180) / 360) * MASK_W)));
  const y = Math.min(MASK_H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * MASK_H)));
  return data[(y * MASK_W + x) * 4] > 127;
}

function hash(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * @param {{land: Uint8ClampedArray, egypt: Uint8ClampedArray}} masks from buildMasks()
 * @param {number} rows number of latitude rows from pole to pole
 * @returns {{positions: Float32Array, flags: Float32Array, count: number}}
 *   positions: unit-sphere xyz per dot; flags: [isEgypt, random] per dot
 */
export function buildMasks(topo) {
  return { land: landMask(topo), egypt: egyptMask() };
}

export function buildLandDots(masks, rows) {
  const { land, egypt } = masks;
  const pos = [];
  const flags = [];
  const D2R = Math.PI / 180;
  for (let r = 0; r < rows; r++) {
    const lat = -90 + (180 * (r + 0.5)) / rows;
    if (lat < -62) continue; // keep Antarctica out: cleaner silhouette, nothing to show there
    const n = Math.max(1, Math.round(Math.cos(lat * D2R) * rows * 2));
    const jitter = (r * 0.618) % 1; // stagger rows so columns don't align at the meridian
    for (let i = 0; i < n; i++) {
      const lng = -180 + (360 * (i + jitter)) / n;
      if (!sample(land, lat, lng)) continue;
      const isEg = sample(egypt, lat, lng) ? 1 : 0;
      const cl = Math.cos(lat * D2R);
      pos.push(cl * Math.sin(lng * D2R), Math.sin(lat * D2R), cl * Math.cos(lng * D2R));
      flags.push(isEg, hash(r * 4099 + i));
    }
  }
  return { positions: new Float32Array(pos), flags: new Float32Array(flags), count: pos.length / 3 };
}
