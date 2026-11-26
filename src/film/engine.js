import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createAssets } from './assets.js';
import { ChapterCompositePass, LensPass, GradePass } from './post.js';

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

/**
 * createFilm(container, { quality, reduced, onProgress }) -> film
 * film.setProgress(F 0..1), film.setPointer(x,y), film.pause(), film.resume(), film.dispose(), film.ready
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
  const gradePass = new GradePass();
  // soft-knee high pass: bloom only the energy *above* the threshold (the stock pass forwards the whole pixel)
  bloomPass.materialHighPassFilter.fragmentShader = /* glsl */`
    uniform sampler2D tDiffuse; uniform float luminosityThreshold; varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      float v = dot(texel.rgb, vec3(0.2126, 0.7152, 0.0722));
      float k = luminosityThreshold * 0.5;
      float soft = clamp(v - luminosityThreshold + k, 0.0, 2.0 * k);
      soft = soft * soft / (4.0 * k + 1e-4);
      float w = max(soft, v - luminosityThreshold) / max(v, 1e-4);
      vec3 c = texel.rgb * w;
      // cap the energy a tiny super-HDR source (sun disc ~1e3) can push into the wide blur mips,
      // otherwise it smears into a frame-wide white veil
      float lc = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c *= min(1.0, luminosityThreshold * 4.0 / max(lc, 1e-4));
      gl_FragColor = vec4(c, 1.0);
    }`;
  bloomPass.materialHighPassFilter.needsUpdate = true;
  composer.addPass(compositePass);
  composer.addPass(lensPass);
  composer.addPass(bloomPass);
  composer.addPass(gradePass);

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

  const clock = new THREE.Timer();
  let time = 0;

  function frame() {
    clock.update(); const dt = Math.min(clock.getDelta(), 0.1);
    if (!running || !visible) return;
    time += dt;
    adapt(dt);

    const k = 1 - Math.exp(-dt * (reduced ? 12 : 5.5));
    F += (target - F) * k;
    pointer.x += (pointer.tx - pointer.x) * (1 - Math.exp(-dt * 3));
    pointer.y += (pointer.ty - pointer.y) * (1 - Math.exp(-dt * 3));
    const p = { x: reduced ? 0 : pointer.x, y: reduced ? 0 : pointer.y };

    const mix = chapters.river ? smooth(MIX[0], MIX[1], F) : 0;
    const orbitOn = chapters.orbit && mix < 0.999;
    const riverOn = chapters.river && mix > 0.001;
    const hints = [];

    if (orbitOn) {
      const lp = clamp01((F - ORBIT[0]) / (ORBIT[1] - ORBIT[0]));
      chapters.orbit.update(dt, time, lp, p);
      renderer.setRenderTarget(rtA); renderer.clear(); renderer.render(chapters.orbit.scene, chapters.orbit.camera);
      hints.push({ ch: chapters.orbit, w: 1 - mix });
    }
    if (riverOn) {
      const lp = clamp01((F - RIVER[0]) / (RIVER[1] - RIVER[0]));
      chapters.river.update(dt, time, lp, p);
      renderer.setRenderTarget(rtB); renderer.clear(); renderer.render(chapters.river.scene, chapters.river.camera);
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
      if (w > bestW) { bestW = w; bestSun = ch.getSun?.() || null; }
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
    lu.uThreshold.value = LENS_T / exE;
    lu.uSun.value.set(sun.x, sun.y); lu.uSunVis.value = sun.vis; lu.uSunInt.value = sun.int;
    const gu = gradePass.material.uniforms;
    gu.uTime.value = time;
    gu.uExposure.value = grade.exposure; gu.uWarmth.value = grade.warmth; gu.uTeal.value = grade.teal;
    gu.uSat.value = grade.sat; gu.uContrast.value = grade.contrast;
    gu.uGrain.value = reduced ? 0.03 : 0.055;

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

  if (import.meta.env.DEV) window.__filmDbg = { setT(b, l) { BLOOM_T = b; LENS_T = l; }, setMul(m) { dbgMul = m; }, lensPass, bloomPass, gradePass, compositePass, chapters, grade, sun, get F() { return F; }, jump(f) { target = F = clamp01(f); } };

  return {
    ready,
    canvas,
    setProgress(f) { target = clamp01(f); },
    jump(f) { target = F = clamp01(f); },
    get progress() { return F; },
    setPointer(x, y) { pointer.tx = x; pointer.ty = y; },
    pause() { running = false; },
    resume() { running = true; clock.update(); },
    dispose() {
      renderer.setAnimationLoop(null);
      ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      for (const ch of Object.values(chapters)) ch?.dispose();
      rtA.dispose(); rtB.dispose(); composer.dispose(); assets.dispose(); renderer.dispose();
      canvas.remove();
    },
  };
}
