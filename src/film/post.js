import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const NOISE = /* glsl */`
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`;

/* ------------------------------------------------------------------ */
/* 1. Chapter composite: blends two HDR chapter frames through a       */
/*    sunlit cloud dissolve (the "dive through the clouds" cut).       */
/* ------------------------------------------------------------------ */
export class ChapterCompositePass extends Pass {
  constructor() {
    super();
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tA: { value: null }, tB: { value: null },
        uMix: { value: 0 }, uTime: { value: 0 }, uAspect: { value: 1 },
        uHasA: { value: 1 }, uHasB: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tA, tB; uniform float uMix, uTime, uAspect, uHasA, uHasB; varying vec2 vUv;
        ${NOISE}
        void main() {
          vec3 a = uHasA > 0.5 ? texture2D(tA, vUv).rgb : vec3(0.0);
          vec3 b = uHasB > 0.5 ? texture2D(tB, vUv).rgb : vec3(0.0);
          if (uMix <= 0.0001) { gl_FragColor = vec4(a, 1.0); return; }
          if (uMix >= 0.9999) { gl_FragColor = vec4(b, 1.0); return; }
          vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
          // rushing clouds: radial zoom of fbm (feels like flying forward through cloud)
          float r = length(p);
          vec2 q = p / (0.35 + r) * 2.2 + vec2(0.0, uTime * 0.15);
          float n = fbm(q * 1.6 + uTime * 0.25) * 0.75 + fbm(p * 3.0 - uTime * 0.1) * 0.25;
          float edge = smoothstep(uMix - 0.18, uMix + 0.18, n * 0.9 + (1.0 - r) * 0.15);
          vec3 col = mix(b, a, edge);
          // sunlit cloud whiteout peaking mid-transition
          float peak = sin(3.14159 * clamp(uMix, 0.0, 1.0));
          // sunlit billows with cool, shaded undersides: keeps tonal structure instead of a flat white sheet
          float lit = smoothstep(0.3, 0.85, n + 0.12 * fbm(p * 7.0 + uTime * 0.2));
          vec3 cloud = mix(vec3(0.78, 0.72, 0.74), vec3(2.2, 1.86, 1.44), lit);
          col = mix(col, cloud, peak * smoothstep(0.25, 0.85, n + peak * 0.45) * 0.9);
          gl_FragColor = vec4(col, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }
  render(renderer, writeBuffer) {
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
  }
  dispose() { this.material.dispose(); this.fsQuad.dispose(); }
}

/* ------------------------------------------------------------------ */
/* 2. Lens pass: god rays from the sun, anamorphic streaks,            */
/*    flare ghosts and halation. Works on the HDR frame.                */
/* ------------------------------------------------------------------ */
export class LensPass extends Pass {
  constructor({ quality = 'high' } = {}) {
    super();
    const hi = quality === 'high';
    this.material = new THREE.ShaderMaterial({
      defines: { RAY_STEPS: hi ? 40 : 20, STREAK_TAPS: hi ? 16 : 8 },
      uniforms: {
        tDiffuse: { value: null },
        uSun: { value: new THREE.Vector2(0.5, 0.5) }, uSunVis: { value: 0 }, uSunInt: { value: 1 },
        uRays: { value: 0.38 }, uStreak: { value: 0.22 }, uGhosts: { value: 0.2 }, uHalation: { value: 0.1 },
        uThreshold: { value: 2.2 }, uAspect: { value: 1 }, uTexel: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse; uniform vec2 uSun, uTexel; uniform float uSunVis, uSunInt, uRays, uStreak, uGhosts, uHalation, uThreshold, uAspect;
        varying vec2 vUv;
        vec3 bright(vec2 uv) {
          vec3 c = texture2D(tDiffuse, clamp(uv, 0.001, 0.999)).rgb;
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          // soft-capped so a super-HDR sun disc does not dominate every radial/streak tap
          return c * smoothstep(uThreshold, uThreshold * 2.5, l) * min(1.0, uThreshold * 2.0 / max(l, 1e-4));
        }
        // rays and ghosts are fed only by highlights around the sun, not by every bright pixel of a
        // daylight sky (that turned whole frames into a milky veil)
        float sunMask(vec2 uv) { return 1.0 - smoothstep(0.03, 0.24, length((uv - uSun) * vec2(uAspect, 1.0))); }
        float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
        void main() {
          vec3 col = texture2D(tDiffuse, vUv).rgb;
          float jitter = ign(gl_FragCoord.xy);
          // --- crepuscular rays (radial blur of highlights toward the sun)
          if (uSunVis > 0.001 && uRays > 0.0) {
            vec2 delta = (vUv - uSun) / float(RAY_STEPS) * 0.92;
            vec2 uv = vUv - delta * jitter;
            float decay = 1.0; vec3 acc = vec3(0.0);
            for (int i = 0; i < RAY_STEPS; i++) { uv -= delta; acc += bright(uv) * sunMask(uv) * decay; decay *= 0.955; }
            acc /= float(RAY_STEPS);
            float falloff = 1.0 - smoothstep(0.0, 1.1, length((vUv - uSun) * vec2(uAspect, 1.0)));
            col += acc * uRays * uSunVis * min(uSunInt, 1.2) * falloff * falloff * vec3(1.0, 0.86, 0.66);
          }
          // --- anamorphic horizontal streak
          vec3 streak = vec3(0.0);
          for (int i = 1; i <= STREAK_TAPS; i++) {
            float o = float(i) * float(i) * 1.6 * uTexel.x * (0.6 + jitter * 0.8);
            float w = 1.0 - float(i) / float(STREAK_TAPS + 1);
            streak += (bright(vUv + vec2(o, 0.0)) + bright(vUv - vec2(o, 0.0))) * w;
          }
          col += streak / float(STREAK_TAPS) * uStreak * vec3(0.55, 0.75, 1.2);
          // --- flare ghosts (mirrored through centre) + halo
          vec2 gv = (vec2(0.5) - vUv);
          vec3 ghosts = vec3(0.0);
          for (int i = 1; i <= 4; i++) {
            vec2 suv = fract(vUv + gv * (0.42 * float(i)));
            float w = pow(1.0 - length(vec2(0.5) - suv) / 0.7071, 6.0);
            vec3 tint = i == 1 ? vec3(1.0, 0.7, 0.4) : i == 2 ? vec3(0.4, 0.8, 1.0) : i == 3 ? vec3(0.9, 0.5, 1.0) : vec3(0.6, 1.0, 0.7);
            ghosts += bright(suv) * sunMask(suv) * uSunVis * w * tint;
          }
          col += ghosts * uGhosts * 0.25;
          // --- halation: warm-red bleed around highlights (cheap 8-tap ring)
          vec3 hal = vec3(0.0);
          for (int i = 0; i < 8; i++) {
            float a = float(i) * 0.785398 + jitter;
            hal += bright(vUv + vec2(cos(a), sin(a)) * uTexel * 7.0);
          }
          col += hal / 8.0 * uHalation * vec3(1.0, 0.35, 0.15);
          gl_FragColor = vec4(col, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }
  setSize(w, h) {
    this.material.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.material.uniforms.uAspect.value = w / h;
  }
  render(renderer, writeBuffer, readBuffer) {
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
  }
  dispose() { this.material.dispose(); this.fsQuad.dispose(); }
}

/* ------------------------------------------------------------------ */
/* 3. Grade pass: exposure, filmic tone curve, split-tone, saturation, */
/*    contrast, chromatic aberration, vignette, grain, dither, sRGB.   */
/* ------------------------------------------------------------------ */
export class GradePass extends Pass {
  constructor() {
    super();
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, uTime: { value: 0 },
        uExposure: { value: 1 }, uWarmth: { value: 0 }, uTeal: { value: 0.35 }, uSat: { value: 1 }, uContrast: { value: 1 },
        uCA: { value: 0.0025 }, uVignette: { value: 0.32 }, uGrain: { value: 0.055 }, uFade: { value: 0 },
        uLift: { value: 0.012 }, uAspect: { value: 1 },
      },
      vertexShader: VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse; uniform float uTime, uExposure, uWarmth, uTeal, uSat, uContrast, uCA, uVignette, uGrain, uFade, uLift, uAspect;
        varying vec2 vUv;
        // ACES fitted (Stephen Hill)
        const mat3 ACESIn = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
        const mat3 ACESOut = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
        vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
        vec3 aces(vec3 c) { c = ACESIn * c; c = RRTAndODTFit(c); return clamp(ACESOut * c, 0.0, 1.0); }
        vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
        float hash(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
        void main() {
          vec2 d = vUv - 0.5;
          float r2 = dot(d * vec2(uAspect, 1.0), d * vec2(uAspect, 1.0));
          // radial chromatic aberration
          vec2 off = d * uCA * (0.4 + r2 * 2.5);
          vec3 c;
          c.r = texture2D(tDiffuse, vUv - off).r;
          c.g = texture2D(tDiffuse, vUv).g;
          c.b = texture2D(tDiffuse, vUv + off).b;
          c *= uExposure;
          // white balance
          c *= vec3(1.0 + 0.10 * uWarmth, 1.0 + 0.01 * uWarmth, 1.0 - 0.12 * uWarmth);
          vec3 t = aces(c);
          // split tone: teal shadows, amber highlights
          float l = dot(t, vec3(0.2126, 0.7152, 0.0722));
          vec3 shadowTint = vec3(-0.035, 0.012, 0.045) * uTeal;
          vec3 highTint = vec3(0.04, 0.012, -0.035) * (0.6 + 0.4 * uTeal);
          t += shadowTint * (1.0 - smoothstep(0.0, 0.45, l)) + highTint * smoothstep(0.45, 1.0, l);
          // contrast around mid-grey + saturation
          t = (t - 0.18) * uContrast + 0.18;
          float l2 = dot(t, vec3(0.2126, 0.7152, 0.0722));
          t = mix(vec3(l2), t, uSat);
          // film lift (raised blacks) + vignette
          t = t * (1.0 - uLift) + uLift;
          t *= 1.0 - uVignette * smoothstep(0.15, 0.9, r2);
          t = clamp(t, 0.0, 1.0);
          vec3 o = toSRGB(t);
          // grain (luma-weighted) + dither
          float g = hash(vec3(gl_FragCoord.xy, floor(uTime * 24.0))) - 0.5;
          o += g * uGrain * (1.0 - 0.6 * l);
          o += (hash(vec3(gl_FragCoord.xy, 7.0)) - 0.5) / 255.0;
          o = mix(o, vec3(0.0), uFade);
          gl_FragColor = vec4(o, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }
  setSize(w, h) { this.material.uniforms.uAspect.value = w / h; }
  render(renderer, writeBuffer, readBuffer) {
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
  }
  dispose() { this.material.dispose(); this.fsQuad.dispose(); }
}
