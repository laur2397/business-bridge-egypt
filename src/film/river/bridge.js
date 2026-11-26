// Cable-stayed bridge over the Nile: two inverted-Y concrete pylons, a spatial fan of HDPE-sheathed
// stay cables to both deck edges, steel box-girder deck with fascia, parapets, lamp standards,
// piers. Night: pylon uplights (analytic point lights in the concrete shader), deck lamps, cars.
// Local axes: deck along X, Y up, Z across.
import {
  BoxGeometry, Color, CylinderGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial,
  Quaternion, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchAtmos } from './atmos.js';
import { NOISE_GLSL, WORLD_NORMAL } from './glsl.js';
import { createGlowPoints, createCars } from './lights.js';

export const BRIDGE = { half: 380, pylonX: 170, deckY: 18, deckW: 28, pylonH: 132 };

function boxAt(w, h, d, x, y, z) { const g = new BoxGeometry(w, h, d); g.translate(x, y, z); return g; }

// tapered box between two centre points (bottom/top), with sizes at each end
function strut(x0, y0, z0, x1, y1, z1, w0, d0, w1, d1) {
  const g = new BoxGeometry(1, 1, 1, 1, 6, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
    const t = vy + 0.5;
    const w = w0 + (w1 - w0) * t, d = d0 + (d1 - d0) * t;
    p.setXYZ(i, x0 + (x1 - x0) * t + vx * w, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t + vz * d);
  }
  g.computeVertexNormals();
  return g;
}

export function createBridge(U, quality) {
  const low = quality === 'low';
  const B = BRIDGE;
  const group = new Group();
  group.name = 'river-bridge';
  const L = B.half * 2;

  // ---------- materials ----------
  const upPos = []; // uplight positions (local), filled below
  const concrete = new MeshStandardMaterial({ color: new Color(0.62, 0.58, 0.52), roughness: 0.82, metalness: 0, envMapIntensity: 1 });
  concrete.name = 'concrete';
  const uUpPos = { value: Array.from({ length: 8 }, () => new Vector3()) };
  patchAtmos(concrete, U.atmos, {
    key: 'concrete',
    extra: (shader) => {
      shader.uniforms.uUpPos = uUpPos;
      shader.uniforms.uUpOn = U.uUpOn;
      shader.uniforms.uBridgeInv = uBridgeInv;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${NOISE_GLSL}\nuniform vec3 uUpPos[ 8 ]; uniform float uUpOn; uniform mat4 uBridgeInv;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            vec3 w = vAtmW;
            float n = rFbm( w * vec3( 0.35, 0.12, 0.35 ) );
            float stain = rNoise( vec3( w.x * 0.9 + w.z * 0.9, w.y * 0.04, 3.0 ) );
            float joint = smoothstep( 0.06, 0.0, abs( fract( w.y / 4.2 ) - 0.5 ) - 0.44 );
            diffuseColor.rgb *= ( 0.82 + 0.3 * n ) * ( 1.0 - 0.18 * smoothstep( 0.55, 0.9, stain ) ) * ( 1.0 - 0.12 * joint );
            diffuseColor.rgb *= mix( 0.55, 1.0, smoothstep( 0.0, 6.0, w.y ) ); // wet/dark tide line at the water
            // pylon: recessed vertical groove on every face + steel anchorage zone at the head
            vec3 lp = ( uBridgeInv * vec4( w, 1.0 ) ).xyz;
            vec3 ln = normalize( mat3( uBridgeInv ) * cross( dFdx( vAtmW ), dFdy( vAtmW ) ) );
            float px = abs( abs( lp.x ) - ${B.pylonX.toFixed(1)} );
            if ( px < 6.0 && w.y > ${(B.deckY + 2).toFixed(1)} ) {
              float across = abs( ln.x ) > 0.6 ? abs( lp.z ) : px;
              float groove = abs( ln.x ) > 0.6 && abs( lp.z ) > 4.0 ? 0.0 : smoothstep( 0.55, 0.35, across );
              diffuseColor.rgb *= 1.0 - 0.45 * groove;
              float anch = smoothstep( ${(B.pylonH - 31).toFixed(1)}, ${(B.pylonH - 30).toFixed(1)}, w.y ) * smoothstep( ${(B.pylonH - 1).toFixed(1)}, ${(B.pylonH - 2).toFixed(1)}, w.y );
              diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.24, 0.24, 0.25 ) * ( 0.85 + 0.3 * n ), anch * 0.85 );
            }
          }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          if ( uUpOn > 0.001 ) {
            vec3 Nw = normalize( ${WORLD_NORMAL} );
            vec3 acc = vec3( 0.0 );
            for ( int i = 0; i < 8; i ++ ) {
              vec3 d = uUpPos[ i ] - vAtmW;
              float l2 = dot( d, d );
              vec3 Ld = d * inversesqrt( l2 );
              float cone = smoothstep( 0.15, 0.65, -Ld.y );   // fixtures aim upward
              acc += vec3( max( dot( Nw, Ld ), 0.0 ) * cone / ( 1.0 + l2 * 0.0012 ) );
            }
            totalEmissiveRadiance += diffuseColor.rgb * acc * vec3( 1.0, 0.74, 0.48 ) * uUpOn * 1.8;
          }`);
    },
  });

  const steel = new MeshStandardMaterial({ color: new Color(0.42, 0.42, 0.42), roughness: 0.55, metalness: 0.35 });
  steel.name = 'steel';
  const uBridgeInv = { value: new Matrix4() };
  patchAtmos(steel, U.atmos, {
    key: 'steel',
    extra: (shader) => {
      shader.uniforms.uLampsOn = U.uLampsOn;
      shader.uniforms.uBridgeInv = uBridgeInv;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform float uLampsOn; uniform mat4 uBridgeInv;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {
            vec3 lp = ( uBridgeInv * vec4( vAtmW, 1.0 ) ).xyz;
            vec3 Nw = normalize( ${WORLD_NORMAL} );
            // pools of warm light from the lamp standards on the road surface and the parapet tops
            float pool = pow( 0.5 + 0.5 * cos( lp.x / 20.0 * 6.2831 ), 3.0 );
            float top = smoothstep( 0.6, 0.9, Nw.y ) * step( ${(B.deckY - 0.3).toFixed(2)}, lp.y );
            float edge = smoothstep( 6.0, 13.0, abs( lp.z ) );
            totalEmissiveRadiance += vec3( 1.0, 0.62, 0.32 ) * uLampsOn * top * ( 0.2 + 0.8 * pool ) * mix( 0.5, 1.0, edge ) * 0.06;
            // underside catches a little bounce
            totalEmissiveRadiance += vec3( 1.0, 0.75, 0.5 ) * uLampsOn * smoothstep( -0.5, -0.9, Nw.y ) * 0.02;
          }`);
    },
  });

  const cableMat = new MeshStandardMaterial({ color: new Color(0.86, 0.84, 0.8), roughness: 0.32, metalness: 0.0 });
  cableMat.name = 'cable';
  patchAtmos(cableMat, U.atmos, {
    key: 'cable',
    extra: (shader) => {
      shader.uniforms.uUpOn = U.uUpOn;
      shader.uniforms.uFat = U.uCableFat;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uFat;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.xz *= uFat;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uUpOn;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3( 1.0, 0.72, 0.45 ) * uUpOn * 0.08 * exp( -max( vAtmW.y - ${B.deckY.toFixed(1)}, 0.0 ) / 45.0 );`);
    },
  });

  const lampMat = new MeshStandardMaterial({ color: new Color(0.2, 0.2, 0.21), roughness: 0.5, metalness: 0.6 });
  lampMat.name = 'lamppost';
  patchAtmos(lampMat, U.atmos, { key: 'lamppost' });

  // ---------- deck ----------
  const deckParts = [
    boxAt(L, 2.2, B.deckW, 0, B.deckY - 1.1, 0), // road slab
    boxAt(L, 2.6, 1.2, 0, B.deckY - 2.2, B.deckW / 2 + 0.2), // fascia
    boxAt(L, 2.6, 1.2, 0, B.deckY - 2.2, -B.deckW / 2 - 0.2),
    boxAt(L, 2.0, B.deckW - 8, 0, B.deckY - 3.6, 0), // box girder
    boxAt(L, 1.1, 0.5, 0, B.deckY + 0.55, B.deckW / 2 - 0.3), // parapets
    boxAt(L, 1.1, 0.5, 0, B.deckY + 0.55, -B.deckW / 2 + 0.3),
    boxAt(L, 0.8, 0.8, 0, B.deckY + 0.4, 0), // median barrier
    boxAt(L, 0.12, 0.12, 0, B.deckY + 1.35, B.deckW / 2 - 0.3), // handrails
    boxAt(L, 0.12, 0.12, 0, B.deckY + 1.35, -B.deckW / 2 + 0.3),
  ];
  // cable anchor brackets along the deck edges
  const deck = new Mesh(mergeGeometries(deckParts), steel);
  group.add(deck);

  // ---------- pylons + piers ----------
  const H = B.pylonH;
  const parts = [];
  for (const s of [-1, 1]) {
    const x = s * B.pylonX;
    const legZ = B.deckW / 2 + 5;
    const joinY = H - 34;
    parts.push(strut(x, -2, legZ, x, joinY, 2.4, 6.5, 6.0, 4.6, 4.2));
    parts.push(strut(x, -2, -legZ, x, joinY, -2.4, 6.5, 6.0, 4.6, 4.2));
    parts.push(strut(x, joinY - 6, 0, x, H, 0, 5.4, 7.2, 4.4, 5.6)); // head / anchorage
    parts.push(boxAt(5.2, 1.2, 6.4, x, H + 0.4, 0)); // cap
    parts.push(boxAt(7, 4, B.deckW + 10, x, B.deckY - 5, 0)); // cross beam under deck
    parts.push(boxAt(18, 3.5, B.deckW + 22, x, 0.2, 0)); // pile cap
    // side-span piers
    for (const off of [85, 170]) {
      const px = s * (B.pylonX + off);
      parts.push(strut(px, -2, 7, px, B.deckY - 4, 7, 3.6, 3.6, 3.0, 3.0));
      parts.push(strut(px, -2, -7, px, B.deckY - 4, -7, 3.6, 3.6, 3.0, 3.0));
      parts.push(boxAt(4.5, 2.5, B.deckW - 2, px, B.deckY - 5, 0));
    }
    parts.push(boxAt(12, B.deckY, B.deckW + 6, s * (B.half - 6), B.deckY / 2 - 2, 0)); // abutment
    // uplight fixtures: at the cross beam, around each leg, aiming up
    for (const zz of [legZ - 3.5, -(legZ - 3.5)]) {
      upPos.push(new Vector3(x - 8, B.deckY + 1.2, zz));
      upPos.push(new Vector3(x + 8, B.deckY + 1.2, zz));
    }
  }
  const pylons = new Mesh(mergeGeometries(parts), concrete);
  group.add(pylons);

  // ---------- stay cables ----------
  const perFan = low ? 9 : 15;
  const cableGeo = new CylinderGeometry(1, 1, 1, 6, 1, true);
  const cableCount = 2 * 2 * 2 * perFan;
  const cables = new InstancedMesh(cableGeo, cableMat, cableCount);
  const m = new Matrix4(), q = new Quaternion(), up = new Vector3(0, 1, 0);
  const a = new Vector3(), b = new Vector3(), d = new Vector3(), mid = new Vector3(), sc = new Vector3();
  const anchors = [];
  let ci = 0;
  for (const s of [-1, 1]) {
    const px = s * B.pylonX;
    for (const edge of [-1, 1]) {
      for (const dir of [-1, 1]) {
        for (let i = 0; i < perFan; i++) {
          const t = i / (perFan - 1);
          a.set(px + dir * 2.0, H - 4 - (1 - t) * 24, edge * 1.6);
          const reach = 18 + t * (B.pylonX - 24);
          b.set(px + dir * reach, B.deckY + 0.6, edge * (B.deckW / 2 + 0.4));
          d.subVectors(b, a); const len = d.length(); d.normalize();
          mid.addVectors(a, b).multiplyScalar(0.5);
          q.setFromUnitVectors(up, d);
          const r = (low ? 0.36 : 0.26) + 0.1 * t;
          sc.set(r, len, r);
          m.compose(mid, q, sc);
          cables.setMatrixAt(ci++, m);
          if (edge === 1 && s === 1 && dir === -1) anchors.push(b.clone());
        }
      }
    }
  }
  cables.instanceMatrix.needsUpdate = true;
  cables.computeBoundingSphere();
  group.add(cables);

  // ---------- lamp standards ----------
  const spacing = low ? 30 : 20;
  const nPer = Math.floor(L / spacing);
  const poleGeo = mergeGeometries([
    (() => { const g = new CylinderGeometry(0.12, 0.2, 10, 6); g.translate(0, 5, 0); return g; })(),
    (() => { const g = new BoxGeometry(0.15, 0.15, 2.4); g.translate(0, 10, -1.1); return g; })(),
    (() => { const g = new BoxGeometry(0.5, 0.22, 0.9); g.translate(0, 9.9, -2.2); return g; })(),
  ]);
  const poles = new InstancedMesh(poleGeo, lampMat, nPer * 2);
  const lampN = nPer * 2;
  const P = [], C = [], S = [], R = [];
  const lampCol = new Color(1.0, 0.7, 0.4);
  let k = 0;
  for (const edge of [-1, 1]) {
    for (let i = 0; i < nPer; i++) {
      const x = -L / 2 + spacing * (i + 0.5);
      const z = edge * (B.deckW / 2 - 0.6);
      q.setFromAxisAngle(up, edge > 0 ? 0 : Math.PI);
      m.compose(new Vector3(x, B.deckY, z), q, new Vector3(1, 1, 1));
      poles.setMatrixAt(k, m);
      P.push(x, B.deckY + 9.75, z - edge * 2.2);
      C.push(lampCol.r * 14, lampCol.g * 14, lampCol.b * 14);
      S.push(1.0);
      R.push(0.05 + 0.85 * Math.abs(x) / (L / 2)); // cascade from the centre outwards
      k++;
    }
  }
  poles.instanceMatrix.needsUpdate = true;
  poles.computeBoundingSphere();
  group.add(poles);
  // aviation beacons on the pylon caps
  for (const s of [-1, 1]) { P.push(s * B.pylonX, H + 1.6, 0); C.push(14, 0.8, 0.4); S.push(1.6); R.push(0.2); }
  const lamps = createGlowPoints(U, {
    positions: new Float32Array(P.slice(0, lampN * 3)), colors: new Float32Array(C.slice(0, lampN * 3)),
    sizes: new Float32Array(S.slice(0, lampN)), rands: new Float32Array(R.slice(0, lampN)),
  }, { on: U.uLampsOn, minPx: 1.6 });
  group.add(lamps);
  const beacons = createGlowPoints(U, {
    positions: new Float32Array(P.slice(lampN * 3)), colors: new Float32Array(C.slice(lampN * 3)),
    sizes: new Float32Array(S.slice(lampN)), rands: new Float32Array(R.slice(lampN)),
  }, { on: U.uBeaconOn, minPx: 2.0, blink: true });
  group.add(beacons);

  // ---------- cars ----------
  const white = new Color(1.0, 0.9, 0.75).multiplyScalar(9);
  const red = new Color(1.0, 0.06, 0.03).multiplyScalar(8);
  const cars = createCars(U, {
    count: low ? 26 : 56, trail: low ? 5 : 9, trailLen: 12, length: L, deckY: B.deckY + 0.9, on: U.uCarsOn,
    lanes: [
      { z: 10.5, dir: -1, color: white }, { z: 7, dir: -1, color: white }, { z: 3.5, dir: -1, color: white },
      { z: -3.5, dir: 1, color: red }, { z: -7, dir: 1, color: red }, { z: -10.5, dir: 1, color: red },
    ],
  });
  group.add(cars);

  return {
    group,
    pylonTopLocal: new Vector3(B.pylonX, H, 0),
    materials: [concrete, steel, cableMat, lampMat],
    update() {
      group.updateMatrixWorld();
      uBridgeInv.value.copy(group.matrixWorld).invert();
      upPos.forEach((p, i) => uUpPos.value[i].copy(p).applyMatrix4(group.matrixWorld));
    },
  };
}
