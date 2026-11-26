// Point-sprite light sources: lamps, beacons, car streaks, stars, sun motes.
// Additive, HDR (well above 1.0 so the engine's bloom/halation picks them up),
// attenuated by the shared atmosphere model.
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Points, ShaderMaterial } from 'three';
import { ATMOS_GLSL, bindAtmos } from './atmos.js';
import { mulberry32 } from './util.js';

function baseUniforms(U, extra) {
  const u = { uScale: U.uScale, uPR: U.uPR, uTime: U.uTime, ...extra };
  bindAtmos(u, U.atmos);
  return u;
}

// data: { positions, colors, sizes (world metres), rands (switch-on order 0..1) }
export function createGlowPoints(U, data, opts = {}) {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(data.positions, 3));
  g.setAttribute('aColor', new BufferAttribute(data.colors, 3));
  g.setAttribute('aSize', new BufferAttribute(data.sizes, 1));
  g.setAttribute('aRand', new BufferAttribute(data.rands, 1));
  const mat = new ShaderMaterial({
    name: 'river-glow',
    uniforms: baseUniforms(U, {
      uOn: opts.on || { value: 1 },
      uIntensity: opts.intensity || { value: 1 },
      uMinPx: { value: opts.minPx ?? 1.6 },
      uBlink: { value: opts.blink ? 1 : 0 },
      uFogMul: { value: opts.fogMul ?? 1 },
    }),
    vertexShader: /* glsl */`
      uniform float uScale; uniform float uPR; uniform float uTime;
      uniform float uOn; uniform float uIntensity; uniform float uMinPx; uniform float uBlink; uniform float uFogMul;
      ${ATMOS_GLSL}
      attribute vec3 aColor; attribute float aSize; attribute float aRand;
      varying vec3 vCol;
      void main() {
        vec4 wp = modelMatrix * vec4( position, 1.0 );
        vec4 mv = viewMatrix * wp;
        float dist = max( -mv.z, 0.001 );
        float on = smoothstep( aRand, aRand + 0.05, uOn );
        if ( uBlink > 0.5 ) on *= mix( 0.15, 1.0, step( 0.5, fract( uTime * 0.6 + aRand * 7.0 ) ) );
        float px = aSize * uScale / dist * uPR;
        float minPx = uMinPx * uPR;
        float energy = px < minPx ? ( px / minPx ) : 1.0;
        px = clamp( px, minPx, 48.0 * uPR );
        float T = atmTrans( wp.xyz, uFogMul );
        vCol = aColor * uIntensity * on * T * mix( 0.3, 1.0, sqrt( energy ) );
        gl_PointSize = on > 0.001 ? px : 0.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r2 = dot( d, d ) * 4.0;
        float core = exp( -r2 * 14.0 );
        float halo = exp( -r2 * 3.5 ) * 0.22;
        float a = ( core + halo ) * smoothstep( 1.0, 0.55, r2 );
        gl_FragColor = vec4( vCol * a, 1.0 );
      }`,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
  });
  const pts = new Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 2;
  return pts;
}

// Head/tail light streaks travelling along the deck (local X), in bridge-local space.
export function createCars(U, cfg) {
  const rand = mulberry32(99);
  const TRAIL = cfg.trail;
  const n = cfg.count * TRAIL;
  const pos = new Float32Array(n * 3), aOff = new Float32Array(n), aSpeed = new Float32Array(n);
  const aTrail = new Float32Array(n), aDir = new Float32Array(n), col = new Float32Array(n * 3);
  let k = 0;
  for (let c = 0; c < cfg.count; c++) {
    const lane = cfg.lanes[c % cfg.lanes.length];
    const off = rand(), speed = (13 + rand() * 9) / cfg.length, tint = 0.75 + rand() * 0.5;
    for (let t = 0; t < TRAIL; t++) {
      pos[k * 3 + 1] = cfg.deckY; pos[k * 3 + 2] = lane.z;
      aOff[k] = off; aSpeed[k] = speed; aTrail[k] = t / TRAIL; aDir[k] = lane.dir;
      col[k * 3] = lane.color.r * tint; col[k * 3 + 1] = lane.color.g * tint; col[k * 3 + 2] = lane.color.b * tint;
      k++;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aOff', new BufferAttribute(aOff, 1));
  g.setAttribute('aSpeed', new BufferAttribute(aSpeed, 1));
  g.setAttribute('aTrail', new BufferAttribute(aTrail, 1));
  g.setAttribute('aDir', new BufferAttribute(aDir, 1));
  g.setAttribute('aColor', new BufferAttribute(col, 3));
  const mat = new ShaderMaterial({
    name: 'river-cars',
    uniforms: baseUniforms(U, { uOn: cfg.on, uLen: { value: cfg.length }, uTrailLen: { value: cfg.trailLen }, uCarT: U.uCarT }),
    vertexShader: /* glsl */`
      uniform float uScale; uniform float uPR; uniform float uTime; uniform float uCarT;
      uniform float uOn; uniform float uLen; uniform float uTrailLen;
      ${ATMOS_GLSL}
      attribute float aOff; attribute float aSpeed; attribute float aTrail; attribute float aDir; attribute vec3 aColor;
      varying vec3 vCol;
      void main() {
        float u = fract( aOff + uCarT * aSpeed );
        float x = ( u - 0.5 ) * uLen * aDir - aDir * aTrail * uTrailLen;
        vec4 wp = modelMatrix * vec4( x, position.y, position.z, 1.0 );
        vec4 mv = viewMatrix * wp;
        float dist = max( -mv.z, 0.001 );
        float edge = smoothstep( 0.0, 0.04, u ) * smoothstep( 1.0, 0.96, u );
        float tr = pow( 1.0 - aTrail, 1.4 );
        float px = clamp( 1.1 * uScale / dist * uPR, 1.6 * uPR, 14.0 * uPR );
        vCol = aColor * uOn * edge * tr * atmTrans( wp.xyz, 1.0 );
        gl_PointSize = uOn > 0.001 ? px : 0.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol;
      void main() {
        vec2 d = gl_PointCoord - 0.5; float r2 = dot( d, d ) * 4.0;
        gl_FragColor = vec4( vCol * exp( -r2 * 7.0 ) * smoothstep( 1.0, 0.5, r2 ), 1.0 );
      }`,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
  });
  const pts = new Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 2;
  return pts;
}

export function createStars(U, count, reduced) {
  const rand = mulberry32(2024);
  const pos = new Float32Array(count * 3), mag = new Float32Array(count), ph = new Float32Array(count), col = new Float32Array(count * 3);
  const R = 5000;
  const warm = new Color(1.0, 0.86, 0.7), cool = new Color(0.75, 0.85, 1.0);
  for (let i = 0; i < count; i++) {
    const el = Math.asin(0.04 + rand() * 0.96), az = rand() * Math.PI * 2;
    pos[i * 3] = Math.cos(el) * Math.cos(az) * R; pos[i * 3 + 1] = Math.sin(el) * R; pos[i * 3 + 2] = Math.cos(el) * Math.sin(az) * R;
    mag[i] = Math.pow(rand(), 7.0); ph[i] = rand() * 100;
    const c = rand() < 0.5 ? warm : cool, t = rand();
    col[i * 3] = 1 + (c.r - 1) * t; col[i * 3 + 1] = 1 + (c.g - 1) * t; col[i * 3 + 2] = 1 + (c.b - 1) * t;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aMag', new BufferAttribute(mag, 1));
  g.setAttribute('aPh', new BufferAttribute(ph, 1));
  g.setAttribute('aColor', new BufferAttribute(col, 3));
  const mat = new ShaderMaterial({
    name: 'river-stars',
    uniforms: { uStars: U.uStars, uTime: U.uTime, uPR: U.uPR, uTwinkle: { value: reduced ? 0 : 1 } },
    vertexShader: /* glsl */`
      uniform float uStars; uniform float uTime; uniform float uPR; uniform float uTwinkle;
      attribute float aMag; attribute float aPh; attribute vec3 aColor;
      varying vec3 vCol;
      void main() {
        vec4 mv = modelViewMatrix * vec4( position, 1.0 );
        float h = normalize( position ).y;
        float horizon = smoothstep( 0.04, 0.4, h );
        float tw = 1.0 + uTwinkle * 0.3 * sin( uTime * ( 1.5 + fract( aPh ) * 3.0 ) + aPh );
        vCol = aColor * ( 0.03 + aMag * 1.6 ) * tw * uStars * horizon;
        gl_PointSize = ( 1.0 + aMag * 1.6 ) * uPR;
        gl_Position = projectionMatrix * mv;
        gl_Position.z = gl_Position.w * 0.99999;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol;
      void main() { vec2 d = gl_PointCoord - 0.5; float r2 = dot( d, d ) * 4.0; gl_FragColor = vec4( vCol * exp( -r2 * 5.0 ), 1.0 ); }`,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
  });
  const pts = new Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -9;
  return pts;
}

// Sun-lit motes drifting in a camera-space box (attached to the camera; never reflected).
export function createDust(U, count) {
  const rand = mulberry32(5);
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) { pos[i * 3] = rand(); pos[i * 3 + 1] = rand(); pos[i * 3 + 2] = rand(); seed[i] = rand(); }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new BufferAttribute(seed, 1));
  const mat = new ShaderMaterial({
    name: 'river-dust',
    uniforms: { uTime: U.uTime, uPR: U.uPR, uScale: U.uScale, uDust: U.uDust, uDustColor: U.uDustColor, uSunScreen: U.uSunScreen },
    vertexShader: /* glsl */`
      uniform float uTime; uniform float uPR; uniform float uScale; uniform float uDust; uniform vec2 uSunScreen;
      attribute float aSeed;
      varying float vA;
      void main() {
        vec3 p = position;
        p.x = fract( p.x + uTime * 0.004 * ( 0.5 + aSeed ) );
        p.y = fract( p.y + uTime * 0.002 * ( aSeed - 0.3 ) + 0.02 * sin( uTime * 0.3 + aSeed * 30.0 ) );
        vec3 cp = vec3( ( p.x - 0.5 ) * 24.0, ( p.y - 0.45 ) * 10.0, -3.0 - p.z * 30.0 );
        vec4 mv = modelViewMatrix * vec4( cp, 1.0 );
        float dist = -mv.z;
        float px = clamp( 0.025 * uScale / dist * uPR, 0.8 * uPR, 5.0 * uPR );
        vec4 clip = projectionMatrix * mv;
        vec2 sp = clip.xy / clip.w * 0.5 + 0.5;
        float sunNear = exp( -length( ( sp - uSunScreen ) * vec2( 2.3, 1.0 ) ) * 2.2 );
        vA = uDust * ( 0.15 + 1.6 * sunNear ) * ( 0.25 + 0.75 * fract( aSeed * 13.7 ) ) * smoothstep( 3.0, 7.0, dist );
        gl_PointSize = px;
        gl_Position = clip;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uDustColor;
      varying float vA;
      void main() { vec2 d = gl_PointCoord - 0.5; float r2 = dot( d, d ) * 4.0; gl_FragColor = vec4( uDustColor * vA * exp( -r2 * 4.0 ), 1.0 ); }`,
    transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending,
  });
  const pts = new Points(g, mat);
  pts.frustumCulled = false;
  pts.layers.set(1);
  pts.renderOrder = 10;
  return pts;
}
