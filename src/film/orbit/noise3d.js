import * as THREE from 'three';

/**
 * Tileable 3D noise volume for the cloud dive (and the procedural Milky Way).
 * R: Perlin-Worley shape noise (billowy, low frequency)
 * G: Worley FBM detail noise (higher frequency, for edge erosion)
 * Generated once on the CPU (~64^3), RG8, linear filtered, repeat wrapped.
 */
export function createNoise3D(size = 64) {
  const N = size;
  const data = new Uint8Array(N * N * N * 2);

  // --- seeded hash
  let seed = 1337;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // --- periodic Worley: feature points per cell for a given cell count
  const makeCells = (cells) => {
    const pts = new Float32Array(cells * cells * cells * 3);
    for (let i = 0; i < pts.length; i++) pts[i] = rnd();
    return pts;
  };
  const worley = (x, y, z, cells, pts) => {
    // x,y,z in [0,1)
    const fx = x * cells, fy = y * cells, fz = z * cells;
    const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
    let best = 1e9;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const cx = ix + dx, cy = iy + dy, cz = iz + dz;
          const wx = ((cx % cells) + cells) % cells;
          const wy = ((cy % cells) + cells) % cells;
          const wz = ((cz % cells) + cells) % cells;
          const k = ((wz * cells + wy) * cells + wx) * 3;
          const px = cx + pts[k] - fx, py = cy + pts[k + 1] - fy, pz = cz + pts[k + 2] - fz;
          const d = px * px + py * py + pz * pz;
          if (d < best) best = d;
        }
      }
    }
    return Math.sqrt(best); // ~0..1.2
  };

  // --- periodic gradient-ish value noise (smooth)
  const vperiod = 8;
  const lattice = new Float32Array(vperiod * vperiod * vperiod);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rnd();
  const lat = (x, y, z, p) => {
    const wx = ((x % p) + p) % p, wy = ((y % p) + p) % p, wz = ((z % p) + p) % p;
    // map a period p lattice into the base lattice by hashing
    const h = ((wx * 73856093) ^ (wy * 19349663) ^ (wz * 83492791) ^ (p * 2654435761)) >>> 0;
    return lattice[h % lattice.length];
  };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const vnoise = (x, y, z, p) => {
    const fx = x * p, fy = y * p, fz = z * p;
    const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
    const tx = fade(fx - ix), ty = fade(fy - iy), tz = fade(fz - iz);
    const l = (a, b, t) => a + (b - a) * t;
    const c000 = lat(ix, iy, iz, p), c100 = lat(ix + 1, iy, iz, p);
    const c010 = lat(ix, iy + 1, iz, p), c110 = lat(ix + 1, iy + 1, iz, p);
    const c001 = lat(ix, iy, iz + 1, p), c101 = lat(ix + 1, iy, iz + 1, p);
    const c011 = lat(ix, iy + 1, iz + 1, p), c111 = lat(ix + 1, iy + 1, iz + 1, p);
    return l(l(l(c000, c100, tx), l(c010, c110, tx), ty), l(l(c001, c101, tx), l(c011, c111, tx), ty), tz);
  };

  const w4 = makeCells(4), w8 = makeCells(8), w16 = makeCells(16);
  const d8 = makeCells(8), d16 = makeCells(16), d32 = makeCells(32);

  const remap = (v, a, b, c, d) => c + ((v - a) / (b - a)) * (d - c);
  const sat = (v) => Math.min(1, Math.max(0, v));

  let i = 0;
  for (let z = 0; z < N; z++) {
    const zz = (z + 0.5) / N;
    for (let y = 0; y < N; y++) {
      const yy = (y + 0.5) / N;
      for (let x = 0; x < N; x++) {
        const xx = (x + 0.5) / N;
        // Worley FBM (inverted -> billows)
        const wf = (1 - worley(xx, yy, zz, 4, w4)) * 0.625
          + (1 - worley(xx, yy, zz, 8, w8)) * 0.25
          + (1 - worley(xx, yy, zz, 16, w16)) * 0.125;
        // value FBM
        const pf = vnoise(xx, yy, zz, 4) * 0.5 + vnoise(xx, yy, zz, 8) * 0.3 + vnoise(xx, yy, zz, 16) * 0.2;
        // Perlin-Worley: remap perlin by worley
        const pw = sat(remap(pf, wf - 1, 1, 0, 1));
        const shape = sat(pw * 0.55 + wf * 0.6 - 0.1);
        const det = sat((1 - worley(xx, yy, zz, 8, d8)) * 0.6 + (1 - worley(xx, yy, zz, 16, d16)) * 0.28
          + (1 - worley(xx, yy, zz, 32, d32)) * 0.12);
        data[i++] = Math.round(shape * 255);
        data[i++] = Math.round(det * 255);
      }
    }
  }

  const tex = new THREE.Data3DTexture(data, N, N, N);
  tex.format = THREE.RGFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}
