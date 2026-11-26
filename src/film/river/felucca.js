// Nile feluccas: slim lofted wooden hull (white with a painted sheer stripe, dark waterline),
// short raked mast, very long lateen yard and boom, and a billowed cotton sail with cloth panels.
// The sail shader adds thin-canvas translucency: backlit by the low sun the cloth glows warm and the
// doubled seams read as darker lines, exactly like the real thing.
import {
  BufferAttribute, BufferGeometry, Color, CylinderGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, Vector3,
} from 'three';
import { patchAtmos } from './atmos.js';
import { createGlowPoints } from './lights.js';
import { NOISE_GLSL, WORLD_NORMAL } from './glsl.js';
import { mulberry32, ss } from './util.js';

function hullGeometry() {
  const NS = 28, NU = 14;
  const pos = [], col = [], idx = [];
  const white = [0.78, 0.75, 0.68], stripe = [0.08, 0.22, 0.42], stripe2 = [0.6, 0.18, 0.08], bottom = [0.16, 0.1, 0.07];
  for (let i = 0; i <= NS; i++) {
    const t = i / NS; // 0 stern -> 1 bow
    const x = -4.6 + t * 9.6;
    const bow = Math.max(t - 0.4, 0) / 0.6;
    const w = 1.3 * (1 - Math.pow(bow, 2.3)) * (0.72 + 0.28 * ss(0, 0.35, t)) + 0.01;
    const sheer = 0.85 + 0.75 * Math.pow(bow, 2.2) + 0.35 * Math.pow(1 - t, 3);
    const keel = -0.38 * (1 - 0.6 * Math.pow(bow, 1.5)) * (0.75 + 0.25 * ss(0, 0.3, t));
    for (let j = 0; j <= NU; j++) {
      const ph = (j / NU) * Math.PI - Math.PI / 2; // port gunwale -> keel -> starboard gunwale
      const c = Math.cos(ph);
      const z = w * Math.sin(ph) * (0.35 + 0.65 * Math.pow(Math.abs(Math.sin(ph)), 0.25));
      const y = sheer - (sheer - keel) * Math.pow(c, 0.55);
      pos.push(x, y, z);
      const fromTop = sheer - y;
      let cc = white;
      if (fromTop < 0.16) cc = stripe; else if (fromTop < 0.24) cc = stripe2;
      if (y < 0.06) cc = bottom;
      col.push(...cc);
    }
  }
  for (let i = 0; i < NS; i++) {
    for (let j = 0; j < NU; j++) {
      const a = i * (NU + 1) + j, b = a + NU + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  // stern transom (fan)
  const base = pos.length / 3;
  pos.push(-4.6, 0.75, 0); col.push(...white);
  for (let j = 0; j < NU; j++) idx.push(base, j + 1, j);
  // thwart / deck boards inside
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function sailGeometry(T, P, C, belly) {
  const N = 18;
  const pos = [], uv = [], idx = [];
  const footDir = new Vector3().subVectors(C, T);
  const footLen = footDir.length(); footDir.normalize();
  const n = new Vector3().subVectors(P, T).cross(footDir).normalize();
  const v = new Vector3();
  const rowStart = [];
  let k = 0;
  for (let i = 0; i <= N; i++) {
    rowStart.push(k);
    for (let j = 0; j <= N - i; j++) {
      const bP = i / N, bC = j / N, bT = 1 - bP - bC;
      v.set(0, 0, 0).addScaledVector(T, bT).addScaledVector(P, bP).addScaledVector(C, bC);
      const b = Math.pow(Math.max(bT * bP * bC * 27, 0), 0.6) + 0.35 * bC * bP * 4 * (1 - bT);
      v.addScaledVector(n, belly * b);
      pos.push(v.x, v.y, v.z);
      const d = new Vector3(v.x, v.y, v.z).sub(T);
      uv.push(d.dot(footDir) / footLen, bP);
      k++;
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N - i; j++) {
      const a = rowStart[i] + j, b = rowStart[i + 1] + j;
      idx.push(a, a + 1, b);
      if (j < N - i - 1) idx.push(a + 1, b + 1, b);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function spar(a, b, r0, r1) {
  const d = new Vector3().subVectors(b, a);
  const g = new CylinderGeometry(r1, r0, d.length(), 6, 1);
  g.translate(0, d.length() / 2, 0);
  const m = new Mesh(g);
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), d.normalize());
  m.updateMatrix();
  g.applyMatrix4(m.matrix);
  return g;
}

export function createFeluccas(U, quality) {
  const low = quality === 'low';
  const hullMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.62, side: DoubleSide });
  hullMat.name = 'hull';
  patchAtmos(hullMat, U.atmos, {
    key: 'hull',
    extra: (shader) => {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${NOISE_GLSL}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          diffuseColor.rgb *= gl_FrontFacing ? ( 0.85 + 0.25 * rNoise( vAtmW * vec3( 0.6, 4.0, 0.6 ) ) ) : 0.35;`);
    },
  });
  const woodMat = new MeshStandardMaterial({ color: new Color(0.24, 0.17, 0.11), roughness: 0.7 });
  woodMat.name = 'spar';
  patchAtmos(woodMat, U.atmos, { key: 'spar' });
  const sailMat = new MeshStandardMaterial({ color: new Color(0.92, 0.88, 0.79), roughness: 0.92, side: DoubleSide });
  sailMat.name = 'sail';
  patchAtmos(sailMat, U.atmos, {
    key: 'sail',
    extra: (shader) => {
      shader.uniforms.uLightDir = U.uLightDir;
      shader.uniforms.uSunE = U.uSunE;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vSail;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSail = uv;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${NOISE_GLSL}\nvarying vec2 vSail; uniform vec3 uLightDir; uniform vec3 uSunE;\nfloat gSeam;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            float seam = smoothstep( 0.44, 0.49, abs( fract( vSail.x * 13.0 ) - 0.5 ) );
            float hem = smoothstep( 0.03, 0.0, vSail.y ) * 0.7;
            float stain = rFbm( vec3( vSail * 9.0, 1.0 ) );
            gSeam = clamp( seam + hem, 0.0, 1.0 );
            diffuseColor.rgb *= ( 0.92 + 0.12 * stain ) * ( 1.0 - 0.1 * gSeam );
            diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.92, 0.84, 0.7 ), smoothstep( 0.55, 0.8, stain ) * 0.6 );
          }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {
            vec3 Nw = normalize( ${WORLD_NORMAL} );
            vec3 L = normalize( uLightDir );
            vec3 V = normalize( cameraPosition - vAtmW );
            float back = max( -dot( Nw, L ), 0.0 );
            float fwd = pow( max( dot( -V, L ), 0.0 ), 4.0 );
            float thick = 1.0 + gSeam * 1.8;
            vec3 tr = uSunE * diffuseColor.rgb * vec3( 1.0, 0.9, 0.72 ) * ( back * 0.42 + fwd * 0.5 ) * exp( -( thick - 1.0 ) * 0.9 ) / 3.14159;
            totalEmissiveRadiance += tr;
          }`);
    },
  });

  const hullGeo = hullGeometry();
  // rig (local, bow toward +X): short raked mast, very long lateen yard, boom along the foot
  const T = new Vector3(4.2, 1.35, 0), P = new Vector3(-5.2, 14.2, 0), C = new Vector3(-3.9, 1.95, 0);
  const sparGeo = [];
  const mastBase = new Vector3(1.2, 0.2, 0), mastTop = new Vector3(1.05, 6.6, 0);
  const rig = [
    spar(mastBase, mastTop, 0.12, 0.08),
    spar(T.clone().add(new Vector3(0.5, -0.65, 0)), P.clone().add(new Vector3(-0.3, 0.4, 0)), 0.09, 0.05),
    spar(T.clone().add(new Vector3(0.2, -0.05, 0)), C.clone().add(new Vector3(-0.25, 0.0, 0)), 0.07, 0.06),
  ];
  const sparMerged = rig;
  const configs = [
    // x, z, heading (rad, 0 = +X), scale, sheet angle, belly, speed
    { x: 2, z: 150, h: -1.95, s: 1.0, sheet: 0.45, belly: 1.0, v: 1.0, hero: true },
    { x: 62, z: -60, h: -1.35, s: 1.05, sheet: -0.4, belly: 0.9, v: 0.8 },
    { x: -105, z: -300, h: -1.75, s: 0.95, sheet: 0.5, belly: 1.1, v: 0.7 },
    { x: 140, z: -470, h: -2.4, s: 1.1, sheet: -0.55, belly: 0.9, v: 0.6 },
    { x: -40, z: -620, h: -1.2, s: 1.0, sheet: 0.35, belly: 1.0, v: 0.6 },
    { x: 60, z: -1250, h: -1.6, s: 1.1, sheet: 0.4, belly: 1.0, v: 0.5 },
  ];
  const use = low ? configs.filter((_, i) => i % 2 === 0 || i === 1) : configs;
  const rand = mulberry32(77);
  const boats = use.map((c, i) => {
    const g = new Group();
    g.name = 'felucca-' + i;
    const hull = new Mesh(hullGeo, hullMat);
    g.add(hull);
    const rigG = new Group();
    rigG.position.copy(mastBase);
    const sail = new Mesh(sailGeometry(T.clone().sub(mastBase), P.clone().sub(mastBase), C.clone().sub(mastBase), 0.9 * c.belly * (c.sheet > 0 ? 1 : -1)), sailMat);
    rigG.add(sail);
    for (const sg of sparMerged) { const mm = new Mesh(sg, woodMat); mm.position.copy(mastBase).negate(); rigG.add(mm); }
    rigG.rotation.y = c.sheet;
    g.add(rigG);
    // a warm lantern hung low on the mast, lit after dusk
    g.add(createGlowPoints(U, {
      positions: new Float32Array([1.4, 2.6, 0]), colors: new Float32Array([7, 4.2, 1.8]),
      sizes: new Float32Array([0.5]), rands: new Float32Array([0.3 + 0.4 * (i / use.length)]),
    }, { on: U.uCityOn, minPx: 1.4 }));
    g.scale.setScalar(c.s);
    return { group: g, cfg: c, phase: rand() * 10, pos: new Vector3() };
  });
  const group = new Group();
  boats.forEach((b) => group.add(b.group));

  return {
    group, boats, materials: [hullMat, woodMat, sailMat],
    // progress-driven position (deterministic for scrubbing) + time-driven bobbing
    update(time, progress, reduced, wakeUniforms) {
      const amp = reduced ? 0.35 : 1;
      boats.forEach((b, i) => {
        const c = b.cfg;
        const travel = progress * 160 * c.v + (reduced ? 0 : time * 0.15 * c.v);
        const dx = Math.cos(c.h), dz = Math.sin(c.h);
        b.pos.set(c.x + dx * travel, 0, c.z + dz * travel);
        const t = time + b.phase;
        b.group.position.set(b.pos.x, (0.06 * Math.sin(t * 1.1) + 0.03 * Math.sin(t * 2.3)) * amp - 0.05, b.pos.z);
        b.group.rotation.set(0.035 * Math.sin(t * 0.8) * amp + 0.06 * Math.sign(c.sheet), -c.h, 0.02 * Math.sin(t * 0.95 + 1.0) * amp, 'YXZ');
        if (wakeUniforms && wakeUniforms[i]) wakeUniforms[i].set(b.pos.x + dx * 4.0 * c.s, b.pos.z + dz * 4.0 * c.s, c.h, 0.9 * c.v + 0.3);
      });
    },
  };
}
