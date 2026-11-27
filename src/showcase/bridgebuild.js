// "Constructia podului" — a steel arch bridge assembling itself at night over dark water.
// createBridgeBuild(container, { quality }) -> { setProgress, setPointer, pause, resume, dispose, ready, getNodeScreenPositions }
import * as THREE from 'three';
import { createAssets } from '../film/assets.js';
// Small HDRI inlined as a data URL so it ships with the module (no separate .exr request)
import nightExr from '../assets/hdri/night.exr?inline';
import {
  BASE, createStage, createLoop, createPlanarReflection, prefersReducedMotion, damp, clamp01, GLSL_NOISE,
} from './common.js';

const SKY = new THREE.Color(0x9CC3EA);
const GOLD = new THREE.Color(0xD9B27C);
const NODE_X = [-32, -11, 11, 32];
const NODE_P = [0.25, 0.5, 0.75, 0.95];
const DECK_Y = 6.0;          // deck centre height
const DECK_T = 0.9;          // deck thickness
const DECK_TOP = DECK_Y + DECK_T / 2;
const DECK_W = 7.0;
const SPAN = 40;             // deck from -40 to 40
const ARCH_X = 32;           // arch springs at +-32
const ARCH_RISE = 20;

// Build front: x -> progress at which the construction reaches that x (piecewise linear through the 4 nodes)
const KX = [-44, -32, -11, 11, 32, 44];
const KP = [0.07, 0.25, 0.5, 0.75, 0.95, 0.985];
function frontP(x) {
  if (x <= KX[0]) return KP[0];
  for (let i = 1; i < KX.length; i++) {
    if (x <= KX[i]) return KP[i - 1] + (KP[i] - KP[i - 1]) * (x - KX[i - 1]) / (KX[i] - KX[i - 1]);
  }
  return KP[KP.length - 1];
}
const archY = (x) => DECK_TOP + ARCH_RISE * (1 - (x / ARCH_X) ** 2);

function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Swept rib between x0..x1 on the arch curve, centred at its own midpoint (so it can fly as a rigid piece).
function archSegmentGeometry(x0, x1, steps = 10, radial = 20) {
  const pos = [];
  const idx = [];
  const mid = new THREE.Vector3((x0 + x1) / 2, archY((x0 + x1) / 2), 0);
  const P = new THREE.Vector3(), T = new THREE.Vector3(), N = new THREE.Vector3();
  const Z = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i <= steps; i++) {
    const x = x0 + (x1 - x0) * (i / steps);
    P.set(x, archY(x), 0);
    T.set(1, -2 * ARCH_RISE * x / (ARCH_X * ARCH_X), 0).normalize();
    N.crossVectors(Z, T).normalize(); // in-plane normal
    const k = Math.abs(x) / ARCH_X;   // 0 at apex, 1 at springs
    const a = THREE.MathUtils.lerp(0.62, 1.05, k * k); // depth of rib
    const b = THREE.MathUtils.lerp(0.5, 0.78, k * k);  // width of rib
    for (let j = 0; j < radial; j++) {
      const th = (j / radial) * Math.PI * 2;
      // superellipse cross-section: a softened rectangle reads as fabricated steel
      const c = Math.cos(th), s = Math.sin(th);
      const e = 0.55;
      const cx = Math.sign(c) * Math.pow(Math.abs(c), e);
      const sy = Math.sign(s) * Math.pow(Math.abs(s), e);
      pos.push(
        P.x + N.x * cx * a + Z.x * sy * b - mid.x,
        P.y + N.y * cx * a + Z.y * sy * b - mid.y,
        P.z + N.z * cx * a + Z.z * sy * b - mid.z,
      );
    }
  }
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + ((j + 1) % radial);
      const c = (i + 1) * radial + j, d = (i + 1) * radial + ((j + 1) % radial);
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geometry: g, center: mid };
}

function concreteTexture(renderer) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const rnd = mulberry(7);
  for (let i = 0; i < S * S; i++) {
    const v = 200 + (rnd() - 0.5) * 26 + (((i / S) | 0) % 64 === 0 ? -18 : 0);
    img.data[i * 4] = v; img.data[i * 4 + 1] = v * 0.985; img.data[i * 4 + 2] = v * 0.96; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.filter = 'blur(1px)';
  g.drawImage(c, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}

export function createBridgeBuild(container, { quality = 'high' } = {}) {
  const stage = createStage(container, { quality, exposure: 0.9, bloom: { strength: 0.45, radius: 0.45, threshold: 1.0 } });
  const { renderer, high } = stage;
  const reduced = prefersReducedMotion();
  const rnd = mulberry(1337);

  const scene = new THREE.Scene();
  const fogCol = new THREE.Color(0.0016, 0.0035, 0.0105);
  scene.fog = new THREE.FogExp2(fogCol, 0.0045);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 2000);
  camera.filmGauge = 35;
  stage.setScene(scene, camera);

  // ---------- sky: night gradient, stars, warm city glow on the horizon ----------
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      varying vec3 vDir;
      float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 night = vec3(0.0016, 0.0035, 0.0105);
        vec3 zen = vec3(0.0002, 0.0004, 0.0012);
        vec3 c = mix(night, zen, smoothstep(0.0, 0.6, y));
        // horizon: city glow (warm, toward -z / behind the bridge) + cool airglow
        float az = atan(d.x, -d.z);
        float city = exp(-max(y, 0.0) * 22.0) * (0.55 + 0.45 * cos(az * 1.3)) ;
        c += vec3(0.05, 0.03, 0.015) * city * 0.22;
        c += vec3(0.003, 0.006, 0.014) * exp(-abs(y) * 12.0);
        // stars
        vec3 sp = d * 260.0;
        vec3 cell = floor(sp);
        float h = h13(cell);
        if (h > 0.9965 && y > 0.04) {
          vec3 f = fract(sp) - 0.5;
          float r = length(f);
          float tw = 0.65 + 0.35 * sin(uTime * (1.0 + h * 3.0) + h * 80.0);
          float m = exp(-r * r * 60.0) * (h - 0.9965) / 0.0035;
          c += vec3(0.8, 0.88, 1.0) * m * tw * 1.6 * smoothstep(0.04, 0.2, y);
        }
        if (y < 0.0) c = mix(c, night, smoothstep(0.0, -0.05, y));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), skyMat);
  sky.frustumCulled = false;
  scene.add(sky);

  // distant city lights along the far shore
  {
    const N = high ? 1400 : 500;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const warm = new THREE.Color(1.0, 0.72, 0.42), white = new THREE.Color(0.85, 0.9, 1.0);
    const tmp = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const a = (rnd() - 0.5) * Math.PI * 1.25;
      const r = 520 + rnd() * 160;
      const cluster = Math.pow(rnd(), 3.0);
      pos[i * 3] = Math.sin(a) * r;
      pos[i * 3 + 1] = 0.8 + cluster * 14 * (0.5 + 0.5 * Math.cos(a * 3.0));
      pos[i * 3 + 2] = -Math.cos(a) * r;
      tmp.copy(rnd() < 0.7 ? warm : white).multiplyScalar(0.6 + rnd() * 2.4);
      col.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uPx: { value: 1 } },
      vertexShader: /* glsl */`
        attribute vec3 color; varying vec3 vC; uniform float uPx;
        void main() { vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = uPx * 1.8; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`
        varying vec3 vC;
        void main() { vec2 d = gl_PointCoord - 0.5; float a = exp(-dot(d, d) * 14.0); gl_FragColor = vec4(vC * a * 0.6, 1.0); }`,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    scene.add(pts);
    stage.onResize((w, h) => { m.uniforms.uPx.value = Math.max(1, h * renderer.getPixelRatio() / 900); });
  }

  // ---------- water ----------
  const reflection = high ? createPlanarReflection(renderer, { height: 0, scale: 0.5 }) : null;
  const waterMat = new THREE.ShaderMaterial({
    defines: { USE_REFLECT: high ? 1 : 0 },
    uniforms: {
      tReflect: { value: reflection ? reflection.texture : null },
      textureMatrix: { value: reflection ? reflection.textureMatrix : new THREE.Matrix4() },
      uCam: { value: new THREE.Vector3() },
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(0x02060f).multiplyScalar(0.5) },
      uSkyRefl: { value: new THREE.Color(0.006, 0.012, 0.03) },
      uFog: { value: fogCol },
    },
    vertexShader: /* glsl */`
      uniform mat4 textureMatrix;
      varying vec4 vUvR; varying vec3 vW;
      void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vUvR = textureMatrix * wp; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tReflect;
      uniform vec3 uCam, uDeep, uSkyRefl, uFog; uniform float uTime;
      varying vec4 vUvR; varying vec3 vW;
      ${GLSL_NOISE}
      vec2 waveGrad(vec2 p, float t) {
        vec2 g = vec2(0.0);
        float e = 0.08;
        float a = 1.0;
        for (int i = 0; i < 4; i++) {
          vec2 q = p * (0.18 * pow(2.1, float(i))) + vec2(t * 0.05 * float(i + 1), -t * 0.03 * float(i + 2));
          float n0 = vnoise(q), nx = vnoise(q + vec2(e, 0.0)), ny = vnoise(q + vec2(0.0, e));
          g += a * vec2(nx - n0, ny - n0) / e;
          a *= 0.55;
        }
        return g;
      }
      void main() {
        vec3 V = normalize(uCam - vW);
        float dist = length(vW - uCam);
        vec2 g = waveGrad(vW.xz, uTime);
        vec3 N = normalize(vec3(-g.x * 0.08, 1.0, -g.y * 0.08));
        float cosT = clamp(dot(N, V), 0.0, 1.0);
        float fres = 0.02 + 0.98 * pow(max(1.0 - cosT, 0.0), 5.0);
        fres = mix(0.25, 1.0, fres);
        vec3 col = uDeep;
      #if USE_REFLECT
        vec2 uv = vUvR.xy / vUvR.w;
        float fall = 1.0 / (1.0 + dist * 0.01);
        uv += vec2(g.x * 0.004, g.y * 0.010) * fall;
        vec3 r = vec3(0.0);
        // vertical streaking: lights smear into columns on the water, as they do at night
        for (int i = 0; i < 7; i++) {
          float o = (float(i) - 3.0) * 0.0045;
          float di = float(i) - 3.0; float w = exp(-di * di * 0.25);
          r += texture2D(tReflect, uv + vec2(o * 0.06, o), 1.0).rgb * w;
        }
        r /= 4.0;
        col += r * fres * 0.9;
      #else
        col += uSkyRefl * fres * 1.2;
      #endif
        float f = 1.0 - exp(-pow(dist * 0.0055, 1.6));
        col = mix(col, uFog, f);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.updateMatrixWorld();
  scene.add(water);

  // ---------- materials ----------
  const concreteMap = concreteTexture(renderer);
  concreteMap.repeat.set(2, 1);
  const concrete = new THREE.MeshStandardMaterial({ color: 0xa9a49b, map: concreteMap, roughness: 0.8, metalness: 0, envMapIntensity: 0.9 });
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x14161b, roughness: 0.55, metalness: 0.0, envMapIntensity: 0.6 });
  const steel = new THREE.MeshPhysicalMaterial({
    color: 0xc4c9d1, metalness: 1, roughness: 0.3, clearcoat: 0.35, clearcoatRoughness: 0.25, envMapIntensity: 1.0,
  });
  const cableMat = new THREE.MeshStandardMaterial({ color: 0xb9c0cc, metalness: 1, roughness: 0.35, emissive: new THREE.Color(0x9CC3EA), emissiveIntensity: 0.05 });
  // arch: uplit from the deck — warm wash on the underside, cool moonlit top (Calatrava at night)
  const archWash = { value: 0 };
  const archSteel = steel.clone();
  archSteel.onBeforeCompile = (sh) => {
    sh.uniforms.uWash = archWash;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWN; varying vec3 vWP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWN = normalize(mat3(modelMatrix) * objectNormal); vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWN; varying vec3 vWP; uniform float uWash;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float under = smoothstep(0.1, -0.9, vWN.y);
        float h = clamp((vWP.y - ${DECK_TOP.toFixed(2)}) / ${ARCH_RISE.toFixed(1)}, 0.0, 1.0);
        float side = smoothstep(0.2, 0.9, abs(vWN.z)) * 0.10;
        float fall = mix(1.0, 0.12, pow(h, 0.6));
        totalEmissiveRadiance += vec3(1.0, 0.76, 0.5) * uWash * (under * 1.5 + side) * fall;`);
  };
  // pieces in flight carry a faint cool charge that discharges on landing
  const flyGlow = { value: 1 };
  const flyMat = (m) => {
    const f = m.clone();
    f.emissive = new THREE.Color(0x9CC3EA);
    f.emissiveIntensity = 0.07;
    return f;
  };
  const ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.86, 0.66).multiplyScalar(5.0) });

  // ---------- elements ----------
  const elements = [];
  const joints = []; // {pos, land}
  const bridge = new THREE.Group();
  scene.add(bridge);

  const flyCache = new Map();
  function flyFor(m) {
    if (Array.isArray(m)) return m.map(flyFor);
    if (!flyCache.has(m)) flyCache.set(m, flyMat(m));
    return flyCache.get(m);
  }
  function addElement(mesh, land, dur, kind, { scatter = 1, rise = false } = {}) {
    const target = { pos: mesh.position.clone(), quat: mesh.quaternion.clone() };
    const start = { pos: target.pos.clone(), quat: target.quat.clone() };
    if (rise) {
      start.pos.y -= 16;
    } else {
      // pieces arrive from above and behind the bridge (never from the lens)
      const dir = new THREE.Vector3((rnd() - 0.5) * 0.9, 0.55 + rnd() * 0.8, -(0.25 + rnd() * 0.9)).normalize();
      start.pos.addScaledVector(dir, (16 + rnd() * 16) * scatter);
      start.quat.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(
        (rnd() - 0.5) * 2.2, (rnd() - 0.5) * 2.2, (rnd() - 0.5) * 2.2)));
    }
    mesh.visible = false;
    bridge.add(mesh);
    const meshes = [];
    mesh.traverse((o) => { if (o.isMesh && o.material !== ledMat) meshes.push({ o, rest: o.material, fly: flyFor(o.material) }); });
    const el = { mesh, target, start, land, dur, kind, meshes, flying: null };
    elements.push(el);
    return el;
  }


  // piers: slender tapered twin columns (V) under each node
  const pierGeo = (() => {
    const g = new THREE.CylinderGeometry(0.55, 0.95, DECK_Y - DECK_T / 2 + 3, 24);
    g.translate(0, (DECK_Y - DECK_T / 2 + 3) / 2 - 3, 0);
    return g;
  })();
  const capGeo = new THREE.BoxGeometry(2.2, 0.7, DECK_W - 0.6);
  [-SPAN + 1.5, ...NODE_X, SPAN - 1.5].forEach((x) => {
    const g = new THREE.Group();
    g.position.set(x, 0, 0);
    for (const sz of [-1, 1]) {
      const c = new THREE.Mesh(pierGeo, concrete);
      c.position.z = sz * 2.0;
      c.rotation.x = sz * 0.1;
      g.add(c);
    }
    const cap = new THREE.Mesh(capGeo, concrete);
    cap.position.y = DECK_Y - DECK_T / 2 - 0.35;
    g.add(cap);
    addElement(g, frontP(x) - 0.06, 0.1, 'pier', { rise: true });
  });

  // deck segments (with LED handrail strips and lamp posts riding along)
  const SEG = 4;
  const segGeo = new THREE.BoxGeometry(SEG - 0.05, DECK_T, DECK_W);
  const deckMats = [concrete, concrete, asphalt, concrete, concrete, concrete];
  const ledGeo = new THREE.BoxGeometry(SEG - 0.05, 0.06, 0.06);
  const railGeo = new THREE.BoxGeometry(SEG - 0.05, 0.05, 0.05);
  const postGeo = new THREE.CylinderGeometry(0.035, 0.05, 1.1, 6);
  for (let x0 = -SPAN; x0 < SPAN - 0.01; x0 += SEG) {
    const xc = x0 + SEG / 2;
    const g = new THREE.Group();
    g.position.set(xc, DECK_Y, 0);
    g.add(new THREE.Mesh(segGeo, deckMats));
    for (const sz of [-1, 1]) {
      const led = new THREE.Mesh(ledGeo, ledMat);
      led.position.set(0, DECK_T / 2 + 0.03, sz * (DECK_W / 2 - 0.25));
      g.add(led);
      const rail = new THREE.Mesh(railGeo, steel);
      rail.position.set(0, DECK_T / 2 + 1.1, sz * (DECK_W / 2 - 0.08));
      g.add(rail);
      const post = new THREE.Mesh(postGeo, steel);
      post.position.set(-SEG / 2 + 0.2, DECK_T / 2 + 0.55, sz * (DECK_W / 2 - 0.08));
      g.add(post);
    }
    const land = frontP(xc) - 0.015;
    addElement(g, land, 0.11, 'deck');
    joints.push({ pos: new THREE.Vector3(x0 + SEG, DECK_TOP, DECK_W / 2), land });
  }

  // arch ribs
  const ARCH_SEGS = 16;
  for (let i = 0; i < ARCH_SEGS; i++) {
    const x0 = -ARCH_X + (2 * ARCH_X) * (i / ARCH_SEGS);
    const x1 = -ARCH_X + (2 * ARCH_X) * ((i + 1) / ARCH_SEGS);
    const { geometry, center } = archSegmentGeometry(x0 - 0.02, x1 + 0.02);
    const m = new THREE.Mesh(geometry, archSteel);
    m.position.copy(center);
    const land = frontP(x1) + 0.005;
    addElement(m, land, 0.12, 'arch', { scatter: 0.8 });
    joints.push({ pos: new THREE.Vector3(x1, archY(x1), 0), land });
  }

  // hanger cables: fan from the arch to both deck edges, drawn with a glowing head
  const hangers = [];
  const hGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 6, 1);
  hGeo.translate(0, -0.5, 0); // origin at top (arch), grows downward
  for (let x = -28; x <= 28.01; x += 4) {
    for (const sz of [-1, 1]) {
      const top = new THREE.Vector3(x, archY(x) - 0.6, 0);
      const bot = new THREE.Vector3(x + sz * 0.0, DECK_TOP + 0.05, sz * (DECK_W / 2 - 0.5));
      const m = new THREE.Mesh(hGeo, cableMat);
      m.position.copy(top);
      const dir = bot.clone().sub(top);
      const len = dir.length();
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
      m.visible = false;
      bridge.add(m);
      const land = Math.max(frontP(x) + 0.03, frontP(Math.abs(x) <= 0 ? 0 : x) + 0.03);
      hangers.push({ mesh: m, top, bot, len, land, dur: 0.05 });
    }
  }

  // ---------- nodes (Understand, Connect, Coordinate, Act) ----------
  const nodes = NODE_X.map((x, i) => {
    const color = i === 3 ? GOLD.clone() : SKY.clone();
    const g = new THREE.Group();
    g.position.set(x, DECK_TOP, DECK_W / 2 + 0.35);
    bridge.add(g);
    // slim steel mast
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 3.2, 10), steel);
    mast.position.y = 1.6;
    g.add(mast);
    // beacon core
    const coreMat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(0.05) });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 16), coreMat);
    core.position.y = 3.4;
    g.add(core);
    // ring
    const ringMat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(0.0), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.025, 8, 64), ringMat);
    ring.position.y = 3.4;
    g.add(ring);
    // halo + beam (additive)
    const haloMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uColor: { value: color.clone() }, uI: { value: 0 } },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          mv.xy += position.xy;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; uniform float uI; varying vec2 vUv;
        void main() {
          vec2 d = vUv - 0.5; float r = length(d);
          float a = exp(-r * r * 40.0) * 1.2 + exp(-r * 9.0) * 0.25;
          float streak = exp(-abs(d.y) * 160.0) * exp(-abs(d.x) * 4.0) * 0.5; // anamorphic
          gl_FragColor = vec4(uColor * (a + streak) * uI, 1.0);
        }`,
    });
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), haloMat);
    halo.position.y = 3.4;
    halo.renderOrder = 5;
    g.add(halo);
    const beamMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: { uColor: { value: color.clone() }, uI: { value: 0 }, uCam: { value: new THREE.Vector3() } },
      vertexShader: /* glsl */`
        varying float vY; varying vec3 vN; varying vec3 vW;
        void main() { vY = uv.y; vN = normalize(mat3(modelMatrix) * normal); vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor, uCam; uniform float uI; varying float vY; varying vec3 vN; varying vec3 vW;
        void main() {
          float f = abs(dot(normalize(vN), normalize(uCam - vW))); f *= f;
          float t = clamp(1.0 - vY, 0.0, 1.0);
          float a = f * t * t * smoothstep(0.0, 0.03, vY);
          gl_FragColor = vec4(uColor * a * uI * 0.5, 1.0);
        }`,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 0.3, 9, 24, 1, true), beamMat);
    beam.position.y = 3.4 + 4.5;
    g.add(beam);
    // pier uplight: a glow on the water + light on the pier via a point light (only when lit)
    const light = new THREE.PointLight(color, 0, 26, 2);
    light.position.set(0, 2.5, 1.5);
    g.add(light);
    g.visible = false;
    // 'low' quality has no planar reflection: paint the beacon's reflection as a rippled streak on the water
    let streak = null;
    if (!high) {
      const sm = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
        uniforms: { uColor: { value: color.clone() }, uI: { value: 0 }, uTime: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: /* glsl */`
          uniform vec3 uColor; uniform float uI, uTime; varying vec2 vUv;
          void main() {
            float x = (vUv.x - 0.5) * 2.0;
            float y = vUv.y;
            float band = 0.55 + 0.45 * sin(y * 90.0 + uTime * 1.5 + sin(y * 23.0) * 2.0);
            float w = exp(-x * x * (6.0 + 30.0 * (1.0 - y))) * band;
            float a = w * smoothstep(0.0, 0.15, y) * (1.0 - smoothstep(0.55, 1.0, y));
            gl_FragColor = vec4(uColor * a * uI, 1.0);
          }`,
      });
      streak = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 34), sm);
      streak.rotation.x = -Math.PI / 2;
      scene.add(streak);
    }
    return { streak, group: g, color, core, coreMat, ring, ringMat, haloMat, beamMat, light, p: NODE_P[i], world: new THREE.Vector3(), lit: 0 };
  });

  // ---------- blueprint: the plan, drawn in faint light before the pieces arrive ----------
  const bp = { pos: [], land: [] };
  const seg = (a, b, land) => { bp.pos.push(a.x, a.y, a.z, b.x, b.y, b.z); bp.land.push(land, land); };
  {
    const v = (x, y, z) => new THREE.Vector3(x, y, z);
    for (let x0 = -SPAN; x0 < SPAN - 0.01; x0 += SEG) {
      const l = frontP(x0 + SEG / 2) - 0.015;
      for (const sz of [-1, 1]) {
        seg(v(x0, DECK_TOP, sz * DECK_W / 2), v(x0 + SEG, DECK_TOP, sz * DECK_W / 2), l);
        seg(v(x0, DECK_Y - DECK_T / 2, sz * DECK_W / 2), v(x0 + SEG, DECK_Y - DECK_T / 2, sz * DECK_W / 2), l);
      }
      seg(v(x0, DECK_TOP, -DECK_W / 2), v(x0, DECK_TOP, DECK_W / 2), l);
      seg(v(x0, DECK_TOP, DECK_W / 2), v(x0, DECK_Y - DECK_T / 2, DECK_W / 2), l);
    }
    const n = 64;
    for (let i = 0; i < n; i++) {
      const x0 = -ARCH_X + 2 * ARCH_X * i / n, x1 = -ARCH_X + 2 * ARCH_X * (i + 1) / n;
      const l = frontP(x1) + 0.005;
      for (const dz of [-0.6, 0.6]) seg(v(x0, archY(x0), dz), v(x1, archY(x1), dz), l);
    }
    hangers.forEach((h) => seg(h.top, h.bot, h.land));
    NODE_X.forEach((x) => {
      const l = frontP(x) - 0.06;
      for (const sz of [-1, 1]) seg(v(x, 0, sz * 2.0), v(x, DECK_Y - DECK_T / 2, sz * 2.0), l);
    });
  }
  const bpGeo = new THREE.BufferGeometry();
  bpGeo.setAttribute('position', new THREE.Float32BufferAttribute(bp.pos, 3));
  bpGeo.setAttribute('aLand', new THREE.Float32BufferAttribute(bp.land, 1));
  const bpMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uP: { value: 0 }, uColor: { value: SKY.clone() }, uI: { value: 1 }, uTime: { value: 0 } },
    vertexShader: /* glsl */`
      attribute float aLand; varying float vLand; varying vec3 vW;
      void main() { vLand = aLand; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`
      uniform float uP, uI, uTime; uniform vec3 uColor; varying float vLand; varying vec3 vW;
      void main() {
        float gone = smoothstep(vLand - 0.06, vLand, uP);
        float scan = 0.6 + 0.4 * sin(vW.x * 0.35 - uTime * 1.2);
        float a = (1.0 - gone) * 0.16 * scan * uI;
        // the build front glows brighter just before pieces lock in
        float fr = (uP - vLand + 0.03) / 0.03; a += exp(-fr * fr) * 0.35 * uI;
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
  });
  const blueprint = new THREE.LineSegments(bpGeo, bpMat);
  blueprint.frustumCulled = false;
  scene.add(blueprint);

  // ---------- sparks at joints (fully GPU, deterministic in progress) ----------
  const PER = high ? 18 : 8;
  const SN = joints.length * (PER + 1);
  const sOrigin = new Float32Array(SN * 3);
  const sVel = new Float32Array(SN * 3);
  const sMeta = new Float32Array(SN * 3); // land, kind (0 = flash, 1 = spark), seed
  let k = 0;
  joints.forEach((j) => {
    for (let n = 0; n <= PER; n++, k++) {
      sOrigin.set([j.pos.x, j.pos.y, j.pos.z], k * 3);
      const v = new THREE.Vector3(rnd() - 0.5, rnd() * 0.9 + 0.1, rnd() - 0.5).normalize().multiplyScalar(4 + rnd() * 9);
      sVel.set([v.x, v.y, v.z], k * 3);
      sMeta.set([j.land, n === 0 ? 0 : 1, rnd()], k * 3);
    }
  });
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sOrigin, 3));
  sGeo.setAttribute('aVel', new THREE.BufferAttribute(sVel, 3));
  sGeo.setAttribute('aMeta', new THREE.BufferAttribute(sMeta, 3));
  const sparkMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uP: { value: 0 }, uPx: { value: 1 }, uTime: { value: 0 } },
    vertexShader: /* glsl */`
      attribute vec3 aVel; attribute vec3 aMeta;
      uniform float uP, uPx, uTime;
      varying float vI; varying float vKind;
      void main() {
        float land = aMeta.x; float kind = aMeta.y; float seed = aMeta.z;
        float life = kind < 0.5 ? 0.035 : 0.06 + seed * 0.03;
        float age = (uP - land) / life;
        vKind = kind;
        vec3 p = position;
        if (age < 0.0 || age > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vI = 0.0; return; }
        if (kind > 0.5) {
          float tt = age * 1.4;
          p += aVel * tt - vec3(0.0, 9.0, 0.0) * tt * tt;
          vI = pow(max(1.0 - age, 0.0), 1.5) * (0.6 + 0.4 * sin(uTime * 40.0 + seed * 50.0));
        } else {
          vI = exp(-age * 5.0);
        }
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uPx * (kind < 0.5 ? 2600.0 : 320.0) / -mv.z * (kind < 0.5 ? 1.0 : (1.0 - age * 0.6));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying float vI; varying float vKind;
      void main() {
        vec2 d = gl_PointCoord - 0.5; float r2 = dot(d, d);
        vec3 hot = vec3(1.0, 0.82, 0.55);
        float a = vKind < 0.5 ? exp(-r2 * 30.0) * 6.0 + exp(-r2 * 6.0) * 0.6 : exp(-r2 * 22.0) * 7.0;
        gl_FragColor = vec4(hot * a * vI, 1.0);
      }`,
  });
  const sparks = new THREE.Points(sGeo, sparkMat);
  sparks.frustumCulled = false;
  sparks.renderOrder = 6;
  scene.add(sparks);

  // ---------- lights ----------
  const moon = new THREE.DirectionalLight(0xa9c4ff, 0.55);
  moon.position.set(-60, 80, -40);
  scene.add(moon);
  const warmFill = new THREE.DirectionalLight(0xffc999, 0.25);
  warmFill.position.set(40, 10, 60);
  scene.add(warmFill);

  // ---------- state + update ----------
  const state = { target: 0, current: 0, pointer: new THREE.Vector2(), pointerD: new THREE.Vector2(), time: 0, started: false };
  const qa = new THREE.Quaternion();
  const center = new THREE.Vector3(0, 11, 0);
  const tmp = new THREE.Vector3();

  function layout(w, h) {
    camera.aspect = w / h;
    camera.setFocalLength(camera.aspect >= 1 ? 40 : 24);
    camera.updateProjectionMatrix();
    const px = h * renderer.getPixelRatio() / 900;
    sparkMat.uniforms.uPx.value = px;
  }
  stage.onResize(layout);
  stage.resize();

  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeOutBack = (t) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

  function update(dt) {
    const k2 = reduced ? 1 : 1 - Math.exp(-2.6 * dt);
    state.current = reduced ? state.target : state.current + (state.target - state.current) * k2;
    if (Math.abs(state.current - state.target) < 1e-5) state.current = state.target;
    state.pointerD.x = damp(state.pointerD.x, reduced ? 0 : state.pointer.x, 2.0, dt);
    state.pointerD.y = damp(state.pointerD.y, reduced ? 0 : state.pointer.y, 2.0, dt);
    const p = state.current;
    const time = reduced ? 2.0 : state.time;

    // camera: slow orbit + crane driven by progress
    const portrait = camera.aspect < 1;
    const e = p * p * (3 - 2 * p);
    // landscape: a slow 3/4 orbit from front-left to front-right; portrait: looking along the deck so it fills the height
    const theta = (portrait ? THREE.MathUtils.lerp(-1.2, -0.72, e) : THREE.MathUtils.lerp(-0.8, 0.6, e)) + state.pointerD.x * 0.04;
    const dist = portrait ? THREE.MathUtils.lerp(70, 78, e) : 104 - 20 * e;
    const hgt = (portrait ? THREE.MathUtils.lerp(7, 16, e) : THREE.MathUtils.lerp(4.5, 15, e)) + state.pointerD.y * 1.5;
    camera.position.set(Math.sin(theta) * dist, hgt, Math.cos(theta) * dist);
    if (portrait) center.set(THREE.MathUtils.lerp(-4, 4, e), THREE.MathUtils.lerp(13, 12, e), 0);
    else center.set(THREE.MathUtils.lerp(-12, 2, e), THREE.MathUtils.lerp(12.5, 11.5, e), 0);
    camera.lookAt(center);
    camera.updateMatrixWorld();

    // flying pieces
    for (const el of elements) {
      const t = clamp01((p - (el.land - el.dur)) / el.dur);
      if (t <= 0) { el.mesh.visible = false; continue; }
      el.mesh.visible = true;
      const inFlight = t < 1 && el.kind !== 'pier';
      if (el.flying !== inFlight) {
        el.flying = inFlight;
        el.meshes.forEach((m) => { m.o.material = inFlight ? m.fly : m.rest; });
      }
      const ep = easeOutCubic(t);
      el.mesh.position.lerpVectors(el.start.pos, el.target.pos, ep);
      if (el.kind !== 'pier') {
        qa.copy(el.start.quat).slerp(el.target.quat, Math.min(1, easeOutBack(Math.min(1, t * 1.05))));
        el.mesh.quaternion.copy(qa);
      }
    }
    // hangers draw down from the arch
    for (const h of hangers) {
      const t = clamp01((p - (h.land - h.dur)) / h.dur);
      h.mesh.visible = t > 0;
      if (t > 0) h.mesh.scale.set(1, h.len * easeOutCubic(t), 1);
    }
    cableMat.emissiveIntensity = 0.04 + 0.12 * smoothstep01((p - 0.9) / 0.1);

    // nodes
    nodes.forEach((n, i) => {
      const deckReady = frontP(NODE_X[i]) - 0.02;
      n.group.visible = p > deckReady;
      const lit = clamp01((p - n.p + 0.025) / 0.03);
      const flash = p > n.p - 0.02 ? Math.exp(-(p - n.p + 0.02) / 0.02) : 0;
      const pulse = reduced ? 1 : 0.92 + 0.08 * Math.sin(time * 2.0 + i);
      n.lit = lit;
      n.coreMat.color.copy(n.color).multiplyScalar(0.06 + lit * (i === 3 ? 22 : 14) * pulse + flash * 20);
      n.ringMat.color.copy(n.color).multiplyScalar(lit * 3.0);
      n.ring.rotation.set(Math.PI / 2 + Math.sin(time * 0.7 + i) * 0.25, 0, time * 0.4);
      n.haloMat.uniforms.uI.value = (lit * 0.45 * pulse + flash * 0.9) * (i === 3 ? 1.8 : 1);
      n.beamMat.uniforms.uI.value = lit * (0.12 + 0.5 * flash) * (i === 3 ? 1.6 : 1);
      n.beamMat.uniforms.uCam.value.copy(camera.position);
      n.light.intensity = lit * 220;
      if (n.streak) {
        // lie on the water under the beacon, pointing at the camera
        n.streak.position.set(NODE_X[i], 0.03, DECK_W / 2 + 0.35);
        const ang = Math.atan2(camera.position.x - NODE_X[i], camera.position.z - n.streak.position.z);
        n.streak.rotation.set(-Math.PI / 2, 0, ang, 'YXZ');
        n.streak.rotation.order = 'YXZ';
        n.streak.rotation.y = ang;
        n.streak.rotation.x = -Math.PI / 2;
        n.streak.rotation.z = 0;
        n.streak.translateY(-14);
        n.streak.material.uniforms.uI.value = lit * (i === 3 ? 2.6 : 1.8);
        n.streak.material.uniforms.uTime.value = time;
      }
    });

    // arch wash comes on as the arch completes
    archWash.value = 0.15 + 0.85 * smoothstep01((p - 0.62) / 0.33);
    flyGlow.value = 1;
    ledMat.color.setRGB(1.0, 0.86, 0.66).multiplyScalar(0.9 + 2.2 * smoothstep01((p - 0.9) / 0.1));

    bpMat.uniforms.uP.value = p;
    bpMat.uniforms.uTime.value = time;
    bpMat.uniforms.uI.value = 1 - 0.7 * smoothstep01((p - 0.9) / 0.1);
    sparkMat.uniforms.uP.value = p;
    sparkMat.uniforms.uTime.value = time;
    skyMat.uniforms.uTime.value = time;
    waterMat.uniforms.uTime.value = time;
    waterMat.uniforms.uCam.value.copy(camera.position);
  }
  function smoothstep01(x) { const t = clamp01(x); return t * t * (3 - 2 * t); }

  function frame(dt, time) {
    state.time = time;
    update(dt);
    if (reflection) reflection.update(scene, camera, [water, blueprint]);
    stage.render(dt, time);
  }

  const loop = createLoop(container, frame, { maxFps: quality === 'low' ? 30 : 0 });
  let disposed = false;
  const assets = createAssets(renderer);
  const ready = (async () => {
    const env = await assets.envMap(nightExr);
    if (disposed) return;
    scene.environment = env;
    scene.environmentIntensity = 0.6;
    update(1);
    await renderer.compileAsync(scene, camera).catch(() => {});
    if (disposed) return;
    frame(1 / 60, 0);
    state.started = true;
    loop.start();
  })();

  const proj = new THREE.Vector3();
  return {
    ready,
    setProgress(v) {
      state.target = clamp01(+v || 0);
      if (!state.started) state.current = state.target;
    },
    setPointer(x, y) { state.pointer.set(+x || 0, +y || 0); },
    getNodeScreenPositions() {
      return nodes.map((n) => {
        n.core.getWorldPosition(proj);
        const vis = proj.clone().sub(camera.position).dot(camera.getWorldDirection(tmp)) > 0;
        proj.project(camera);
        return { x: (proj.x + 1) / 2, y: (1 - proj.y) / 2, lit: n.lit, visible: vis };
      });
    },
    pause() { loop.pause(); },
    resume() { loop.resume(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      loop.dispose();
      reflection?.dispose();
      assets.dispose();
      concreteMap.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose();
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        ms.forEach((m) => m.dispose());
      });
      stage.dispose();
    },
  };
}
