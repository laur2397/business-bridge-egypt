import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createAssets } from './assets.js';
import { ChapterCompositePass, FxPass, LensPass, GradePass, FinishPass } from './post.js';
import { createFluid } from './fluid.js';

const chapterLoaders = import.meta.glob(['./orbit/index.js', './river/index.js']);

// Scroll timeline (see CONTRACT.md)
const ORBIT = [0.0, 0.42];
const RIVER = [0.40, 1.0];
const MIX = [0.37, 0.45];
const EXPOSURE_TRIM = 0.82; // global trim: the engine's bloom/lens add light on top of the chapters' own exposure
// Bloom / lens thresholds are expressed in *exposed* (display-referred, pre-tonemap) units, so a bright but
// low-contrast frame (mist, cloud) that the chapter exposes down does not bloom wholesale into a white sheet.
let BLOOM_T = 3.0;
let LENS_T = 3.0;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
// bump: 0 outside [a,b], 1 inside, with soft edges of width e
const bump = (a, b, e, v) => smooth(a - e, a + e, v) * (1 - smooth(b - e, b + e, v));

// Interaction tuning
const HOLD_FOV = 0.22;      // FOV narrowing at full hold (dolly-in feel)
const HOLD_SLOW = 0.25;     // chapter time scale at full hold
const FLUID_GLOW = 1.2;     // warm dye glow, in exposed (display-referred, pre-tonemap) units at dye = 1

/**
 * createFilm(container, { quality, reduced, onProgress }) -> film
 * film.setProgress(F 0..1), film.setPointer(x,y), film.pause(), film.resume(), film.dispose(), film.ready
 * v3: film.setVelocity(v -1..1), film.pointerDown(), film.pointerUp(), film.onHold = (a 0..1) => {},
 *     film.getDrama() -> 0..1, film.setLetterbox(extra 0..1), film.hold (current amount)
 */
export function createFilm(container, { quality = 'high', reduced = false, onProgress } = {}) {
  const probe = document.createElement('canvas');
  if (!probe.getContext('webgl2')) throw new Error('WebGL2 not available');

  const canvas = document.createElement('canvas');
  canvas.className = 'film__canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  container.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  const maxPR = quality === 'high' ? 1.5 : 1;
  let pixelRatio = Math.min(window.devicePixelRatio || 1, maxPR);
  renderer.setPixelRatio(pixelRatio);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.autoClear = true;

  const assets = createAssets(renderer, { onProgress });
  const ctx = { renderer, quality, reduced, base: import.meta.env.BASE_URL, assets };

  const samples = quality === 'high' ? 4 : 0;
  const rtA = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples });
  const rtB = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples });

  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }));
  const compositePass = new ChapterCompositePass();
  const lensPass = new LensPass({ quality });
  const BLOOM_S = quality === 'high' ? 0.26 : 0.22;
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), BLOOM_S, 0.55, 1.7);
  const fxPass = new FxPass({ quality });
  const finishPass = quality === 'high' ? new FinishPass() : null;
  const gradePass = new GradePass({ finish: !!finishPass });
  const fluid = reduced ? null : createFluid(renderer, { quality });
  // soft-knee high pass: bloom only the energy *above* the threshold (the stock pass forwards the whole pixel).
  // v3: the threshold is also raised to ~1.6x the *local* mean luminance (8-tap ring, ~4% of the frame), so a
  // wide, uniformly bright area (hazy morning sky, cloud whiteout) no longer blooms into a frame-wide veil,
  // while compact sources (sun disc, lamps, glints, city lights) still do.
  bloomPass.materialHighPassFilter.uniforms.uLocal = { value: 1.6 };
  bloomPass.materialHighPassFilter.fragmentShader = /* glsl */`
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
    }`;
  bloomPass.materialHighPassFilter.needsUpdate = true;
  composer.addPass(compositePass);
  composer.addPass(fxPass);       // liquid light, scroll whip, hold focus (disabled when idle)
  composer.addPass(lensPass);
  composer.addPass(bloomPass);
  composer.addPass(gradePass);
  if (finishPass) composer.addPass(finishPass); // FXAA + grain on 'high'
  fxPass.enabled = false;

  const chapters = { orbit: null, river: null };
  const loadChapter = async (name) => {
    const loader = chapterLoaders[`./${name}/index.js`];
    if (!loader) return null;
    const mod = await loader();
    const ch = mod.createChapter(ctx);
    chapters[name] = ch;
    resize();
    await ch.ready;
    return ch;
  };

  // Per-chapter exposure art-direction on top of the chapters' own curves (multipliers vs local progress)
  let dbgMul = 1;
  const expMul = (ch) => {
    if (ch === chapters.river) {
      const lp = clamp01((F - RIVER[0]) / (RIVER[1] - RIVER[0]));
      // deeper night for the finale: let the city, lamps and reflections carry the frame
      return dbgMul * (1 - 0.22 * smooth(0.78, 1.0, lp));
    }
    return dbgMul;
  };

  // Damped state
  let target = 0;
  let F = 0;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const grade = { exposure: 1, warmth: 0, teal: 0.35, sat: 1, contrast: 1 };
  const sun = { x: 0.5, y: 0.5, vis: 0, int: 1 };
  // v3 interaction state
  const ptrRaw = { x: 0, y: 0, has: false, lx: 0, ly: 0, lhas: false };
  const scroll = { t: 0, v: 0 };                       // target (decays if the UI stops calling) / damped
  const hold = { on: false, a: 0, v: 0, cb: false };   // spring: a may overshoot below 0 on release
  let letterboxExtra = 0, drama = 0;
  let chTime = 0;                                      // chapter clock (slows down while holding)
  let api = null;

  let width = 1, height = 1;
  function resize() {
    width = container.clientWidth || window.innerWidth;
    height = container.clientHeight || window.innerHeight;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    const w = Math.floor(width * pixelRatio), h = Math.floor(height * pixelRatio);
    rtA.setSize(w, h); rtB.setSize(w, h);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
    bloomPass.setSize(Math.floor(w / 2), Math.floor(h / 2));
    compositePass.material.uniforms.uAspect.value = width / height;
    fluid?.resize(width / height);
    for (const ch of Object.values(chapters)) ch?.resize(width, height);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  // Visibility
  let visible = true, running = true;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0 });
  io.observe(container);
  const onVis = () => { if (document.hidden) running = false; else running = true; };
  document.addEventListener('visibilitychange', onVis);

  // Adaptive resolution
  let slowFrames = 0, fastFrames = 0;
  function adapt(dt) {
    if (dt > 1 / 42) { slowFrames++; fastFrames = 0; } else if (dt < 1 / 58) { fastFrames++; slowFrames = Math.max(0, slowFrames - 1); }
    if (slowFrames > 60 && pixelRatio > 0.75) { pixelRatio = Math.max(0.75, pixelRatio - 0.2); slowFrames = 0; resize(); }
    if (fastFrames > 240 && pixelRatio < Math.min(window.devicePixelRatio || 1, maxPR)) { pixelRatio = Math.min(maxPR, pixelRatio + 0.1); fastFrames = 0; resize(); }
  }

  // render a chapter with the hold dolly applied *after* its update; restore its own FOV afterwards so the
  // chapter (which sets fov every frame, sometimes only when it changed) never sees our value
  const zoomOf = new WeakMap(); // chapter -> screen-space zoom of the current dolly (for the sun hint)
  function renderAt(ch, rt, fovMul) {
    const cam = ch.camera;
    const base = cam.fov;
    const D = Math.PI / 360;
    zoomOf.set(ch, fovMul === 1 ? 1 : Math.tan(base * D) / Math.tan(base * fovMul * D));
    if (fovMul !== 1) { cam.fov = base * fovMul; cam.updateProjectionMatrix(); }
    renderer.setRenderTarget(rt); renderer.clear(); renderer.render(ch.scene, cam);
    if (fovMul !== 1) { cam.fov = base; cam.updateProjectionMatrix(); }
  }

  const clock = new THREE.Timer();
  let time = 0;

  function frame() {
    clock.update(); const dt = Math.min(clock.getDelta(), 0.1);
    if (!running || !visible) return;
    time += dt;
    adapt(dt);

    // --- hold to act: spring toward 0/1. Press eases in (near-critical), release springs back with overshoot.
    {
      const tgt = hold.on ? 1 : 0;
      const w = hold.on ? 5.5 : 8.5, z = hold.on ? 0.95 : 0.32;
      const sdt = Math.min(dt, 1 / 30);
      hold.v += (w * w * (tgt - hold.a) - 2 * z * w * hold.v) * sdt;
      hold.a += hold.v * sdt;
      if (!hold.on && Math.abs(hold.a) < 1e-4 && Math.abs(hold.v) < 1e-3) { hold.a = 0; hold.v = 0; }
    }
    const holdA = clamp01(hold.a);
    const holdOn = hold.on || hold.a !== 0;
    if (holdOn || hold.cb) {
      hold.cb = holdOn;
      try { api?.onHold?.(holdA); } catch (e) { console.warn('[film] onHold', e); }
    }
    // slow motion for the chapters while holding (the scroll itself keeps real time)
    const cdt = dt * (reduced ? 1 : lerp(1, HOLD_SLOW, holdA));
    chTime += cdt;

    // --- scroll velocity (damped; decays if the UI stops reporting)
    scroll.t *= Math.exp(-dt * 3);
    scroll.v += (scroll.t - scroll.v) * (1 - Math.exp(-dt * 9));
    const whip = reduced ? 0 : smooth(0.06, 1, Math.abs(scroll.v));

    // --- pointer → fluid splats (from the raw, undamped pointer)
    if (fluid && ptrRaw.has) {
      const ux = (ptrRaw.x + 1) * 0.5, uy = (1 - ptrRaw.y) * 0.5; // DOM y down -> uv y up
      if (ptrRaw.lhas) {
        const dd = Math.hypot(ux - ptrRaw.lx, uy - ptrRaw.ly);
        // one stroke per frame from where the pointer was; a jump (re-entering the window) is ignored
        if (dd > 1e-4 && dd < 0.5) fluid.splat(ptrRaw.lx, ptrRaw.ly, ux, uy, dt);
      }
      ptrRaw.lx = ux; ptrRaw.ly = uy; ptrRaw.lhas = true;
    }

    const k = 1 - Math.exp(-dt * (reduced ? 12 : 5.5));
    F += (target - F) * k;
    pointer.x += (pointer.tx - pointer.x) * (1 - Math.exp(-dt * 3));
    pointer.y += (pointer.ty - pointer.y) * (1 - Math.exp(-dt * 3));
    const p = { x: reduced ? 0 : pointer.x, y: reduced ? 0 : pointer.y };

    const mix = chapters.river ? smooth(MIX[0], MIX[1], F) : 0;
    const orbitOn = chapters.orbit && mix < 0.999;
    const riverOn = chapters.river && mix > 0.001;
    const hints = [];
    // dolly-in by FOV narrowing (negative hold = elastic overshoot on release -> slightly wider)
    const holdFov = reduced ? 1 : 1 - HOLD_FOV * Math.max(-0.35, Math.min(1, hold.a));

    if (orbitOn) {
      const lp = clamp01((F - ORBIT[0]) / (ORBIT[1] - ORBIT[0]));
      chapters.orbit.update(cdt, chTime, lp, p);
      renderAt(chapters.orbit, rtA, holdFov);
      hints.push({ ch: chapters.orbit, w: 1 - mix });
    }
    if (riverOn) {
      const lp = clamp01((F - RIVER[0]) / (RIVER[1] - RIVER[0]));
      chapters.river.update(cdt, chTime, lp, p);
      renderAt(chapters.river, rtB, holdFov);
      hints.push({ ch: chapters.river, w: mix });
    }
    renderer.setRenderTarget(null);

    const cu = compositePass.material.uniforms;
    cu.tA.value = rtA.texture; cu.tB.value = rtB.texture;
    cu.uHasA.value = orbitOn ? 1 : 0; cu.uHasB.value = riverOn ? 1 : 0;
    cu.uMix.value = orbitOn ? (riverOn ? mix : 0) : 1;
    cu.uTime.value = time;

    // Blend post hints from visible chapters
    let ex = 0, wa = 0, te = 0, sa = 0, co = 0, wsum = 0;
    let bestSun = null, bestW = -1;
    for (const { ch, w } of hints) {
      ex += (ch.getExposure?.() ?? 1) * expMul(ch) * w;
      const g = ch.getGrade?.() || {};
      wa += (g.warmth ?? 0) * w; te += (g.tealShadows ?? 0.35) * w; sa += (g.saturation ?? 1) * w; co += (g.contrast ?? 1) * w;
      wsum += w;
      if (w > bestW) {
        bestW = w; bestSun = ch.getSun?.() || null;
        // the chapter projected its sun with its own FOV; re-project it through the hold dolly
        const z = zoomOf.get(ch) ?? 1;
        if (bestSun && z !== 1) bestSun = { ...bestSun, x: 0.5 + (bestSun.x - 0.5) * z, y: 0.5 + (bestSun.y - 0.5) * z };
      }
    }
    if (wsum > 0) {
      const kk = 1 - Math.exp(-dt * 4);
      grade.exposure = lerp(grade.exposure, (ex / wsum) * EXPOSURE_TRIM, kk);
      grade.warmth = lerp(grade.warmth, wa / wsum, kk);
      grade.teal = lerp(grade.teal, te / wsum, kk);
      grade.sat = lerp(grade.sat, sa / wsum, kk);
      grade.contrast = lerp(grade.contrast, co / wsum, kk);
    }
    const sk = 1 - Math.exp(-dt * 8);
    if (bestSun && bestSun.visible !== false) {
      sun.x = lerp(sun.x, bestSun.x, sk); sun.y = lerp(sun.y, bestSun.y, sk);
      sun.vis = lerp(sun.vis, 1, sk); sun.int = lerp(sun.int, bestSun.intensity ?? 1, sk);
    } else sun.vis = lerp(sun.vis, 0, sk);

    const lu = lensPass.material.uniforms;
    const exE = Math.max(grade.exposure, 0.05);
    bloomPass.threshold = BLOOM_T / exE;
    // bright (exposed-down) frames get less glow: bloom is for lamps, stars and the sun, not for a daylit sky
    bloomPass.strength = BLOOM_S * lerp(0.35, 1, smooth(0.5, 1.2, exE));
    // night finale: lights carry the frame -> a little more glow
    const nightW = riverOn ? mix * smooth(0.8, 1.0, clamp01((F - RIVER[0]) / (RIVER[1] - RIVER[0]))) : 0;
    bloomPass.strength *= 1 + 0.45 * nightW;
    lu.uThreshold.value = LENS_T / exE;
    lu.uSun.value.set(sun.x, sun.y); lu.uSunVis.value = sun.vis; lu.uSunInt.value = sun.int;
    const gu = gradePass.material.uniforms;
    gu.uTime.value = time;
    gu.uExposure.value = grade.exposure; gu.uWarmth.value = grade.warmth; gu.uTeal.value = grade.teal;
    gu.uSat.value = grade.sat; gu.uContrast.value = grade.contrast;
    gu.uGrain.value = reduced ? 0.03 : 0.055;
    if (finishPass) { finishPass.material.uniforms.uTime.value = time; finishPass.material.uniforms.uGrain.value = gu.uGrain.value; }
    // night finale: deeper toe + teal shadows so the city lights pop
    gu.uNight.value = nightW;
    // interaction: whip adds radial CA + a tighter vignette; hold tightens the vignette and lifts highlights
    gu.uCAx.value = whip * 0.011;
    gu.uVigTight.value = Math.max(whip * 0.55, holdA * (reduced ? 0.5 : 1));
    gu.uHiLift.value = holdA * 0.2 * smooth(0.45, 1.1, exE); // no lift on frames that are already bright

    // --- FX pass (fluid refraction + glow, scroll whip, hold focus); disabled entirely when idle
    const energy = fluid ? fluid.step(dt) : 0;
    const fu = fxPass.material.uniforms;
    fu.uFluid.value = energy > 0 ? 1 : 0;
    if (energy > 0) { fu.tVel.value = fluid.velocity; fu.tDye.value = fluid.dye; fu.uDyeTexel.value.copy(fluid.dyeTexel); }
    fu.uGlow.value = FLUID_GLOW / exE;
    fu.uMB.value = whip * 0.065;
    fu.uExp.value = exE;
    fu.uDof.value = reduced ? 0 : holdA;
    fxPass.enabled = energy > 0 || fu.uMB.value > 1e-4 || fu.uDof.value > 1e-3;

    // --- drama (UI tightens the letterbox): cloud dive, lights switching on, holding
    drama = Math.max(bump(0.375, 0.445, 0.02, F), 0.85 * bump(0.71, 0.77, 0.02, F), holdA, letterboxExtra);

    composer.render(dt);
  }

  // Ready: orbit first (it is the opening), river right after.
  const ready = (async () => {
    const results = await Promise.allSettled([loadChapter('orbit'), loadChapter('river')]);
    const errors = results.filter((r) => r.status === 'rejected');
    if (errors.length) console.warn('[film] chapter failed:', errors.map((e) => e.reason?.message || e.reason));
    if (!chapters.orbit && !chapters.river) throw new Error('No film chapters available');
    // warm up: render both once so shaders are compiled before the user scrolls
    clock.update();
    for (const f of [0, 0.41, 0.6]) { target = F = f; frame(); }
    target = F = 0;
    renderer.setAnimationLoop(frame);
  })();

  if (import.meta.env.DEV) window.__filmDbg = { setT(b, l) { BLOOM_T = b; LENS_T = l; }, setMul(m) { dbgMul = m; }, lensPass, bloomPass, gradePass, compositePass, chapters, grade, sun, get F() { return F; }, jump(f) { target = F = clamp01(f); }, fxPass, finishPass, fluid, hold, scroll, setHold(v) { hold.on = v > 0; hold.a = v; hold.v = 0; }, get drama() { return drama; } };

  api = {
    onHold: null,
    ready,
    canvas,
    setProgress(f) { target = clamp01(f); },
    jump(f) { target = F = clamp01(f); },
    get progress() { return F; },
    setPointer(x, y) {
      pointer.tx = x; pointer.ty = y;
      ptrRaw.x = x; ptrRaw.y = y; ptrRaw.has = true;
    },
    /** scroll velocity, normalized -1..1 (e.g. Lenis velocity / ~40). Damped inside; call every scroll frame. */
    setVelocity(v) { const n = +v || 0; scroll.t = Math.max(-1, Math.min(1, n)); },
    /** "Hold to Act" */
    pointerDown() { hold.on = true; },
    pointerUp() { hold.on = false; },
    get hold() { return clamp01(hold.a); },
    /** 0..1: how dramatic the moment is (the UI tightens the letterbox) */
    getDrama() { return drama; },
    /** optional extra letterbox request from outside (merged into getDrama) */
    setLetterbox(extra) { letterboxExtra = clamp01(+extra || 0); },
    pause() { running = false; },
    resume() { running = true; clock.update(); },
    dispose() {
      renderer.setAnimationLoop(null);
      ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      for (const ch of Object.values(chapters)) ch?.dispose();
      fluid?.dispose(); fxPass.dispose(); finishPass?.dispose();
      rtA.dispose(); rtB.dispose(); composer.dispose(); assets.dispose(); renderer.dispose();
      canvas.remove();
    },
  };
  if (import.meta.env.DEV) window.__film = api;
  return api;
}
