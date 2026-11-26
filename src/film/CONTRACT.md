# Film engine ↔ chapter contract

The film is ONE fixed full-screen canvas with ONE `THREE.WebGLRenderer` (WebGL2), owned by `src/film/engine.js`.
Each chapter is a module that builds its own scene and camera and renders **linear HDR** into a render target that the engine provides.
The engine does all final post-processing: tone mapping, grading, bloom, god rays, flares, DOF, grain, vignette, letterbox, and the transitions between chapters.

## Chapter module API

```js
// src/film/<name>/index.js
export function createChapter(ctx) { ... return chapter; }

ctx = {
  renderer,            // shared THREE.WebGLRenderer. Do NOT change toneMapping, outputColorSpace, autoClear or the size/pixelRatio.
                       // You MAY call renderer.render / setRenderTarget for your own extra passes (e.g. water reflection),
                       // but restore the previous render target afterwards.
  quality,             // 'high' | 'low'
  reduced,             // boolean: prefers-reduced-motion
  base,                // import.meta.env.BASE_URL, e.g. '/' or './'. Build asset URLs as `${base}textures/earth-day-4k.jpg`.
  assets: {            // shared, cached loaders that report progress to the preloader
    texture(url, { colorSpace = 'srgb' | 'linear' }) -> Promise<THREE.Texture>,
    exr(url) -> Promise<THREE.DataTexture>,          // equirectangular, already set to EquirectangularReflectionMapping
    envMap(url) -> Promise<THREE.Texture>,           // PMREM-filtered env map from an .exr, cached
  },
}

chapter = {
  scene,               // THREE.Scene
  camera,              // THREE.PerspectiveCamera (the engine sets its aspect on resize via chapter.resize)
  ready,               // Promise: resolves when all assets have loaded and the shaders have compiled (call renderer.compile)

  update(dt, time, progress, pointer),
                       // progress: this chapter's local progress 0..1 (raw scroll; damp your own camera and values!)
                       // pointer: {x, y} in -1..1 (already damped by the engine)
                       // Called only while the chapter is visible.

  resize(width, height),   // CSS pixels; update camera.aspect and any of your own render targets

  // Optional hints that the engine uses for post FX (read every frame after update):
  getSun?() -> { x, y, visible, intensity }   // sun position in screen UV 0..1 (y up), for god rays and lens flare
  getExposure?() -> number                    // suggested exposure (default 1)
  getFocus?() -> { distance, aperture }       // world-space focus distance for DOF (aperture 0 = off)
  getGrade?() -> { warmth: -1..1, tealShadows: 0..1, saturation: 0..2, contrast: 0..2 }  // per-moment grade hints

  dispose(),
}
```

## Rules
- The output must be **linear HDR**. Do not tone-map, gamma-correct, vignette or add grain yourself. The engine renders your scene into a HalfFloat target with `renderer.toneMapping = NoToneMapping`.
- Lights and emissives can go well above 1.0. Use that so bloom and halation pick them up (lamps 4–20, sun disc 30+).
- All assets go through `ctx.assets`. Never `fetch` from outside the site.
- No global side effects: don't patch `THREE.ShaderChunk`; use `onBeforeCompile` per material.
- Respect `ctx.reduced`: no camera shake or drift, slower ambient motion.
- `quality === 'low'`: half the instance counts, 2k textures, no extra render passes where possible.

## Scroll timeline (engine)
The film section is `#film` (about 900vh tall, sticky canvas). Global film progress `F` (0..1) maps to chapters:

| F range | Chapter | Local progress |
|---|---|---|
| 0.00 – 0.42 | `orbit` | (F - 0.00) / 0.42 |
| 0.36 – 0.46 | transition (cloud dive) | both chapters render; the engine blends them with a cloud/noise dissolve |
| 0.40 – 1.00 | `river` | (F - 0.40) / 0.60 |

So orbit's last ~15% (local progress 0.85–1) should already be diving into bright, sunlit clouds over the Nile Delta, and river's first ~10% (local 0–0.1) should start inside thick morning mist and clear out.
