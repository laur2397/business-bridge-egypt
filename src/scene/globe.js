// Business Bridge Egypt — "Cairo, the bridge" globe.
// Dotted landmasses, fresnel atmosphere, Cairo hub with ring pulse and great-circle
// arcs to partner regions, all driven by scroll progress.
//
//   const globe = createGlobe(container, { quality: 'high' | 'low' });
//   globe.setProgress(p) · globe.focus(region|null) · globe.setPointer(x, y)
//   globe.pause() · globe.resume() · globe.dispose() · globe.ready (Promise)
import * as THREE from 'three';
import { buildMasks, buildLandDots } from './globe/landmask.js';
import {
  bodyVert, bodyFrag, haloVert, haloFrag, dotVert, dotFrag,
  arcVert, arcFrag, nodeVert, nodeFrag,
} from './globe/shaders.js';

const D2R = Math.PI / 180;

const PALETTE = {
  core: '#081530',
  edge: '#050C20',
  rim: '#5B8DC4',
  halo: '#5B8DC4',
  halo2: '#1E4B86',
  dot: '#9CC3EA',
  gold: '#D9B27C',
  ivory: '#F4EFE6',
};

const CAIRO = { lat: 30.04, lng: 31.24 };

// Order = draw-in order. Region keys are the public focus() keys.
const DESTINATIONS = [
  { name: 'London', lat: 51.5, lng: -0.13, region: 'europe' },
  { name: 'Frankfurt', lat: 50.1, lng: 8.7, region: 'europe' },
  { name: 'Dubai', lat: 25.2, lng: 55.3, region: 'gulf' },
  { name: 'Riyadh', lat: 24.7, lng: 46.7, region: 'gulf' },
  { name: 'Lagos', lat: 6.5, lng: 3.4, region: 'africa' },
  { name: 'Nairobi', lat: -1.29, lng: 36.8, region: 'africa' },
  { name: 'Johannesburg', lat: -26.2, lng: 28.0, region: 'africa' },
  { name: 'Singapore', lat: 1.35, lng: 103.8, region: 'asia' },
  { name: 'Shanghai', lat: 31.2, lng: 121.5, region: 'asia' },
  { name: 'New York', lat: 40.7, lng: -74.0, region: 'americas' },
];

// Camera framing (lat/lng that faces the viewer).
const VIEW_START = { lat: 28, lng: -22 }; // Atlantic + Europe
const VIEW_END = { lat: 22, lng: CAIRO.lng }; // Cairo slightly above centre, Africa below

const ARC_START = 0.32;
const ARC_STEP = 0.056;
const ARC_LEN = 0.17;

function hexVec(hex) {
  const n = parseInt(hex.slice(1), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export function latLngToVec(lat, lng, r = 1) {
  const cl = Math.cos(lat * D2R);
  return new THREE.Vector3(cl * Math.sin(lng * D2R) * r, Math.sin(lat * D2R) * r, cl * Math.cos(lng * D2R) * r);
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

function buildArcCurve(a, b) {
  const va = latLngToVec(a.lat, a.lng);
  const vb = latLngToVec(b.lat, b.lng);
  const angle = va.angleTo(vb);
  const lift = Math.min(0.03 + angle * 0.1, 0.11);
  const pts = [];
  const N = 48;
  const q = new THREE.Vector3();
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    // slerp along the great circle
    const s = Math.sin(angle);
    const w1 = Math.sin((1 - t) * angle) / s;
    const w2 = Math.sin(t * angle) / s;
    q.copy(va).multiplyScalar(w1).addScaledVector(vb, w2).normalize();
    const h = 1 + Math.sin(Math.PI * t) * lift;
    pts.push(q.clone().multiplyScalar(h));
  }
  return new THREE.CatmullRomCurve3(pts);
}

function buildTube(curve, radius, tubular, radial) {
  const geo = new THREE.TubeGeometry(curve, tubular, radius, radial, false);
  const count = geo.attributes.position.count;
  const centers = new Float32Array(count * 3);
  const p = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    curve.getPointAt(i / tubular, p);
    for (let j = 0; j <= radial; j++) {
      const k = (i * (radial + 1) + j) * 3;
      centers[k] = p.x; centers[k + 1] = p.y; centers[k + 2] = p.z;
    }
  }
  geo.setAttribute('aCenter', new THREE.BufferAttribute(centers, 3));
  return geo;
}

// Additive "light" blending: adds colour, leaves the canvas alpha untouched so the
// page background shows through a transparent canvas.
function lightBlend(mat) {
  mat.transparent = true;
  mat.depthWrite = false;
  mat.blending = THREE.CustomBlending;
  mat.blendEquation = THREE.AddEquation;
  mat.blendSrc = THREE.OneFactor;
  mat.blendDst = THREE.OneFactor;
  mat.blendSrcAlpha = THREE.ZeroFactor;
  mat.blendDstAlpha = THREE.OneFactor;
  return mat;
}

export function createGlobe(container, options = {}) {
  if (!container) throw new Error('createGlobe: container element is required');
  if (!hasWebGL()) throw new Error('WebGL is not available');

  const low = options.quality === 'low';
  const reduceMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reduced = !!(reduceMQ && reduceMQ.matches);

  // ------------------------------------------------------------ renderer
  const renderer = new THREE.WebGLRenderer({
    antialias: !low,
    alpha: true,
    premultipliedAlpha: true,
    powerPreference: low ? 'low-power' : 'high-performance',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NoToneMapping;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'bbe-globe-canvas';
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0, 4.5);

  const root = new THREE.Group(); // float + halo
  const tilt = new THREE.Group(); // pointer tilt
  const globe = new THREE.Group(); // geographic rotation
  globe.rotation.order = 'XYZ';
  scene.add(root);
  root.add(tilt);
  tilt.add(globe);

  const lightDir = new THREE.Vector3(-0.55, 0.65, 0.55).normalize();
  const timeU = { value: 0 };
  const motionU = { value: reduced ? 0 : 1 };

  const disposables = [];
  const track = (o) => (disposables.push(o), o);

  // ------------------------------------------------------------ body
  const bodyMat = track(new THREE.ShaderMaterial({
    vertexShader: bodyVert,
    fragmentShader: bodyFrag,
    uniforms: {
      uCore: { value: hexVec(PALETTE.core) },
      uEdge: { value: hexVec(PALETTE.edge) },
      uRim: { value: hexVec(PALETTE.rim) },
      uLightDir: { value: lightDir },
      uRimStrength: { value: 0.85 },
    },
  }));
  const body = new THREE.Mesh(track(new THREE.SphereGeometry(1, low ? 64 : 112, low ? 48 : 84)), bodyMat);
  body.renderOrder = 0;
  globe.add(body);

  // ------------------------------------------------------------ halo
  const haloMat = track(lightBlend(new THREE.ShaderMaterial({
    vertexShader: haloVert,
    fragmentShader: haloFrag,
    uniforms: {
      uColor: { value: hexVec(PALETTE.halo) },
      uColor2: { value: hexVec(PALETTE.halo2) },
      uR: { value: 1 },
      uStrength: { value: 0.7 },
    },
  })));
  const halo = new THREE.Mesh(track(new THREE.PlaneGeometry(3.4, 3.4)), haloMat);
  halo.renderOrder = 1;
  root.add(halo);

  // ------------------------------------------------------------ land dots (async)
  const dotUniforms = {
    uSize: { value: low ? 0.0095 : 0.0074 },
    uEgyptBoost: { value: 0 },
    uColor: { value: hexVec(PALETTE.dot) },
    uEgyptColor: { value: hexVec(PALETTE.gold) },
    uOpacity: { value: 0.72 },
    uLightDir: { value: lightDir },
    uTime: timeU,
    uMotion: motionU,
  };
  let dots = null;

  // ------------------------------------------------------------ Cairo + destinations
  const quad = track(new THREE.PlaneGeometry(1, 1));
  function makeNode(lat, lng, size, color, coreColor, rings, core) {
    const mat = track(lightBlend(new THREE.ShaderMaterial({
      vertexShader: nodeVert,
      fragmentShader: nodeFrag,
      uniforms: {
        uPos: { value: latLngToVec(lat, lng) },
        uSize: { value: size },
        uColor: { value: hexVec(color) },
        uCoreColor: { value: hexVec(coreColor) },
        uTime: timeU,
        uMotion: motionU,
        uAmount: { value: 0 },
        uRings: { value: rings },
        uPhase: { value: Math.random() },
        uCore: { value: core },
      },
    })));
    const m = new THREE.Mesh(quad, mat);
    m.renderOrder = 4;
    m.frustumCulled = false;
    globe.add(m);
    return m;
  }
  const cairo = makeNode(CAIRO.lat, CAIRO.lng, 0.3, PALETTE.gold, '#FFF6E6', 2, 0.075);

  const arcs = DESTINATIONS.map((d, i) => {
    const curve = buildArcCurve(CAIRO, d);
    const tub = low ? 64 : 120;
    const geo = track(buildTube(curve, 0.0038, tub, low ? 5 : 8));
    const common = {
      uFrom: { value: hexVec(PALETTE.gold) },
      uTo: { value: hexVec(PALETTE.dot) },
      uPulseColor: { value: hexVec(PALETTE.ivory) },
      uDraw: { value: 0 },
      uTime: timeU,
      uMotion: motionU,
      uOffset: { value: i * 0.137 },
      uIntensity: { value: 1 },
    };
    const coreMat = track(lightBlend(new THREE.ShaderMaterial({
      vertexShader: arcVert, fragmentShader: arcFrag,
      uniforms: { ...common, uThick: { value: 1 }, uGlow: { value: 0 } },
    })));
    const core = new THREE.Mesh(geo, coreMat);
    core.renderOrder = 3;
    globe.add(core);
    let glow = null;
    if (!low) {
      const glowMat = track(lightBlend(new THREE.ShaderMaterial({
        vertexShader: arcVert, fragmentShader: arcFrag,
        uniforms: { ...common, uThick: { value: 4 }, uGlow: { value: 1 } },
      })));
      glow = new THREE.Mesh(geo, glowMat);
      glow.renderOrder = 2;
      globe.add(glow);
    }
    const node = makeNode(d.lat, d.lng, 0.075, PALETTE.dot, PALETTE.ivory, 1, 0.16);
    return {
      ...d, core, glow, node, common,
      draw: 0, intensity: 1, thick: 1,
    };
  });

  // ------------------------------------------------------------ state
  const state = {
    progress: 0, // target
    view: 0, // damped rotation progress
    cairo: 0,
    egypt: 0,
    pointer: { x: 0, y: 0 },
    tilt: { x: 0, y: 0 },
    focus: null,
    width: 1,
    height: 1,
  };
  let snap = true; // jump straight to targets on first frame

  // ------------------------------------------------------------ layout
  const FIT_RADIUS = 1.2; // globe + a little of the halo
  function resize() {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    state.width = w; state.height = h;
    const pr = low ? 1 : Math.min(window.devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const vHalf = (camera.fov * D2R) / 2;
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    const half = Math.min(vHalf, hHalf);
    camera.position.z = FIT_RADIUS / Math.sin(half);
    camera.updateProjectionMatrix();
    const d = camera.position.z;
    haloMat.uniforms.uR.value = d / Math.sqrt(d * d - 1); // silhouette radius on z=0 plane
    if (masks) scheduleDots();
    if (!running()) renderOnce();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  // ------------------------------------------------------------ visibility / loop
  let visible = true;
  let paused = false;
  let disposed = false;
  let raf = 0;
  let last = performance.now();
  let elapsed = 0;

  const running = () => visible && !paused && !disposed && !document.hidden;

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) visible = e.isIntersecting;
    kick();
  }, { rootMargin: '100px' });
  io.observe(container);

  const onVis = () => kick();
  document.addEventListener('visibilitychange', onVis);

  const onReduce = (e) => {
    reduced = e.matches;
    motionU.value = reduced ? 0 : 1;
    kick();
  };
  if (reduceMQ) reduceMQ.addEventListener?.('change', onReduce);

  function kick() {
    if (running() && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  function update(dt) {
    const p = state.progress;
    const k = snap ? Infinity : 1;
    const D = (cur, tgt, lambda) => (snap ? tgt : damp(cur, tgt, lambda * k, dt));

    // rotation: ease from Atlantic/Europe to Egypt over the first ~40% of progress
    let viewT = easeInOut(clamp01(p / 0.4));
    if (reduced) viewT = p >= 0.3 ? 1 : viewT;
    state.view = reduced ? viewT : D(state.view, viewT, 2.6);
    const v = state.view;
    let lat = VIEW_START.lat + (VIEW_END.lat - VIEW_START.lat) * v;
    let lng = VIEW_START.lng + (VIEW_END.lng - VIEW_START.lng) * v;

    // gentle float (no continuous spin)
    const fl = reduced ? 0 : 1;
    lng += Math.sin(elapsed * 0.22) * 1.6 * fl;
    lat += Math.sin(elapsed * 0.17 + 1.3) * 0.7 * fl;
    root.position.y = Math.sin(elapsed * 0.55) * 0.012 * fl;
    globe.rotation.set(lat * D2R, -lng * D2R, 0);

    state.tilt.x = D(state.tilt.x, -state.pointer.y * 0.07, 3);
    state.tilt.y = D(state.tilt.y, state.pointer.x * 0.1, 3);
    tilt.rotation.set(state.tilt.x, state.tilt.y, 0);

    // Cairo + Egypt highlight
    state.cairo = D(state.cairo, clamp01((p - 0.12) / 0.25), 3);
    state.egypt = D(state.egypt, 0.35 + 0.65 * clamp01((p - 0.1) / 0.3), 3);
    cairo.material.uniforms.uAmount.value = state.cairo;
    dotUniforms.uEgyptBoost.value = state.egypt;

    // arcs
    arcs.forEach((a, i) => {
      const start = ARC_START + i * ARC_STEP;
      let target = clamp01((p - start) / ARC_LEN);
      if (reduced) target = p >= 0.3 ? 1 : 0;
      a.draw = reduced ? target : D(a.draw, target, 5);
      const focused = state.focus && a.region === state.focus;
      const fI = state.focus ? (focused ? 1.9 : 0.22) : 1;
      const fT = state.focus ? (focused ? 1.8 : 0.85) : 1;
      a.intensity = D(a.intensity, fI, 6);
      a.thick = D(a.thick, fT, 6);
      a.common.uDraw.value = a.draw <= 0.002 ? -1 : a.draw; // -1 hides the whole tube
      a.common.uIntensity.value = a.intensity;
      a.core.material.uniforms.uThick.value = a.thick;
      if (a.glow) a.glow.material.uniforms.uThick.value = 4 * a.thick;
      a.core.visible = a.draw > 0.002;
      if (a.glow) a.glow.visible = a.core.visible;
      const nodeAmt = clamp01((a.draw - 0.92) / 0.08) * (state.focus ? (focused ? 1.6 : 0.35) : 1);
      a.node.material.uniforms.uAmount.value = nodeAmt;
      a.node.visible = nodeAmt > 0.001;
    });
    snap = false;
  }

  function renderOnce() {
    if (disposed) return;
    update(0);
    renderer.render(scene, camera);
  }

  function frame(now) {
    raf = 0;
    if (!running()) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    elapsed += dt;
    timeU.value = elapsed;
    update(dt);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------ async land
  let masks = null;
  let dotRows = 0;
  let rebuildTimer = 0;
  // Dot grid density follows the on-screen globe size so dots never fall below
  // ~3.5 CSS px spacing (avoids moire on phones) and never exceed the quality cap.
  function desiredRows() {
    const vHalf = (camera.fov * D2R) / 2;
    const rPx = (state.height / 2) * (1 / Math.tan(vHalf)) / Math.sqrt(camera.position.z ** 2 - 1);
    const rows = Math.round((Math.PI * rPx) / 3.6 / 10) * 10;
    return Math.max(90, Math.min(low ? 160 : 250, rows));
  }
  function buildDots() {
    if (!masks || disposed) return;
    const rows = desiredRows();
    if (rows === dotRows) return;
    dotRows = rows;
    const { positions, flags, count } = buildLandDots(masks, rows);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(positions, 3));
    geo.setAttribute('aFlag', new THREE.InstancedBufferAttribute(flags, 2));
    geo.instanceCount = count;
    dotUniforms.uSize.value = (0.6 * Math.PI) / rows;
    if (dots) {
      dots.geometry.dispose();
      dots.geometry = geo;
    } else {
      const mat = track(new THREE.ShaderMaterial({
        vertexShader: dotVert,
        fragmentShader: dotFrag,
        uniforms: dotUniforms,
        transparent: true,
        depthWrite: false,
      }));
      dots = new THREE.Mesh(geo, mat);
      dots.frustumCulled = false;
      dots.renderOrder = 1;
      globe.add(dots);
    }
  }
  function scheduleDots() {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => { buildDots(); if (!running()) renderOnce(); }, 200);
  }

  const ready = import('world-atlas/land-110m.json')
    .then((mod) => {
      if (disposed) return;
      masks = buildMasks(mod.default || mod);
      buildDots();
      renderOnce();
    });

  resize();
  kick();

  // ------------------------------------------------------------ API
  return {
    ready,
    canvas,
    setProgress(p) {
      state.progress = clamp01(Number(p) || 0);
      if (!running()) renderOnce();
    },
    focus(region) {
      state.focus = region || null;
      if (!running()) renderOnce();
    },
    setPointer(x, y) {
      state.pointer.x = Math.max(-1, Math.min(1, Number(x) || 0));
      state.pointer.y = Math.max(-1, Math.min(1, Number(y) || 0));
    },
    pause() {
      paused = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    resume() {
      paused = false;
      kick();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      clearTimeout(rebuildTimer);
      if (dots) dots.geometry.dispose();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      if (reduceMQ) reduceMQ.removeEventListener?.('change', onReduce);
      for (const d of disposables) d.dispose?.();
      renderer.dispose();
      canvas.remove();
    },
  };
}
