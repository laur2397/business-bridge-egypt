// River mist:
//  - stacked low mist sheets over the water (optical thickness grows at grazing angles, so the banks
//    of vapour hug the river and glow in the sun's forward-scatter lobe)
//  - a camera-attached "curtain" for the opening: we start inside lit vapour that parts from the centre
//    outward as we fly out of it, plus faint sun shafts raking through the mist.
import { Color, DoubleSide, Group, Matrix3, Mesh, NormalBlending, PlaneGeometry, ShaderMaterial, Vector2 } from 'three';
import { ATMOS_GLSL, bindAtmos } from './atmos.js';
import { NOISE_GLSL } from './glsl.js';

export function createMistSheets(U, quality) {
  const group = new Group();
  const layers = quality === 'low' ? [1.5, 6.0] : [1.0, 3.2, 6.5, 11.0];
  const geo = new PlaneGeometry(2400, 5200);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -1300);
  const mats = [];
  layers.forEach((y, i) => {
    const mat = new ShaderMaterial({
      name: 'river-mist',
      uniforms: { uTime: U.uTime, uSheet: U.uSheet, uLayer: { value: i }, uY: { value: y } },
      vertexShader: /* glsl */`
        varying vec3 vW;
        void main() { vec4 w = modelMatrix * vec4( position, 1.0 ); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`
        uniform float uTime; uniform float uSheet; uniform float uLayer; uniform float uY;
        ${ATMOS_GLSL}
        ${NOISE_GLSL}
        varying vec3 vW;
        void main() {
          vec3 d = vW - cameraPosition;
          float dist = length( d );
          vec3 dir = d / dist;
          vec2 p = vW.xz * 0.0045 + vec2( uLayer * 3.7, uLayer * 1.3 ) + vec2( 0.004, 0.0015 ) * uTime;
          float n = rFbm2( p ) ;
          float n2 = rFbm2( vW.xz * 0.02 + vec2( -0.01, 0.006 ) * uTime + uLayer );
          float dens = smoothstep( 0.32, 0.75, n * 0.75 + n2 * 0.4 );
          // thickest over open water, thinner near the camera (no hard intersection), fade with height
          float thick = dens * uSheet * ( 1.0 - uLayer * 0.16 );
          float graze = 0.12 / max( abs( dir.y ), 0.02 );
          float a = 1.0 - exp( -thick * graze );
          a *= smoothstep( 40.0, 260.0, dist ) * smoothstep( 4200.0, 1800.0, dist );
          float mu = dot( dir, uSunDir );
          vec3 col = atmHaze( dir ) * 1.02 + uSunCol * atmHG( mu, 0.8 ) * uMieK * 1.0;
          // the sheet itself sits inside the atmosphere
          float T = atmTrans( vW, 0.6 );
          col = col * T + atmHaze( dir ) * ( 1.0 - T );
          gl_FragColor = vec4( col, a * 0.85 );
        }`,
      transparent: true, depthWrite: false, side: DoubleSide, blending: NormalBlending,
    });
    bindAtmos(mat.uniforms, U.atmos);
    const mesh = new Mesh(geo, mat);
    mesh.position.y = y;
    mesh.renderOrder = 3 + i;
    mesh.frustumCulled = false;
    group.add(mesh);
    mats.push(mat);
  });
  return { group, materials: mats };
}

export function createMistCurtain(U) {
  const mat = new ShaderMaterial({
    name: 'river-curtain',
    uniforms: {
      uTime: U.uTime, uCurtain: U.uCurtain, uShaft: U.uShaft, uSunScreen: U.uSunScreen, uAspect: { value: 1 },
      uCamRot: { value: new Matrix3() }, uTan: { value: new Vector2(1, 1) }, uPush: U.uPush,
      uMistCol: { value: new Color(2, 1.8, 1.5) },
    },
    vertexShader: /* glsl */`
      varying vec2 vNdc;
      void main() { vNdc = position.xy; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform float uCurtain; uniform float uShaft; uniform vec2 uSunScreen; uniform float uAspect;
      uniform mat3 uCamRot; uniform vec2 uTan; uniform float uPush; uniform vec3 uMistCol;
      ${ATMOS_GLSL}
      ${NOISE_GLSL}
      varying vec2 vNdc;
      void main() {
        vec3 dir = normalize( uCamRot * vec3( vNdc.x * uTan.x, vNdc.y * uTan.y, -1.0 ) );
        float mu = dot( dir, uSunDir );
        vec3 base = mix( atmHaze( dir ) * 1.1 + uSunCol * atmHG( mu, 0.6 ) * uMieK * 2.0, uMistCol * ( 0.75 + 0.9 * atmHG( mu, 0.6 ) ), smoothstep( 0.0, 0.3, uCurtain ) );
        vec2 sp = vNdc * vec2( uAspect, 1.0 );
        float r = length( sp );
        float a = 0.0;
        if ( uCurtain > 0.001 ) {
          // fly-through: the vapour field zooms outward as we push forward
          float zoom = 1.0 / ( 1.0 + uPush * 2.5 );
          vec2 q = sp * zoom * 1.4 + vec2( uTime * 0.01, 0.0 );
          float n = rFbm2( q * 0.9 + 2.0 ) * 0.7 + rFbm2( q * 2.4 - uTime * 0.02 ) * 0.3;
          float open = 1.0 - uCurtain;
          float thr = open * 1.25 - 0.15 + 0.35 * open * ( 1.0 - smoothstep( 0.0, 1.4, r ) );
          a = smoothstep( thr - 0.05, thr + 0.3, n + 0.1 * ( 1.0 - r ) );
          a = mix( a, 1.0, smoothstep( 0.85, 1.0, uCurtain ) );
          // denser where the vapour is thick: a hint of self-shadow
          base *= mix( 0.82, 1.08, smoothstep( 0.3, 0.8, n ) );
        }
        // sun shafts raking through the mist
        vec2 toSun = ( vNdc * 0.5 + 0.5 ) - uSunScreen;
        toSun.x *= uAspect;
        float ang = atan( toSun.y, toSun.x );
        float ds = length( toSun );
        float rays = rNoise2( vec2( ang * 22.0, uTime * 0.03 ) ) * rNoise2( vec2( ang * 7.0 + 3.0, uTime * 0.02 ) );
        float shaft = smoothstep( 0.25, 0.7, rays ) * exp( -ds * 2.2 ) * smoothstep( 0.02, 0.15, ds ) * uShaft * smoothstep( -0.01, 0.06, dir.y );
        vec3 col = base;
        float alpha = clamp( a + shaft * 0.12, 0.0, 1.0 );
        gl_FragColor = vec4( col, alpha );
      }`,
    transparent: true, depthTest: false, depthWrite: false,
  });
  bindAtmos(mat.uniforms, U.atmos);
  const mesh = new Mesh(new PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 20;
  mesh.layers.set(1);
  return { mesh, material: mat };
}
