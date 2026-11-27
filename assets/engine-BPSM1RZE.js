const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/orbit-B75Lqpr-.js","assets/UnrealBloomPass-C28B2YMj.js","assets/river-CiP8Ed_4.js"])))=>i.map(i=>d[i]);
import{F as e,J as t,N as n,Q as r,U as i,W as a,_t as o,a as s,at as c,c as l,ft as u,gt as d,i as f,k as p,m as ee,n as te,ot as m,p as ne,t as h,yt as g,z as _}from"./UnrealBloomPass-C28B2YMj.js";import{t as v}from"./assets-ok17D2jF.js";import{t as y}from"./main-DYDyfpYH.js";var b=`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`,x=`
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`,S=class extends s{constructor(){super(),this.material=new m({uniforms:{tA:{value:null},tB:{value:null},uMix:{value:0},uTime:{value:0},uAspect:{value:1},uHasA:{value:1},uHasB:{value:0}},vertexShader:b,fragmentShader:`
        uniform sampler2D tA, tB; uniform float uMix, uTime, uAspect, uHasA, uHasB; varying vec2 vUv;
        ${x}
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
        }`,depthTest:!1,depthWrite:!1}),this.fsQuad=new f(this.material)}render(e,t){e.setRenderTarget(this.renderToScreen?null:t),this.fsQuad.render(e)}dispose(){this.material.dispose(),this.fsQuad.dispose()}},C=class extends s{constructor({quality:e=`high`}={}){super();let t=e===`high`;this.material=new m({defines:{RAY_STEPS:t?40:20,STREAK_TAPS:t?16:8},uniforms:{tDiffuse:{value:null},uSun:{value:new d(.5,.5)},uSunVis:{value:0},uSunInt:{value:1},uRays:{value:.38},uStreak:{value:.22},uGhosts:{value:.2},uHalation:{value:.1},uThreshold:{value:2.2},uAspect:{value:1},uTexel:{value:new d(1,1)}},vertexShader:b,fragmentShader:`
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
        }`,depthTest:!1,depthWrite:!1}),this.fsQuad=new f(this.material)}setSize(e,t){this.material.uniforms.uTexel.value.set(1/e,1/t),this.material.uniforms.uAspect.value=e/t}render(e,t,n){this.material.uniforms.tDiffuse.value=n.texture,e.setRenderTarget(this.renderToScreen?null:t),this.fsQuad.render(e)}dispose(){this.material.dispose(),this.fsQuad.dispose()}},w=class extends s{constructor({quality:e=`high`}={}){super();let t=e===`high`;this.material=new m({defines:{TAPS:t?12:8,DOF_PX:t?`11.0`:`8.0`},uniforms:{tDiffuse:{value:null},tVel:{value:null},tDye:{value:null},uFluid:{value:0},uVelScale:{value:18e-5},uGlow:{value:0},uLens:{value:.08},uDyeTexel:{value:new d(1,1)},uMB:{value:0},uDof:{value:0},uExp:{value:1},uAspect:{value:1},uTexel:{value:new d(1,1)}},vertexShader:b,fragmentShader:`
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
        }`,depthTest:!1,depthWrite:!1}),this.fsQuad=new f(this.material)}setSize(e,t){this.material.uniforms.uTexel.value.set(1/e,1/t),this.material.uniforms.uAspect.value=e/t}render(e,t,n){this.material.uniforms.tDiffuse.value=n.texture,e.setRenderTarget(this.renderToScreen?null:t),this.fsQuad.render(e)}dispose(){this.material.dispose(),this.fsQuad.dispose()}},T=class extends s{constructor({finish:e=!1}={}){super(),this.material=new m({defines:e?{FINISH:1}:{},uniforms:{tDiffuse:{value:null},uTime:{value:0},uExposure:{value:1},uWarmth:{value:0},uTeal:{value:.35},uSat:{value:1},uContrast:{value:1},uCA:{value:.0016},uCAx:{value:0},uVignette:{value:.32},uVigTight:{value:0},uGrain:{value:.055},uFade:{value:0},uLift:{value:.006},uAspect:{value:1},uHiLift:{value:0},uNight:{value:0}},vertexShader:b,fragmentShader:`
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
        }`,depthTest:!1,depthWrite:!1}),this.fsQuad=new f(this.material)}setSize(e,t){this.material.uniforms.uAspect.value=e/t}render(e,t,n){this.material.uniforms.tDiffuse.value=n.texture,e.setRenderTarget(this.renderToScreen?null:t),this.fsQuad.render(e)}dispose(){this.material.dispose(),this.fsQuad.dispose()}},E=class extends s{constructor(){super(),this.material=new m({uniforms:{tDiffuse:{value:null},uTexel:{value:new d(1,1)},uTime:{value:0},uGrain:{value:.055}},vertexShader:b,fragmentShader:`
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
        }`,depthTest:!1,depthWrite:!1}),this.fsQuad=new f(this.material)}setSize(e,t){this.material.uniforms.uTexel.value.set(1/e,1/t)}render(e,t,n){this.material.uniforms.tDiffuse.value=n.texture,e.setRenderTarget(this.renderToScreen?null:t),this.fsQuad.render(e)}dispose(){this.material.dispose(),this.fsQuad.dispose()}},re=`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`,D=`
  uniform vec2 uTexel;
  varying vec2 vUv;
  #define L(t) texture2D(t, vUv - vec2(uTexel.x, 0.0))
  #define R(t) texture2D(t, vUv + vec2(uTexel.x, 0.0))
  #define B(t) texture2D(t, vUv - vec2(0.0, uTexel.y))
  #define T(t) texture2D(t, vUv + vec2(0.0, uTexel.y))
`,O={splat:`
    uniform sampler2D uTarget; uniform vec2 uA, uB; uniform vec3 uValue; uniform float uRadius, uAspect;
    varying vec2 vUv;
    void main() {
      // capsule (segment) splat so a fast cursor leaves a continuous stroke, not a string of beads
      vec2 p = vUv * vec2(uAspect, 1.0), a = uA * vec2(uAspect, 1.0), b = uB * vec2(uAspect, 1.0);
      vec2 ab = b - a; float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
      float d = length(p - a - ab * h);
      float w = exp(-d * d / uRadius);
      gl_FragColor = vec4(texture2D(uTarget, vUv).xyz + uValue * w, 1.0);
    }`,advect:`
    uniform sampler2D uVelocity, uSource; uniform vec2 uTexel; uniform float uDt, uDissipation;
    varying vec2 vUv;
    void main() {
      vec2 coord = vUv - uDt * texture2D(uVelocity, vUv).xy * uTexel;
      vec4 r = texture2D(uSource, coord);
      gl_FragColor = r / (1.0 + uDissipation * uDt);
    }`,curl:`
    uniform sampler2D uVelocity; ${D}
    void main() {
      float c = R(uVelocity).y - L(uVelocity).y - T(uVelocity).x + B(uVelocity).x;
      gl_FragColor = vec4(0.5 * c, 0.0, 0.0, 1.0);
    }`,vorticity:`
    uniform sampler2D uVelocity, uCurl; uniform float uCurlK, uDt; ${D}
    void main() {
      float l = L(uCurl).x, r = R(uCurl).x, b = B(uCurl).x, t = T(uCurl).x, c = texture2D(uCurl, vUv).x;
      vec2 f = 0.5 * vec2(abs(t) - abs(b), abs(r) - abs(l));
      f /= length(f) + 1e-4;
      f *= uCurlK * c; f.y *= -1.0;
      vec2 v = texture2D(uVelocity, vUv).xy + f * uDt;
      gl_FragColor = vec4(clamp(v, -1000.0, 1000.0), 0.0, 1.0);
    }`,divergence:`
    uniform sampler2D uVelocity; ${D}
    void main() {
      float l = L(uVelocity).x, r = R(uVelocity).x, b = B(uVelocity).y, t = T(uVelocity).y;
      vec2 c = texture2D(uVelocity, vUv).xy;
      // reflective walls
      if (vUv.x - uTexel.x < 0.0) l = -c.x;
      if (vUv.x + uTexel.x > 1.0) r = -c.x;
      if (vUv.y - uTexel.y < 0.0) b = -c.y;
      if (vUv.y + uTexel.y > 1.0) t = -c.y;
      gl_FragColor = vec4(0.5 * (r - l + t - b), 0.0, 0.0, 1.0);
    }`,scale:`
    uniform sampler2D uSource; uniform float uK; varying vec2 vUv;
    void main() { gl_FragColor = texture2D(uSource, vUv) * uK; }`,pressure:`
    uniform sampler2D uPressure, uDivergence; ${D}
    void main() {
      float p = L(uPressure).x + R(uPressure).x + B(uPressure).x + T(uPressure).x;
      gl_FragColor = vec4(0.25 * (p - texture2D(uDivergence, vUv).x), 0.0, 0.0, 1.0);
    }`,gradient:`
    uniform sampler2D uPressure, uVelocity; ${D}
    void main() {
      vec2 v = texture2D(uVelocity, vUv).xy - vec2(R(uPressure).x - L(uPressure).x, T(uPressure).x - B(uPressure).x);
      gl_FragColor = vec4(v, 0.0, 1.0);
    }`};function k(e,{quality:s=`high`}={}){let l=s===`high`,u=l?128:72,f=l?256:128,te=l?16:10,h={type:p,format:r,minFilter:n,magFilter:n,depthBuffer:!1,stencilBuffer:!1,wrapS:ne,wrapT:ne},v={...h,minFilter:i,magFilter:i},y=e=>{let t={a:new g(1,1,e),b:new g(1,1,e)};return t.swap=()=>{let e=t.a;t.a=t.b,t.b=e},t.setSize=(e,n)=>{t.a.setSize(e,n),t.b.setSize(e,n)},t.dispose=()=>{t.a.dispose(),t.b.dispose()},t},b=y(h),x=y(h),S=y(v),C=new g(1,1,v),w=new g(1,1,v),T=new d(1,1),E=new d(1,1),D=(e,t)=>new m({vertexShader:re,fragmentShader:e,uniforms:t,depthTest:!1,depthWrite:!1,blending:0}),k={splat:D(O.splat,{uTarget:{value:null},uA:{value:new d},uB:{value:new d},uValue:{value:new o},uRadius:{value:.001},uAspect:{value:1}}),advect:D(O.advect,{uVelocity:{value:null},uSource:{value:null},uTexel:{value:T},uDt:{value:0},uDissipation:{value:0}}),curl:D(O.curl,{uVelocity:{value:null},uTexel:{value:T}}),vorticity:D(O.vorticity,{uVelocity:{value:null},uCurl:{value:null},uCurlK:{value:l?26:18},uDt:{value:0},uTexel:{value:T}}),divergence:D(O.divergence,{uVelocity:{value:null},uTexel:{value:T}}),scale:D(O.scale,{uSource:{value:null},uK:{value:.8}}),pressure:D(O.pressure,{uPressure:{value:null},uDivergence:{value:null},uTexel:{value:T}}),gradient:D(O.gradient,{uPressure:{value:null},uVelocity:{value:null},uTexel:{value:T}})},A=new _(new t(2,2));A.frustumCulled=!1;let j=new c;j.add(A);let M=new a(-1,1,1,-1,0,1),N=(t,n)=>{A.material=t,e.setRenderTarget(n),e.render(j,M)},P=1,F=0,ie=[];function I(e){P=Math.max(.2,e||1);let t=e=>P>=1?[Math.round(e*P),e]:[e,Math.round(e/P)],[n,r]=t(u),[i,a]=t(f);b.setSize(n,r),S.setSize(n,r),C.setSize(n,r),w.setSize(n,r),x.setSize(i,a),T.set(1/n,1/r),E.set(1/i,1/a),k.splat.uniforms.uAspect.value=P,L()}function L(){let t=e.getRenderTarget(),n=e.getClearColor(new ee),r=e.getClearAlpha();e.setClearColor(0,0);for(let t of[b.a,b.b,x.a,x.b,S.a,S.b,C,w])e.setRenderTarget(t),e.clear();e.setClearColor(n,r),e.setRenderTarget(t),F=0}function R(e,t,n,r,i){ie.push([e,t,n,r,Math.max(i,1/240)])}function ae(){let e=k.splat.uniforms;for(let[t,n,r,i,a]of ie){let o=r-t,s=i-n,c=Math.hypot(o*P,s)/a;if(c<.02)continue;let u=Math.min(1,2.6/c),d=o/a/T.x*u*.55,f=s/a/T.y*u*.55;e.uA.value.set(t,n),e.uB.value.set(r,i),e.uRadius.value=(l?.0011:.0016)*(1+Math.min(c,3)*.35),e.uTarget.value=b.a.texture,e.uValue.value.set(d,f,0),N(k.splat,b.b),b.swap();let p=.16+.44*Math.min(1,c/2.2);e.uRadius.value*=.8,e.uTarget.value=x.a.texture,e.uValue.value.set(p,p*.5,0),N(k.splat,x.b),x.swap(),F=Math.min(1,F+.6+c*.2)}ie=[]}function oe(t){if(!ie.length&&F<.002)return 0;let n=e.getRenderTarget(),r=e.autoClear;e.autoClear=!1,t=Math.min(t,1/30),ae(),k.curl.uniforms.uVelocity.value=b.a.texture,N(k.curl,w),k.vorticity.uniforms.uVelocity.value=b.a.texture,k.vorticity.uniforms.uCurl.value=w.texture,k.vorticity.uniforms.uDt.value=t,N(k.vorticity,b.b),b.swap(),k.divergence.uniforms.uVelocity.value=b.a.texture,N(k.divergence,C),k.scale.uniforms.uSource.value=S.a.texture,N(k.scale,S.b),S.swap(),k.pressure.uniforms.uDivergence.value=C.texture;for(let e=0;e<te;e++)k.pressure.uniforms.uPressure.value=S.a.texture,N(k.pressure,S.b),S.swap();k.gradient.uniforms.uPressure.value=S.a.texture,k.gradient.uniforms.uVelocity.value=b.a.texture,N(k.gradient,b.b),b.swap();let i=k.advect.uniforms;return i.uDt.value=t,i.uTexel.value=T,i.uVelocity.value=b.a.texture,i.uSource.value=b.a.texture,i.uDissipation.value=1.9,N(k.advect,b.b),b.swap(),i.uVelocity.value=b.a.texture,i.uSource.value=x.a.texture,i.uDissipation.value=2.4,N(k.advect,x.b),x.swap(),e.autoClear=r,e.setRenderTarget(n),F*=Math.exp(-t*2),F<.002&&L(),F}return I(1),{get velocity(){return b.a.texture},get dye(){return x.a.texture},get energy(){return F},texel:T,dyeTexel:E,resize:I,splat:R,step:oe,clear:L,dispose(){b.dispose(),x.dispose(),S.dispose(),C.dispose(),w.dispose();for(let e of Object.values(k))e.dispose();A.geometry.dispose()}}}var A=Object.assign({"./orbit/index.js":()=>y(()=>import(`./orbit-B75Lqpr-.js`),__vite__mapDeps([0,1])),"./river/index.js":()=>y(()=>import(`./river-CiP8Ed_4.js`),__vite__mapDeps([2,1]))}),j=[0,.42],M=[.4,1],N=[.37,.45],P=.82,F=3,ie=3,I=e=>Math.min(1,Math.max(0,e)),L=(e,t,n)=>{let r=I((n-e)/(t-e));return r*r*(3-2*r)},R=(e,t,n)=>e+(t-e)*n,ae=(e,t,n,r)=>L(e-n,e+n,r)*(1-L(t-n,t+n,r)),oe=.22,se=.25,ce=1.2;function z(t,{quality:n=`high`,reduced:r=!1,onProgress:i}={}){if(!document.createElement(`canvas`).getContext(`webgl2`))throw Error(`WebGL2 not available`);let a=document.createElement(`canvas`);a.className=`film__canvas`,a.setAttribute(`aria-hidden`,`true`),a.style.cssText=`position:absolute;inset:0;width:100%;height:100%;display:block`,t.appendChild(a);let o=new l({canvas:a,antialias:!1,powerPreference:`high-performance`,stencil:!1}),s=n===`high`?Math.min(window.devicePixelRatio||1,1.25):1,c=n===`low`?.7:Math.min(1,s),f=n===`low`?1/31:0,ee=0;o.setPixelRatio(c),o.toneMapping=0,o.outputColorSpace=e,o.autoClear=!0;let m=v(o,{onProgress:i}),ne={renderer:o,quality:n,reduced:r,base:`/`,assets:m},_=n===`high`?2:0,y=new g(1,1,{type:p,samples:_}),b=new g(1,1,{type:p,samples:_}),x=new te(o,new g(1,1,{type:p})),re=new S,D=new C({quality:n}),O=n===`high`?.26:.22,z=new h(new d(256,256),O,.55,1.7),B=new w({quality:n}),V=n===`high`?new E:null,le=new T({finish:!!V}),H=r?null:k(o,{quality:n});z.materialHighPassFilter.uniforms.uLocal={value:1.6},z.materialHighPassFilter.fragmentShader=`
    uniform sampler2D tDiffuse; uniform float luminosityThreshold, uLocal; varying vec2 vUv;
    float lumAt(vec2 uv) { return dot(texture2D(tDiffuse, uv).rgb, vec3(0.2126, 0.7152, 0.0722)); }
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      float v = dot(texel.rgb, vec3(0.2126, 0.7152, 0.0722));
      float T = luminosityThreshold;
      if (v > T * 0.5 && uLocal > 0.0) {
        float m = 0.0;
        for (int i = 0; i < 8; i++) {
          float a = float(i) * 0.785398 + 0.3927;
          m += min(lumAt(vUv + vec2(cos(a) * 0.024, sin(a) * 0.042)), T * 8.0);
        }
        T = max(T, m / 8.0 * uLocal);
      }
      float k = T * 0.5;
      float soft = clamp(v - T + k, 0.0, 2.0 * k);
      soft = soft * soft / (4.0 * k + 1e-4);
      float w = max(soft, v - T) / max(v, 1e-4);
      vec3 c = texel.rgb * w;
      // cap the energy a tiny super-HDR source (sun disc ~1e3) can push into the wide blur mips,
      // otherwise it smears into a frame-wide white veil
      float lc = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c *= min(1.0, luminosityThreshold * 4.0 / max(lc, 1e-4));
      gl_FragColor = vec4(c, 1.0);
    }`,z.materialHighPassFilter.needsUpdate=!0,x.addPass(re),x.addPass(B),x.addPass(D),x.addPass(z),x.addPass(le),V&&x.addPass(V),B.enabled=!1;let U={orbit:null,river:null},W=async e=>{let t=A[`./${e}/index.js`];if(!t)return null;let n=(await t()).createChapter(ne);return U[e]=n,ge(),await n.ready,n},ue=e=>e===U.river?1*(1-.22*L(.78,1,I((G-M[0])/(M[1]-M[0])))):1,de=0,G=0,K={x:0,y:0,tx:0,ty:0},q={exposure:1,warmth:0,teal:.35,sat:1,contrast:1},J={x:.5,y:.5,vis:0,int:1},Y={x:0,y:0,has:!1,lx:0,ly:0,lhas:!1},X={t:0,v:0},Z={on:!1,a:0,v:0,cb:!1},fe=0,pe=0,me=0,he=null,Q=1,$=1;function ge(){Q=t.clientWidth||window.innerWidth,$=t.clientHeight||window.innerHeight,o.setPixelRatio(c),o.setSize(Q,$,!1);let e=Math.floor(Q*c),n=Math.floor($*c);y.setSize(e,n),b.setSize(e,n),x.setPixelRatio(c),x.setSize(Q,$),z.setSize(Math.floor(e/2),Math.floor(n/2)),re.material.uniforms.uAspect.value=Q/$,H?.resize(Q/$);for(let e of Object.values(U))e?.resize(Q,$)}let _e=new ResizeObserver(ge);_e.observe(t);let ve=!0,ye=!0,be=new IntersectionObserver(([e])=>{ve=e.isIntersecting},{threshold:0});be.observe(t);let xe=()=>{ye=!document.hidden};document.addEventListener(`visibilitychange`,xe);let Se=0,Ce=0;function we(e){e>(f?1/26:1/42)?(Se++,Ce=0):e<(f?1/30.5:1/58)&&(Ce++,Se=Math.max(0,Se-1)),Se>24&&c>.5&&(c=Math.max(.5,c-.1),Se=0,ge()),Ce>240&&c<Math.min(window.devicePixelRatio||1,s)&&(c=Math.min(s,c+.1),Ce=0,ge())}let Te=new WeakMap;function Ee(e,t,n){let r=e.camera,i=r.fov,a=Math.PI/360;Te.set(e,n===1?1:Math.tan(i*a)/Math.tan(i*n*a)),n!==1&&(r.fov=i*n,r.updateProjectionMatrix()),o.setRenderTarget(t),o.clear(),o.render(e.scene,r),n!==1&&(r.fov=i,r.updateProjectionMatrix())}let De=new u,Oe=0;function ke(){De.update();let e=De.getDelta();if(!ye||!ve)return;if(f){if(ee+=e,ee<f)return;e=ee,ee=0}e=Math.min(e,.1),Oe+=e,we(e);{let t=+!!Z.on,n=Z.on?5.5:8.5,r=Z.on?.95:.32,i=Math.min(e,1/30);Z.v+=(n*n*(t-Z.a)-2*r*n*Z.v)*i,Z.a+=Z.v*i,!Z.on&&Math.abs(Z.a)<1e-4&&Math.abs(Z.v)<.001&&(Z.a=0,Z.v=0)}let t=I(Z.a),n=Z.on||Z.a!==0;if(n||Z.cb){Z.cb=n;try{he?.onHold?.(t)}catch(e){console.warn(`[film] onHold`,e)}}let i=e*(r?1:R(1,se,t));me+=i,X.t*=Math.exp(-e*3),X.v+=(X.t-X.v)*(1-Math.exp(-e*9));let a=r?0:L(.06,1,Math.abs(X.v));if(H&&Y.has){let t=(Y.x+1)*.5,n=(1-Y.y)*.5;if(Y.lhas){let r=Math.hypot(t-Y.lx,n-Y.ly);r>1e-4&&r<.5&&H.splat(Y.lx,Y.ly,t,n,e)}Y.lx=t,Y.ly=n,Y.lhas=!0}let s=1-Math.exp(-e*(r?12:5.5));G+=(de-G)*s,K.x+=(K.tx-K.x)*(1-Math.exp(-e*3)),K.y+=(K.ty-K.y)*(1-Math.exp(-e*3));let c={x:r?0:K.x,y:r?0:K.y},l=U.river?L(N[0],N[1],G):0,u=U.orbit&&l<.999,d=U.river&&l>.001,p=[],te=r?1:1-oe*Math.max(-.35,Math.min(1,Z.a));if(u){let e=I((G-j[0])/(j[1]-j[0]));U.orbit.update(i,me,e,c),Ee(U.orbit,y,te),p.push({ch:U.orbit,w:1-l})}if(d){let e=I((G-M[0])/(M[1]-M[0]));U.river.update(i,me,e,c),Ee(U.river,b,te),p.push({ch:U.river,w:l})}o.setRenderTarget(null);let m=re.material.uniforms;m.tA.value=y.texture,m.tB.value=b.texture,m.uHasA.value=+!!u,m.uHasB.value=+!!d,m.uMix.value=u?d?l:0:1,m.uTime.value=Oe;let ne=0,h=0,g=0,_=0,v=0,S=0,C=null,w=-1;for(let{ch:e,w:t}of p){ne+=(e.getExposure?.()??1)*ue(e)*t;let n=e.getGrade?.()||{};if(h+=(n.warmth??0)*t,g+=(n.tealShadows??.35)*t,_+=(n.saturation??1)*t,v+=(n.contrast??1)*t,S+=t,t>w){w=t,C=e.getSun?.()||null;let n=Te.get(e)??1;C&&n!==1&&(C={...C,x:.5+(C.x-.5)*n,y:.5+(C.y-.5)*n})}}if(S>0){let t=1-Math.exp(-e*4);q.exposure=R(q.exposure,ne/S*P,t),q.warmth=R(q.warmth,h/S,t),q.teal=R(q.teal,g/S,t),q.sat=R(q.sat,_/S,t),q.contrast=R(q.contrast,v/S,t)}let T=1-Math.exp(-e*8);C&&C.visible!==!1?(J.x=R(J.x,C.x,T),J.y=R(J.y,C.y,T),J.vis=R(J.vis,1,T),J.int=R(J.int,C.intensity??1,T)):J.vis=R(J.vis,0,T);let E=D.material.uniforms,k=Math.max(q.exposure,.05);z.threshold=F/k,z.strength=O*R(.35,1,L(.5,1.2,k));let A=d?l*L(.8,1,I((G-M[0])/(M[1]-M[0]))):0;z.strength*=1+.45*A,E.uThreshold.value=ie/k,E.uSun.value.set(J.x,J.y),E.uSunVis.value=J.vis,E.uSunInt.value=J.int;let W=le.material.uniforms;W.uTime.value=Oe,W.uExposure.value=q.exposure,W.uWarmth.value=q.warmth,W.uTeal.value=q.teal,W.uSat.value=q.sat,W.uContrast.value=q.contrast,W.uGrain.value=r?.03:.055,V&&(V.material.uniforms.uTime.value=Oe,V.material.uniforms.uGrain.value=W.uGrain.value),W.uNight.value=A,W.uCAx.value=a*.011,W.uVigTight.value=Math.max(a*.55,t*(r?.5:1)),W.uHiLift.value=t*.2*L(.45,1.1,k);let Q=H?H.step(e):0,$=B.material.uniforms;$.uFluid.value=+(Q>0),Q>0&&($.tVel.value=H.velocity,$.tDye.value=H.dye,$.uDyeTexel.value.copy(H.dyeTexel)),$.uGlow.value=ce/k,$.uMB.value=a*.065,$.uExp.value=k,$.uDof.value=r?0:t,B.enabled=Q>0||$.uMB.value>1e-4||$.uDof.value>.001,pe=Math.max(ae(.375,.445,.02,G),.85*ae(.71,.77,.02,G),t,fe),x.render(e)}return he={onHold:null,ready:(async()=>{try{await W(`orbit`)}catch(e){console.warn(`[film] orbit failed:`,e?.message||e)}let e=W(`river`).catch(e=>console.warn(`[film] river failed:`,e?.message||e));if(!U.orbit&&(await e,!U.river))throw Error(`No film chapters available`);De.update(),de=G=0,ke(),o.setAnimationLoop(ke)})(),canvas:a,setProgress(e){de=I(e)},jump(e){de=G=I(e)},get progress(){return G},setPointer(e,t){K.tx=e,K.ty=t,Y.x=e,Y.y=t,Y.has=!0},setVelocity(e){let t=+e||0;X.t=Math.max(-1,Math.min(1,t))},pointerDown(){Z.on=!0},pointerUp(){Z.on=!1},get hold(){return I(Z.a)},getDrama(){return pe},setLetterbox(e){fe=I(+e||0)},pause(){ye=!1},resume(){ye=!0,De.update()},dispose(){o.setAnimationLoop(null),_e.disconnect(),be.disconnect(),document.removeEventListener(`visibilitychange`,xe);for(let e of Object.values(U))e?.dispose();H?.dispose(),B.dispose(),V?.dispose(),y.dispose(),b.dispose(),x.dispose(),m.dispose(),o.dispose(),a.remove()}},he}export{z as createFilm};