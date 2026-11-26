// Hero WebGL scene — "The Bridge over the Nile at Cairo".
//
//   const hero = createHeroScene(container, { quality: 'high' | 'low' });
//   hero.setProgress(p)      p in [0,1] (scroll), damped internally
//   hero.setPointer(x, y)    normalized -1..1, subtle camera parallax
//   hero.pause() / hero.resume() / hero.dispose()
//   hero.ready               Promise resolved after the first rendered frame
//
// Throws an Error if WebGL is unavailable (the page shows its static fallback).
// Every texture is procedural. Nothing is downloaded.
import {
  ACESFilmicToneMapping, Color, DirectionalLight, FogExp2, HalfFloatType, HemisphereLight,
  PerspectiveCamera, PlaneGeometry, Scene, SRGBColorSpace, Vector2, Vector3,
  WebGLRenderer, WebGLRenderTarget
} from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { createWaterNormals } from './hero/textures.js';
import { createSky, evalSky, applySkyProgress } from './hero/sky.js';
import { createBridge } from './hero/bridge.js';
import { createCity } from './hero/city.js';
import { createStars, createDust } from './hero/lights.js';
import { FilmShader } from './hero/post.js';
import { patchFogWater } from './hero/patches.js';

const DEG = Math.PI / 180;
const HAZE_OFFS = [0, 5, 10, 20, 35, 55, 90, 180];
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function hasWebGL2() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return false;
    const ext = gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
    return true;
  } catch (e) {
    return false;
  }
}

export function createHeroScene(container, options = {}) {
  if (!container) throw new Error('createHeroScene: container element is required');
  if (typeof window === 'undefined' || !hasWebGL2()) throw new Error('WebGL is not available');

  const quality = options.quality === 'low' ? 'low' : 'high';
  const low = quality === 'low';
  const mqReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reduced = !!(mqReduce && mqReduce.matches);

  // ---------------- renderer ----------------
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' });
  } catch (e) {
    throw new Error('WebGL is not available: ' + (e && e.message ? e.message : e));
  }
  const maxPR = low ? 1 : Math.min(window.devicePixelRatio || 1, 1.75);
  let pr = maxPR;
  renderer.setPixelRatio(pr);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.5;
  renderer.outputColorSpace = SRGBColorSpace;
  container.appendChild(canvas);

  let W = Math.max(1, container.clientWidth), H = Math.max(1, container.clientHeight);
  renderer.setSize(W, H, false);

  // ---------------- shared uniforms ----------------
  const shared = {
    uTime: { value: 0 },
    uScale: { value: 1 },
    uPR: { value: pr },
    uFogDensity: { value: 0.00024 },
    uNight: { value: 0 },
    uStars: { value: 0 },
    uSunWorld: { value: new Vector3(0, 0, -1) },
    uHaze: { value: Array.from({ length: 8 }, () => new Color()) },
    uCityOn: { value: 0 },
    uLampsOn: { value: 0 },
    uCarsOn: { value: 0 },
    uBeaconOn: { value: 0 },
    uWinIntensity: { value: 2.4 },
    uWaterNight: { value: 0 },
    uDust: { value: 0 },
    uSunScreenX: { value: 1 },
    uPyrRim: { value: new Color(0, 0, 0) }
  };

  // ---------------- scene ----------------
  const scene = new Scene();
  scene.fog = new FogExp2(0x8a6a50, shared.uFogDensity.value);
  const camera = new PerspectiveCamera(38, W / H, 1, 30000);
  camera.layers.enable(1);
  scene.add(camera);

  const sky = createSky(shared);
  scene.add(sky);

  const sunLight = new DirectionalLight(0xffb070, 2.5);
  scene.add(sunLight);
  scene.add(sunLight.target);
  const hemi = new HemisphereLight(0x9cb4d8, 0x3a2a1a, 0.8);
  scene.add(hemi);

  // water
  const waterNormals = createWaterNormals(low ? 256 : 512);
  const water = new Water(new PlaneGeometry(30000, 30000), {
    textureWidth: low ? 384 : 1024,
    textureHeight: low ? 384 : 1024,
    waterNormals,
    sunDirection: new Vector3(0, 0.1, -1),
    sunColor: 0xffa060,
    waterColor: 0x082230,
    distortionScale: 3.2,
    fog: true
  });
  water.rotation.x = -Math.PI / 2;
  water.material.uniforms.size.value = 7.0;
  patchFogWater(water.material, shared);
  water.name = 'hero-water';
  scene.add(water);

  // bridge
  const bridge = createBridge(shared, quality);
  bridge.group.position.set(45, 0, -762);
  bridge.group.rotation.y = -0.2;
  scene.add(bridge.group);

  // city, pyramids, lights
  const city = createCity(shared, quality);
  scene.add(city.group);

  const stars = createStars(shared, low ? 900 : 2200, reduced);
  scene.add(stars);

  const dust = createDust(shared, low ? 90 : 220);
  camera.add(dust);

  // ---------------- post ----------------
  const rt = new WebGLRenderTarget(W * pr, H * pr, { type: HalfFloatType, samples: low ? 0 : pr > 1.3 ? 2 : 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pr);
  composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  let bloom = null;
  if (!low) {
    bloom = new UnrealBloomPass(new Vector2(W, H), 0.55, 0.55, 0.9);
    composer.addPass(bloom);
  }
  composer.addPass(new OutputPass());
  const film = new ShaderPass(FilmShader);
  composer.addPass(film);

  // ---------------- state ----------------
  let targetP = 0, curP = 0;
  const pointer = new Vector2(), pointerS = new Vector2();
  let running = true, userPaused = false, inView = true, docHidden = document.hidden;
  let raf = 0, last = performance.now(), elapsed = 0, firstFrame = true, disposed = false;
  let readyResolve;
  const ready = new Promise((r) => (readyResolve = r));

  const sunDir = new Vector3();
  const tmpV = new Vector3(), tmpC = new Color(), tmpC2 = new Color();
  const camPos = new Vector3(), lookAt = new Vector3();
  let lastSkyP = -1;

  function computeFov(aspect) {
    // keep at least ~16 deg half horizontal FOV on portrait screens
    const minHalfH = 16 * DEG;
    const v = 2 * Math.atan(Math.tan(minHalfH) / aspect) / DEG;
    return Math.min(66, Math.max(38, v));
  }

  function resize() {
    W = Math.max(1, container.clientWidth); H = Math.max(1, container.clientHeight);
    renderer.setSize(W, H, false);
    composer.setSize(W, H);
    camera.aspect = W / H;
    camera.fov = computeFov(camera.aspect);
    camera.updateProjectionMatrix();
    shared.uScale.value = H / (2 * Math.tan((camera.fov * DEG) / 2));
    film.uniforms.uRes.value.set(W * pr, H * pr);
    if (!running || !raf) renderOnce();
  }

  function applyProgress(p) {
    // ---- sun / sky ----
    const elev = applySkyProgress(sky, p, sunDir);
    const night = ss(0.3, 0.95, p);
    shared.uStars.value = ss(0.58, 1.0, p);

    const sunAbove = ss(-2.5 * DEG, 3 * DEG, elev);
    // ---- lights ----
    const lights = ss(0.22, 0.8, p);
    shared.uCityOn.value = lerp(0, 1.02, ss(0.18, 0.95, p));
    shared.uLampsOn.value = lerp(0, 1.1, ss(0.22, 0.6, p));
    shared.uCarsOn.value = ss(0.32, 0.62, p);
    shared.uBeaconOn.value = lerp(0, 1.1, ss(0.25, 0.75, p));
    shared.uWinIntensity.value = lerp(1.2, 1.8, night);
    shared.uDust.value = (1 - ss(0.1, 0.55, p)) * (low ? 0.6 : 0.9);
    bridge.update({ lights });
    city.update({ lights });

    // ---- direct light ----
    sunLight.position.copy(sunDir).multiplyScalar(2000).add(new Vector3(0, 0, -700));
    sunLight.target.position.set(0, 0, -700);
    sunLight.color.setRGB(1.0, lerp(0.6, 0.42, ss(0, 0.4, p)), lerp(0.34, 0.2, ss(0, 0.4, p)));
    sunLight.intensity = 3.0 * sunAbove;
    hemi.color.copy(tmpC.set(0x9cb4d8).lerp(tmpC2.set(0x1b2c55), night));
    hemi.groundColor.copy(tmpC.set(0x4a3020).lerp(tmpC2.set(0x07080e), night));
    hemi.intensity = lerp(0.75, 0.45, night);
    shared.uPyrRim.value.setRGB(1.0, 0.55, 0.28).multiplyScalar(0.18 * sunAbove);

    // ---- water ----
    const wu = water.material.uniforms;
    wu.sunDirection.value.copy(sunDir).normalize();
    wu.sunColor.value.setRGB(1.0, 0.62, 0.32).multiplyScalar(lerp(1, 0.0, ss(0.25, 0.75, p)));
    wu.waterColor.value.set(0x082230).lerp(tmpC.set(0x030c16), night);
    shared.uWaterNight.value = night;

    // ---- fog + aerial glow from the sky model (only when the sky changed) ----
    if (Math.abs(p - lastSkyP) > 0.0005) {
      lastSkyP = p;
      const sunAz = Math.atan2(sunDir.x, -sunDir.z);
      const haze = shared.uHaze.value;
      for (let i = 0; i < HAZE_OFFS.length; i++) {
        const aa = sunAz + HAZE_OFFS[i] * DEG;
        tmpV.set(Math.sin(aa), 0.045, -Math.cos(aa)).normalize();
        evalSky(sky, tmpV, haze[i]);
        const l = 0.2126 * haze[i].r + 0.7152 * haze[i].g + 0.0722 * haze[i].b;
        if (l > 7) haze[i].multiplyScalar(7 / l);
      }
      scene.fog.color.copy(haze[5]);
    }
    scene.fog.density = lerp(0.00026, 0.0002, night);
    shared.uFogDensity.value = scene.fog.density;

    renderer.toneMappingExposure = lerp(0.42, 1.15, ss(0.15, 0.85, p));
    if (bloom) {
      bloom.strength = lerp(0.28, 0.7, ss(0.2, 0.9, p));
      bloom.threshold = lerp(6.0, 1.1, ss(0.15, 0.7, p));
    }

    // ---- camera path ----
    const c = easeInOut(Math.min(1, Math.max(0, p)));
    camPos.set(lerp(0, 30, c), lerp(5.5, 14, c), lerp(80, -200, c));
    const pitch = lerp(2.4, 4.4, c) * DEG;
    const portrait = camera.aspect < 1 ? (1 - camera.aspect) : 0;
    const yaw = (lerp(0.0, -1.5, c) + portrait * 9) * DEG;
    return { pitch, yaw };
  }

  function updateCamera(view, dt) {
    const k = 1 - Math.exp(-dt * (reduced ? 20 : 3));
    if (reduced) pointerS.set(0, 0); else pointerS.lerp(pointer, k);
    const t = elapsed;
    const drift = reduced ? 0 : 1;
    const dx = drift * (Math.sin(t * 0.11) * 0.8 + pointerS.x * 2.5);
    const dy = drift * (Math.sin(t * 0.17 + 1.3) * 0.18 - pointerS.y * 0.8);
    camera.position.set(camPos.x + dx, camPos.y + dy, camPos.z);
    const yaw = view.yaw - pointerS.x * 1.2 * DEG + drift * Math.sin(t * 0.07) * 0.12 * DEG;
    const pitch = view.pitch + pointerS.y * 0.7 * DEG;
    lookAt.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)).add(camera.position);
    camera.lookAt(lookAt);
    camera.rotateZ(drift * Math.sin(t * 0.09) * 0.08 * DEG);
    camera.updateMatrixWorld();
  }

  // dynamic resolution: if frames are consistently slow, step the pixel ratio down (never below 1)
  let slowAcc = 0, slowN = 0;
  function adaptResolution(dt) {
    if (dt <= 0 || pr <= 1) return;
    slowAcc += dt; slowN++;
    if (slowN >= 90) {
      const avg = slowAcc / slowN;
      slowAcc = 0; slowN = 0;
      if (avg > 1 / 45) {
        pr = Math.max(1, pr - 0.25);
        shared.uPR.value = pr;
        renderer.setPixelRatio(pr);
        composer.setPixelRatio(pr);
        resize();
      }
    }
  }

  function frame(dt) {
    adaptResolution(dt);
    elapsed += dt;
    shared.uTime.value = elapsed;
    const kP = 1 - Math.exp(-dt * (reduced ? 10 : 2.6));
    curP += (targetP - curP) * kP;
    if (Math.abs(targetP - curP) < 1e-5) curP = targetP;
    const view = applyProgress(curP);
    updateCamera(view, dt);

    shared.uSunWorld.value.copy(sunDir);
    tmpV.copy(sunDir).multiplyScalar(5000).add(camera.position).project(camera);
    shared.uSunScreenX.value = tmpV.x;

    water.material.uniforms.time.value += dt * (reduced ? 0.06 : 0.55);
    if (!reduced) sky.material.uniforms.time.value = elapsed;
    film.uniforms.uTime.value = reduced ? 0 : elapsed;
    composer.render(dt);
    if (firstFrame) { firstFrame = false; readyResolve(); }
  }

  function renderOnce() {
    if (disposed) return;
    frame(0);
  }

  function loop() {
    raf = 0;
    if (!running || disposed) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    frame(dt);
    raf = requestAnimationFrame(loop);
  }

  function updateRunning() {
    const should = !userPaused && inView && !docHidden && !disposed;
    if (should && !running) {
      running = true;
      last = performance.now();
      if (!raf) raf = requestAnimationFrame(loop);
    } else if (!should && running) {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  // ---------------- observers ----------------
  const ro = new ResizeObserver(() => resize());
  ro.observe(container);
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) inView = e.isIntersecting;
    updateRunning();
  }, { threshold: 0 });
  io.observe(container);
  const onVis = () => { docHidden = document.hidden; updateRunning(); };
  document.addEventListener('visibilitychange', onVis);
  const onReduce = (e) => { reduced = e.matches; stars.material.uniforms.uTwinkle.value = reduced ? 0 : 1; };
  if (mqReduce && mqReduce.addEventListener) mqReduce.addEventListener('change', onReduce);
  const onLost = (e) => { e.preventDefault(); running = false; if (raf) cancelAnimationFrame(raf); raf = 0; };
  const onRestored = () => { updateRunning(); };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  resize();
  applyProgress(0);
  running = false;
  updateRunning();
  if (!running) renderOnce(); // still produce a first frame (resolves ready) if starting hidden

  // ---------------- API ----------------
  return {
    ready,
    setProgress(p, opts) {
      const v = Math.min(1, Math.max(0, Number(p) || 0));
      targetP = v;
      if (opts && opts.immediate) curP = v;
      if (!running && !disposed) renderOnce();
    },
    setPointer(x, y) {
      pointer.set(Math.min(1, Math.max(-1, Number(x) || 0)), Math.min(1, Math.max(-1, Number(y) || 0)));
    },
    pause() { userPaused = true; updateRunning(); },
    resume() { userPaused = false; updateRunning(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      if (mqReduce && mqReduce.removeEventListener) mqReduce.removeEventListener('change', onReduce);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => m.dispose());
        }
        if (o.isWater && o.material.uniforms.mirrorSampler.value) o.material.uniforms.mirrorSampler.value.dispose();
      });
      waterNormals.dispose();
      composer.passes.forEach((p) => p.dispose && p.dispose());
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      if (readyResolve) readyResolve();
    }
  };
}

export default createHeroScene;
