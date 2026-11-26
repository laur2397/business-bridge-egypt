// A loose flock of egrets and ibis crossing the river at dawn. Instanced low-poly birds whose
// wings flap in the vertex shader (two-segment wings: the outer hand lags the inner arm),
// with a little glide phase, each bird on its own beat.
import { BufferAttribute, BufferGeometry, Color, DoubleSide, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { patchAtmos } from './atmos.js';
import { mulberry32 } from './util.js';

function birdGeometry() {
  // forward +X, span along Z, up +Y; units: metres (egret ~1.5 m wingspan)
  const P = [], W = [], I = [];
  const v = (x, y, z, w) => { P.push(x, y, z); W.push(w); return P.length / 3 - 1; };
  // body (diamond) + neck + head + beak + trailing legs
  const nose = v(0.32, 0.03, 0, 0), tail = v(-0.42, 0.0, 0, 0), top = v(0.0, 0.07, 0, 0), bot = v(0.0, -0.06, 0, 0);
  const l = v(0.0, 0.0, 0.08, 0), r = v(0.0, 0.0, -0.08, 0);
  I.push(nose, top, l, nose, r, top, nose, l, bot, nose, bot, r, tail, l, top, tail, top, r, tail, bot, l, tail, r, bot);
  const head = v(0.46, 0.08, 0, 0), beak = v(0.62, 0.05, 0, 0), hu = v(0.42, 0.12, 0.0, 0);
  I.push(nose, head, hu, head, beak, hu);
  const leg0 = v(-0.4, -0.02, 0.02, 0), leg1 = v(-0.72, -0.05, 0.0, 0), leg2 = v(-0.4, -0.04, -0.02, 0);
  I.push(leg0, leg1, leg2);
  // wings: inner (arm) and outer (hand) quads per side
  for (const s of [1, -1]) {
    const a0 = v(0.12, 0.02, 0.06 * s, 0.06 * s), a1 = v(-0.14, 0.02, 0.06 * s, 0.06 * s);
    const b0 = v(0.14, 0.02, 0.38 * s, 0.38 * s), b1 = v(-0.18, 0.02, 0.38 * s, 0.38 * s);
    const c0 = v(0.04, 0.02, 0.78 * s, 0.78 * s), c1 = v(-0.12, 0.02, 0.74 * s, 0.74 * s);
    I.push(a0, b0, a1, a1, b0, b1, b0, c0, b1, b1, c0, c1);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(P), 3));
  g.setAttribute('aWing', new BufferAttribute(new Float32Array(W), 1));
  g.setIndex(I);
  g.computeVertexNormals();
  return g;
}

export function createBirds(U, quality) {
  const N = quality === 'low' ? 9 : 17;
  const mat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: DoubleSide, envMapIntensity: 0.6 });
  mat.name = 'birds';
  patchAtmos(mat, U.atmos, {
    key: 'birds',
    extra: (shader) => {
      shader.uniforms.uFlap = U.uFlapT;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aWing; uniform float uFlap;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          {
            float ph = 0.0;
            #ifdef USE_INSTANCING
              ph = fract( instanceMatrix[3].x * 0.137 + instanceMatrix[3].z * 0.071 ) * 6.2831;
            #endif
            float glide = smoothstep( 0.55, 0.9, sin( uFlap * 0.31 + ph * 1.7 ) );
            float beat = sin( uFlap * 5.2 + ph );
            float a = mix( beat * 0.85 + 0.15, 0.08, glide );
            float s = abs( aWing );
            float sg = sign( aWing );
            float inner = min( s, 0.38 );
            float outer = max( s - 0.38, 0.0 );
            float a2 = a * 1.5 + 0.25 * cos( uFlap * 5.2 + ph ) * ( 1.0 - glide );
            float y = sin( a ) * inner + sin( a2 ) * outer;
            float z = cos( a ) * inner + cos( a2 ) * outer;
            if ( s > 0.0 ) { transformed.y += y; transformed.z = sg * ( z + 0.0 ); }
            transformed.y += 0.03 * beat * ( 1.0 - glide ) * ( 1.0 - step( 0.001, s ) );
          }`);
    },
  });
  const mesh = new InstancedMesh(birdGeometry(), mat, N);
  const rand = mulberry32(31);
  const birds = [];
  const white = new Color(0.6, 0.6, 0.6), dark = new Color(0.05, 0.045, 0.045);
  for (let i = 0; i < N; i++) {
    const egret = rand() < 0.45;
    birds.push({
      off: new Vector3(-Math.abs(i - N / 2) * 3.2 + (rand() - 0.5) * 4, (rand() - 0.5) * 3 + i * 0.15, (i - N / 2) * 2.6 + (rand() - 0.5) * 3),
      scale: egret ? 1.25 + rand() * 0.2 : 1.1 + rand() * 0.15,
      wob: rand() * 10,
    });
    mesh.setColorAt(i, egret ? white : dark);
  }
  mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.layers.set(1); // birds are tiny in the water reflection: skip them there
  const m = new Matrix4(), q = new Quaternion(), p = new Vector3(), s = new Vector3(), dir = new Vector3();
  const yAxis = new Vector3(0, 1, 0);
  return {
    mesh, material: mat,
    // anchor: world point the flock crosses; dirV: unit travel direction (xz); u in [0,1] along the crossing
    update(anchor, travel, u, time, visible) {
      mesh.visible = visible;
      if (!visible) return;
      dir.copy(travel).normalize();
      const heading = Math.atan2(-dir.z, dir.x);
      birds.forEach((b, i) => {
        p.copy(anchor).addScaledVector(dir, (u - 0.5) * 260);
        // loose skein: offsets rotated into the travel frame
        const ox = b.off.x, oz = b.off.z;
        p.x += dir.x * ox - dir.z * oz; p.z += dir.z * ox + dir.x * oz;
        p.y += b.off.y + Math.sin(time * 0.7 + b.wob) * 0.5;
        p.x += Math.sin(time * 0.5 + b.wob) * 0.8;
        q.setFromAxisAngle(yAxis, heading + Math.sin(time * 0.4 + b.wob) * 0.08);
        s.setScalar(b.scale);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
