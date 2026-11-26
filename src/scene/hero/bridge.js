// Modern cable-stayed bridge: 2 A-shaped pylons, slim deck, fan of stay cables,
// warm deck lamps and car light streaks. Local axis: deck runs along X, Y up.
import {
  BoxGeometry, CylinderGeometry, Group, InstancedMesh, Mesh, MeshStandardMaterial, Matrix4,
  Quaternion, Vector3, Color
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchFogStandard } from './patches.js';
import { createGlowPoints, createCars } from './lights.js';

export const BRIDGE = {
  mainHalf: 175,      // pylons at x = ±175
  sideSpan: 175,      // deck ends at ±350
  deckY: 19,          // top of deck
  deckW: 30,
  pylonH: 128
};

function legGeometry(x, zBase, zTop, yBase, yTop, wx, wz) {
  // tapered leg as an 8-vertex box between two rectangles
  const g = new BoxGeometry(1, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
    const t = vy + 0.5; // 0 bottom, 1 top
    const z = zBase + (zTop - zBase) * t;
    const sx = wx * (1 - 0.35 * t), sz = wz * (1 - 0.3 * t);
    p.setXYZ(i, x + vx * sx, yBase + (yTop - yBase) * t, z + vz * sz);
  }
  g.computeVertexNormals();
  return g;
}

function boxAt(w, h, d, x, y, z) {
  const g = new BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

export function createBridge(shared, quality) {
  const group = new Group();
  group.name = 'hero-bridge';
  const B = BRIDGE;
  const L = (B.mainHalf + B.sideSpan) * 2;
  const low = quality === 'low';

  const concrete = new MeshStandardMaterial({ color: new Color(0x8f877c), roughness: 0.86, metalness: 0.0 });
  concrete.name = 'concrete';
  patchFogStandard(concrete, shared, (shader) => {
    // night uplighting: brightest just above the deck, fading up the pylon
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vUpY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvUpY = position.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vUpY;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance *= mix( 2.2, 0.08, pow( smoothstep( 18.0, 130.0, vUpY ), 0.6 ) ) * step( 14.0, vUpY );`);
  });
  const deckMat = new MeshStandardMaterial({ color: new Color(0x6f6a64), roughness: 0.8 });
  deckMat.name = 'deck';
  patchFogStandard(deckMat, shared);

  // ---- deck (girder + parapet edge strips) ----
  const deckParts = [
    boxAt(L, 2.6, B.deckW, 0, B.deckY - 1.3, 0),
    boxAt(L, 0.6, 0.6, 0, B.deckY + 0.3, B.deckW / 2 - 0.3),
    boxAt(L, 0.6, 0.6, 0, B.deckY + 0.3, -B.deckW / 2 + 0.3),
    boxAt(L, 1.6, B.deckW - 6, 0, B.deckY - 3.2, 0) // box girder underside, shadowed
  ];
  const deck = new Mesh(mergeGeometries(deckParts), deckMat);
  group.add(deck);

  // ---- piers under side spans + approach ----
  const piers = [];
  for (const s of [-1, 1]) {
    for (const off of [70, 125]) {
      const x = s * (B.mainHalf + off);
      piers.push(boxAt(5, B.deckY - 2.6, 18, x, (B.deckY - 2.6) / 2, 0));
    }
    piers.push(boxAt(10, B.deckY, B.deckW + 4, s * (L / 2 - 5), B.deckY / 2 - 1, 0)); // abutment
  }

  // ---- A-shaped pylons ----
  const pylonParts = [];
  const top = B.pylonH;
  for (const s of [-1, 1]) {
    const x = s * B.mainHalf;
    // legs from water to just under the head
    pylonParts.push(legGeometry(x, B.deckW / 2 + 3, 2.6, -2, top - 18, 5.5, 6));
    pylonParts.push(legGeometry(x, -(B.deckW / 2 + 3), -2.6, -2, top - 18, 5.5, 6));
    // head block (anchorage zone)
    pylonParts.push(legGeometry(x, 0, 0, top - 22, top, 4.6, 7.5));
    // cross beam under the deck
    pylonParts.push(boxAt(6, 3, B.deckW + 6, x, B.deckY - 4.5, 0));
    // pile cap at the water line
    pylonParts.push(boxAt(16, 3, B.deckW + 16, x, 0.4, 0));
  }
  const pylons = new Mesh(mergeGeometries([...pylonParts, ...piers]), concrete);
  group.add(pylons);

  // ---- stay cables (instanced thin cylinders) ----
  const perFan = low ? 7 : 13;
  const cableMat = new MeshStandardMaterial({
    color: new Color(0xe8e2d6), roughness: 0.45, metalness: 0.2,
    emissive: new Color(0xffc890), emissiveIntensity: 0
  });
  cableMat.name = 'cable';
  patchFogStandard(cableMat, shared);
  const cableGeo = new CylinderGeometry(1, 1, 1, 5, 1, true);
  const cableCount = 2 /*pylons*/ * 2 /*edges*/ * 2 /*sides*/ * perFan;
  const cables = new InstancedMesh(cableGeo, cableMat, cableCount);
  const m = new Matrix4(), q = new Quaternion(), up = new Vector3(0, 1, 0);
  const a = new Vector3(), b = new Vector3(), d = new Vector3(), mid = new Vector3(), sc = new Vector3();
  let ci = 0;
  const r = low ? 0.4 : 0.32;
  for (const s of [-1, 1]) {
    const px = s * B.mainHalf;
    for (const edge of [-1, 1]) {
      for (const dir of [-1, 1]) {
        for (let i = 0; i < perFan; i++) {
          const t = i / (perFan - 1);
          // anchors spread over the pylon head (semi-fan)
          a.set(px + dir * 1.2, top - 3 - (1 - t) * 18, edge * 1.4);
          const reach = 22 + t * (B.mainHalf - 32);
          b.set(px + dir * reach, B.deckY + 0.8, edge * (B.deckW / 2 - 1.2));
          d.subVectors(b, a); const len = d.length(); d.normalize();
          mid.addVectors(a, b).multiplyScalar(0.5);
          q.setFromUnitVectors(up, d);
          sc.set(r, len, r);
          m.compose(mid, q, sc);
          cables.setMatrixAt(ci++, m);
        }
      }
    }
  }
  cables.instanceMatrix.needsUpdate = true;
  group.add(cables);

  // ---- deck lamps ----
  const spacing = low ? 26 : 18;
  const nPer = Math.floor(L / spacing);
  const lampN = nPer * 2;
  const lp = new Float32Array(lampN * 3), lc = new Float32Array(lampN * 3), ls = new Float32Array(lampN), lr = new Float32Array(lampN);
  const lamp = new Color(1.0, 0.72, 0.42);
  let k = 0;
  for (const edge of [-1, 1]) {
    for (let i = 0; i < nPer; i++) {
      const x = -L / 2 + spacing * (i + 0.5);
      lp[k * 3] = x; lp[k * 3 + 1] = B.deckY + 8.5; lp[k * 3 + 2] = edge * (B.deckW / 2 - 0.8);
      lc[k * 3] = lamp.r * 8; lc[k * 3 + 1] = lamp.g * 8; lc[k * 3 + 2] = lamp.b * 8;
      ls[k] = 1.15;
      lr[k] = 0.28 + 0.12 * Math.abs(x) / (L / 2); // switch on from centre outwards
      k++;
    }
  }
  // pylon top aviation beacons + soft uplights at pylon heads
  const extra = [];
  for (const s of [-1, 1]) extra.push([s * B.mainHalf, top + 1.5, 0, 6, 0.4, 0.3, 2.2, 0.33]);
  const N2 = lampN + extra.length;
  const P = new Float32Array(N2 * 3), C = new Float32Array(N2 * 3), S = new Float32Array(N2), R = new Float32Array(N2);
  P.set(lp); C.set(lc); S.set(ls); R.set(lr);
  extra.forEach((e, i) => {
    const j = lampN + i;
    P[j * 3] = e[0]; P[j * 3 + 1] = e[1]; P[j * 3 + 2] = e[2];
    C[j * 3] = e[3]; C[j * 3 + 1] = e[4]; C[j * 3 + 2] = e[5]; S[j] = e[6]; R[j] = e[7];
  });
  const lamps = createGlowPoints(shared, { positions: P, colors: C, sizes: S, rands: R }, { on: shared.uLampsOn, minPx: 2.0 });
  group.add(lamps);

  // ---- cars ----
  const white = new Color(1.0, 0.92, 0.8).multiplyScalar(7);
  const red = new Color(1.0, 0.08, 0.04).multiplyScalar(6);
  const cars = createCars(shared, {
    count: low ? 22 : 46,
    trail: low ? 6 : 10,
    trailLen: 14,
    length: L,
    deckY: B.deckY + 1.2,
    on: shared.uCarsOn,
    lanes: [
      { z: 9.5, dir: -1, color: white }, { z: 6, dir: -1, color: white },
      { z: -6, dir: 1, color: red }, { z: -9.5, dir: 1, color: red }
    ]
  });
  group.add(cars);

  // pylon flood light: subtle warm emissive ramp on pylons after dusk (see shader patch above)
  concrete.emissive = new Color(0xffb070);
  concrete.emissiveIntensity = 0;

  return {
    group, length: L,
    materials: [concrete, deckMat, cableMat],
    update(state) {
      concrete.emissiveIntensity = 0.04 * state.lights;
      cableMat.emissiveIntensity = 0.06 * state.lights;
    }
  };
}
