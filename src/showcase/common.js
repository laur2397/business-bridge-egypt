// Shared stage for the showcase scenes (monoliths, bridge build).
// Own renderer + HDR composer (MSAA) + bloom + ACES output + film finish (grain, vignette, dither).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export const BASE = (import.meta.env && import.meta.env.BASE_URL) || '/';

export function assertWebGL2() {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2');
  if (!gl) throw new Error('WebGL2 is required for this showcase scene');
  gl.getExtension('WEBGL_lose_context')?.loseContext();
}

export const damp = (a, b, lambda, dt) => THREE.MathUtils.lerp(a, b, 1 - Math.exp(-lambda * dt));
export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t, s = 1.2) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);

// Film finish: runs after OutputPass (display-referred). Vignette, animated grain, ordered dither (kills banding),
// a whisper of chromatic aberration at the edges and lifted blacks toward deep navy.
const FinishShader = {
  name: 'ShowcaseFinish',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uVignette: { value: 0.55 },
    uGrain: { value: 0.045 },
    uCA: { value: 0.0018 },
    uLift: { value: new THREE.Vector3(5 / 255, 11 / 255, 26 / 255) },
    uVigCenter: { value: new THREE.Vector2(0.5, 0.5) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain, uCA;
    uniform vec2 uRes, uVigCenter;
    uniform vec3 uLift;
    varying vec2 vUv;
    float hash(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 off = d * r2 * uCA * 4.0;
      vec3 c;
      c.r = texture2D(tDiffuse, vUv - off).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv + off).b;
      // vignette (elliptical, aspect aware), centred slightly off when the composition asks for it
      vec2 vd = (vUv - uVigCenter) * vec2(uRes.x / uRes.y, 1.0) * 0.82;
      float vig = 1.0 - uVignette * smoothstep(0.25, 1.05, length(vd));
      c *= vig;
      // lifted blacks toward the brand night (film toe)
      c = c + uLift * 0.55 * (1.0 - smoothstep(0.0, 0.18, c));
      // grain: luminance-weighted, animated
      float t = floor(uTime * 24.0);
      float g = hash(vec3(gl_FragCoord.xy, t)) + hash(vec3(gl_FragCoord.xy + 17.0, t + 3.0)) - 1.0;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c += g * uGrain * (0.35 + 0.65 * (1.0 - l)) * (0.25 + l * 1.2);
      // triangular dither at 8-bit
      float dn = hash(vec3(gl_FragCoord.xy, t + 7.0)) - hash(vec3(gl_FragCoord.yx + 3.1, t + 11.0));
      c += dn / 255.0;
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }
  `,
};

/**
 * createStage(container, { quality, exposure, bloom })
 * -> { renderer, canvas, composer, bloomPass, finishPass, size, setScene(scene, camera), render(dt), onResize(cb), dispose() }
 */
export function createStage(container, { quality = 'high', exposure = 1, bloom = {}, clearColor = 0x050B1A } = {}) {
  assertWebGL2();
  const high = quality !== 'low';

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
  canvas.setAttribute('aria-hidden', 'true');
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  container.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance',
  });
  const dpr = high ? Math.min(window.devicePixelRatio || 1, 1.75) : 1;
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(clearColor, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (!high) renderer.transmissionResolutionScale = 0.75;

  const rt = new THREE.WebGLRenderTarget(2, 2, {
    type: THREE.HalfFloatType,
    samples: high ? 4 : 0,
    colorSpace: THREE.LinearSRGBColorSpace,
  });
  const composer = new EffectComposer(renderer, rt);
  const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
  composer.addPass(renderPass);
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256),
    bloom.strength ?? 0.55, bloom.radius ?? 0.6, bloom.threshold ?? 1.0);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  const finishPass = new ShaderPass(FinishShader);
  composer.addPass(finishPass);

  const size = { w: 1, h: 1 };
  const resizeCbs = [];
  function resize() {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    if (w === size.w && h === size.h) return;
    size.w = w; size.h = h;
    renderer.setSize(w, h, false);
    composer.setPixelRatio(dpr);
    composer.setSize(w, h);
    // bloom at reduced resolution (cheaper, softer)
    bloomPass.setSize(Math.round(w * dpr * (high ? 0.5 : 0.35)), Math.round(h * dpr * (high ? 0.5 : 0.35)));
    finishPass.uniforms.uRes.value.set(w * dpr, h * dpr);
    resizeCbs.forEach((cb) => cb(w, h));
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  return {
    renderer, canvas, composer, bloomPass, finishPass, size, high,
    setScene(scene, camera) { renderPass.scene = scene; renderPass.camera = camera; },
    resize() { size.w = 0; resize(); },
    onResize(cb) { resizeCbs.push(cb); },
    render(dt, time) {
      finishPass.uniforms.uTime.value = time;
      composer.render(dt);
    },
    dispose() {
      ro.disconnect();
      composer.dispose?.();
      rt.dispose();
      bloomPass.dispose?.();
      renderer.dispose();
      renderer.forceContextLoss?.();
      canvas.remove();
    },
  };
}

/**
 * Animation loop with visibility handling: pauses offscreen (IntersectionObserver), on hidden tab, and on pause().
 */
export function createLoop(container, tick) {
  let raf = 0;
  let last = 0;
  let onscreen = true;
  let manualPause = false;
  let running = false;
  const t0 = performance.now();

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    tick(dt, (now - t0) / 1000);
  }
  function evaluate() {
    const should = onscreen && !manualPause && !document.hidden;
    if (should && !running) { running = true; last = 0; raf = requestAnimationFrame(frame); }
    else if (!should && running) { running = false; cancelAnimationFrame(raf); }
  }
  const io = new IntersectionObserver((entries) => {
    onscreen = entries[entries.length - 1].isIntersecting;
    evaluate();
  }, { rootMargin: '100px' });
  io.observe(container);
  const onVis = () => evaluate();
  document.addEventListener('visibilitychange', onVis);

  return {
    start() { evaluate(); },
    pause() { manualPause = true; evaluate(); },
    resume() { manualPause = false; evaluate(); },
    get running() { return running; },
    dispose() { io.disconnect(); document.removeEventListener('visibilitychange', onVis); cancelAnimationFrame(raf); running = false; },
  };
}

export function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Planar reflection for a horizontal plane y = height. Renders the scene mirrored into a mip-mapped HDR target
 * (mips are used for cheap roughness blur in the receiving shader).
 */
export function createPlanarReflection(renderer, { height = 0, scale = 0.5, clipBias = 0.003 } = {}) {
  const rt = new THREE.WebGLRenderTarget(2, 2, {
    type: THREE.HalfFloatType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    colorSpace: THREE.LinearSRGBColorSpace,
  });
  const textureMatrix = new THREE.Matrix4();
  const cam = new THREE.PerspectiveCamera();
  const normal = new THREE.Vector3(0, 1, 0);
  const planePos = new THREE.Vector3(0, height, 0);
  const camPos = new THREE.Vector3();
  const view = new THREE.Vector3();
  const look = new THREE.Vector3();
  const target = new THREE.Vector3();
  const rot = new THREE.Matrix4();
  const plane = new THREE.Plane();
  const clip = new THREE.Vector4();
  const q = new THREE.Vector4();
  const tmpSize = new THREE.Vector2();
  const planeMatrix = new THREE.Matrix4(); // plane local == world for our usage

  return {
    texture: rt.texture,
    textureMatrix,
    update(scene, camera, hidden = []) {
      renderer.getDrawingBufferSize(tmpSize);
      const w = Math.max(2, Math.round(tmpSize.x * scale));
      const h = Math.max(2, Math.round(tmpSize.y * scale));
      if (rt.width !== w || rt.height !== h) rt.setSize(w, h);

      camPos.setFromMatrixPosition(camera.matrixWorld);
      view.subVectors(planePos, camPos);
      view.reflect(normal).negate().add(planePos);
      rot.extractRotation(camera.matrixWorld);
      look.set(0, 0, -1).applyMatrix4(rot).add(camPos);
      target.subVectors(planePos, look).reflect(normal).negate().add(planePos);

      cam.position.copy(view);
      cam.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal);
      cam.lookAt(target);
      cam.far = camera.far;
      cam.near = camera.near;
      cam.updateMatrixWorld();
      cam.projectionMatrix.copy(camera.projectionMatrix);
      cam.projectionMatrix.elements[8] *= -1;
      cam.projectionMatrix.elements[12] *= -1;

      textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
      textureMatrix.multiply(cam.projectionMatrix);
      textureMatrix.multiply(cam.matrixWorldInverse);
      textureMatrix.multiply(planeMatrix);

      plane.setFromNormalAndCoplanarPoint(normal, planePos);
      plane.applyMatrix4(cam.matrixWorldInverse);
      clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
      const pm = cam.projectionMatrix;
      q.x = (Math.sign(clip.x) + pm.elements[8]) / pm.elements[0];
      q.y = (Math.sign(clip.y) + pm.elements[9]) / pm.elements[5];
      q.z = -1.0;
      q.w = (1.0 + pm.elements[10]) / pm.elements[14];
      clip.multiplyScalar(2.0 / clip.dot(q));
      pm.elements[2] = clip.x;
      pm.elements[6] = clip.y;
      pm.elements[10] = clip.z + 1.0 - clipBias;
      pm.elements[14] = clip.w;
      cam.projectionMatrixInverse.copy(pm).invert();

      const vis = hidden.map((o) => o.visible);
      hidden.forEach((o) => { o.visible = false; });
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(rt);
      renderer.state.buffers.depth.setMask(true);
      renderer.clear();
      renderer.render(scene, cam);
      renderer.setRenderTarget(prev);
      hidden.forEach((o, i) => { o.visible = vis[i]; });
    },
    dispose() { rt.dispose(); },
  };
}

// Shared GLSL helpers
export const GLSL_NOISE = /* glsl */`
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`;

/** Vertical gradient backdrop sphere (deep night at horizon, black above/below). */
export function createBackdrop({ radius = 400, horizon = 0x050B1A, top = 0x000000, glow = 0x0c1a33, glowStrength = 0.6 } = {}) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uHorizon: { value: new THREE.Color(horizon) },
      uTop: { value: new THREE.Color(top) },
      uGlow: { value: new THREE.Color(glow) },
      uGlowStrength: { value: glowStrength },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uHorizon, uTop, uGlow; uniform float uGlowStrength;
      varying vec3 vDir;
      void main() {
        float y = vDir.y;
        vec3 c = mix(uHorizon, uTop, smoothstep(0.0, 0.45, abs(y)));
        c += uGlow * uGlowStrength * exp(-abs(y) * 14.0);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}
