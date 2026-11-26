// Cairo along the Nile: embanked banks, palm groves and tree lines, a varied skyline (mid-rise blocks
// with roof clutter, setback towers, glass towers) with procedural windows (glass by day, lit by night),
// the Cairo Tower with its lattice, the three Giza pyramids (51.84 deg) on a desert plateau, street and
// corniche lights. Camera looks toward -Z; west bank (pyramids) on the left, downtown on the right.
import {
  BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DoubleSide, ExtrudeGeometry,
  Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Path, Quaternion, Shape, SphereGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchAtmos } from './atmos.js';
import { NOISE_GLSL, WORLD_NORMAL } from './glsl.js';
import { createGlowPoints } from './lights.js';
import { mulberry32 } from './util.js';

export const LEFT_BANK = [[-420, 3000], [-330, 1200], [-290, 300], [-285, -400], [-300, -760], [-330, -1200], [-440, -2200], [-380, -3400], [-220, -5600], [-120, -14000]];
export const RIGHT_BANK = [[440, 3000], [360, 1200], [320, 300], [305, -400], [312, -760], [350, -1200], [500, -2200], [440, -3400], [280, -5600], [160, -14000]];
export const LAND_Y = 2.2;

export function bankXAt(bank, z) {
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

function patchWindows(mat, U, key, glass) {
  patchAtmos(mat, U.atmos, {
    key,
    extra: (shader) => {
      shader.uniforms.uOn = U.uCityOn;
      shader.uniforms.uWin = U.uWinI;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLP; varying vec3 vON; varying float vSeed; varying float vHgt;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          {
            vec3 sc = vec3( 1.0 );
            #ifdef USE_INSTANCING
              sc = vec3( length( instanceMatrix[0].xyz ), length( instanceMatrix[1].xyz ), length( instanceMatrix[2].xyz ) );
              vSeed = fract( sin( dot( instanceMatrix[3].xz, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
            #else
              vSeed = 0.5;
            #endif
            vLP = position * sc;
            vHgt = sc.y;
            vON = normal;
          }`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          ${NOISE_GLSL}
          uniform float uOn; uniform float uWin;
          varying vec3 vLP; varying vec3 vON; varying float vSeed; varying float vHgt;
          float gWin; float gLit; vec3 gWinCol;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          gWin = 0.0; gLit = 0.0; gWinCol = vec3( 0.0 );
          {
            float side = abs( vON.y ) < 0.5 ? 1.0 : 0.0;
            float hc = abs( vON.x ) > 0.5 ? vLP.z : vLP.x;
            float floorH = ${glass ? '3.8' : '3.2'};
            vec2 c = vec2( hc / ${glass ? '2.0' : '3.4'}, vLP.y / floorH );
            vec2 cell = floor( c ); vec2 f = fract( c );
            vec2 fw = fwidth( c );
            float aa = smoothstep( 0.2, 0.6, max( fw.x, fw.y ) );
            float mask = smoothstep( 0.16, 0.24, f.x ) * smoothstep( 0.84, 0.76, f.x ) * smoothstep( 0.24, 0.32, f.y ) * smoothstep( 0.86, 0.78, f.y );
            ${glass ? 'mask = smoothstep( 0.04, 0.1, f.x ) * smoothstep( 0.96, 0.9, f.x ) * smoothstep( 0.08, 0.14, f.y ) * smoothstep( 0.96, 0.9, f.y );' : ''}
            mask = mix( mask, ${glass ? '0.75' : '0.35'}, aa ) * side * step( 0.6, vLP.y / floorH );
            gWin = mask;
            // facade: weathering, darker ground floor, slab edges, AO at the base
            float n = rNoise( vec3( vLP.x * 0.08, vLP.y * 0.05, vLP.z * 0.08 ) + vSeed * 40.0 );
            diffuseColor.rgb *= 0.8 + 0.35 * n;
            diffuseColor.rgb *= mix( 0.45, 1.0, smoothstep( 0.0, 5.0, vLP.y ) ) * mix( 0.8, 1.06, clamp( vLP.y / max( vHgt, 1.0 ), 0.0, 1.0 ) );
            diffuseColor.rgb *= 0.9 + 0.2 * rHash2( vec2( floor( hc / 9.0 ), vSeed * 31.0 ) ) * side;
            diffuseColor.rgb *= 1.0 - 0.15 * smoothstep( 0.92, 1.0, f.y ) * side * ( 1.0 - aa );
            diffuseColor.rgb = mix( diffuseColor.rgb, vec3( ${glass ? '0.03, 0.04, 0.05' : '0.06, 0.06, 0.065'} ), mask * ${glass ? '0.8' : '0.68'} );
            // night: lit windows
            float bOn = smoothstep( vSeed * 0.8, vSeed * 0.8 + 0.15, uOn );
            float r = rHash2( cell + vSeed * 91.7 + vON.xz * 13.0 );
            float r2 = rHash2( cell * 1.37 + vSeed * 17.1 );
            float density = mix( 0.08, 0.42, fract( vSeed * 7.3 ) );
            gLit = step( r, density * bOn );
            vec3 warm = vec3( 1.0, 0.6, 0.28 );
            vec3 cool = vec3( 0.7, 0.82, 1.0 );
            gWinCol = mix( warm, cool, step( 0.8, r2 ) ) * ( 0.15 + 1.1 * r2 * r2 );
            vec3 avg = mix( warm, cool, 0.2 ) * 0.07 * density * bOn;
            gWinCol = mix( gWinCol * gLit, avg, aa ) * mask;
          }`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix( roughnessFactor, ${glass ? '0.18' : '0.2'}, gWin );`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += gWinCol * uWin;`);
    },
  });
}

// ---------- palm: trunk + arched fronds with procedural leaflets ----------
function palmGeometry(rand) {
  const parts = [];
  const trunk = new CylinderGeometry(0.17, 0.27, 1, 6, 6, true);
  trunk.translate(0, 0.5, 0);
  // bend the trunk slightly
  const tp = trunk.attributes.position;
  for (let i = 0; i < tp.count; i++) { const y = tp.getY(i); tp.setX(i, tp.getX(i) + y * y * 0.07); }
  const tLeaf = new Float32Array(tp.count * 3).fill(0);
  trunk.setAttribute('aLeaf', new BufferAttribute(tLeaf, 3));
  trunk.deleteAttribute('uv');
  parts.push(trunk);
  // fronds (crown at y=1 of a unit-height palm; fronds scale with the instance)
  const nF = 11;
  for (let f = 0; f < nF; f++) {
    const th = (f / nF) * Math.PI * 2 + rand() * 0.3;
    const len = 0.32 + rand() * 0.08; // relative to palm height
    const lift = (rand() * 0.5 + 0.2) * 0.12;
    const seg = 7;
    const pos = [], leaf = [], idx = [];
    const dx = Math.cos(th), dz = Math.sin(th);
    const px = -dz, pz = dx;
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      const r = u * len;
      const y = 1.0 + lift * Math.sin(u * Math.PI * 0.9) - u * u * len * 0.75;
      const w = 0.075 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.1 + 0.05)), 0.6) + 0.004;
      const cx = 0.07 + dx * r, cz = dz * r; // crown offset from the trunk bend
      const droop = -w * 0.35;
      pos.push(cx + px * w, y + droop, cz + pz * w, cx, y, cz, cx - px * w, y + droop, cz - pz * w);
      leaf.push(u, 1, 1, u, 0, 1, u, -1, 1);
    }
    for (let i = 0; i < seg; i++) {
      const a = i * 3;
      idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('aLeaf', new BufferAttribute(new Float32Array(leaf), 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    parts.push(g);
  }
  const trunkN = trunk.toNonIndexed ? trunk : trunk;
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
}

export function createCity(U, quality) {
  const low = quality === 'low';
  const rand = mulberry32(1234);
  const group = new Group();
  group.name = 'river-city';
  const m = new Matrix4(), q = new Quaternion(), p = new Vector3(), s = new Vector3(), yAxis = new Vector3(0, 1, 0);

  // ---------- land with the river cut out; the hole's side walls are the stone embankment ----------
  const outer = new Shape();
  outer.moveTo(-30000, -4000); outer.lineTo(30000, -4000); outer.lineTo(30000, 30000); outer.lineTo(-30000, 30000); outer.closePath();
  const hole = new Path();
  const ring = [...LEFT_BANK, ...RIGHT_BANK.slice().reverse()];
  ring.forEach(([x, z], i) => (i === 0 ? hole.moveTo(x, -z) : hole.lineTo(x, -z)));
  hole.closePath();
  outer.holes.push(hole);
  const landGeo = new ExtrudeGeometry(outer, { depth: LAND_Y + 3, bevelEnabled: false, curveSegments: 1 });
  landGeo.rotateX(-Math.PI / 2);
  landGeo.translate(0, -3, 0);
  const landMat = new MeshStandardMaterial({ color: new Color(0.3, 0.27, 0.2), roughness: 1 });
  landMat.name = 'land';
  patchAtmos(landMat, U.atmos, {
    key: 'land',
    extra: (shader) => {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${NOISE_GLSL}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            float n = rFbm2( vAtmW.xz * 0.004 );
            diffuseColor.rgb *= 0.7 + 0.6 * n;
            diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.12, 0.15, 0.08 ), smoothstep( 0.45, 0.7, rFbm2( vAtmW.xz * 0.01 + 5.0 ) ) * 0.6 );
          }`);
    },
  });
  const wallMat = new MeshStandardMaterial({ color: new Color(0.5, 0.45, 0.38), roughness: 0.9 });
  wallMat.name = 'embank';
  patchAtmos(wallMat, U.atmos, {
    key: 'embank',
    extra: (shader) => {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${NOISE_GLSL}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            vec3 w = vAtmW;
            float blk = rHash2( floor( vec2( ( w.x + w.z ) / 1.6, w.y / 0.6 ) ) );
            diffuseColor.rgb *= 0.75 + 0.35 * blk;
            diffuseColor.rgb *= mix( 0.35, 1.0, smoothstep( 0.0, 1.2, w.y ) ); // wet line
          }`);
    },
  });
  const land = new Mesh(landGeo, [landMat, wallMat]);
  group.add(land);

  // ---------- Giza plateau ----------
  const duneMat = new MeshStandardMaterial({ color: new Color(0.62, 0.47, 0.3), roughness: 1 });
  duneMat.name = 'dune';
  patchAtmos(duneMat, U.atmos, { key: 'dune' });
  const duneGeo = new SphereGeometry(1, 48, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const dp = duneGeo.attributes.position;
  for (let i = 0; i < dp.count; i++) { const y = dp.getY(i); dp.setY(i, Math.pow(y, 0.35)); }
  duneGeo.computeVertexNormals();
  const dune = new Mesh(duneGeo, duneMat);
  dune.scale.set(2600, 44, 1500);
  dune.position.set(-2350, -2, -4100);
  group.add(dune);

  // ---------- pyramids: Khufu, Khafre, Menkaure at 51.84 deg ----------
  const pyrMat = new MeshStandardMaterial({ color: new Color(0.78, 0.6, 0.4), roughness: 0.95, flatShading: true });
  pyrMat.name = 'pyr';
  patchAtmos(pyrMat, U.atmos, {
    key: 'pyr', mul: 0.42,
    extra: (shader) => {
      shader.uniforms.uFlood = U.uFlood;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${NOISE_GLSL}\nuniform float uFlood;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += diffuseColor.rgb * vec3( 1.0, 0.8, 0.55 ) * uFlood * ( 0.35 + 0.65 * smoothstep( 0.0, 0.8, normalize( cross( dFdx( vAtmW ), dFdy( vAtmW ) ) ).z ) );`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            float course = smoothstep( 0.35, 0.5, abs( fract( vAtmW.y / 1.5 ) - 0.5 ) );
            diffuseColor.rgb *= 0.9 + 0.1 * course;
            diffuseColor.rgb *= 0.85 + 0.25 * rNoise( vAtmW * 0.05 );
          }`);
    },
  });
  const slope = Math.tan((51.84 * Math.PI) / 180);
  const PY_BASE = 40;
  const pyrs = [
    { h: 146.6, x: -2000, z: -3700, rot: 0.06 },
    { h: 143.5, x: -2330, z: -4050, rot: 0.06, cap: true },
    { h: 65.5, x: -2630, z: -4380, rot: 0.06 },
  ];
  // queens' pyramids / mastaba bumps for scale
  for (let i = 0; i < 3; i++) pyrs.push({ h: 20 + i * 2, x: -1830 + i * 45, z: -3860, rot: 0.06 });
  const pyrGroup = new Group();
  for (const P of pyrs) {
    const half = P.h / slope;
    const g = new ConeGeometry(half * Math.SQRT2, P.h, 4, 1).toNonIndexed();
    g.rotateY(Math.PI / 4 + P.rot);
    g.translate(0, P.h / 2, 0);
    g.computeVertexNormals();
    const mesh = new Mesh(g, pyrMat);
    mesh.position.set(P.x, PY_BASE, P.z);
    pyrGroup.add(mesh);
  }
  group.add(pyrGroup);

  // ---------- buildings ----------
  const counts = low ? { block: 650, tower: 70, glass: 24 } : { block: 1500, tower: 150, glass: 46 };
  const blockGeo = new BoxGeometry(1, 1, 1); blockGeo.translate(0, 0.5, 0);
  const towerGeo = mergeGeometries([
    (() => { const g = new BoxGeometry(1, 0.82, 1); g.translate(0, 0.41, 0); return g; })(),
    (() => { const g = new BoxGeometry(0.78, 0.14, 0.78); g.translate(0, 0.89, 0); return g; })(),
    (() => { const g = new BoxGeometry(0.4, 0.05, 0.4); g.translate(0, 0.985, 0); return g; })(),
  ]);
  const blockMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.88 });
  blockMat.name = 'blocks';
  patchWindows(blockMat, U, 'blocks', false);
  const towerMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 });
  towerMat.name = 'towers';
  patchWindows(towerMat, U, 'towers', false);
  const glassMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.4 });
  glassMat.name = 'glass';
  patchWindows(glassMat, U, 'glass', true);
  const blocks = new InstancedMesh(blockGeo, blockMat, counts.block);
  const towers = new InstancedMesh(towerGeo, towerMat, counts.tower);
  const glass = new InstancedMesh(blockGeo, glassMat, counts.glass);
  const sand = [new Color(0.5, 0.42, 0.33), new Color(0.58, 0.51, 0.41), new Color(0.44, 0.38, 0.31), new Color(0.62, 0.58, 0.52), new Color(0.47, 0.4, 0.34), new Color(0.4, 0.38, 0.36), new Color(0.55, 0.55, 0.53)];
  const glassCols = [new Color(0.3, 0.38, 0.42), new Color(0.35, 0.32, 0.28), new Color(0.25, 0.3, 0.36)];
  const tall = [];
  const roofs = [];
  let nb = 0, nt = 0, ng = 0, guard = 0;
  const total = counts.block + counts.tower + counts.glass;
  while ((nb < counts.block || nt < counts.tower || ng < counts.glass) && guard++ < total * 40) {
    const z = 600 - Math.pow(rand(), 1.25) * 6600;
    const span = 900 + Math.max(0, -z) * 0.6;
    const x = (rand() * 2 - 1) * span;
    if (inRiver(x, z, 45)) continue;
    const left = x < 0;
    // keep the pyramid sight line open (left, behind ~1 km) and the left near bank low
    const angL = Math.atan2(-x, -z + 300) / (Math.PI / 180);
    const angF = Math.atan2(-x - 10, -z - 185) / (Math.PI / 180);
    const pyramidZone = left && ((angL > 20 && angL < 36) || (angF > 22 && angF < 40)) && z < 300;
    if (pyramidZone && rand() < 0.5) continue;
    const nearRiver = inRiver(x, z, 160);
    const downtown = !left && z < -700 && z > -2800 && x < 1800;
    let kind = 'block';
    const rr = rand();
    if (downtown && rr < 0.12 && ng < counts.glass) kind = 'glass';
    else if ((downtown && rr < 0.3) || (nearRiver && !left && rr < 0.05)) kind = nt < counts.tower ? 'tower' : 'block';
    if (kind === 'block' && nb >= counts.block) continue;
    let h, w, d;
    if (kind === 'glass') { h = 90 + Math.pow(rand(), 1.3) * 90; w = 26 + rand() * 16; d = 26 + rand() * 16; }
    else if (kind === 'tower') { h = 55 + Math.pow(rand(), 1.4) * 85; w = 22 + rand() * 18; d = 20 + rand() * 16; }
    else {
      h = 12 + Math.pow(rand(), 2.0) * (nearRiver ? 40 : 30); w = 16 + rand() * 26; d = 14 + rand() * 24;
      if (pyramidZone) h = Math.min(h, 3 + Math.hypot(x, z - 300) * 0.007);
      if (z > -500) h = Math.min(h, 10 + rand() * 18);
    }
    // stand back from the water: the corniche road and gardens
    const bx = bankXAt(left ? LEFT_BANK : RIGHT_BANK, z);
    if (bx !== null && Math.abs(x - bx) < 55 + w * 0.6) continue;
    const rot = (rand() - 0.5) * 0.3 + (rand() < 0.12 ? Math.PI / 4 : 0);
    q.setFromAxisAngle(yAxis, rot);
    p.set(x, LAND_Y - 0.5, z); s.set(w, h, d);
    m.compose(p, q, s);
    if (kind === 'glass') { glass.setMatrixAt(ng, m); glass.setColorAt(ng, glassCols[Math.floor(rand() * 3)]); ng++; }
    else if (kind === 'tower') { towers.setMatrixAt(nt, m); towers.setColorAt(nt, sand[Math.floor(rand() * sand.length)].clone().multiplyScalar(0.9 + rand() * 0.2)); nt++; }
    else {
      blocks.setMatrixAt(nb, m); blocks.setColorAt(nb, sand[Math.floor(rand() * sand.length)].clone().multiplyScalar(0.8 + rand() * 0.35)); nb++;
      if (!low && h > 14 && rand() < 0.7) roofs.push([x + (rand() - 0.5) * w * 0.5, LAND_Y - 0.5 + h, z + (rand() - 0.5) * d * 0.5, 2 + rand() * 4, 1.5 + rand() * 2.5, rot]);
    }
    if (h > 60) tall.push([x, LAND_Y + h, z]);
  }
  for (const [mesh, n] of [[blocks, nb], [towers, nt], [glass, ng]]) {
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  if (roofs.length) {
    const roofMat = new MeshStandardMaterial({ color: new Color(0.45, 0.42, 0.38), roughness: 0.9 });
    roofMat.name = 'roof';
    patchAtmos(roofMat, U.atmos, { key: 'roof' });
    const rm = new InstancedMesh(blockGeo, roofMat, roofs.length);
    roofs.forEach((r, i) => { q.setFromAxisAngle(yAxis, r[5]); m.compose(p.set(r[0], r[1], r[2]), q, s.set(r[3], r[4], r[3] * 0.8)); rm.setMatrixAt(i, m); });
    rm.instanceMatrix.needsUpdate = true;
    rm.computeBoundingSphere();
    group.add(rm);
  }

  // ---------- tree lines (alpha-cut silhouette ribbons along both banks) ----------
  const treeMat = new MeshStandardMaterial({ color: new Color(0.11, 0.14, 0.07), roughness: 1, side: DoubleSide });
  treeMat.name = 'treeline';
  patchAtmos(treeMat, U.atmos, {
    key: 'treeline',
    extra: (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aRib; varying vec2 vRib;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRib = aRib;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${NOISE_GLSL}\nvarying vec2 vRib;`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          {
            float a = vRib.x;
            float crown = 0.45 + 0.55 * rFbm2( vec2( a * 0.09, 0.0 ) ) + 0.25 * rNoise2( vec2( a * 0.6, 3.0 ) );
            crown *= mix( 0.6, 1.0, smoothstep( 0.2, 0.5, rNoise2( vec2( a * 0.012, 9.0 ) ) ) );
            float lumpy = 0.06 * rNoise2( vec2( a * 2.5, vRib.y * 6.0 ) );
            if ( vRib.y > crown + lumpy ) discard;
          }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          diffuseColor.rgb *= 0.65 + 0.6 * rNoise2( vec2( vRib.x * 0.8, vRib.y * 8.0 ) ) * smoothstep( 0.0, 0.6, vRib.y );`);
    },
  });
  const ribbonParts = [];
  for (const bank of [LEFT_BANK, RIGHT_BANK]) {
    const sgn = bank === LEFT_BANK ? -1 : 1;
    for (const [off, hgt, seed] of [[24, 16, 0], [46, 22, 500]]) {
      const pos = [], rib = [], idx = [];
      let along = seed, prev = null, k = 0;
      for (let z = 2800; z > -5200; z -= 12) {
        const bx = bankXAt(bank, z); if (bx === null) continue;
        const x = bx + sgn * (off + 6 * Math.sin(z * 0.01 + seed));
        if (prev) along += Math.hypot(x - prev[0], z - prev[1]);
        prev = [x, z];
        pos.push(x, LAND_Y - 0.5, z, x, LAND_Y + hgt, z);
        rib.push(along, 0, along, 1);
        if (k > 0) { const a = (k - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        k++;
      }
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
      g.setAttribute('aRib', new BufferAttribute(new Float32Array(rib), 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      ribbonParts.push(g);
    }
  }
  const treeline = new Mesh(mergeGeometries(ribbonParts), treeMat);
  treeline.frustumCulled = false;
  group.add(treeline);

  // ---------- palms ----------
  const palmMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: DoubleSide });
  palmMat.name = 'palm';
  patchAtmos(palmMat, U.atmos, {
    key: 'palm',
    extra: (shader) => {
      shader.uniforms.uWind = U.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aLeaf; varying vec3 vLeaf; uniform float uWind;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vLeaf = aLeaf;
          if ( aLeaf.z > 0.5 ) {
            float ph = 0.0;
            #ifdef USE_INSTANCING
              ph = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.07;
            #endif
            transformed.y += sin( uWind * 1.3 + ph + aLeaf.x * 2.0 ) * 0.008 * aLeaf.x;
          }`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vLeaf;`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          if ( vLeaf.z > 0.5 ) {
            float u = vLeaf.x, v = abs( vLeaf.y );
            float comb = fract( u * 26.0 - v * 1.6 );
            if ( v > 0.18 && comb > 0.55 ) discard;
            if ( v > 1.0 - 0.6 * u ) discard;
          }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          diffuseColor.rgb = vLeaf.z > 0.5 ? mix( vec3( 0.12, 0.16, 0.06 ), vec3( 0.2, 0.22, 0.09 ), vLeaf.x ) : vec3( 0.2, 0.15, 0.1 );`);
    },
  });
  const palmGeo = palmGeometry(rand);
  const palmN = low ? 220 : 520;
  const palms = new InstancedMesh(palmGeo, palmMat, palmN);
  let pn = 0;
  for (let i = 0; i < palmN * 4 && pn < palmN; i++) {
    const bank = rand() < 0.5 ? LEFT_BANK : RIGHT_BANK;
    const sgn = bank === LEFT_BANK ? -1 : 1;
    const z = 2600 - Math.pow(rand(), 1.15) * 6000;
    const bx = bankXAt(bank, z); if (bx === null) continue;
    const x = bx + sgn * (5 + Math.pow(rand(), 1.5) * 70);
    const hgt = 10 + rand() * 9;
    q.setFromAxisAngle(yAxis, rand() * Math.PI * 2);
    const lean = new Quaternion().setFromAxisAngle(new Vector3(rand() - 0.5, 0, rand() - 0.5).normalize(), (rand() - 0.5) * 0.25);
    q.premultiply(lean);
    m.compose(p.set(x, LAND_Y - 0.3, z), q, s.set(hgt, hgt, hgt));
    palms.setMatrixAt(pn++, m);
  }
  palms.count = pn;
  palms.instanceMatrix.needsUpdate = true;
  palms.computeBoundingSphere();
  group.add(palms);

  // ---------- Cairo Tower (187 m, lattice shaft, lotus crown) ----------
  const ctMat = new MeshStandardMaterial({ color: new Color(0.62, 0.56, 0.48), roughness: 0.8 });
  ctMat.name = 'ctower';
  patchAtmos(ctMat, U.atmos, {
    key: 'ctower',
    extra: (shader) => {
      shader.uniforms.uTowerOn = U.uTowerOn;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTowerOn;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float lat = 0.0;
          {
            vec3 w = vAtmW - vec3( -430.0, 0.0, -1400.0 );
            float ang = atan( w.z, w.x ) * 6.0;
            vec2 g = vec2( ang + w.y * 0.32, ang - w.y * 0.32 );
            vec2 f = abs( fract( g ) - 0.5 );
            lat = smoothstep( 0.12, 0.05, min( f.x, f.y ) ) * step( 8.0, w.y ) * step( w.y, 154.0 );
            diffuseColor.rgb *= 1.0 - 0.55 * lat;
          }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {
            float y = vAtmW.y;
            vec3 Nw = normalize( ${WORLD_NORMAL} );
            float up = smoothstep( 160.0, 10.0, y ) * 0.18 + smoothstep( 150.0, 160.0, y ) * smoothstep( 175.0, 165.0, y ) * 0.18;
            totalEmissiveRadiance += vec3( 1.0, 0.72, 0.42 ) * uTowerOn * up * ( 1.0 - 0.7 * lat ) * 1.2;
          }`);
    },
  });
  const ct = [];
  { const g = new CylinderGeometry(6.0, 4.4, 150, 20, 1, true); g.translate(0, 77, 0); ct.push(g); }
  { const g = new CylinderGeometry(15, 17, 6, 20); g.translate(0, 3, 0); ct.push(g); }
  { const g = new CylinderGeometry(10.5, 6.5, 10, 20); g.translate(0, 157, 0); ct.push(g); }
  { const g = new CylinderGeometry(7.5, 10.5, 5, 20); g.translate(0, 164.5, 0); ct.push(g); }
  { const g = new CylinderGeometry(0.8, 1.8, 18, 8); g.translate(0, 176, 0); ct.push(g); }
  const cairoTower = new Mesh(mergeGeometries(ct), ctMat);
  cairoTower.position.set(-430, LAND_Y, -1400);
  group.add(cairoTower);
  tall.push([-430, LAND_Y + 186, -1400]);

  // ---------- city lights ----------
  const lampList = [];
  const sodium = [1.0, 0.5, 0.17], whiteL = [1.0, 0.86, 0.68];
  for (const bank of [LEFT_BANK, RIGHT_BANK]) {
    const sgn = bank === LEFT_BANK ? -1 : 1;
    for (let z = 2200; z > -4600; z -= low ? 40 : 24) {
      const bx = bankXAt(bank, z); if (bx === null) continue;
      lampList.push([bx + sgn * 6, LAND_Y + 7, z, ...sodium.map((v) => v * 9), 0.9, 0.05 + 0.5 * Math.abs(z + 760) / 4000 + rand() * 0.08]);
    }
  }
  const streetN = low ? 900 : 2600;
  for (let i = 0, g2 = 0; i < streetN && g2 < streetN * 12; g2++) {
    const z = 1500 - Math.pow(rand(), 1.3) * 6800;
    const span = 900 + Math.max(0, -z) * 0.6;
    const x = (rand() * 2 - 1) * span;
    if (inRiver(x, z, 30)) continue;
    const c = rand() < 0.65 ? sodium : whiteL;
    const k = 4 + rand() * 7;
    lampList.push([x, LAND_Y + 3 + rand() * 7, z, c[0] * k, c[1] * k, c[2] * k, 0.9 + rand() * 0.8, 0.2 + rand() * 0.75]);
    i++;
  }
  const Ln = lampList.length;
  const LP = new Float32Array(Ln * 3), LC = new Float32Array(Ln * 3), LS = new Float32Array(Ln), LR = new Float32Array(Ln);
  lampList.forEach((e, i) => { LP.set(e.slice(0, 3), i * 3); LC.set(e.slice(3, 6), i * 3); LS[i] = e[6]; LR[i] = e[7]; });
  group.add(createGlowPoints(U, { positions: LP, colors: LC, sizes: LS, rands: LR }, { on: U.uCityOn, minPx: 1.3, fogMul: 0.6 }));

  const bN = tall.length;
  const bp = new Float32Array(bN * 3), bc = new Float32Array(bN * 3), bs = new Float32Array(bN), br = new Float32Array(bN);
  tall.forEach((t, i) => { bp.set(t, i * 3); bc.set([10, 0.6, 0.3], i * 3); bs[i] = 1.8; br[i] = rand(); });
  group.add(createGlowPoints(U, { positions: bp, colors: bc, sizes: bs, rands: br }, { on: U.uBeaconOn, minPx: 1.6, blink: true }));

  // Cairo Tower crown glow
  group.add(createGlowPoints(U, {
    positions: new Float32Array([-430, LAND_Y + 168, -1400]), colors: new Float32Array([2.0, 1.4, 0.75]),
    sizes: new Float32Array([2.2]), rands: new Float32Array([0]),
  }, { on: U.uTowerOn, minPx: 3 }));

  return {
    group,
    cairoTowerTop: new Vector3(-430, LAND_Y + 170, -1400),
    pyramidCenter: new Vector3(-2300, PY_BASE + 60, -4000),
    materials: [landMat, wallMat, duneMat, pyrMat, blockMat, towerMat, glassMat, treeMat, palmMat, ctMat],
  };
}
