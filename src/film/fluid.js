import * as THREE from 'three';

/**
 * Liquid light: a small stable-fluids solver (Stam / GPU Gems 38 style) that runs at low resolution
 * under the film. The engine reads `velocity` (refraction offset of the frame) and `dye` (warm glow).
 *
 * createFluid(renderer, { quality }) -> {
 *   velocity: THREE.Texture, dye: THREE.Texture, texel: THREE.Vector2,
 *   resize(aspect), splat(x0, y0, x1, y1, dt) (uv 0..1, y up), step(dt) -> energy 0..1, dispose()
 * }
 * Units: velocity is in sim texels / second. A fast swipe peaks around a few hundred.
 */

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// neighbour sampling helper (texel offsets). Clamp-to-edge wrapping gives free-slip-ish borders.
const NB = /* glsl */`
  uniform vec2 uTexel;
  varying vec2 vUv;
  #define L(t) texture2D(t, vUv - vec2(uTexel.x, 0.0))
  #define R(t) texture2D(t, vUv + vec2(uTexel.x, 0.0))
  #define B(t) texture2D(t, vUv - vec2(0.0, uTexel.y))
  #define T(t) texture2D(t, vUv + vec2(0.0, uTexel.y))
`;

const FRAG = {
  splat: /* glsl */`
    uniform sampler2D uTarget; uniform vec2 uA, uB; uniform vec3 uValue; uniform float uRadius, uAspect;
    varying vec2 vUv;
    void main() {
      // capsule (segment) splat so a fast cursor leaves a continuous stroke, not a string of beads
      vec2 p = vUv * vec2(uAspect, 1.0), a = uA * vec2(uAspect, 1.0), b = uB * vec2(uAspect, 1.0);
      vec2 ab = b - a; float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
      float d = length(p - a - ab * h);
      float w = exp(-d * d / uRadius);
      gl_FragColor = vec4(texture2D(uTarget, vUv).xyz + uValue * w, 1.0);
    }`,
  advect: /* glsl */`
    uniform sampler2D uVelocity, uSource; uniform vec2 uTexel; uniform float uDt, uDissipation;
    varying vec2 vUv;
    void main() {
      vec2 coord = vUv - uDt * texture2D(uVelocity, vUv).xy * uTexel;
      vec4 r = texture2D(uSource, coord);
      gl_FragColor = r / (1.0 + uDissipation * uDt);
    }`,
  curl: /* glsl */`
    uniform sampler2D uVelocity; ${NB}
    void main() {
      float c = R(uVelocity).y - L(uVelocity).y - T(uVelocity).x + B(uVelocity).x;
      gl_FragColor = vec4(0.5 * c, 0.0, 0.0, 1.0);
    }`,
  vorticity: /* glsl */`
    uniform sampler2D uVelocity, uCurl; uniform float uCurlK, uDt; ${NB}
    void main() {
      float l = L(uCurl).x, r = R(uCurl).x, b = B(uCurl).x, t = T(uCurl).x, c = texture2D(uCurl, vUv).x;
      vec2 f = 0.5 * vec2(abs(t) - abs(b), abs(r) - abs(l));
      f /= length(f) + 1e-4;
      f *= uCurlK * c; f.y *= -1.0;
      vec2 v = texture2D(uVelocity, vUv).xy + f * uDt;
      gl_FragColor = vec4(clamp(v, -1000.0, 1000.0), 0.0, 1.0);
    }`,
  divergence: /* glsl */`
    uniform sampler2D uVelocity; ${NB}
    void main() {
      float l = L(uVelocity).x, r = R(uVelocity).x, b = B(uVelocity).y, t = T(uVelocity).y;
      vec2 c = texture2D(uVelocity, vUv).xy;
      // reflective walls
      if (vUv.x - uTexel.x < 0.0) l = -c.x;
      if (vUv.x + uTexel.x > 1.0) r = -c.x;
      if (vUv.y - uTexel.y < 0.0) b = -c.y;
      if (vUv.y + uTexel.y > 1.0) t = -c.y;
      gl_FragColor = vec4(0.5 * (r - l + t - b), 0.0, 0.0, 1.0);
    }`,
  scale: /* glsl */`
    uniform sampler2D uSource; uniform float uK; varying vec2 vUv;
    void main() { gl_FragColor = texture2D(uSource, vUv) * uK; }`,
  pressure: /* glsl */`
    uniform sampler2D uPressure, uDivergence; ${NB}
    void main() {
      float p = L(uPressure).x + R(uPressure).x + B(uPressure).x + T(uPressure).x;
      gl_FragColor = vec4(0.25 * (p - texture2D(uDivergence, vUv).x), 0.0, 0.0, 1.0);
    }`,
  gradient: /* glsl */`
    uniform sampler2D uPressure, uVelocity; ${NB}
    void main() {
      vec2 v = texture2D(uVelocity, vUv).xy - vec2(R(uPressure).x - L(uPressure).x, T(uPressure).x - B(uPressure).x);
      gl_FragColor = vec4(v, 0.0, 1.0);
    }`,
};

export function createFluid(renderer, { quality = 'high' } = {}) {
  const hi = quality === 'high';
  const SIM = hi ? 128 : 72; // short side, in texels
  const DYE = hi ? 256 : 128;
  const ITER = hi ? 16 : 10;

  const opts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping };
  const optsN = { ...opts, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
  const pair = (o) => {
    const p = { a: new THREE.WebGLRenderTarget(1, 1, o), b: new THREE.WebGLRenderTarget(1, 1, o) };
    p.swap = () => { const t = p.a; p.a = p.b; p.b = t; };
    p.setSize = (w, h) => { p.a.setSize(w, h); p.b.setSize(w, h); };
    p.dispose = () => { p.a.dispose(); p.b.dispose(); };
    return p;
  };
  const vel = pair(opts), dye = pair(opts), prs = pair(optsN);
  const div = new THREE.WebGLRenderTarget(1, 1, optsN), crl = new THREE.WebGLRenderTarget(1, 1, optsN);

  const simTexel = new THREE.Vector2(1, 1), dyeTexel = new THREE.Vector2(1, 1);
  const mk = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, blending: THREE.NoBlending });
  const M = {
    splat: mk(FRAG.splat, { uTarget: { value: null }, uA: { value: new THREE.Vector2() }, uB: { value: new THREE.Vector2() }, uValue: { value: new THREE.Vector3() }, uRadius: { value: 1e-3 }, uAspect: { value: 1 } }),
    advect: mk(FRAG.advect, { uVelocity: { value: null }, uSource: { value: null }, uTexel: { value: simTexel }, uDt: { value: 0 }, uDissipation: { value: 0 } }),
    curl: mk(FRAG.curl, { uVelocity: { value: null }, uTexel: { value: simTexel } }),
    vorticity: mk(FRAG.vorticity, { uVelocity: { value: null }, uCurl: { value: null }, uCurlK: { value: hi ? 26 : 18 }, uDt: { value: 0 }, uTexel: { value: simTexel } }),
    divergence: mk(FRAG.divergence, { uVelocity: { value: null }, uTexel: { value: simTexel } }),
    scale: mk(FRAG.scale, { uSource: { value: null }, uK: { value: 0.8 } }),
    pressure: mk(FRAG.pressure, { uPressure: { value: null }, uDivergence: { value: null }, uTexel: { value: simTexel } }),
    gradient: mk(FRAG.gradient, { uPressure: { value: null }, uVelocity: { value: null }, uTexel: { value: simTexel } }),
  };
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  const scene = new THREE.Scene(); scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const run = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); renderer.render(scene, cam); };

  let aspect = 1;
  let energy = 0; // rough estimate of how much is still moving (0 = idle, the sim and post can early-out)
  let pending = [];

  function resize(a) {
    aspect = Math.max(0.2, a || 1);
    const sz = (n) => (aspect >= 1 ? [Math.round(n * aspect), n] : [n, Math.round(n / aspect)]);
    const [sw, sh] = sz(SIM), [dw, dh] = sz(DYE);
    vel.setSize(sw, sh); prs.setSize(sw, sh); div.setSize(sw, sh); crl.setSize(sw, sh); dye.setSize(dw, dh);
    simTexel.set(1 / sw, 1 / sh); dyeTexel.set(1 / dw, 1 / dh);
    M.splat.uniforms.uAspect.value = aspect;
    clear();
  }
  function clear() {
    const prev = renderer.getRenderTarget();
    const cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    for (const t of [vel.a, vel.b, dye.a, dye.b, prs.a, prs.b, div, crl]) { renderer.setRenderTarget(t); renderer.clear(); }
    renderer.setClearColor(cc, ca);
    renderer.setRenderTarget(prev);
    energy = 0;
  }

  /** queue a stroke from (x0,y0) to (x1,y1) in uv (y up) that took dt seconds */
  function splat(x0, y0, x1, y1, dt) {
    pending.push([x0, y0, x1, y1, Math.max(dt, 1 / 240)]);
  }

  function applySplats() {
    const su = M.splat.uniforms;
    for (const [x0, y0, x1, y1, dt] of pending) {
      const dx = x1 - x0, dy = y1 - y0;
      const speed = Math.hypot(dx * aspect, dy) / dt; // screen heights / s
      if (speed < 0.02) continue;
      // velocity in sim texels/s; soft-limited so a flick does not tear the frame apart
      const lim = Math.min(1, 2.6 / speed);
      const vx = (dx / dt) / simTexel.x * lim * 0.55, vy = (dy / dt) / simTexel.y * lim * 0.55;
      su.uA.value.set(x0, y0); su.uB.value.set(x1, y1);
      su.uRadius.value = (hi ? 0.0011 : 0.0016) * (1 + Math.min(speed, 3) * 0.35);
      su.uTarget.value = vel.a.texture; su.uValue.value.set(vx, vy, 0);
      run(M.splat, vel.b); vel.swap();
      // dye: amount grows with speed but saturates (slow drags still glow a little)
      const amt = 0.16 + 0.44 * Math.min(1, speed / 2.2);
      su.uRadius.value *= 0.8;
      su.uTarget.value = dye.a.texture; su.uValue.value.set(amt, amt * 0.5, 0);
      run(M.splat, dye.b); dye.swap();
      energy = Math.min(1, energy + 0.6 + speed * 0.2);
    }
    pending = [];
  }

  /** one simulation step. Returns energy (0 = idle: nothing left to show). */
  function step(dt) {
    if (!pending.length && energy < 0.002) return 0;
    const prev = renderer.getRenderTarget();
    const ac = renderer.autoClear; renderer.autoClear = false;
    dt = Math.min(dt, 1 / 30);

    applySplats();

    M.curl.uniforms.uVelocity.value = vel.a.texture; run(M.curl, crl);
    M.vorticity.uniforms.uVelocity.value = vel.a.texture; M.vorticity.uniforms.uCurl.value = crl.texture; M.vorticity.uniforms.uDt.value = dt;
    run(M.vorticity, vel.b); vel.swap();
    M.divergence.uniforms.uVelocity.value = vel.a.texture; run(M.divergence, div);
    M.scale.uniforms.uSource.value = prs.a.texture; run(M.scale, prs.b); prs.swap();
    M.pressure.uniforms.uDivergence.value = div.texture;
    for (let i = 0; i < ITER; i++) { M.pressure.uniforms.uPressure.value = prs.a.texture; run(M.pressure, prs.b); prs.swap(); }
    M.gradient.uniforms.uPressure.value = prs.a.texture; M.gradient.uniforms.uVelocity.value = vel.a.texture;
    run(M.gradient, vel.b); vel.swap();

    const au = M.advect.uniforms;
    au.uDt.value = dt;
    // ~1.5 s to fade: velocity loses ~95% in 1.6 s, dye slightly faster so the glow never lingers as a stain
    au.uTexel.value = simTexel; au.uVelocity.value = vel.a.texture; au.uSource.value = vel.a.texture; au.uDissipation.value = 1.9;
    run(M.advect, vel.b); vel.swap();
    au.uVelocity.value = vel.a.texture; au.uSource.value = dye.a.texture; au.uDissipation.value = 2.4;
    run(M.advect, dye.b); dye.swap();

    renderer.autoClear = ac;
    renderer.setRenderTarget(prev);
    energy *= Math.exp(-dt * 2.0);
    if (energy < 0.002) clear();
    return energy;
  }

  resize(1);

  return {
    get velocity() { return vel.a.texture; },
    get dye() { return dye.a.texture; },
    get energy() { return energy; },
    texel: simTexel, dyeTexel,
    resize, splat, step, clear,
    dispose() {
      vel.dispose(); dye.dispose(); prs.dispose(); div.dispose(); crl.dispose();
      for (const m of Object.values(M)) m.dispose();
      quad.geometry.dispose();
    },
  };
}
