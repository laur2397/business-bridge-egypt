import * as THREE from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

/**
 * Shared, cached asset loaders with aggregated progress.
 * createAssets(renderer, { onProgress(loaded, total) })
 */
export function createAssets(renderer, { onProgress } = {}) {
  const texLoader = new THREE.TextureLoader();
  const exrLoader = new EXRLoader();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const cache = new Map();
  let total = 0;
  let loaded = 0;
  const bump = () => onProgress?.(loaded, total);

  const track = (key, factory) => {
    if (cache.has(key)) return cache.get(key);
    total++;
    bump();
    const p = factory().then(
      (v) => { loaded++; bump(); return v; },
      (e) => { loaded++; bump(); throw e; },
    );
    cache.set(key, p);
    return p;
  };

  return {
    texture(url, { colorSpace = 'srgb' } = {}) {
      return track(`tex:${url}:${colorSpace}`, () => new Promise((resolve, reject) => {
        texLoader.load(url, (t) => {
          t.colorSpace = colorSpace === 'srgb' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          resolve(t);
        }, undefined, reject);
      }));
    },
    exr(url) {
      return track(`exr:${url}`, () => new Promise((resolve, reject) => {
        exrLoader.load(url, (t) => { t.mapping = THREE.EquirectangularReflectionMapping; resolve(t); }, undefined, reject);
      }));
    },
    envMap(url) {
      return track(`env:${url}`, () => this.exr(url).then((t) => pmrem.fromEquirectangular(t).texture));
    },
    get progress() { return total ? loaded / total : 1; },
    dispose() { pmrem.dispose(); },
  };
}
