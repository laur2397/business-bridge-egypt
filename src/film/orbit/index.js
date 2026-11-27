// Chapter I "Orbita" + Chapter II "Coborarea".
// One continuous camera move: deep space crescent -> push-in over Egypt with arcs converging on Cairo ->
// descent toward the Nile Delta at sunrise -> dive into sunlit cumulus, ending in warm white mist.
//
// Rendering: a single full-screen ray-traced planet pass (ground, cloud shell, Rayleigh+Mie+ozone
// single scattering with Chapman-approximated sun paths, stars, Milky Way, HDR sun) that writes depth,
// then additive arcs / nodes / Cairo ring, then (only during the dive) a volumetric cloud raymarch.
import * as THREE from 'three';
import {
  ATMO, fullscreenVert, planetFrag, arcVert, arcFrag, nodeVert, nodeFrag, ringVert, ringFrag,
} from './shaders.js';
import { diveFrag, compositeFrag, compositeVert } from './dive.js';
import { createNoise3D } from './noise3d.js';

const D2R = Math.PI / 180;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function llv(lat, lng, r = 1, out = new THREE.Vector3()) {
  const cl = Math.cos(lat * D2R);
  return out.set(cl * Math.sin(lng * D2R) * r, Math.sin(lat * D2R) * r, cl * Math.cos(lng * D2R) * r);
}

const CAIRO = { lat: 30.04, lng: 31.24 };
const DELTA = { lat: 30.75, lng: 31.05 };
const BANK = { lat: 31.1, lng: 31.6 };

// Order = arrival order onto Cairo
const CITIES = [
  { name: 'London', lat: 51.5, lng: -0.13 },
  { name: 'Frankfurt', lat: 50.1, lng: 8.7 },
  { name: 'New York', lat: 40.7, lng: -74.0 },
  { name: 'Lagos', lat: 6.5, lng: 3.4 },
  { name: 'Riyadh', lat: 24.7, lng: 46.7 },
  { name: 'Dubai', lat: 25.2, lng: 55.3 },
  { name: 'Johannesburg', lat: -26.2, lng: 28.0 },
  { name: 'Nairobi', lat: -1.29, lng: 36.8 },
  { name: 'Singapore', lat: 1.35, lng: 103.8 },
  { name: 'Shanghai', lat: 31.2, lng: 121.5 },
];
const ARC_T0 = 0.17;
const ARC_STEP = 0.028;
const ARC_LEN = 0.085;

// ------------------------------------------------------------- camera keyframes
// lat/lng: point under the camera; alt: altitude in Earth radii (interpolated in log space);
// w: 0 = frame the globe (look at centre + composition offset ox/oy), 1 = local horizon view;
// pitch (deg, horizon mode); hd: heading offset (deg) from the sun azimuth; hfov (deg); roll (deg)
const KEYS = [
  { p: 0.00, lat: 27.17, lng: -15.78, alt: 3.6, w: 0, ox: -0.24, oy: -0.033, roll: -22, pitch: -40, hd: -12, hfov: 54, slng: 152.8 },
  { p: 0.15, lat: 29.14, lng: -14.74, alt: 3.15, w: 0, ox: -0.22, oy: -0.026, roll: -18, pitch: -40, hd: -12, hfov: 54, slng: 147.5 },
  { p: 0.33, lat: 27.29, lng: 0.0, alt: 1.9, w: 0, ox: 0.159, oy: 0.026, roll: 18.3, pitch: -40, hd: -12, hfov: 54, slng: 147.0 },
  { p: 0.55, lat: 8.85, lng: 20.92, alt: 0.95, w: 0, ox: 0.125, oy: 0.319, roll: 5.3, pitch: -49, hd: -12, hfov: 52, slng: 147.0 },
  { p: 0.64, lat: 27.0, lng: 21.5, alt: 0.45, w: 0.5, ox: 0.06, oy: 0.12, roll: 2, pitch: -52, hd: -12, hfov: 52, slng: 147.0 },
  { p: 0.71, lat: 28.8, lng: 26.0, alt: 0.19, w: 0.97, ox: 0, oy: 0, roll: 0, pitch: -37, hd: -12, hfov: 53, slng: 146.8 },
  { p: 0.78, lat: 29.8, lng: 28.8, alt: 0.05, w: 1, ox: 0, oy: 0, roll: 0, pitch: -21.8, hd: -11, hfov: 54, slng: 131.2 },
  { p: 0.83, lat: 30.3, lng: 29.9, alt: 0.02, w: 1, ox: 0, oy: 0, roll: 0, pitch: -15.4, hd: -11, hfov: 55, slng: 120.3 },
  { p: 0.88, lat: 30.55, lng: 30.5, alt: 0.009, w: 1, ox: 0, oy: 0, roll: 0, pitch: -11.7, hd: -10, hfov: 56, slng: 108.4 },
  { p: 0.93, lat: 30.7, lng: 30.85, alt: 0.0053, w: 1, ox: 0, oy: 0, roll: 0, pitch: -9.9, hd: -9, hfov: 60, slng: 103.3 },
  { p: 1.00, lat: 30.75, lng: 31.05, alt: 0.0030, w: 1, ox: 0, oy: 0, roll: 0, pitch: -16, hd: -8, hfov: 64, slng: 99.3 },
];
const KEY_FIELDS = ['lat', 'lng', 'alt', 'w', 'ox', 'oy', 'pitch', 'hd', 'hfov', 'roll', 'slng'];

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
function sampleKeys(p, out) {
  let i = 0;
  while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++;
  const k0 = KEYS[Math.max(i - 1, 0)], k1 = KEYS[i], k2 = KEYS[i + 1], k3 = KEYS[Math.min(i + 2, KEYS.length - 1)];
  const t = clamp01((p - k1.p) / (k2.p - k1.p));
  for (const f of KEY_FIELDS) {
    if (f === 'alt') {
      out.alt = Math.exp(catmull(Math.log(k0.alt), Math.log(k1.alt), Math.log(k2.alt), Math.log(k3.alt), t));
    } else if (f === 'w') {
      out.w = clamp01(lerp(k1.w, k2.w, t * t * (3 - 2 * t)));
    } else {
      out[f] = catmull(k0[f], k1[f], k2[f], k3[f], t);
    }
  }
  return out;
}

// sun: subsolar point (late November: ~ -20 deg). Longitude slides east->west = the Earth turning into dawn.

// CPU twin of the shader's Chapman approximation (for sun colour / getSun)
function chapX(X, mu) { const c = Math.sqrt(1.5707963 * X); return c / ((c - 1) * mu + 1); }
function optDepth(r, mu, H) {
  const X = r / H, h = (r - 1) / H;
  if (mu >= 0) return H * Math.exp(-h) * chapX(X, mu);
  const s = Math.sqrt(Math.max(1 - mu * mu, 0));
  const X0 = X * s, h0 = X0 - 1 / H;
  const full = H * 2 * Math.exp(Math.min(-h0, 60)) * Math.sqrt(1.5707963 * X0);
  return Math.max(full - H * Math.exp(-h) * chapX(X, -mu), 0);
}
function transmittance(pos, dir, out) {
  // transmittance along a ray from pos toward dir (to space), 0 if the ground blocks it
  const r = pos.length();
  const mu = pos.dot(dir) / r;
  let dR, dM;
  if (r > ATMO.RA) {
    if (mu >= 0) return out.set(1, 1, 1);
    const rmin = r * Math.sqrt(1 - mu * mu);
    if (rmin < 1) return out.set(0, 0, 0);
    if (rmin > ATMO.RA) return out.set(1, 1, 1);
    dR = 2 * ATMO.HR * Math.exp(-(rmin - 1) / ATMO.HR) * Math.sqrt(1.5707963 * rmin / ATMO.HR);
    dM = 2 * ATMO.HM * Math.exp(-(rmin - 1) / ATMO.HM) * Math.sqrt(1.5707963 * rmin / ATMO.HM);
  } else {
    // ground occlusion
    const b = pos.dot(dir), c = r * r - 1;
    if (b < 0 && b * b - c > 0) return out.set(0, 0, 0);
    dR = optDepth(r, mu, ATMO.HR);
    dM = optDepth(r, mu, ATMO.HM);
  }
  const k = (i) => Math.exp(-((ATMO.TAU_R[i] + ATMO.TAU_O[i]) / ATMO.HR) * dR - (ATMO.TAU_M * 1.11 / ATMO.HM) * dM);
  return out.set(k(0), k(1), k(2));
}

function fullscreenQuad(material) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const m = new THREE.Mesh(g, material);
  m.frustumCulled = false;
  return m;
}

function buildArc(a, b, segments = 160) {
  const va = llv(a.lat, a.lng), vb = llv(b.lat, b.lng);
  const ang = va.angleTo(vb);
  const lift = Math.min(0.022 + ang * 0.07, 0.085);
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    // slerp on the sphere
    const s = Math.sin(ang);
    const p = va.clone().multiplyScalar(Math.sin((1 - t) * ang) / s).add(vb.clone().multiplyScalar(Math.sin(t * ang) / s));
    // asymmetric lift: rises steeply from the source, lands softly on Cairo
    const h = Math.sin(Math.PI * Math.pow(t, 0.85)) * lift;
    pts.push(p.normalize().multiplyScalar(1.0015 + h));
  }
  const pos = [], nxt = [], at = [], side = [], idx = [];
  for (let i = 0; i <= segments; i++) {
    const p = pts[i];
    const n = i < segments ? pts[i + 1] : pts[i].clone().multiplyScalar(2).sub(pts[i - 1]);
    for (const sd of [-1, 1]) {
      pos.push(p.x, p.y, p.z); nxt.push(n.x, n.y, n.z); at.push(i / segments); side.push(sd);
    }
    if (i < segments) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aNext', new THREE.Float32BufferAttribute(nxt, 3));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(at, 1));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  g.setIndex(idx);
  return g;
}

export function createChapter(ctx) {
  const { renderer, quality, reduced, base, assets } = ctx;
  const high = quality !== 'low';
  const res = '2k'; // 4k doubled the download for a barely visible gain

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.01, 50);
  camera.position.set(0, 0, 4);

  const noise = createNoise3D(high ? 64 : 48);
  const bankDir = llv(BANK.lat, BANK.lng);

  // ---------------------------------------------------------- planet pass
  const common = {
    tClouds: { value: null },
    uCloudRot: { value: 0 },
    uBankDir: { value: bankDir },
    uBankAmt: { value: 1 },
    uCoreDir: { value: llv(DELTA.lat, DELTA.lng) },
  };
  const planetMat = new THREE.ShaderMaterial({
    vertexShader: fullscreenVert,
    fragmentShader: planetFrag(high ? 22 : 12),
    uniforms: {
      ...common,
      uProjInv: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() },
      uCam: { value: new THREE.Vector3() },
      uSun: { value: new THREE.Vector3(1, 0, 0) },
      uSunI: { value: 5.0 },
      uSunRad: { value: 0.36 * D2R },
      uViewProj: { value: new THREE.Matrix4() },
      tDay: { value: null }, tNight: { value: null }, tBump: { value: null }, tWater: { value: null },
      tStars: { value: null }, tNoise: { value: noise },
      uLightsI: { value: 70 },
      uStarsI: { value: 1 },
      uTime: { value: 0 },
      uCloudFade: { value: 1 },
      uShellNear: { value: new THREE.Vector2(0, 0) },
    },
    depthTest: true,
    depthWrite: true,
    depthFunc: THREE.AlwaysDepth,
  });
  const planet = fullscreenQuad(planetMat);
  planet.renderOrder = -10;
  scene.add(planet);

  // ---------------------------------------------------------- arcs
  const arcs = [];
  const arcGroup = new THREE.Group();
  scene.add(arcGroup);
  const drawSize = new THREE.Vector2(1, 1);
  CITIES.forEach((c, i) => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: arcVert,
      fragmentShader: arcFrag,
      uniforms: {
        uRes: { value: drawSize },
        uWidth: { value: 3.2 },
        uCam: { value: new THREE.Vector3() },
        uHead: { value: 0 },
        uAlpha: { value: 1 },
        uTime: { value: 0 },
        uPhase: { value: i * 0.37 },
      },
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(buildArc(c, CAIRO), mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    arcGroup.add(mesh);
    arcs.push({ mesh, mat, start: ARC_T0 + i * ARC_STEP });
  });

  // nodes: Cairo + sources
  const nodePos = [], nodeSize = [], nodeKind = [];
  const cv = llv(CAIRO.lat, CAIRO.lng, 1.003);
  nodePos.push(cv.x, cv.y, cv.z); nodeSize.push(64); nodeKind.push(1);
  CITIES.forEach((c) => { const v = llv(c.lat, c.lng, 1.002); nodePos.push(v.x, v.y, v.z); nodeSize.push(14); nodeKind.push(0); });
  const nodeGeo = new THREE.BufferGeometry();
  nodeGeo.setAttribute('position', new THREE.Float32BufferAttribute(nodePos, 3));
  nodeGeo.setAttribute('aSize', new THREE.Float32BufferAttribute(nodeSize, 1));
  nodeGeo.setAttribute('aKind', new THREE.Float32BufferAttribute(nodeKind, 1));
  const nodeMat = new THREE.ShaderMaterial({
    vertexShader: nodeVert, fragmentShader: nodeFrag,
    uniforms: { uScale: { value: 1 }, uCam: { value: new THREE.Vector3() }, uCairo: { value: 0 }, uSrc: { value: 0 }, uTime: { value: 0 } },
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: true,
  });
  const nodes = new THREE.Points(nodeGeo, nodeMat);
  nodes.frustumCulled = false;
  nodes.renderOrder = 3;
  scene.add(nodes);

  // Cairo ring, tangent to the surface
  const ringMat = new THREE.ShaderMaterial({
    vertexShader: ringVert, fragmentShader: ringFrag,
    uniforms: { uTime: { value: 0 }, uAmt: { value: 0 } },
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), ringMat);
  ring.position.copy(llv(CAIRO.lat, CAIRO.lng, 1.0018));
  ring.lookAt(llv(CAIRO.lat, CAIRO.lng, 2));
  ring.renderOrder = 1;
  ring.frustumCulled = false;
  scene.add(ring);

  // ---------------------------------------------------------- dive (volumetric)
  const dE = new THREE.Vector3(), dU = new THREE.Vector3(), dN = new THREE.Vector3();
  {
    const la = DELTA.lat * D2R, ln = DELTA.lng * D2R;
    dU.copy(llv(DELTA.lat, DELTA.lng));
    dE.set(Math.cos(ln), 0, -Math.sin(ln));
    dN.set(-Math.sin(la) * Math.sin(ln), Math.cos(la), -Math.sin(la) * Math.cos(ln));
  }
  const diveMat = new THREE.ShaderMaterial({
    vertexShader: fullscreenVert,
    fragmentShader: diveFrag(high ? 80 : 44, high ? 4 : 3),
    uniforms: {
      ...common,
      uProjInv: planetMat.uniforms.uProjInv,
      uCamWorld: planetMat.uniforms.uCamWorld,
      uCamL: { value: new THREE.Vector3() },
      uE: { value: dE }, uU: { value: dU }, uN: { value: dN },
      uSunL: { value: new THREE.Vector3(0, 1, 0) },
      uSunCol: { value: new THREE.Vector3(1, 1, 1) },
      uSkyCol: { value: new THREE.Vector3(0.3, 0.4, 0.6) },
      uHazeCol: { value: new THREE.Vector3(0.6, 0.6, 0.7) },
      uMistCol: { value: new THREE.Vector3(3.1, 2.8, 2.4) },
      uFade: { value: 0 },
      uMist: { value: 0 },
      uNear: { value: 1 },
      uTime: { value: 0 },
      tNoise: { value: noise },
    },
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
  });
  diveMat.uniforms.tClouds = common.tClouds;
  diveMat.uniforms.uCloudRot = common.uCloudRot;
  diveMat.uniforms.uCoreDir = common.uCoreDir;
  const diveScene = new THREE.Scene();
  diveScene.add(fullscreenQuad(diveMat));
  const diveScale = high ? 0.5 : 0.35;
  const diveRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
  const dbs = new THREE.Vector2();
  // composite: premultiplied cloud layer over the planet, bilinear upsampled
  const dive = fullscreenQuad(new THREE.ShaderMaterial({
    vertexShader: compositeVert,
    fragmentShader: compositeFrag,
    uniforms: { tDive: { value: diveRT.texture }, uTexel: { value: new THREE.Vector2(0.25, 0.25) } },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  }));
  dive.renderOrder = 20;
  dive.visible = false;
  scene.add(dive);
  function renderDive() {
    renderer.getDrawingBufferSize(dbs);
    const w = Math.max(4, Math.round(dbs.x * diveScale)), h = Math.max(4, Math.round(dbs.y * diveScale));
    if (diveRT.width !== w || diveRT.height !== h) { diveRT.setSize(w, h); dive.material.uniforms.uTexel.value.set(1 / w, 1 / h); }
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(diveRT);
    renderer.render(diveScene, camera);
    renderer.setRenderTarget(prev);
  }

  // ---------------------------------------------------------- assets
  const tex = (name, colorSpace = 'srgb') => assets.texture(`${base}textures/${name}`, { colorSpace });
  const ready = Promise.all([
    tex(`earth-day-${res}.jpg`),
    tex(`earth-night-${res}.jpg`, 'linear'),
    tex(`earth-clouds-${res}.jpg`, 'linear'),
    tex('earth-bump-2k.jpg', 'linear'),
    tex('earth-water-2k.jpg', 'linear'),
    tex(`milkyway-${res}.jpg`),
  ]).then(([day, night, clouds, bump, water, stars]) => {
    for (const t of [day, night, clouds, bump, water]) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.ClampToEdgeWrapping;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.needsUpdate = true;
    }
    stars.wrapS = THREE.RepeatWrapping;
    stars.generateMipmaps = false;
    stars.minFilter = THREE.LinearFilter;
    stars.needsUpdate = true;
    const u = planetMat.uniforms;
    u.tDay.value = day; u.tNight.value = night; u.tBump.value = bump; u.tWater.value = water; u.tStars.value = stars;
    common.tClouds.value = clouds;
    update(0, 0, state.target, { x: 0, y: 0 }, true);
    const vis = dive.visible;
    dive.visible = true;
    renderer.compile(scene, camera);
    renderer.compile(diveScene, camera);
    dive.visible = vis;
    state.first = true; // the first real frame snaps to the current scroll position
  });

  // ---------------------------------------------------------- state
  const state = {
    target: 0, p: 0, v: 0, first: true,
    key: {},
    sunScreen: { x: 2, y: 0.5, visible: false, intensity: 0 },
    exposure: 1, focus: { distance: 3, aperture: 0 },
    grade: { warmth: -0.1, tealShadows: 0.35, saturation: 1, contrast: 1.05 },
    look: new THREE.Vector3(0, 0, -1),
    up: new THREE.Vector3(0, 1, 0),
    width: 1, height: 1,
  };

  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3();
  const sunDir = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const sunT = new THREE.Vector3();
  const sampleDir = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const qBreath = new THREE.Quaternion();
  const eul = new THREE.Euler();
  const m4 = new THREE.Matrix4();

  function computeSun(p) {
    sampleKeys(p, state.key);
    llv(-20.2, state.key.slng, 1, sunDir);
    return sunDir;
  }

  function placeCamera(p, time, pointer, dt) {
    const k = sampleKeys(p, state.key);
    // portrait screens: back off so the globe still reads, and centre the composition
    const aspect = state.width / state.height;
    const portrait = clamp01((1.25 - aspect) / 0.8);
    const vfovFromH = (h) => 2 * Math.atan(Math.tan((h * D2R) / 2) / aspect) / D2R;
    let vfov = Math.min(Math.max(vfovFromH(k.hfov), 22), 62);
    const altScale = 1 + portrait * 0.45 * (1 - k.w);
    const alt = k.alt * altScale;
    llv(k.lat, k.lng, 1 + alt, camPos);

    // globe framing
    const fwd0 = tmp.copy(camPos).multiplyScalar(-1).normalize();
    const right0 = tmp2.crossVectors(fwd0, worldUp).normalize();
    const up0 = tmp3.crossVectors(right0, fwd0).normalize();
    const ox = k.ox * (1 - portrait), oy = k.oy + portrait * 0.04;
    const dir0 = fwd0.clone().addScaledVector(right0, ox).addScaledVector(up0, oy).normalize();
    // roll the globe framing so the sun side sits at screen-right
    const rollQ = new THREE.Quaternion().setFromAxisAngle(dir0, k.roll * D2R);
    const upG = up0.clone().applyQuaternion(rollQ);

    // horizon framing: heading toward the sun azimuth (+offset), pitched down
    const U = camPos.clone().normalize();
    const E = new THREE.Vector3(U.z, 0, -U.x).normalize();
    const Nn = new THREE.Vector3().crossVectors(U, E);
    const sAz = Math.atan2(sunDir.dot(E), sunDir.dot(Nn));
    const hd = sAz + k.hd * D2R;
    const horiz = Nn.clone().multiplyScalar(Math.cos(hd)).addScaledVector(E, Math.sin(hd));
    const dir1 = horiz.multiplyScalar(Math.cos(k.pitch * D2R)).addScaledVector(U, Math.sin(k.pitch * D2R)).normalize();

    const w = k.w;
    const dir = dir0.clone().lerp(dir1, w).normalize();
    const up = upG.clone().lerp(U, w).normalize();

    // secondary smoothing on the look so nothing ever snaps
    const a = state.first ? 1 : 1 - Math.exp(-dt * 6);
    state.look.lerp(dir, a).normalize();
    state.up.lerp(up, a).normalize();

    camera.position.copy(camPos);
    camera.up.copy(state.up);
    camera.lookAt(tmp.copy(camPos).add(state.look));

    // handheld breathing + pointer parallax (off for reduced motion)
    if (!reduced) {
      const amp = lerp(0.0007, 0.0035, smooth(0.8, 1.0, p));
      const bx = (Math.sin(time * 0.31) * 0.6 + Math.sin(time * 0.73 + 1.3) * 0.3 + Math.sin(time * 1.37 + 0.2) * 0.1) * amp;
      const by = (Math.sin(time * 0.27 + 2.1) * 0.6 + Math.sin(time * 0.61 + 0.4) * 0.3 + Math.sin(time * 1.13 + 2.7) * 0.1) * amp;
      eul.set(by + pointer.y * 0.012, bx - pointer.x * 0.018, 0);
      qBreath.setFromEuler(eul);
      camera.quaternion.multiply(qBreath);
    }

    camera.fov = vfov;
    const altNow = camPos.length() - 1;
    camera.near = Math.max(altNow * 0.25, 2e-4);
    camera.far = camPos.length() + 2.5;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    return k;
  }

  function update(dt, time, progress, pointer = { x: 0, y: 0 }, force = false) {
    state.target = clamp01(progress);
    // critically damped spring on progress
    if (state.first || force) { state.p = state.target; state.v = 0; }
    else {
      const omega = 2 / 0.45;
      const x = omega * dt;
      const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
      const change = state.p - state.target;
      const temp = (state.v + omega * change) * dt;
      state.v = (state.v - omega * temp) * exp;
      state.p = state.target + (change + temp) * exp;
    }
    const p = state.p;
    computeSun(p);
    placeCamera(p, time, pointer, dt);
    state.first = false;

    // ---- planet uniforms
    const u = planetMat.uniforms;
    u.uProjInv.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    u.uCam.value.copy(camera.position);
    u.uSun.value.copy(sunDir);
    u.uViewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    u.uTime.value = time;
    common.uCloudRot.value = reduced ? 0 : time * 0.00012;
    u.uStarsI.value = lerp(1, 0.25, smooth(0.55, 0.8, p));
    const diveFade = smooth(0.835, 0.905, p);
    u.uCloudFade.value = 1 - smooth(0.965, 0.995, p);
    u.uShellNear.value.set(58 / 6371, 86 / 6371).multiplyScalar(diveFade);

    // ---- arcs + nodes
    const arcVis = 1 - smooth(0.6, 0.7, p);
    arcGroup.visible = arcVis > 0.001;
    let arrived = 0;
    for (const a of arcs) {
      const h = (p - a.start) / ARC_LEN;
      a.mat.uniforms.uHead.value = Math.max(h, 0) * 1.0 + Math.max(h - 1, 0) * 0.3;
      a.mesh.visible = h > 0 && arcVis > 0.001;
      a.mat.uniforms.uAlpha.value = arcVis;
      a.mat.uniforms.uTime.value = time;
      a.mat.uniforms.uCam.value.copy(camera.position);
      if (h >= 1) arrived++;
    }
    renderer.getDrawingBufferSize(drawSize);
    const pxScale = drawSize.y / Math.max(state.height, 1);
    for (const a of arcs) a.mat.uniforms.uWidth.value = 2.8 * pxScale;
    nodeMat.uniforms.uScale.value = pxScale;
    nodeMat.uniforms.uCam.value.copy(camera.position);
    nodeMat.uniforms.uTime.value = time;
    nodeMat.uniforms.uSrc.value = smooth(0.12, 0.2, p) * arcVis;
    const cairoOn = smooth(ARC_T0 + ARC_LEN * 0.8, ARC_T0 + ARC_LEN * 1.1, p);
    nodeMat.uniforms.uCairo.value = (cairoOn * (0.6 + 0.4 * arrived / arcs.length)) * (1 - smooth(0.62, 0.74, p));
    nodes.visible = p < 0.76;
    ringMat.uniforms.uTime.value = reduced ? 1.3 : time;
    ringMat.uniforms.uAmt.value = cairoOn * (1 - smooth(0.6, 0.7, p));
    ring.visible = ringMat.uniforms.uAmt.value > 0.001;

    // ---- dive
    dive.visible = diveFade > 0.001;
    if (dive.visible || force) {
      const du = diveMat.uniforms;
      const cp = camera.position;
      du.uCamL.value.set(cp.dot(dE) * 6371, (cp.dot(dU) - 1) * 6371, cp.dot(dN) * 6371);
      du.uSunL.value.set(sunDir.dot(dE), sunDir.dot(dU), sunDir.dot(dN)).normalize();
      // sunlight at ~20 km over the Delta
      transmittance(llv(DELTA.lat, DELTA.lng, 1 + 20 / 6371), sunDir, tmp2);
      const sI = u.uSunI.value;
      du.uSunCol.value.set(tmp2.x * sI, tmp2.y * sI, tmp2.z * sI);
      du.uSkyCol.value.set(0.30, 0.42, 0.66).multiplyScalar(sI * 0.11);
      du.uHazeCol.value.set(0.55 + tmp2.x * 0.5, 0.58 + tmp2.y * 0.35, 0.72 + tmp2.z * 0.2).multiplyScalar(sI * 0.11);
      du.uFade.value = diveFade;
      du.uMist.value = smooth(0.955, 1.0, p);
      du.uTime.value = reduced ? 0 : time;
      if (dive.visible) renderDive();
    }

    // ---- sun on screen (for god rays / flares)
    // visibility = mean transmittance over the disc centre + 6 rim samples, so a sun half-hidden
    // behind the limb (the opening shot) still reports a partial, reddened intensity
    tmp.copy(camera.position).addScaledVector(sunDir, 10).project(camera);
    const inFront = sunDir.dot(camera.getWorldDirection(tmp2)) > 0;
    const sx = tmp.x * 0.5 + 0.5, sy = tmp.y * 0.5 + 0.5;
    const ax = tmp2.crossVectors(sunDir, worldUp).normalize();
    const ay = tmp3.crossVectors(ax, sunDir).normalize();
    const rad = planetMat.uniforms.uSunRad.value;
    let lum = 0;
    for (let i = 0; i < 7; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = i === 6 ? 0 : rad;
      sampleDir.copy(sunDir).addScaledVector(ax, Math.cos(a) * r).addScaledVector(ay, Math.sin(a) * r).normalize();
      transmittance(camera.position, sampleDir, sunT);
      lum += (sunT.x * 0.2126 + sunT.y * 0.7152 + sunT.z * 0.0722) / 7;
    }
    const onScreen = inFront && sx > -0.15 && sx < 1.15 && sy > -0.15 && sy < 1.15;
    state.sunScreen.x = sx; state.sunScreen.y = sy;
    state.sunScreen.visible = onScreen && lum > 0.01 && diveFade < 0.95;
    state.sunScreen.intensity = onScreen ? lum * (1 - diveFade * 0.8) : 0;

    // ---- exposure / focus / grade
    state.exposure = lerp(1.0, 0.9, smooth(0.6, 0.85, p)) * lerp(1, 0.92, smooth(0.9, 1.0, p));
    state.focus.distance = camera.position.length() - 1 + 0.0;
    state.focus.aperture = smooth(0.86, 0.95, p) * 0.02;
    if (p > 0.86) state.focus.distance = Math.max(4 / 6371, (camera.position.length() - 1 - 20 / 6371));
    const dawn = smooth(0.62, 0.85, p);
    state.grade.warmth = lerp(-0.12, 0.26, dawn);
    state.grade.tealShadows = lerp(0.4, 0.2, dawn);
    state.grade.saturation = lerp(0.95, 0.94, dawn);
    state.grade.contrast = lerp(1.08, 0.95, smooth(0.85, 1, p));
  }

  return {
    scene,
    camera,
    ready,
    update,
    resize(width, height) {
      state.width = width; state.height = height;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    getSun: () => state.sunScreen,
    getExposure: () => state.exposure,
    getFocus: () => state.focus,
    getGrade: () => state.grade,
    dispose() {
      scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
      diveScene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
      diveRT.dispose();
      noise.dispose();
    },
  };
}
