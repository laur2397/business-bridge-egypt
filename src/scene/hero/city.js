// Banks, far-bank skyline (instanced, procedural lit windows), palms, corniche lights,
// a Cairo-Tower-like lattice tower, and the three Giza pyramids on the horizon.
import {
  BoxGeometry, Color, ConeGeometry, CylinderGeometry, ExtrudeGeometry, Group, IcosahedronGeometry,
  InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Path, Quaternion, Shape, SphereGeometry, Vector3
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchFogStandard, patchWindows } from './patches.js';
import { createGlowPoints } from './lights.js';
import { mulberry32 } from './textures.js';

// River outline in world XZ (camera looks toward -Z). Left bank then right bank, near -> far.
const LEFT_BANK = [[-4200, 900], [-1000, -330], [-300, -770], [-282, -900], [-330, -1400], [-430, -2200], [-330, -3200], [-170, -5200], [-90, -14000]];
const RIGHT_BANK = [[4200, 900], [1150, -280], [400, -640], [372, -760], [430, -1300], [560, -2200], [470, -3200], [300, -5200], [170, -14000]];

function bankXAt(bank, z) {
  for (let i = 0; i < bank.length - 1; i++) {
    const [x0, z0] = bank[i], [x1, z1] = bank[i + 1];
    if (z <= z0 && z >= z1) return x0 + ((z - z0) / (z1 - z0)) * (x1 - x0);
  }
  return null;
}

export function inRiver(x, z, margin = 0) {
  const l = bankXAt(LEFT_BANK, z), r = bankXAt(RIGHT_BANK, z);
  if (l === null || r === null) return z > 0;
  return x > l - margin && x < r + margin;
}

export function createCity(shared, quality, rand0) {
  const low = quality === 'low';
  const rand = mulberry32(rand0 || 1234);
  const group = new Group();
  group.name = 'hero-city';

  // ---- land (extruded slab with the river cut out) ----
  const outer = new Shape();
  outer.moveTo(-30000, -2000); outer.lineTo(30000, -2000); outer.lineTo(30000, 30000); outer.lineTo(-30000, 30000); outer.closePath();
  const hole = new Path();
  const ring = [...LEFT_BANK, ...RIGHT_BANK.slice().reverse()];
  ring.forEach(([x, z], i) => (i === 0 ? hole.moveTo(x, -z) : hole.lineTo(x, -z)));
  hole.closePath();
  outer.holes.push(hole);
  const landGeo = new ExtrudeGeometry(outer, { depth: 4, bevelEnabled: false, curveSegments: 1 });
  landGeo.rotateX(-Math.PI / 2); // shape (x, y) -> world (x, z = -y), depth along +y
  landGeo.translate(0, -2.5, 0);
  const landMat = new MeshStandardMaterial({ color: new Color(0x4a3f33), roughness: 1 });
  landMat.name = 'land';
  patchFogStandard(landMat, shared);
  const land = new Mesh(landGeo, landMat);
  group.add(land);

  // Giza plateau swell (sand) under the pyramids
  const duneMat = new MeshStandardMaterial({ color: new Color(0x9c7a52), roughness: 1 });
  duneMat.name = 'dune';
  patchFogStandard(duneMat, shared, null, 1.1);
  const dune = new Mesh(new SphereGeometry(1, 32, 12), duneMat);
  dune.scale.set(2600, 34, 1400);
  dune.position.set(-2000, -14, -4300);
  group.add(dune);

  // ---- buildings ----
  const maxB = low ? 520 : 1500;
  const bGeo = new BoxGeometry(1, 1, 1); bGeo.translate(0, 0.5, 0);
  const bMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0.0, emissive: 0x000000 });
  bMat.name = 'buildings';
  patchWindows(bMat, shared);
  const buildings = new InstancedMesh(bGeo, bMat, maxB);
  const m = new Matrix4(), q = new Quaternion(), p = new Vector3(), s = new Vector3(), yAxis = new Vector3(0, 1, 0);
  const palette = [new Color(0.36, 0.3, 0.24), new Color(0.42, 0.36, 0.3), new Color(0.3, 0.29, 0.28), new Color(0.46, 0.42, 0.37), new Color(0.33, 0.26, 0.2)];
  const tall = [];
  let n = 0, guard = 0;
  while (n < maxB && guard++ < maxB * 30) {
    const z = -520 - Math.pow(rand(), 1.5) * 5600;
    const span = 300 + Math.abs(z) * 0.78;
    const x = (rand() * 2 - 1) * span;
    if (inRiver(x, z, 30)) continue;
    if (z > -600 && Math.abs(x) < 520) continue;
    // keep the left (pyramid) sight line low and sparse
    const angL = Math.atan2(-x, -z + 80) / (Math.PI / 180);
    const pyramidZone = angL > 17 && angL < 32 && z < -1000;
    if (pyramidZone && rand() < 0.6) continue;
    const nearLeft = x < 0 && z > -1350;
    if (nearLeft && rand() < 0.55) continue;
    // corniche row (first row from the river) is denser
    const nearRiver = inRiver(x, z, 140);
    let h, w, d;
    const towerZone = x > 380 && x < 1700 && z < -800 && z > -2400;
    const tp = towerZone ? 0.16 : nearRiver ? 0.06 : 0.025;
    if (!pyramidZone && !nearLeft && rand() < tp) {
      h = 75 + Math.pow(rand(), 1.4) * 105; w = 22 + rand() * 18; d = 22 + rand() * 18;
    } else {
      h = 9 + Math.pow(rand(), 2.2) * (nearRiver ? 48 : 32); w = 14 + rand() * 30; d = 14 + rand() * 26;
      if (pyramidZone) h = Math.min(h, 7 + rand() * 6);
      if (z > -1100) h = Math.min(h, 14 + rand() * 16);
      if (nearLeft) h = Math.min(h, 6 + rand() * 9);
    }
    const rot = (rand() - 0.5) * 0.35 + (rand() < 0.15 ? Math.PI / 4 : 0);
    q.setFromAxisAngle(yAxis, rot);
    p.set(x, 1.5, z); s.set(w, h, d);
    m.compose(p, q, s);
    buildings.setMatrixAt(n, m);
    const c = palette[Math.floor(rand() * palette.length)].clone().multiplyScalar(0.85 + rand() * 0.3);
    buildings.setColorAt(n, c);
    if (h > 70) tall.push([x, h + 1.5, z]);
    n++;
  }
  buildings.count = n;
  buildings.instanceMatrix.needsUpdate = true;
  if (buildings.instanceColor) buildings.instanceColor.needsUpdate = true;
  buildings.computeBoundingSphere();
  group.add(buildings);

  // ---- palms / trees along the banks ----
  const treeN = low ? 260 : 720;
  const tGeo = new IcosahedronGeometry(1, 0);
  const tMat = new MeshStandardMaterial({ color: new Color(0x1d261b), roughness: 1, flatShading: true });
  tMat.name = 'trees';
  patchFogStandard(tMat, shared);
  const trees = new InstancedMesh(tGeo, tMat, treeN);
  let tn = 0;
  for (let i = 0; i < treeN * 3 && tn < treeN; i++) {
    const side = rand() < 0.5 ? LEFT_BANK : RIGHT_BANK;
    const sgn = side === LEFT_BANK ? -1 : 1;
    const z = -560 - Math.pow(rand(), 1.3) * 3600;
    const bx = bankXAt(side, z);
    if (bx === null) continue;
    const x = bx + sgn * (6 + rand() * 30);
    const sc = 3 + rand() * 3.5;
    q.setFromAxisAngle(yAxis, rand() * 6.28);
    p.set(x, 1.5 + sc * 0.55, z); s.set(sc * 1.3, sc * (0.55 + rand() * 0.35), sc * 1.3);
    m.compose(p, q, s);
    trees.setMatrixAt(tn++, m);
  }
  trees.count = tn;
  trees.instanceMatrix.needsUpdate = true;
  trees.computeBoundingSphere();
  group.add(trees);

  // ---- Cairo-Tower-like lattice tower (187 m) ----
  const towerMat = new MeshStandardMaterial({ color: new Color(0x9a8a76), roughness: 0.8, emissive: new Color(0xffd2a0), emissiveIntensity: 0 });
  towerMat.name = 'tower';
  patchFogStandard(towerMat, shared);
  const tx = -470, tz = -1650;
  const shaft = new CylinderGeometry(6.2, 4.6, 150, 18, 1, true); shaft.translate(0, 75 + 1.5, 0);
  const podium = new CylinderGeometry(14, 16, 6, 18); podium.translate(0, 3 + 1.5, 0);
  const pod = new CylinderGeometry(10, 7.2, 12, 18); pod.translate(0, 157 + 1.5, 0);
  const crown = new CylinderGeometry(6, 9.5, 6, 18); crown.translate(0, 166 + 1.5, 0);
  const mast = new CylinderGeometry(0.9, 1.6, 18, 8); mast.translate(0, 178 + 1.5, 0);
  const tower = new Mesh(mergeGeometries([shaft, podium, pod, crown, mast]), towerMat);
  tower.position.set(tx, 0, tz);
  group.add(tower);
  tall.push([tx, 188.5, tz]);

  // ---- pyramids (Khufu > Khafre > Menkaure, 51.84 deg faces) ----
  const pyrMat = new MeshStandardMaterial({ color: new Color(0xc9a275), roughness: 0.95, flatShading: true });
  pyrMat.name = 'pyramids';
  patchFogStandard(pyrMat, shared, (shader) => {
    shader.uniforms.uRim = shared.uPyrRim;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // last warm light grazing the sun-facing (east/right) faces
        totalEmissiveRadiance += uRim * diffuseColor.rgb * smoothstep( 0.1, 0.6, normal.x );`);
  }, 1.0);
  const slope = Math.tan((51.84 * Math.PI) / 180);
  const pyrs = [
    { h: 146.6, x: -1560, z: -3600, y: 6 },
    { h: 143.5, x: -1910, z: -3960, y: 16 },
    { h: 65.5, x: -2250, z: -4320, y: 12 }
  ];
  const pyrGroup = new Group();
  for (const P of pyrs) {
    const half = P.h / slope;
    const g = new ConeGeometry(half * Math.SQRT2, P.h, 4, 1).toNonIndexed();
    g.rotateY(Math.PI / 4);
    g.translate(0, P.h / 2, 0);
    g.computeVertexNormals();
    const mesh = new Mesh(g, pyrMat);
    mesh.position.set(P.x, P.y, P.z);
    pyrGroup.add(mesh);
  }
  group.add(pyrGroup);

  // ---- city & corniche lights (sodium + white), aviation beacons ----
  const lampList = [];
  const sodium = [1.0, 0.5, 0.18], whiteL = [1.0, 0.85, 0.65];
  for (const bank of [LEFT_BANK, RIGHT_BANK]) {
    const sgn = bank === LEFT_BANK ? -1 : 1;
    for (let z = -420; z > -4200; z -= low ? 46 : 28) {
      const bx = bankXAt(bank, z); if (bx === null) continue;
      lampList.push([bx + sgn * 5, 8, z, ...sodium.map((v) => v * 7), 1.1, 0.25 + rand() * 0.12]);
    }
  }
  const streetN = low ? 700 : 2200;
  for (let i = 0, g2 = 0; i < streetN && g2 < streetN * 10; g2++) {
    const z = -540 - Math.pow(rand(), 1.4) * 5200;
    const span = 300 + Math.abs(z) * 0.78;
    const x = (rand() * 2 - 1) * span;
    if (inRiver(x, z, 10)) continue;
    const c = rand() < 0.7 ? sodium : whiteL;
    const k = 3 + rand() * 6;
    lampList.push([x, 4 + rand() * 6, z, c[0] * k, c[1] * k, c[2] * k, 1.0 + rand() * 0.8, 0.3 + rand() * 0.5]);
    i++;
  }
  const L = lampList.length;
  const P = new Float32Array(L * 3), C = new Float32Array(L * 3), S = new Float32Array(L), R = new Float32Array(L);
  lampList.forEach((e, i) => { P.set(e.slice(0, 3), i * 3); C.set(e.slice(3, 6), i * 3); S[i] = e[6]; R[i] = e[7]; });
  const cityLights = createGlowPoints(shared, { positions: P, colors: C, sizes: S, rands: R }, { on: shared.uCityOn, minPx: 1.5, fogMul: 0.55 });
  group.add(cityLights);

  const bN = tall.length;
  const bp = new Float32Array(bN * 3), bc = new Float32Array(bN * 3), bs = new Float32Array(bN), br = new Float32Array(bN);
  tall.forEach((t, i) => { bp.set(t, i * 3); bc.set([7, 0.5, 0.3], i * 3); bs[i] = 2.2; br[i] = rand(); });
  const beacons = createGlowPoints(shared, { positions: bp, colors: bc, sizes: bs, rands: br }, { on: shared.uBeaconOn, minPx: 1.8, blink: true });
  group.add(beacons);

  return {
    group,
    materials: [landMat, duneMat, bMat, tMat, towerMat, pyrMat],
    update(state) {
      towerMat.emissiveIntensity = 0.1 * state.lights;
    }
  };
}
