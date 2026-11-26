// Point-sprite light sources: lamps, corniche lights, beacons, car streaks, stars, dust.
// All additive, HDR (values > 1 feed the bloom), with manual distance haze.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial, Color
} from 'three';
import { mulberry32 } from './textures.js';

const glowCommon = /* glsl */`
  uniform float uScale;      // px per world unit at distance 1 (viewport height / (2 tan(fov/2)))
  uniform float uPR;
  uniform float uFogDensity;
  uniform float uTime;
`;

// ---------- Generic glow points (lamps / beacons) ----------
export function createGlowPoints(shared, data, opts = {}) {
  // data: { positions: Float32Array, colors: Float32Array, sizes: Float32Array, rands: Float32Array }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(data.positions, 3));
  g.setAttribute('aColor', new BufferAttribute(data.colors, 3));
  g.setAttribute('aSize', new BufferAttribute(data.sizes, 1));
  g.setAttribute('aRand', new BufferAttribute(data.rands, 1));
  const mat = new ShaderMaterial({
    uniforms: {
      uScale: shared.uScale, uPR: shared.uPR, uFogDensity: shared.uFogDensity, uTime: shared.uTime,
      uOn: opts.on || { value: 1 },
      uIntensity: { value: opts.intensity ?? 1 },
      uMinPx: { value: opts.minPx ?? 1.6 },
      uBlink: { value: opts.blink ? 1 : 0 },
      uFogMul: { value: opts.fogMul ?? 1 }
    },
    vertexShader: /* glsl */`
      ${glowCommon}
      uniform float uOn; uniform float uIntensity; uniform float uMinPx; uniform float uBlink; uniform float uFogMul;
      attribute vec3 aColor; attribute float aSize; attribute float aRand;
      varying vec3 vCol;
      void main() {
        vec4 mv = modelViewMatrix * vec4( position, 1.0 );
        float dist = max( -mv.z, 0.001 );
        float on = smoothstep( aRand, aRand + 0.06, uOn );
        if ( uBlink > 0.5 ) on *= step( 0.55, fract( uTime * 0.7 + aRand * 7.0 ) ) * 0.9 + 0.1 * on;
        float px = aSize * uScale / dist * uPR;
        float minPx = uMinPx * uPR;
        float energy = px < minPx ? ( px / minPx ) : 1.0;  // conserve energy for sub-pixel lights
        px = clamp( px, minPx, 64.0 * uPR );
        float fd = uFogDensity * uFogMul * dist;
        float fog = exp( -fd * fd );
        vCol = aColor * uIntensity * on * fog * mix( 0.35, 1.0, sqrt( energy ) );
        gl_PointSize = on > 0.001 ? px : 0.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r2 = dot( d, d ) * 4.0;
        float core = exp( -r2 * 9.0 );
        float halo = exp( -r2 * 3.0 ) * 0.35;
        float a = ( core + halo ) * smoothstep( 1.0, 0.6, r2 );
        gl_FragColor = vec4( vCol * a, 1.0 );
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending
  });
  const pts = new Points(g, mat);
  pts.frustumCulled = false;
  return pts;
}

// ---------- Car light streaks on the deck ----------
export function createCars(shared, cfg) {
  // cfg: { count, length, deckY, lanes: [{z, dir, color}] , quality }
  const rand = mulberry32(99);
  const TRAIL = cfg.trail;
  const n = cfg.count * TRAIL;
  const pos = new Float32Array(n * 3);
  const aLane = new Float32Array(n);
  const aOff = new Float32Array(n);
  const aSpeed = new Float32Array(n);
  const aTrail = new Float32Array(n);
  const aDir = new Float32Array(n);
  const col = new Float32Array(n * 3);
  let k = 0;
  for (let c = 0; c < cfg.count; c++) {
    const lane = cfg.lanes[c % cfg.lanes.length];
    const off = rand();
    const speed = (14 + rand() * 8) / cfg.length; // 14-22 m/s
    const tint = 0.8 + rand() * 0.4;
    for (let t = 0; t < TRAIL; t++) {
      pos[k * 3 + 1] = cfg.deckY; pos[k * 3 + 2] = lane.z;
      aLane[k] = lane.z; aOff[k] = off; aSpeed[k] = speed; aTrail[k] = t / TRAIL; aDir[k] = lane.dir;
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
    uniforms: {
      uScale: shared.uScale, uPR: shared.uPR, uFogDensity: shared.uFogDensity, uTime: shared.uTime,
      uOn: cfg.on, uLen: { value: cfg.length }, uTrailLen: { value: cfg.trailLen }
    },
    vertexShader: /* glsl */`
      ${glowCommon}
      uniform float uOn; uniform float uLen; uniform float uTrailLen;
      attribute float aOff; attribute float aSpeed; attribute float aTrail; attribute float aDir; attribute vec3 aColor;
      varying vec3 vCol;
      void main() {
        float u = fract( aOff + uTime * aSpeed );
        float x = ( u - 0.5 ) * uLen * aDir - aDir * aTrail * uTrailLen;
        vec3 p = vec3( x, position.y, position.z );
        vec4 mv = modelViewMatrix * vec4( p, 1.0 );
        float dist = max( -mv.z, 0.001 );
        float edge = smoothstep( 0.0, 0.04, u ) * smoothstep( 1.0, 0.96, u );
        float on = smoothstep( 0.0, 1.0, uOn );
        float fd = uFogDensity * dist; float fog = exp( -fd * fd );
        float tr = pow( 1.0 - aTrail, 1.6 );
        float px = clamp( 1.8 * uScale / dist * uPR, 1.8 * uPR, 18.0 * uPR );
        vCol = aColor * on * edge * fog * tr;
        gl_PointSize = on > 0.001 ? px : 0.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol;
      void main() {
        vec2 d = gl_PointCoord - 0.5; float r2 = dot( d, d ) * 4.0;
        float a = exp( -r2 * 6.0 ) * smoothstep( 1.0, 0.5, r2 );
        gl_FragColor = vec4( vCol * a, 1.0 );
      }`,
    transparent: true, depthWrite: false, blending: AdditiveBlending
  });
  const pts = new Points(g, mat);
  pts.frustumCulled = false;
  return pts;
}

// ---------- Stars ----------
export function createStars(shared, count, reduced) {
  const rand = mulberry32(2024);
  const pos = new Float32Array(count * 3);
  const mag = new Float32Array(count);
  const ph = new Float32Array(count);
  const col = new Float32Array(count * 3);
  const R = 9000;
  const warm = new Color(1.0, 0.86, 0.7), cool = new Color(0.75, 0.85, 1.0);
  for (let i = 0; i < count; i++) {
    const u = rand(), v = rand();
    const el = Math.asin(0.03 + u * 0.97);
    const az = v * Math.PI * 2;
    pos[i * 3] = Math.cos(el) * Math.cos(az) * R;
    pos[i * 3 + 1] = Math.sin(el) * R;
    pos[i * 3 + 2] = Math.cos(el) * Math.sin(az) * R;
    mag[i] = Math.pow(rand(), 6.0);
    ph[i] = rand() * 100;
    const c = rand() < 0.5 ? warm : cool;
    const t = rand();
    col[i * 3] = 1 + (c.r - 1) * t; col[i * 3 + 1] = 1 + (c.g - 1) * t; col[i * 3 + 2] = 1 + (c.b - 1) * t;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aMag', new BufferAttribute(mag, 1));
  g.setAttribute('aPh', new BufferAttribute(ph, 1));
  g.setAttribute('aColor', new BufferAttribute(col, 3));
  const mat = new ShaderMaterial({
    uniforms: { uNight: shared.uStars, uTime: shared.uTime, uPR: shared.uPR, uTwinkle: { value: reduced ? 0 : 1 } },
    vertexShader: /* glsl */`
      uniform float uNight; uniform float uTime; uniform float uPR; uniform float uTwinkle;
      attribute float aMag; attribute float aPh; attribute vec3 aColor;
      varying vec3 vCol;
      void main() {
        vec4 mv = modelViewMatrix * vec4( position, 1.0 );
        float h = normalize( position ).y;
        float horizon = smoothstep( 0.03, 0.35, h );
        float tw = 1.0 + uTwinkle * 0.35 * sin( uTime * ( 1.5 + fract( aPh ) * 3.0 ) + aPh );
        float b = ( 0.08 + aMag * 2.2 ) * tw * uNight * horizon;
        vCol = aColor * b;
        gl_PointSize = ( 1.2 + aMag * 1.8 ) * uPR;
        gl_Position = projectionMatrix * mv;
        gl_Position.z = gl_Position.w * 0.99999;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol;
      void main() {
        vec2 d = gl_PointCoord - 0.5; float r2 = dot( d, d ) * 4.0;
        gl_FragColor = vec4( vCol * exp( -r2 * 5.0 ), 1.0 );
      }`,
    transparent: true, depthWrite: false, blending: AdditiveBlending
  });
  const pts = new Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -9;
  return pts;
}

// ---------- Dust motes (camera-attached, layer 1 so the water mirror skips them) ----------
export function createDust(shared, count) {
  const rand = mulberry32(5);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = rand(); pos[i * 3 + 1] = rand(); pos[i * 3 + 2] = rand();
    seed[i] = rand();
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new BufferAttribute(seed, 1));
  const mat = new ShaderMaterial({
    uniforms: {
      uTime: shared.uTime, uPR: shared.uPR, uScale: shared.uScale,
      uDust: shared.uDust, uDustColor: { value: new Color(1.0, 0.72, 0.45) }, uSunScreenX: shared.uSunScreenX
    },
    vertexShader: /* glsl */`
      uniform float uTime; uniform float uPR; uniform float uScale; uniform float uDust; uniform float uSunScreenX;
      attribute float aSeed;
      varying float vA;
      void main() {
        // camera-space box: x[-14,14], y[-6,8], z[-4,-40]; slow drift with wrap
        vec3 p = position;
        p.x = fract( p.x + uTime * 0.004 * ( 0.5 + aSeed ) );
        p.y = fract( p.y + uTime * 0.002 * ( aSeed - 0.3 ) + 0.02 * sin( uTime * 0.3 + aSeed * 30.0 ) );
        vec3 cp = vec3( ( p.x - 0.5 ) * 28.0, ( p.y - 0.4 ) * 14.0, -4.0 - p.z * 36.0 );
        vec4 mv = modelViewMatrix * vec4( cp, 1.0 );
        float dist = -mv.z;
        float px = clamp( 0.03 * uScale / dist * uPR, 0.8 * uPR, 6.0 * uPR );
        vec4 clip = projectionMatrix * mv;
        float sx = clip.x / clip.w;
        float sunSide = 0.35 + 0.65 * smoothstep( -0.6, 0.8, sx * sign( uSunScreenX + 1e-4 ) );
        vA = uDust * sunSide * ( 0.25 + 0.75 * fract( aSeed * 13.7 ) ) * smoothstep( 4.0, 8.0, dist );
        gl_PointSize = px;
        gl_Position = clip;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uDustColor;
      varying float vA;
      void main() {
        vec2 d = gl_PointCoord - 0.5; float r2 = dot( d, d ) * 4.0;
        gl_FragColor = vec4( uDustColor * vA * exp( -r2 * 4.0 ), 1.0 );
      }`,
    transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending
  });
  const pts = new Points(g, mat);
  pts.frustumCulled = false;
  pts.layers.set(1);
  pts.renderOrder = 10;
  return pts;
}
