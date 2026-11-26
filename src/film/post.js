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
/* 3. FX pass (interactive): liquid-light refraction from the fluid    */
/*    sim, scroll whip (directional blur along screen-Y) and the        */
/*    "hold to act" focus pull (blur growing toward the frame edges).   */
/*    HDR in, HDR out, placed before bloom so the warm dye glow blooms. */
/*    The engine disables the whole pass when nothing is active.       */
/* ------------------------------------------------------------------ */
export class FxPass extends Pass {
  constructor({ quality = 'high' } = {}) {
    super();
    const hi = quality === 'high';
    this.material = new THREE.ShaderMaterial({
      defines: { TAPS: hi ? 12 : 8, DOF_PX: hi ? '11.0' : '8.0' },
      uniforms: {
        tDiffuse: { value: null }, tVel: { value: null }, tDye: { value: null },
        uFluid: { value: 0 }, uVelScale: { value: 1.8e-4 }, uGlow: { value: 0 }, uLens: { value: 0.08 }, uDyeTexel: { value: new THREE.Vector2(1, 1) },
        uMB: { value: 0 }, uDof: { value: 0 }, uExp: { value: 1 },
        uAspect: { value: 1 }, uTexel: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse, tVel, tDye; uniform vec2 uTexel;
        uniform vec2 uDyeTexel;
        uniform float uFluid, uVelScale, uGlow, uLens, uMB, uDof, uAspect, uExp;
        varying vec2 vUv;
        float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
        vec3 tap(vec2 uv, vec2 off, bool split) {
          if (!split) return texture2D(tDiffuse, uv + off).rgb;
          // chromatic split along the flow: red refracts a little further than blue (like water on glass)
          return vec3(texture2D(tDiffuse, uv + off * 1.3).r, texture2D(tDiffuse, uv + off).g, texture2D(tDiffuse, uv + off * 0.7).b);
        }
        void main() {
          vec2 off = vec2(0.0); float dye = 0.0, rim = 0.0;
          if (uFluid > 0.0) {
            vec2 v = texture2D(tVel, vUv).xy * uVelScale;
            v.x /= uAspect;                       // isotropic on screen
            float m = length(v);
            v /= 1.0 + m / 0.028;                 // soft limit: never tears the frame (max ~2.8% of the frame)
            // the dye is also a thin film of water on the lens: its gradient bends the image like a droplet edge
            vec2 e = uDyeTexel * 2.0;
            float dl = texture2D(tDye, vUv - vec2(e.x, 0.0)).r, dr = texture2D(tDye, vUv + vec2(e.x, 0.0)).r;
            float db = texture2D(tDye, vUv - vec2(0.0, e.y)).r, dt = texture2D(tDye, vUv + vec2(0.0, e.y)).r;
            vec2 g = vec2(dr - dl, dt - db);
            off = (-v + g * uLens) * uFluid;
            dye = 0.25 * (dl + dr + db + dt) * uFluid;
            rim = length(g) * uFluid;
          }
          bool split = dot(off, off) > 4e-8;
          vec3 col;
          if (uMB < 1e-4 && uDof < 1e-3) {
            col = tap(vUv, off, split);
          } else {
            float jit = ign(gl_FragCoord.xy);
            vec2 da = (vUv - 0.5) * vec2(uAspect, 1.0);
            // no depth buffer: a centre-weighted focus pull reads as shallow depth of field
            float dofR = uDof * smoothstep(0.1, 0.85, length(da)) * DOF_PX;
            vec3 acc = vec3(0.0); float wsum = 0.0;
            for (int i = 0; i < TAPS; i++) {
              float fi = float(i);
              float t = (fi + jit) / float(TAPS) - 0.5;
              float a = fi * 2.39996 + jit * 6.2832;
              float rr = sqrt((fi + 0.5) / float(TAPS));
              vec2 o = vec2(0.0, t * uMB) + vec2(cos(a), sin(a)) * rr * dofR * uTexel;
              vec3 c = tap(vUv + o, off, split);
              // tent weights (a soft whip, not a stack of copies) x Karis weight: a super-HDR sun tap must not
              // smear its energy over the whole kernel (that washed the frame out while holding)
              float wt = (1.0 - abs(t) * 1.3) / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722)) * uExp);
              acc += c * wt; wsum += wt;
            }
            col = acc / wsum;
          }
          // warm liquid light: soft halo + hotter core (HDR, so bloom picks the core up)
          // warm liquid light: a faint body, a hotter core and bright caustic rims (HDR, so bloom catches them)
          col += uGlow * (0.1 * dye + 0.6 * dye * dye + 1.2 * rim) * vec3(1.0, 0.58, 0.26);
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
/* 4. Grade pass: exposure, log-space contrast, ACES, split-tone,      */
/*    saturation, night toe, radial CA, vignette, (grain, dither, sRGB)*/
/* ------------------------------------------------------------------ */
export class GradePass extends Pass {
  constructor({ finish = false } = {}) {
    super();
    this.material = new THREE.ShaderMaterial({
      // with FINISH the grain/dither move to the FinishPass (after FXAA, so AA never sees grain)
      defines: finish ? { FINISH: 1 } : {},
      uniforms: {
        tDiffuse: { value: null }, uTime: { value: 0 },
        uExposure: { value: 1 }, uWarmth: { value: 0 }, uTeal: { value: 0.35 }, uSat: { value: 1 }, uContrast: { value: 1 },
        uCA: { value: 0.0016 }, uCAx: { value: 0 }, uVignette: { value: 0.32 }, uVigTight: { value: 0 }, uGrain: { value: 0.055 }, uFade: { value: 0 },
        uLift: { value: 0.006 }, uAspect: { value: 1 }, uHiLift: { value: 0 }, uNight: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse; uniform float uTime, uExposure, uWarmth, uTeal, uSat, uContrast, uCA, uCAx, uVignette, uVigTight, uGrain, uFade, uLift, uAspect, uHiLift, uNight;
        varying vec2 vUv;
        // ACES fitted (Stephen Hill)
        const mat3 ACESIn = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
        const mat3 ACESOut = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
        vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
        vec3 aces(vec3 c) { c = ACESIn * c; c = RRTAndODTFit(c); return clamp(ACESOut * c, 0.0, 1.0); }
        vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
        float hash(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
        float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
        void main() {
          vec2 d = vUv - 0.5;
          vec2 da = d * vec2(uAspect, 1.0);
          float r = length(da), r2 = r * r;
          // radial chromatic aberration, scaled by radius only (zero at the centre, ~1 px in the corners) so
          // thin high-contrast detail (stay cables) does not fringe; the scroll whip adds more (uCAx)
          vec2 off = d * r * (uCA + uCAx);
          vec3 c;
          if (uCA + uCAx > 1e-5) {
            c.r = texture2D(tDiffuse, vUv - off).r;
            c.g = texture2D(tDiffuse, vUv).g;
            c.b = texture2D(tDiffuse, vUv + off).b;
          } else c = texture2D(tDiffuse, vUv).rgb;
          c = max(c, 0.0) * uExposure;
          // hold-to-act: a lift on the highlights only
          float l0 = luma(c);
          c *= 1.0 + uHiLift * smoothstep(0.6, 3.0, l0);
          // white balance (capped: a warm morning must stay a morning, not an orange veil)
          float w = clamp(uWarmth, -0.6, 0.6);
          c *= vec3(1.0 + 0.08 * w, 1.0 + 0.008 * w, 1.0 - 0.10 * w);
          // contrast in log space around mid-grey: highlights keep rolling off in the ACES shoulder
          // instead of being pushed past 1.0 and clipped in display space
          l0 = luma(c);
          float lc = 0.18 * pow(max(l0, 1e-6) / 0.18, uContrast);
          // highlight roll-off ahead of ACES: a hot, wide sky/sun area keeps a gradient instead of a white plate
          // (asymptote ~8 so the sun core still reads white-hot)
          lc = lc < 2.0 ? lc : 2.0 + (lc - 2.0) / (1.0 + (lc - 2.0) / 6.0);
          c *= lc / max(l0, 1e-6);
          vec3 t = aces(c);
          float l = luma(t);
          // split tone. Shadows: multiplicative teal (black stays black). Highlights: amber in the upper mids,
          // fading out again toward white so the sun stays white-hot instead of yellow-clipped.
          float sh = 1.0 - smoothstep(0.02, 0.4, l);
          float hm = smoothstep(0.3, 0.75, l) * (1.0 - smoothstep(0.82, 1.0, l));
          t *= 1.0 + vec3(-0.16, 0.02, 0.13) * uTeal * sh;
          t += vec3(-0.012, 0.005, 0.016) * uTeal * sh * (1.0 - 0.7 * uNight);
          t *= 1.0 + vec3(0.055, 0.012, -0.06) * (0.6 + 0.4 * uTeal) * hm;
          // saturation (protect near-white so highlights roll to white, not to a clipped hue)
          float l2 = luma(t);
          t = mix(vec3(l2), t, mix(uSat, 1.0, smoothstep(0.85, 1.0, l2)));
          // night: a deeper toe and teal shadows; emissive lights (already near 1) are untouched by the gamma
          if (uNight > 0.0) {
            // shadows/darks: navy -> deep teal (pull blue toward green), then a deeper toe
            float dk = (1.0 - smoothstep(0.0, 0.25, l2)) * uNight;
            float gb = 0.5 * (t.g + t.b);
            t = mix(t, vec3(t.r * 0.85, gb * 1.02, gb * 1.12), 0.55 * dk);
            t = pow(max(t, 0.0), vec3(1.0 + 0.45 * uNight));
          }
          // film lift, shadows only (keeps the deep end from going digital-black without hazing the mids)
          t += uLift * pow(1.0 - clamp(l2, 0.0, 1.0), 8.0);
          // vignette (tightens during scroll whips and "hold")
          float vA = 0.15 - 0.12 * uVigTight, vB = 0.9 - 0.35 * uVigTight;
          t *= 1.0 - (uVignette + 0.25 * uVigTight) * smoothstep(vA, vB, r2);
          t = clamp(t, 0.0, 1.0);
          vec3 o = toSRGB(t);
#ifndef FINISH
          // grain (luma-weighted) + dither
          float g = hash(vec3(gl_FragCoord.xy, floor(uTime * 24.0))) - 0.5;
          o += g * uGrain * (1.0 - 0.6 * l);
          o += (hash(vec3(gl_FragCoord.xy, 7.0)) - 0.5) / 255.0;
#endif
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

/* ------------------------------------------------------------------ */
/* 5. Finish pass ('high'): FXAA on the graded, display-referred frame */
/*    (cleans the shimmer of thin bright lines such as stay cables),   */
/*    then grain + dither so the AA never mistakes grain for edges.    */
/* ------------------------------------------------------------------ */
export class FinishPass extends Pass {
  constructor() {
    super();
    this.material = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uGrain: { value: 0.055 } },
      vertexShader: VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uTime, uGrain; varying vec2 vUv;
        float hash(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
        float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
        void main() {
          vec3 rgbM = texture2D(tDiffuse, vUv).rgb;
          vec3 nw = texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
          vec3 ne = texture2D(tDiffuse, vUv + vec2(1.0, -1.0) * uTexel).rgb;
          vec3 sw = texture2D(tDiffuse, vUv + vec2(-1.0, 1.0) * uTexel).rgb;
          vec3 se = texture2D(tDiffuse, vUv + vec2(1.0, 1.0) * uTexel).rgb;
          float lM = lum(rgbM), lNW = lum(nw), lNE = lum(ne), lSW = lum(sw), lSE = lum(se);
          float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
          float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
          vec3 col = rgbM;
          if (lMax - lMin > max(0.0312, lMax * 0.125)) {   // early-out on flat areas
            vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
            float red = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
            float rcpMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
            dir = clamp(dir * rcpMin, -8.0, 8.0) * uTexel;
            vec3 a = 0.5 * (texture2D(tDiffuse, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tDiffuse, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
            vec3 b = a * 0.5 + 0.25 * (texture2D(tDiffuse, vUv - dir * 0.5).rgb + texture2D(tDiffuse, vUv + dir * 0.5).rgb);
            float lB = lum(b);
            col = (lB < lMin || lB > lMax) ? a : b;
          }
          float l = lum(col);
          float g = hash(vec3(gl_FragCoord.xy, floor(uTime * 24.0))) - 0.5;
          col += g * uGrain * (1.0 - 0.6 * l);
          col += (hash(vec3(gl_FragCoord.xy, 7.0)) - 0.5) / 255.0;
          gl_FragColor = vec4(col, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }
  setSize(w, h) { this.material.uniforms.uTexel.value.set(1 / w, 1 / h); }
  render(renderer, writeBuffer, readBuffer) {
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
  }
  dispose() { this.material.dispose(); this.fsQuad.dispose(); }
}
