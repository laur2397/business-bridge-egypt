// DataMorph — GPU particle showcase for "De ce Egipt" (brief v3 §2).
// 5 scroll-driven states: dust -> Egypt + Nile -> Suez Canal -> SCZONE -> globe.
// Targets are evaluated analytically on the GPU; a GPGPU spring simulation (GPUComputationRenderer)
// adds pointer repulsion/swirl, click bursts and mid-morph turbulence on top.
import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import '@fontsource-variable/archivo/wdth.css';
import { buildStates, K, KIND_COUNT, GLOBE_R } from './datamorph/shapes.js';
import { velocityShader, dispShader, renderVertex, renderFragment, finalShader } from './datamorph/shaders.js';

const GOLD = '#D9B27C', GOLD_L = '#F0D3A4', SKY = '#9CC3EA';
// faint background numerals (only where they read well behind the composition)
const NUMERALS = [null, null, null, '455', null];
const FOV = 32;
const SHAPE = 6.9; // world-space box the composition must fit

function styleTable() {
  const c = (hex, mul) => new THREE.Color(hex).multiplyScalar(mul);
  const mixc = (a, b, t, mul) => new THREE.Color(a).lerp(new THREE.Color(b), t).multiplyScalar(mul);
  const S = new Array(KIND_COUNT).fill(null).map(() => [c(GOLD, 1), 0.5, 0.016]);
  const set = (k, col, a, size) => { S[k] = [col, a, size]; };
  set(K.AMBIENT, mixc(GOLD, SKY, 0.35, 0.9), 0.22, 0.016);
  set(K.NEBULA, mixc(GOLD, GOLD_L, 0.4, 1.6), 0.85, 0.018);
  set(K.FILL, c(GOLD, 1.25), 0.7, 0.014);
  set(K.OUTLINE, c(GOLD_L, 2.1), 0.95, 0.015);
  set(K.NILE, new THREE.Color(1.0, 0.84, 0.6).multiplyScalar(2.0), 0.8, 0.016);
  set(K.DELTA, c(GOLD_L, 1.5), 0.7, 0.014);
  set(K.CAIRO, new THREE.Color(1.0, 0.95, 0.88).multiplyScalar(3.0), 1.0, 0.04);
  set(K.RIPPLE, c(GOLD_L, 2.2), 0.9, 0.014);
  set(K.COAST, c(SKY, 1.7), 0.95, 0.013);
  set(K.SEA, c(SKY, 1.0), 0.6, 0.012);
  set(K.BANK, c(GOLD_L, 1.8), 0.8, 0.013);
  set(K.SHIP, new THREE.Color(1.0, 0.88, 0.68).multiplyScalar(2.1), 0.9, 0.016);
  set(K.LANE, c(SKY, 1.4), 0.6, 0.012);
  set(K.ARC, mixc(SKY, GOLD_L, 0.35, 1.1), 0.45, 0.012);
  set(K.GRID, c(SKY, 0.9), 0.4, 0.011);
  set(K.BLOCK, c(GOLD, 1.7), 0.85, 0.014);
  set(K.PORT, new THREE.Color(1.0, 0.92, 0.8).multiplyScalar(2.4), 1.0, 0.02);
  set(K.LAND, c(GOLD, 1.35), 0.85, 0.016);
  set(K.OCEAN, c(SKY, 0.75), 0.3, 0.012);
  set(K.EGLAND, new THREE.Color(1.0, 0.88, 0.66).multiplyScalar(2.4), 1.0, 0.018);
  set(K.GARC, mixc(GOLD_L, '#FFFFFF', 0.3, 1.8), 0.85, 0.015);
  set(K.RIM, c(SKY, 1.5), 0.5, 0.014);
  set(K.TEXT, c(GOLD_L, 0.9), 0.2, 0.014);
  set(K.ZONE, c(GOLD_L, 2.2), 0.95, 0.014);
  set(K.GARCS, mixc(SKY, GOLD_L, 0.5, 1.2), 0.45, 0.011);
  set(K.GCITY, new THREE.Color(1.0, 0.95, 0.86).multiplyScalar(2.2), 1.0, 0.02);
  return S;
}

const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));

export function createDataMorph(container, { quality = 'high' } = {}) {
  const probe = document.createElement('canvas').getContext('webgl2');
  if (!probe) throw new Error('DataMorph: WebGL2 is not available');
  const lose = probe.getExtension('WEBGL_lose_context');
  lose && lose.loseContext();

  const low = quality === 'low';
  const TEX = low ? 200 : 400; // 40k / 160k particles
  const N = TEX * TEX;
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
  const maxPR = low ? 1 : 1.75;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPR));
  renderer.setClearColor(0x000000, 1);
  renderer.toneMapping = THREE.NoToneMapping;
  const canvas = renderer.domElement;
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', background: '#050B1A' });
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.1, 80);

  // ---------- GPGPU
  const gpu = new GPUComputationRenderer(TEX, TEX, renderer);
  const d0 = gpu.createTexture(), v0 = gpu.createTexture();
  {
    // intro: particles start scattered and assemble
    const a = d0.image.data;
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = 2.5 + Math.random() * 4;
      const s = Math.sqrt(1 - u * u);
      a[i * 4] = Math.cos(th) * s * r; a[i * 4 + 1] = u * r; a[i * 4 + 2] = Math.sin(th) * s * r; a[i * 4 + 3] = 1;
    }
  }
  const dispVar = gpu.addVariable('tDisp', dispShader, d0);
  const velVar = gpu.addVariable('tVel', velocityShader, v0);
  gpu.setVariableDependencies(dispVar, [dispVar, velVar]);
  gpu.setVariableDependencies(velVar, [dispVar, velVar]);

  const blank = new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType);
  blank.needsUpdate = true;
  const shared = {
    tA: { value: blank }, tB: { value: blank }, tCurves: { value: blank },
    uRotA: { value: new THREE.Matrix3() }, uRotB: { value: new THREE.Matrix3() },
    uNebTilt: { value: new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationX(-1.08).multiply(new THREE.Matrix4().makeRotationZ(0.35))) },
    uMapX: { value: new THREE.Vector3(1, 0, 0) }, uMapY: { value: new THREE.Vector3(0, 1, 0) },
    uM: { value: 0 }, uTime: { value: 0 },
  };
  Object.assign(velVar.material.uniforms, shared, {
    uDt: { value: 1 / 60 }, uK: { value: 13 }, uC: { value: 4.2 }, uTurb: { value: 0 }, uIdle: { value: 0 },
    uAspect: { value: 1 }, uPtrStr: { value: 0 }, uPtrR: { value: 0.16 }, uPtr: { value: new THREE.Vector2(9, 9) },
    uPtrVel: { value: new THREE.Vector2() },
    uVP: { value: new THREE.Matrix4() }, uCamR: { value: new THREE.Vector3(1, 0, 0) }, uCamU: { value: new THREE.Vector3(0, 1, 0) },
    uCamF: { value: new THREE.Vector3(0, 0, 1) }, uBurst: { value: new THREE.Vector4(0, 0, 0, 0.35) },
  });
  Object.assign(dispVar.material.uniforms, { uDt: velVar.material.uniforms.uDt });
  const gpuErr = gpu.init();
  if (gpuErr) throw new Error('DataMorph: ' + gpuErr);

  // ---------- particles
  const refs = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) { refs[i * 2] = i % TEX; refs[i * 2 + 1] = Math.floor(i / TEX); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('ref', new THREE.BufferAttribute(refs, 2));
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100);
  const styles = styleTable();
  const mat = new THREE.ShaderMaterial({
    defines: { RES: TEX },
    uniforms: Object.assign({}, shared, {
      tDisp: { value: null }, tVel: { value: null },
      uStyle: { value: styles.map(([col, a]) => new THREE.Vector4(col.r, col.g, col.b, a)) },
      uSize: { value: styles.map((s) => s[2]) },
      uPx: { value: 400 }, uFocus: { value: 11 }, uSizeMul: { value: 1 }, uAlphaMul: { value: 1 }, uIntro: { value: 0 },
      uSky: { value: new THREE.Color(SKY) },
    }),
    vertexShader: renderVertex,
    fragmentShader: renderFragment,
    transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  // ---------- post
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.45, 0.9);
  composer.addPass(bloom);
  const fin = new ShaderPass(finalShader);
  fin.uniforms.uBg.value = new THREE.Vector3(5 / 255, 11 / 255, 26 / 255);
  fin.uniforms.uGlow.value = new THREE.Vector3(0.035, 0.055, 0.1);
  fin.uniforms.uCenter.value = new THREE.Vector2(0.7, 0.5);
  fin.uniforms.uRes.value = new THREE.Vector2(1, 1);
  fin.uniforms.uGrain.value = 0.032;
  composer.addPass(fin);

  // ---------- layout
  let W = 1, H = 1, baseD = 11;
  const shiftPx = new THREE.Vector2();
  function layout() {
    const r = container.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    renderer.setSize(W, H, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(W, H);
    const aspect = W / H;
    let availW, availH;
    if (aspect >= 1) { availW = 0.55 * W; availH = 0.9 * H; shiftPx.set(0.225 * W, 0); }
    else { availW = 0.96 * W; availH = 0.5 * H; shiftPx.set(0, 0.24 * H); }
    const ppu = Math.min(availW, availH) / SHAPE;
    const t = Math.tan((FOV / 2) * Math.PI / 180);
    baseD = H / (2 * t * ppu);
    camera.aspect = aspect;
    camera.setViewOffset(W, H, -shiftPx.x, shiftPx.y, W, H);
    camera.updateProjectionMatrix();
    const pr = renderer.getPixelRatio();
    mat.uniforms.uPx.value = (H * pr) / (2 * t);
    mat.uniforms.uSizeMul.value = Math.max(0.85, Math.min(1.6, Math.sqrt(125 / ppu))) * (low ? 1.35 : 1);
    mat.uniforms.uAlphaMul.value = low ? 0.75 : 0.38;
    velVar.material.uniforms.uAspect.value = aspect;
    fin.uniforms.uAspect.value = aspect;
    fin.uniforms.uRes.value.set(W * pr, H * pr);
    fin.uniforms.uCenter.value.set(0.5 + shiftPx.x / W, 0.5 + shiftPx.y / H);
  }
  layout();
  const ro = new ResizeObserver(() => layout());
  ro.observe(container);

  // ---------- state
  let statesTex = null;
  let target = 0, prog = 0;
  const ptrT = new THREE.Vector2(9, 9), ptr = new THREE.Vector2(9, 9), ptrPrev = new THREE.Vector2(9, 9);
  let ptrActive = 0, ptrStr = 0, ptrLastMove = -1;
  let burstQ = null;
  let time = 0, clock = 0, intro = 0;
  const camOff = new THREE.Vector2();

  const globeRot = (t) => {
    const sway = reduced ? 0 : 0.42 * Math.sin(t * 0.05) + 0.06 * Math.sin(t * 0.13);
    const m = new THREE.Matrix4().makeRotationX(0.4).multiply(new THREE.Matrix4().makeRotationY(-31.2 * Math.PI / 180 - 0.32 + sway));
    return new THREE.Matrix3().setFromMatrix4(m);
  };
  const ident = new THREE.Matrix3();

  const ready = (async () => {
    if (document.fonts) {
      try {
        await Promise.race([
          Promise.all([document.fonts.load('200 100px "Archivo Variable"'), document.fonts.ready]),
          new Promise((r) => setTimeout(r, 2500)),
        ]);
      } catch (e) { /* fonts are optional */ }
    }
    const hasFont = !document.fonts || document.fonts.check('200 100px "Archivo Variable"');
    const built = await buildStates(N, { texts: hasFont ? NUMERALS : [] });
    statesTex = built.states.map((arr) => {
      const t = new THREE.DataTexture(arr, TEX, TEX, THREE.RGBAFormat, THREE.FloatType);
      t.minFilter = t.magFilter = THREE.NearestFilter;
      t.needsUpdate = true;
      return t;
    });
    shared.tCurves.value = built.curveTex;
    shared.uMapX.value.copy(built.mapX);
    shared.uMapY.value.copy(built.mapY);
    if (disposed) return;
    shared.tA.value = statesTex[0];
    shared.tB.value = statesTex[1];
    step(1 / 60, true);
    renderer.compile(scene, camera);
    disposed || composer.render();
    loaded = true;
    if (running()) start();
  })();

  let loaded = false, disposed = false, userPaused = false, onScreen = true, docHidden = document.hidden;
  let raf = 0, last = 0;
  const running = () => loaded && !disposed && !userPaused && onScreen && !docHidden;

  function step(dt, first = false) {
    clock += dt;
    if (!reduced) time += dt;
    intro = first ? 0 : Math.min(1, intro + dt / 1.2);
    mat.uniforms.uIntro.value = 1 - Math.pow(1 - intro, 3);

    // progress damping (scroll-driven, critically damped feel)
    prog = damp(prog, target, 3.2, dt);
    if (Math.abs(prog - target) < 1e-4) prog = target;
    const pd = Math.min(4, Math.max(0, prog * 4));
    const a = Math.min(3, Math.floor(pd));
    const m = pd - a;
    shared.tA.value = statesTex[a];
    shared.tB.value = statesTex[a + 1];
    shared.uRotA.value.copy(a === 4 ? globeRot(time) : ident);
    shared.uRotB.value.copy(a + 1 === 4 ? globeRot(time) : ident);
    shared.uM.value = m;
    shared.uTime.value = time;

    // camera: drift + pointer parallax
    const pa = ptrActive ? ptr : new THREE.Vector2(0, 0);
    camOff.x = damp(camOff.x, pa.x * 0.35, 2.5, dt);
    camOff.y = damp(camOff.y, -pa.y * 0.22, 2.5, dt);
    const drift = reduced ? 0 : 1;
    const dx = Math.sin(clock * 0.071) * 0.22 * drift + camOff.x;
    const dy = Math.cos(clock * 0.053) * 0.14 * drift + camOff.y;
    const dz = Math.sin(clock * 0.037) * 0.25 * drift;
    camera.position.set(dx, dy, baseD + dz);
    camera.lookAt(dx * 0.35, dy * 0.35, 0);
    camera.updateMatrixWorld();
    mat.uniforms.uFocus.value = baseD;

    const vu = velVar.material.uniforms;
    vu.uDt.value = dt;
    vu.uTurb.value = reduced ? 0 : 7.0; // scaled per particle by sin(pi*e)^2 -> burst mid-morph
    vu.uIdle.value = reduced ? 0 : 0.5;
    vu.uVP.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const e = camera.matrixWorld.elements;
    vu.uCamR.value.set(e[0], e[1], e[2]);
    vu.uCamU.value.set(e[4], e[5], e[6]);
    vu.uCamF.value.set(e[8], e[9], e[10]);

    // pointer
    ptr.x = damp(ptr.x, ptrT.x, 14, dt); ptr.y = damp(ptr.y, ptrT.y, 14, dt);
    const idle = clock - ptrLastMove > 2.5;
    ptrStr = damp(ptrStr, ptrActive && !idle ? 1 : ptrActive ? 0.55 : 0, 4, dt);
    vu.uPtr.value.set(ptr.x, -ptr.y);
    vu.uPtrVel.value.set((ptr.x - ptrPrev.x) / Math.max(dt, 1e-3), -(ptr.y - ptrPrev.y) / Math.max(dt, 1e-3)).clampLength(0, 3);
    ptrPrev.copy(ptr);
    vu.uPtrStr.value = ptrStr;
    if (burstQ) { vu.uBurst.value.set(burstQ[0], -burstQ[1], 1, 0.3); burstQ = null; }
    else vu.uBurst.value.z = 0;

    gpu.compute();
    mat.uniforms.tDisp.value = gpu.getCurrentRenderTarget(dispVar).texture;
    mat.uniforms.tVel.value = gpu.getCurrentRenderTarget(velVar).texture;
    fin.uniforms.uTime.value = clock;
  }

  function frame(now) {
    raf = 0;
    if (!running()) return;
    const dt = last ? Math.min(1 / 30, Math.max(1 / 240, (now - last) / 1000)) : 1 / 60;
    last = now;
    step(dt);
    composer.render(dt);
    raf = requestAnimationFrame(frame);
  }
  function start() { if (!raf && running()) { last = 0; raf = requestAnimationFrame(frame); } }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  const io = new IntersectionObserver((ents) => {
    onScreen = ents.some((en) => en.isIntersecting);
    onScreen ? start() : stop();
  }, { threshold: 0 });
  io.observe(container);
  const onVis = () => { docHidden = document.hidden; docHidden ? stop() : start(); };
  document.addEventListener('visibilitychange', onVis);

  return {
    ready,
    setProgress(p) { target = Math.min(1, Math.max(0, +p || 0)); },
    setPointer(x, y) {
      if (!isFinite(x) || !isFinite(y) || Math.abs(x) > 1.5 || Math.abs(y) > 1.5) { ptrActive = 0; return; }
      if (!ptrActive) { ptr.set(x, y); ptrPrev.set(x, y); }
      ptrT.set(x, y); ptrActive = 1; ptrLastMove = clock;
    },
    burst(x, y) { burstQ = [x, y]; },
    pause() { userPaused = true; stop(); },
    resume() { userPaused = false; start(); },
    dispose() {
      disposed = true; stop();
      io.disconnect(); ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      gpu.dispose();
      geo.dispose(); mat.dispose();
      statesTex && statesTex.forEach((t) => t.dispose());
      shared.tCurves.value && shared.tCurves.value.dispose();
      blank.dispose();
      composer.dispose && composer.dispose();
      bloom.dispose();
      renderer.dispose();
      renderer.forceContextLoss && renderer.forceContextLoss();
      canvas.remove();
    },
    // test helpers (not part of the public contract)
    _debug: {
      jump(p) { target = prog = Math.min(1, Math.max(0, p)); },
      step(dt = 1 / 60, n = 1) { for (let i = 0; i < n; i++) step(dt); composer.render(dt); },
      get counts() { return { particles: N, tex: TEX }; },
      renderer,
      GLOBE_R,
    },
  };
}

export default createDataMorph;
