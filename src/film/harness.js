import * as THREE from 'three';
import { createAssets } from './assets.js';

/**
 * Minimal test harness for a single chapter (development only).
 * It mimics the engine: the chapter renders linear HDR into a HalfFloat target,
 * then a simple pass applies exposure, ACES Filmic and sRGB output.
 * The real engine adds bloom, flares, DOF, grading, grain and so on — so keep your chapter
 * honest HDR and let highlights go above 1.0.
 *
 * Usage (in a test html):
 *   import { runHarness } from '/src/film/harness.js';
 *   import { createChapter } from '/src/film/orbit/index.js';
 *   runHarness(createChapter, { name: 'orbit' });
 * URL params: ?p=0.5 (progress) &q=low &noui &reduced
 */
export async function runHarness(createChapter, { name = 'chapter' } = {}) {
  const params = new URLSearchParams(location.search);
  const quality = params.get('q') === 'low' ? 'low' : 'high';
  const reduced = params.has('reduced');
  let progress = parseFloat(params.get('p') || '0');
  let label = null;

  document.body.style.cssText = 'margin:0;background:#000;overflow:hidden';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block';
  document.body.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'high' ? 1.5 : 1));
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

  const assets = createAssets(renderer, { onProgress: (l, t) => { if (label) label.textContent = `${name} — assets ${l}/${t}`; } });
  const ctx = { renderer, quality, reduced, base: import.meta.env.BASE_URL, assets };

  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: quality === 'high' ? 4 : 0 });
  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: rt.texture }, uExposure: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float uExposure; varying vec2 vUv;
        vec3 aces(vec3 x){ x*=0.6; return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.,1.); }
        vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c,vec3(1./2.4))-0.055, step(0.0031308,c)); }
        void main(){ vec3 c = texture2D(tDiffuse,vUv).rgb*uExposure; gl_FragColor = vec4(toSRGB(aces(c)),1.); }`,
      depthTest: false, depthWrite: false,
    }),
  );
  const postScene = new THREE.Scene(); postScene.add(quad);
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const chapter = createChapter(ctx);
  const resize = () => {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    const pr = renderer.getPixelRatio();
    rt.setSize(Math.floor(w * pr), Math.floor(h * pr));
    chapter.resize(w, h);
  };
  addEventListener('resize', resize);
  resize();

  if (!params.has('noui')) {
    const ui = document.createElement('div');
    ui.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;display:flex;gap:12px;align-items:center;font:12px system-ui;color:#fff;z-index:9';
    ui.innerHTML = `<span id="lbl"></span><input id="rng" type="range" min="0" max="1" step="0.001" value="${progress}" style="flex:1"><span id="val"></span>`;
    document.body.appendChild(ui);
    label = ui.querySelector('#lbl');
    const rng = ui.querySelector('#rng'); const val = ui.querySelector('#val');
    rng.oninput = () => { progress = parseFloat(rng.value); val.textContent = progress.toFixed(3); };
    val.textContent = progress.toFixed(3);
  }
  const pointer = { x: 0, y: 0 };
  addEventListener('pointermove', (e) => { pointer.x = (e.clientX / innerWidth) * 2 - 1; pointer.y = (e.clientY / innerHeight) * 2 - 1; });

  window.__chapter = chapter;
  window.__setProgress = (p) => { progress = p; };
  await chapter.ready;
  window.__ready = true;

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    chapter.update(dt, clock.elapsedTime, progress, pointer);
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(chapter.scene, chapter.camera);
    renderer.setRenderTarget(null);
    quad.material.uniforms.uExposure.value = chapter.getExposure?.() ?? 1;
    renderer.render(postScene, postCam);
  });
}
