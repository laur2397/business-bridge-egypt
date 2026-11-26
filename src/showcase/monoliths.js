// "Sala monolitilor" — 8 glass monoliths in a dark gallery hall. Scroll-driven camera dolly.
// createMonoliths(container, { quality }) -> { setProgress, setActive, setPointer, pause, resume, dispose, ready }
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createAssets } from '../film/assets.js';
import {
  BASE, createStage, createLoop, createPlanarReflection, createBackdrop, prefersReducedMotion,
  damp, clamp01, GLSL_NOISE,
} from './common.js';
import numeralFontUrl from '@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2?url';

const COUNT = 8;
const SPACING = 4.6;
const SLAB = { w: 0.9, h: 2.8, d: 0.22 };
// Row direction (receding to the right, away from camera) and its normal (toward the viewer)
const ROW_T = new THREE.Vector3(Math.cos(0.32), 0, -Math.sin(0.32));
const ROW_N = new THREE.Vector3(Math.sin(0.32), 0, Math.cos(0.32));
const ROW_YAW = 0.32;
const GOLD = new THREE.Color(0xD9B27C);
const BLUE = new THREE.Color(0x5B8DC4);
const NIGHT = new THREE.Color(0x050B1A);
const GOLD_GLASS = GOLD.clone().lerp(new THREE.Color(1, 1, 1), 0.3);

// Row layout: a gentle concave arc receding to the right.
function rowPos(s, out = new THREE.Vector3()) {
  return out.copy(ROW_T).multiplyScalar(s * SPACING);
}

// Numerals: Archivo (variable width axis), set condensed and light to match the v3 type system.
const NUMERAL_FAMILY = 'BBE Numerals';
let fontPromise = null;
function loadFont() {
  if (fontPromise) return fontPromise;
  fontPromise = (async () => {
    if (typeof FontFace === 'undefined' || !document.fonts) return;
    try {
      const ff = new FontFace(NUMERAL_FAMILY, `url(${numeralFontUrl})`, { weight: '100 900', stretch: '62% 125%' });
      await Promise.race([ff.load(), new Promise((_, rej) => setTimeout(() => rej(new Error('font timeout')), 4000))]);
      document.fonts.add(ff);
    } catch { /* falls back to a system serif */ }
  })();
  return fontPromise;
}

function numeralTexture(n, renderer, bold) {
  const W = 512, H = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.font = `200 380px "${NUMERAL_FAMILY}", "Archivo Variable", system-ui, sans-serif`;
  if ('fontStretch' in g) g.fontStretch = 'extra-condensed';
  const label = String(n).padStart(2, '0');
  g.fillText(label, W / 2, 470);
  g.strokeStyle = '#fff';
  g.lineWidth = bold ? 7 : 3;
  g.lineJoin = 'round';
  g.strokeText(label, W / 2, 470);
  // hairline + small diamond: an engraved maker's mark
  g.fillRect(W / 2 - 70, 540, 140, 5);
  g.save();
  g.translate(W / 2, 600);
  g.rotate(Math.PI / 4);
  g.fillRect(-9, -9, 18, 18);
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// Gallery environment: studio.exr dimmed to a whisper + tall strip softboxes for long, elegant glass highlights.
function buildEnv(renderer, studioTex) {
  const envScene = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32),
    new THREE.MeshBasicMaterial({ map: studioTex, side: THREE.BackSide, color: new THREE.Color(0.035, 0.04, 0.05) }));
  envScene.add(sky);
  // softbox with a soft horizontal falloff and a vertical gradient (bright top), so flat glass faces show a falloff
  const boxMat = (c) => new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uC: { value: c } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uC; varying vec2 vUv;
      void main(){ float x = 1.0 - pow(abs(vUv.x - 0.5) * 2.0, 3.0); float y = smoothstep(0.0, 0.9, vUv.y) * 0.85 + 0.15;
      gl_FragColor = vec4(uC * x * y, 1.0); }`,
  });
  const box = (w, h, x, y, z, c) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), boxMat(c));
    m.position.set(x, y, z); m.lookAt(0, y, 0);
    envScene.add(m);
    return m;
  };
  // tall vertical strips (key left-front, rim right-back), warm/cool
  box(2.6, 22, -16, 6, 10, new THREE.Color(9.0, 8.2, 7.0));
  box(1.6, 22, 18, 6, -6, new THREE.Color(3.0, 4.6, 7.0));
  box(1.0, 22, -6, 6, -18, new THREE.Color(1.2, 1.6, 2.4));
  box(2.4, 22, 16, 6, 9, new THREE.Color(4.5, 4.0, 3.4));   // front-right: the face catches this as a graded sheet
  box(0.7, 22, 4, 6, 18, new THREE.Color(4.0, 4.0, 4.2));   // narrow front strip: bevel glints
  // overhead softbox
  const top = new THREE.Mesh(new THREE.PlaneGeometry(10, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.0, 1.8), side: THREE.DoubleSide }));
  top.position.set(0, 18, 2); top.rotation.x = Math.PI / 2;
  envScene.add(top);
  // low cool horizon band
  const band = new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 0.8, 64, 1, true),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.45, 0.8), side: THREE.BackSide }));
  band.position.y = 0.5;
  envScene.add(band);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(envScene, 0, 0.1, 100);
  pmrem.dispose();
  envScene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  return rt;
}

export function createMonoliths(container, { quality = 'high' } = {}) {
  const stage = createStage(container, { quality, exposure: 1.0, bloom: { strength: 0.42, radius: 0.55, threshold: 0.9 } });
  const { renderer, high } = stage;
  const reduced = prefersReducedMotion();

  const scene = new THREE.Scene();
  const fogColor = NIGHT.clone().multiplyScalar(0.8);
  scene.fog = new THREE.FogExp2(fogColor, 0.028);
  const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 500);
  camera.filmGauge = 35;
  stage.setScene(scene, camera);

  // ---------- backdrop + hall ----------
  scene.add(createBackdrop({ radius: 300, horizon: 0x050B1A, top: 0x000000, glow: 0x0b1830, glowStrength: 0.5 }));

  const hall = new THREE.Group();
  scene.add(hall);
  // back wall: dark plaster with a soft wash and a cove light line at its foot
  const wallMat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uWash: { value: new THREE.Color(0x0d1b33) },
      uCove: { value: new THREE.Color(0x9CC3EA).multiplyScalar(0.9) },
      uHalo: { value: new THREE.Vector3() },
      uHaloColor: { value: new THREE.Color(0x6d5a44) },
    }]),
    vertexShader: /* glsl */`
      #include <fog_pars_vertex>
      varying vec3 vW;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <fog_pars_fragment>
      uniform vec3 uWash, uCove, uHalo, uHaloColor;
      varying vec3 vW;
      ${GLSL_NOISE}
      void main() {
        float y = vW.y;
        vec3 c = uWash * 0.05 * (0.8 + 0.4 * fbm(vW.xy * 0.4));
        // wash grazing up from the cove
        c += uWash * 0.9 * exp(-y * 0.55) ;
        // cove line
        c += uCove * 3.0 * exp(-abs(y - 0.18) * 40.0);
        // vertical gallery slits (very dim)
        float sx = abs(fract(vW.x / 9.0 + 0.5) - 0.5) * 9.0;
        c += uCove * 0.18 * exp(-sx * 18.0) * smoothstep(0.0, 1.5, y) * exp(-max(y - 3.5, 0.0) * 0.5);
        // soft halo behind the active monolith (backlight for the glass)
        vec3 hd = vW - uHalo; hd.y *= 0.7;
        c += uHaloColor * exp(-dot(hd, hd) / 9.0);
        gl_FragColor = vec4(c, 1.0);
        #include <fog_fragment>
      }`,
  });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(160, 24), wallMat);
  rowPos(3.5, wall.position).addScaledVector(ROW_N, -11);
  wall.position.y = 12;
  wall.rotation.y = ROW_YAW;
  hall.add(wall);

  // ---------- floor (planar reflection, blurred) ----------
  const reflection = high ? createPlanarReflection(renderer, { height: 0, scale: 0.5 }) : null;
  const floorMat = new THREE.ShaderMaterial({
    defines: { USE_REFLECT: high ? 1 : 0 },
    uniforms: {
      tReflect: { value: reflection ? reflection.texture : null },
      textureMatrix: { value: reflection ? reflection.textureMatrix : new THREE.Matrix4() },
      uCam: { value: new THREE.Vector3() },
      uBase: { value: new THREE.Color(0x0a0f1a).multiplyScalar(0.18) },
      uFog: { value: fogColor },
      uFogDensity: { value: 0.028 },
      uEnvTint: { value: new THREE.Color(0x10203a) },
    },
    vertexShader: /* glsl */`
      uniform mat4 textureMatrix;
      varying vec4 vUvR; varying vec3 vW;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;
        vUvR = textureMatrix * wp;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tReflect;
      uniform vec3 uCam, uBase, uFog, uEnvTint; uniform float uFogDensity;
      varying vec4 vUvR; varying vec3 vW;
      ${GLSL_NOISE}
      void main() {
        vec3 V = normalize(uCam - vW);
        float m = fbm(vW.xz * 0.9);               // stone variation
        float m2 = vnoise(vW.xz * 0.12);
        float fres = 0.04 + 0.96 * pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0);
        vec3 col = uBase * (0.6 + 0.8 * m);
        // fake env: faint cool sheen toward grazing angles
        col += uEnvTint * fres * 0.25;
      #if USE_REFLECT
        vec2 uv = vUvR.xy / vUvR.w;
        vec2 wob = (vec2(vnoise(vW.xz * 5.0), vnoise(vW.xz * 5.0 + 9.3)) - 0.5) * 0.0022;
        uv += wob;
        float lod = 1.2 + m2 * 1.6;
        vec3 refl = texture2D(tReflect, uv, lod).rgb * 0.30;
        const float R = 0.0065;
        refl += texture2D(tReflect, uv + vec2( R, 0.0), lod + 0.6).rgb * 0.12;
        refl += texture2D(tReflect, uv + vec2(-R, 0.0), lod + 0.6).rgb * 0.12;
        refl += texture2D(tReflect, uv + vec2(0.0,  R * 1.6), lod + 0.9).rgb * 0.12;
        refl += texture2D(tReflect, uv + vec2(0.0, -R * 1.6), lod + 0.9).rgb * 0.12;
        refl += texture2D(tReflect, uv + vec2( R, R) * 1.4, lod + 1.2).rgb * 0.055;
        refl += texture2D(tReflect, uv + vec2(-R, R) * 1.4, lod + 1.2).rgb * 0.055;
        refl += texture2D(tReflect, uv + vec2( R,-R) * 1.4, lod + 1.2).rgb * 0.055;
        refl += texture2D(tReflect, uv + vec2(-R,-R) * 1.4, lod + 1.2).rgb * 0.055;
        float k = mix(0.22, 0.95, fres) * (0.8 + 0.35 * m);
        col += refl * k;
      #endif
        float fd = length(vW - uCam);
        float f = 1.0 - exp(-pow(fd * uFogDensity, 2.0));
        col = mix(col, uFog, f);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), floorMat);
  floor.rotation.x = -Math.PI / 2;
  rowPos(3.5, floor.position);
  floor.updateMatrixWorld();
  scene.add(floor);

  // ---------- monoliths ----------
  const slabGeo = new RoundedBoxGeometry(SLAB.w, SLAB.h, SLAB.d, 5, 0.045);
  slabGeo.translate(0, SLAB.h / 2, 0);
  const plinthGeo = new RoundedBoxGeometry(SLAB.w + 0.26, 0.12, SLAB.d + 0.34, 3, 0.02);
  plinthGeo.translate(0, 0.06, 0);
  const plinthMat = new THREE.MeshPhysicalMaterial({
    color: 0x0b0d12, metalness: 0.85, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 0.6,
  });
  const slotGeo = new THREE.BoxGeometry(SLAB.w - 0.08, 0.012, SLAB.d - 0.06);
  const numGeo = new THREE.PlaneGeometry(SLAB.w * 0.86, SLAB.w * 0.86 * 2);

  const items = [];
  for (let i = 0; i < COUNT; i++) {
    const group = new THREE.Group();
    rowPos(i, group.position);
    group.rotation.y = ROW_YAW;
    scene.add(group);

    const plinth = new THREE.Mesh(plinthGeo, plinthMat);
    group.add(plinth);

    const pivot = new THREE.Group();
    pivot.position.y = 0.12;
    group.add(pivot);

    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.07,
      transmission: 1,
      thickness: 0.9,
      ior: 1.5,
      dispersion: high ? 4.0 : 0,
      attenuationColor: BLUE.clone(),
      attenuationDistance: 1.1,
      specularIntensity: 1,
      envMapIntensity: 1.25,
      clearcoat: 0.0,
    });
    const slab = new THREE.Mesh(slabGeo, mat);
    pivot.add(slab);

    // glowing light slot in the plinth (seen through the glass bottom, lights the edges)
    const slotMat = new THREE.MeshBasicMaterial({ color: BLUE.clone().multiplyScalar(2), fog: false });
    const slot = new THREE.Mesh(slotGeo, slotMat);
    slot.position.y = 0.121;
    group.add(slot);

    // the numeral: opaque (alpha-to-coverage) plane inside the glass, so refraction bends it
    const numMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: false, alphaTest: high ? 0.35 : 0.25, alphaToCoverage: true, fog: false, side: THREE.FrontSide,
    });
    const num = new THREE.Mesh(numGeo, numMat);
    num.position.set(0, SLAB.h * 0.62, -0.035);
    pivot.add(num);

    items.push({ group, pivot, slab, mat, num, numMat, slotMat, weight: i === 0 ? 1 : 0 });
  }

  // ---------- light cones (volumetric fake) ----------
  const coneGeo = new THREE.ConeGeometry(1.15, 8.2, 64, 1, true);
  coneGeo.translate(0, 8.2 / 2, 0); // base on the floor, apex (light source) at y = 8.2
  const coneMatBase = {
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vW; varying float vY;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vY = position.y / 8.2;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uIntensity, uTime; uniform vec3 uCam;
      varying vec3 vN; varying vec3 vW; varying float vY;
      ${GLSL_NOISE}
      void main() {
        vec3 V = normalize(uCam - vW);
        float facing = abs(dot(normalize(vN), V));
        float core = facing * facing * facing;
        float along = smoothstep(0.0, 0.25, vY) * (0.35 + 0.65 * vY) * (1.0 - smoothstep(0.88, 1.0, vY));
        float dust = 0.7 + 0.6 * fbm(vec2(atan(vW.z, vW.x) * 3.0 + vW.x, vY * 4.0 - uTime * 0.06));
        float a = core * along * dust * uIntensity;
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
  };
  const cones = items.map((it, i) => {
    const mat = new THREE.ShaderMaterial({
      ...coneMatBase,
      uniforms: {
        uColor: { value: BLUE.clone() }, uIntensity: { value: 0.1 }, uTime: { value: 0 }, uCam: { value: new THREE.Vector3() },
      },
    });
    const m = new THREE.Mesh(coneGeo, mat);
    m.position.copy(it.group.position);
    m.renderOrder = 2;
    scene.add(m);
    return m;
  });

  // ---------- active: floor caustic pool ----------
  const poolMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uColor: { value: GOLD.clone() }, uIntensity: { value: 1 }, uTime: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec2 vP;
      void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uIntensity, uTime;
      varying vec2 vP;
      ${GLSL_NOISE}
      float caustic(vec2 p, float t) {
        vec2 q = p;
        float c = 0.0;
        for (int i = 0; i < 3; i++) {
          q += vec2(sin(q.y * 2.1 + t), cos(q.x * 1.9 - t * 0.8)) * 0.35;
          c += 0.02 / abs(sin(q.x * 3.1) * cos(q.y * 2.7) + 0.02);
        }
        return c;
      }
      void main() {
        // vP: plane local (x right, y = -z world)
        float r = length(vP * vec2(1.0, 1.15));
        float pool = exp(-r * r * 0.9);
        // light passing through the slab: a tinted streak cast backward (away from camera)
        vec2 s = vP - vec2(0.0, 0.9);
        float sx = s.x / 0.42, sy = max(s.y, 0.0) / 1.4;
        float streak = exp(-sx * sx) * exp(-sy * sy) * step(-0.9, s.y) * smoothstep(-0.9, -0.2, s.y);
        float cs = caustic(vP * 2.2, uTime * 0.25) ;
        float cmask = exp(-r * r * 1.6);
        float cmask2 = exp(-r * r * 3.5);
        vec3 col = uColor * (pool * 0.45 + streak * 0.4 * (0.85 + 0.15 * min(cs, 2.0)) + cmask2 * min(cs, 2.0) * 0.025);
        gl_FragColor = vec4(col * uIntensity, 1.0);
      }`,
  });
  const poolGeo = new THREE.PlaneGeometry(6, 6);
  const pools = items.map((it) => {
    const m = new THREE.Mesh(poolGeo, poolMat.clone());
    m.rotation.set(-Math.PI / 2, 0, ROW_YAW);
    m.position.copy(it.group.position).setY(0.004);
    m.renderOrder = 1;
    m.visible = false;
    scene.add(m);
    return m;
  });

  // ---------- 'low' quality: no planar reflection; paint a soft mirrored glow of each slab on the floor ----------
  const fakeRefl = high ? [] : items.map((it) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 3.6), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uColor: { value: new THREE.Color() }, uI: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */`
        uniform vec3 uColor; uniform float uI; varying vec2 vUv;
        void main() {
          float x = (vUv.x - 0.5) * 2.0;
          float y = 1.0 - vUv.y; // 0 at the plinth, 1 far toward the camera
          float a = exp(-x * x * 5.0) * (1.0 - x * x) * exp(-y * 2.6) * smoothstep(0.0, 0.05, y) * (1.0 - smoothstep(0.8, 1.0, y));
          gl_FragColor = vec4(uColor * a * uI, 1.0);
        }`,
    }));
    m.renderOrder = 1;
    scene.add(m);
    return m;
  });

  // ---------- active: rising dust ----------
  const DUST = high ? 900 : 260;
  const dGeo = new THREE.BufferGeometry();
  const dPos = new Float32Array(DUST * 3);
  const dRnd = new Float32Array(DUST * 4);
  for (let i = 0; i < DUST; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 1.15;
    dPos[i * 3] = Math.cos(a) * r;
    dPos[i * 3 + 1] = Math.random() * 7.5;
    dPos[i * 3 + 2] = Math.sin(a) * r;
    dRnd[i * 4] = Math.random(); dRnd[i * 4 + 1] = Math.random(); dRnd[i * 4 + 2] = Math.random(); dRnd[i * 4 + 3] = Math.random();
  }
  dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  dGeo.setAttribute('aRnd', new THREE.BufferAttribute(dRnd, 4));
  const dustMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: {
      uTime: { value: 0 }, uColor: { value: GOLD.clone().lerp(new THREE.Color(1, 1, 1), 0.4) }, uIntensity: { value: 1 },
      uPx: { value: 1 },
    },
    vertexShader: /* glsl */`
      attribute vec4 aRnd;
      uniform float uTime, uPx;
      varying float vA;
      void main() {
        vec3 p = position;
        float H = 7.5;
        p.y = mod(p.y + uTime * (0.08 + aRnd.x * 0.12), H);
        p.x += sin(uTime * 0.3 + aRnd.y * 6.28) * 0.12;
        p.z += cos(uTime * 0.27 + aRnd.z * 6.28) * 0.12;
        float rCone = 1.25 * (1.0 - p.y / 8.2);
        float inCone = 1.0 - smoothstep(rCone * 0.6, rCone, length(p.xz));
        float tw = 0.55 + 0.45 * sin(uTime * (1.0 + aRnd.w * 2.0) + aRnd.x * 30.0);
        vA = inCone * tw * smoothstep(0.0, 0.6, p.y) * (1.0 - smoothstep(6.0, 7.5, p.y)) * (0.3 + aRnd.z);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uPx * (0.6 + aRnd.w * 1.6) * (14.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uIntensity;
      varying float vA;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float a = exp(-dot(d, d) * 18.0);
        gl_FragColor = vec4(uColor * a * vA * uIntensity * 2.2, 1.0);
      }`,
  });
  const dust = new THREE.Points(dGeo, dustMat);
  dust.frustumCulled = false;
  dust.renderOrder = 3;
  scene.add(dust);

  // ---------- lights ----------
  const spot = new THREE.SpotLight(0xffe2b8, 120, 14, 0.24, 0.85, 2);
  spot.position.set(0, 8, 0.4);
  scene.add(spot, spot.target);
  const rim = new THREE.DirectionalLight(0x9CC3EA, 0.35);
  rim.position.set(6, 6, -8);
  scene.add(rim);

  // ---------- state ----------
  const state = {
    target: 0, current: 0, explicit: null,
    pointer: new THREE.Vector2(), pointerD: new THREE.Vector2(),
    time: 0,
  };
  const tmpM = new THREE.Vector3();
  const tmpCam = new THREE.Vector3();
  const tmpLook = new THREE.Vector3();
  const haloRay = new THREE.Vector3();
  const tmpN = new THREE.Vector3();
  const goldWhite = new THREE.Color(1.0, 0.86, 0.66);

  function layout(w, h) {
    camera.aspect = w / h;
    if (camera.aspect >= 1) {
      camera.setFocalLength(40);
      camera.filmOffset = -5.2; // lens shift: active monolith sits right of centre
    } else {
      camera.setFocalLength(30);
      camera.filmOffset = 0;
    }
    camera.updateProjectionMatrix();
    dustMat.uniforms.uPx.value = h * renderer.getPixelRatio() / 900 * (camera.aspect >= 1 ? 1 : 0.55);
    const vc = stage.finishPass.uniforms.uVigCenter.value;
    vc.set(camera.aspect >= 1 ? 0.62 : 0.5, 0.5);
  }
  stage.onResize(layout);
  stage.resize();

  function update(dt) {
    const k = reduced ? 1 : 1 - Math.exp(-3.2 * dt);
    const tgt = state.explicit ?? state.target * (COUNT - 1);
    state.current = reduced ? tgt : state.current + (tgt - state.current) * k;
    state.pointerD.x = damp(state.pointerD.x, reduced ? 0 : state.pointer.x, 2.5, dt);
    state.pointerD.y = damp(state.pointerD.y, reduced ? 0 : state.pointer.y, 2.5, dt);
    const a = state.current;
    const time = reduced ? 3.0 : state.time;

    rowPos(a, tmpM);
    const portrait = camera.aspect < 1;
    // camera: 3/4 view from front-left, slight crane with progress
    const lift = Math.sin(clamp01(a / (COUNT - 1)) * Math.PI) * 0.15;
    tmpCam.copy(tmpM).addScaledVector(ROW_T, portrait ? -1.9 : -5.0).addScaledVector(ROW_N, portrait ? 6.4 : 7.0);
    tmpCam.y = 1.55 + lift;
    tmpCam.x += state.pointerD.x * 0.35;
    tmpCam.y += state.pointerD.y * 0.18;
    camera.position.copy(tmpCam);
    tmpLook.copy(tmpM); tmpLook.y = portrait ? 1.15 : 1.25;
    camera.lookAt(tmpLook);

    items.forEach((it, i) => {
      const w = Math.max(0, 1 - Math.abs(a - i));
      const we = w * w * (3 - 2 * w);
      it.weight = we;
      it.mat.attenuationColor.copy(BLUE).lerp(GOLD_GLASS, we);
      it.mat.attenuationDistance = THREE.MathUtils.lerp(1.6, 1.1, we);
      it.mat.envMapIntensity = THREE.MathUtils.lerp(0.9, 1.5, we);
      it.pivot.rotation.y = (portrait ? -0.25 : -0.42) * we;
      // numeral glow: dim cool for inactive, hot gold-white for active
      it.numMat.color.copy(BLUE).multiplyScalar(0.55).lerp(goldWhite.clone().multiplyScalar(5.5), we);
      it.slotMat.color.copy(BLUE).multiplyScalar(1.2).lerp(GOLD.clone().multiplyScalar(6.0), we);
      const cm = cones[i].material.uniforms;
      cm.uColor.value.copy(BLUE).lerp(GOLD.clone().lerp(new THREE.Color(1, 1, 1), 0.35), we);
      cm.uIntensity.value = THREE.MathUtils.lerp(0.035, 0.24, we) * (portrait ? 0.7 : 1);
      cm.uTime.value = time;
      cm.uCam.value.copy(camera.position);
    });

    const nearest = Math.max(0, Math.min(COUNT - 1, Math.round(a)));
    const frac = Math.abs(a - nearest);
    const focus = Math.max(0, 1 - frac * 2); // 1 when centred on a monolith, 0 halfway between
    pools.forEach((pm, i) => {
      const w = items[i].weight;
      pm.visible = w > 0.01;
      pm.material.uniforms.uTime.value = time;
      pm.material.uniforms.uIntensity.value = 1.1 * w * w;
    });
    fakeRefl.forEach((m, i) => {
      const it = items[i];
      // lie flat in front of the plinth, oriented toward the camera
      const ang = Math.atan2(camera.position.x - it.group.position.x, camera.position.z - it.group.position.z);
      m.rotation.set(-Math.PI / 2, 0, 0);
      m.rotation.order = 'YXZ';
      m.rotation.y = ang;
      m.position.copy(it.group.position).setY(0.006);
      m.translateY(-1.95);
      const w = it.weight;
      m.material.uniforms.uColor.value.copy(BLUE).multiplyScalar(0.25).lerp(GOLD, w);
      m.material.uniforms.uI.value = 0.25 + 0.9 * w;
    });
    rowPos(nearest, tmpN);
    dust.position.set(tmpN.x, 0.1, tmpN.z);
    dustMat.uniforms.uTime.value = time + 5.0;
    dustMat.uniforms.uIntensity.value = 0.4 + 0.6 * focus;
    spot.position.copy(tmpN).addScaledVector(ROW_N, 0.9); spot.position.y = 8.2;
    spot.target.position.set(tmpN.x, 1.4, tmpN.z);
    spot.intensity = 60 + 90 * focus;

    floorMat.uniforms.uCam.value.copy(camera.position);
    // halo: where the ray camera -> active monolith hits the back wall
    haloRay.copy(tmpM).setY(1.7).sub(camera.position);
    const denom = haloRay.dot(ROW_N);
    const tHit = (wall.position.clone().sub(camera.position).dot(ROW_N)) / (denom || -1e-3);
    wallMat.uniforms.uHalo.value.copy(camera.position).addScaledVector(haloRay, tHit);
    wallMat.uniforms.uHaloColor.value.setRGB(0.42, 0.33, 0.22).multiplyScalar(0.25 + 0.5 * focus);
  }

  function frame(dt, time) {
    state.time = time;
    update(dt);
    camera.updateMatrixWorld();
    if (reflection) reflection.update(scene, camera, [floor, ...pools]);
    stage.render(dt, time);
  }

  const loop = createLoop(container, frame);
  let disposed = false;
  let envRT = null;

  const assets = createAssets(renderer);
  const ready = (async () => {
    const [studio] = await Promise.all([assets.exr(`${BASE}hdri/studio.exr`), loadFont()]);
    if (disposed) return;
    envRT = buildEnv(renderer, studio);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 1.0;
    items.forEach((it, i) => {
      const t = numeralTexture(i + 1, renderer, !high);
      it.numMat.map = t;
      it.numMat.needsUpdate = true;
    });
    update(1);
    camera.updateMatrixWorld();
    await renderer.compileAsync(scene, camera).catch(() => {});
    if (disposed) return;
    frame(1 / 60, 0);
    state.started = true;
    loop.start();
  })();

  return {
    ready,
    setProgress(p) {
      state.target = clamp01(+p || 0); state.explicit = null;
      if (!state.started) state.current = state.target * (COUNT - 1); // first call snaps (page loaded mid-scroll)
    },
    setActive(i) { state.explicit = i == null ? null : Math.max(0, Math.min(COUNT - 1, +i)); },
    setPointer(x, y) { state.pointer.set(+x || 0, +y || 0); },
    pause() { loop.pause(); },
    resume() { loop.resume(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      loop.dispose();
      reflection?.dispose();
      envRT?.dispose();
      assets.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose();
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        ms.forEach((m) => { m.map?.dispose(); m.dispose(); });
      });
      stage.dispose();
    },
  };
}
