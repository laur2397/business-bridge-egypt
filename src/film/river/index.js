// Chapters III "Raul" / IV "Podul" / V "Act" — one continuous camera move over the Nile at Cairo.
//   0.00-0.10  inside warm morning vapour that parts like a curtain; dawn, sun just risen
//   0.10-0.45  The River: low glide (1-3 m) over the water past feluccas, egrets, mist banks, god rays
//   0.45-0.75  The Bridge: crane up past the pylon and the stay-cable fan; golden hour -> sunset -> blue hour,
//              lights cascade on (deck lamps, pylon uplights, cars, windows, Cairo Tower)
//   0.75-1.00  Act: blue hour / night, camera settles on a wide frame with calm sky (upper centre) for the title
// Output is linear HDR; the engine does tone mapping and all post.
import {
  Color, DirectionalLight, HemisphereLight, Matrix3, PerspectiveCamera, PMREMGenerator, Scene, Vector3, Mesh,
} from 'three';
import { createAtmosUniforms } from './atmos.js';
import { createSky, evalSky } from './sky.js';
import { createWater, createMirror, MAX_BOATS } from './water.js';
import { createWaterNormals } from './textures.js';
import { createBridge } from './bridge.js';
import { createCity } from './city.js';
import { createFeluccas } from './felucca.js';
import { createBirds } from './birds.js';
import { createMistSheets, createMistCurtain } from './mist.js';
import { createStars, createDust } from './lights.js';
import { DEG, clamp, lerp, ss, sampleKeys, hermiteKeys, dampK, noise1 } from './util.js';

// ---------------- time of day (keyed on local progress) ----------------
// elev/az in degrees (az: 0 = straight down the river (-Z), + = right); colours linear.
const TOD = [
  { p: 0.00, elev: 1.4, az: 13, turb: 5, ray: 1.4, mie: 0.005, mieG: 0.87, night: 0, day: 1, glow: 0.25, belt: [0, 0, 0], sunI: 5, sunC: [1.0, 0.62, 0.36], disc: 40, fog: 0.0045, fall: 0.07, aerial: 0.00026, mieK: 1.3, sheet: 1.3, curtain: 1, exp: 0.6, cloud: 0.2, cloudLit: [1.2, 0.75, 0.5], cloudSh: [0.35, 0.3, 0.32], gain: 1.0 },
  { p: 0.10, elev: 2.0, az: 13.5, turb: 4.8, ray: 1.5, mie: 0.0036, mieG: 0.87, night: 0, day: 1, glow: 0.22, belt: [0, 0, 0], sunI: 6.5, sunC: [1.0, 0.64, 0.38], disc: 45, fog: 0.0024, fall: 0.06, aerial: 0.00022, mieK: 1.2, sheet: 1.1, curtain: 0, exp: 0.56, cloud: 0.22, cloudLit: [1.3, 0.8, 0.55], cloudSh: [0.35, 0.3, 0.32], gain: 1.0 },
  { p: 0.28, elev: 3.8, az: 14.5, turb: 4.6, ray: 1.6, mie: 0.0036, mieG: 0.87, night: 0, day: 1, glow: 0.15, belt: [0, 0, 0], sunI: 8.5, sunC: [1.0, 0.7, 0.45], disc: 50, fog: 0.001, fall: 0.05, aerial: 0.0002, mieK: 1.0, sheet: 0.65, curtain: 0, exp: 0.6, cloud: 0.25, cloudLit: [1.5, 1.0, 0.72], cloudSh: [0.4, 0.37, 0.38], gain: 1.0 },
  { p: 0.45, elev: 4.2, az: 16, turb: 4.8, ray: 1.8, mie: 0.0036, mieG: 0.87, night: 0, day: 1, glow: 0.2, belt: [0, 0, 0], sunI: 9, sunC: [1.0, 0.68, 0.42], disc: 50, fog: 0.0008, fall: 0.045, aerial: 0.00018, mieK: 0.9, sheet: 0.4, curtain: 0, exp: 0.66, cloud: 0.28, cloudLit: [1.5, 0.95, 0.65], cloudSh: [0.4, 0.36, 0.38], gain: 1.0 },
  { p: 0.55, elev: 2.0, az: 17.5, turb: 5.5, ray: 2.2, mie: 0.0036, mieG: 0.87, night: 0, day: 1, glow: 0.45, belt: [0, 0, 0], sunI: 7, sunC: [1.0, 0.62, 0.38], disc: 45, fog: 0.0008, fall: 0.045, aerial: 0.00018, mieK: 1.0, sheet: 0.15, curtain: 0, exp: 0.8, cloud: 0.22, cloudLit: [1.6, 0.75, 0.4], cloudSh: [0.35, 0.28, 0.3], gain: 1.0 },
  { p: 0.63, elev: 0.1, az: 18.5, turb: 7, ray: 2.6, mie: 0.006, mieG: 0.8, night: 0.08, day: 1, glow: 0.85, belt: [0.02, 0.008, 0.012], sunI: 3.5, sunC: [1.0, 0.5, 0.26], disc: 30, fog: 0.0008, fall: 0.045, aerial: 0.0002, mieK: 1.0, sheet: 0.05, curtain: 0, exp: 1.05, cloud: 0.24, cloudLit: [1.5, 0.5, 0.25], cloudSh: [0.22, 0.16, 0.2], gain: 1.15 },
  { p: 0.70, elev: -2.5, az: 19.5, turb: 6, ray: 3.0, mie: 0.005, mieG: 0.78, night: 0.4, day: 0.85, glow: 0.7, belt: [0.03, 0.012, 0.02], sunI: 0.0, sunC: [1.0, 0.35, 0.15], disc: 0, fog: 0.0007, fall: 0.045, aerial: 0.0002, mieK: 0.6, sheet: 0.0, curtain: 0, exp: 1.9, cloud: 0.3, cloudLit: [0.5, 0.18, 0.12], cloudSh: [0.06, 0.05, 0.08], gain: 1.3 },
  { p: 0.80, elev: -5.5, az: 20.5, turb: 5, ray: 3.0, mie: 0.004, mieG: 0.76, night: 0.85, day: 0.3, glow: 0.35, belt: [0.008, 0.004, 0.008], sunI: 0.0, sunC: [0.9, 0.3, 0.15], disc: 0, fog: 0.00065, fall: 0.045, aerial: 0.00022, mieK: 0.25, sheet: 0, curtain: 0, exp: 2.6, cloud: 0.26, cloudLit: [0.12, 0.06, 0.07], cloudSh: [0.02, 0.022, 0.035], gain: 1.3 },
  { p: 1.00, elev: -10, az: 22, turb: 4, ray: 3.0, mie: 0.003, mieG: 0.76, night: 1.0, day: 0.035, glow: 0.12, belt: [0, 0, 0], sunI: 0.0, sunC: [0.8, 0.3, 0.2], disc: 0, fog: 0.0006, fall: 0.045, aerial: 0.00024, mieK: 0.1, sheet: 0, curtain: 0, exp: 3.0, cloud: 0.22, cloudLit: [0.03, 0.03, 0.045], cloudSh: [0.012, 0.014, 0.024], gain: 1.3 },
];

// ---------------- camera path ----------------
// pos / target keyed on progress (non-uniform Hermite), fov in degrees, roll in degrees.
// 'L' keys are in bridge-local coordinates (deck along X, +Z = downstream side, toward the start).
const CAM_DEF = [
  { p: 0.00, v: [6, 3.0, 470, 22, 9, -500, 34, 0] },
  { p: 0.10, v: [4, 2.6, 395, 20, 8, -500, 34, 0] },
  { p: 0.20, v: [-2, 2.0, 280, 12, 7, -500, 34, -0.4] },
  { p: 0.30, v: [2, 1.7, 150, 14, 7, -520, 34, 0.3] },
  { p: 0.40, v: [14, 2.6, -60, 50, 18, -640, 35, 0] },
  { p: 0.49, L: true, v: [250, 10, 175, 176, 62, 0, 38, 0.5] },
  { p: 0.56, L: true, v: [232, 20, 110, 172, 82, 0, 42, 1.0] },
  { p: 0.62, L: true, v: [212, 34, 80, 168, 100, 0, 46, 1.4] },
  { p: 0.68, L: true, v: [165, 62, 115, 40, 50, 0, 44, 0.8] },
  { p: 0.75, L: true, v: [70, 62, 270, -20, 44, 0, 40, 0.3] },
  { p: 0.83, v: [20, 30, -320, 4, 46, -760, 37, 0] },
  { p: 0.90, v: [-6, 17, -210, 0, 46, -760, 36, 0] },
  { p: 1.00, v: [-10, 15, -185, -2, 46, -760, 36, 0] },
];

export function createChapter(ctx) {
  const { renderer, quality, reduced } = ctx;
  const low = quality === 'low';

  // ---------------- shared uniforms ----------------
  const U = {
    atmos: createAtmosUniforms(),
    uScale: { value: 500 }, uPR: { value: 1 }, uTime: { value: 0 }, uCarT: { value: 0 }, uFlapT: { value: 0 },
    uLightDir: { value: new Vector3(0, 0.05, -1) }, uSunE: { value: new Color(5, 3, 2) },
    uLampsOn: { value: 0 }, uCityOn: { value: 0 }, uCarsOn: { value: 0 }, uBeaconOn: { value: 0 }, uUpOn: { value: 0 },
    uTowerOn: { value: 0 }, uWinI: { value: 2.2 }, uStars: { value: 0 },
    uDust: { value: 0 }, uDustColor: { value: new Color(1, 0.75, 0.5) }, uSunScreen: { value: { x: 0.6, y: 0.5 } },
    uSheet: { value: 1 }, uCableFat: { value: 1 }, uFlood: { value: 0 }, uCurtain: { value: 1 }, uShaft: { value: 0 }, uPush: { value: 0 },
  };

  const scene = new Scene();
  scene.name = 'river';
  const camera = new PerspectiveCamera(34, 16 / 9, 0.5, 24000);
  camera.layers.enable(1);
  scene.add(camera);

  // sky + stars
  const sky = createSky(U.atmos);
  scene.add(sky);
  const stars = createStars(U, low ? 900 : 2200, reduced);
  scene.add(stars);

  // sun
  const sun = new DirectionalLight(0xffffff, 5);
  scene.add(sun, sun.target);
  // bounce from the warm water / land and a touch of open-sky fill (the IBL carries the rest)
  const hemi = new HemisphereLight(0x8899bb, 0x6a4a30, 0.3);
  scene.add(hemi);

  // environment: PMREM of our own sky, refreshed as the time of day changes
  const pmrem = new PMREMGenerator(renderer);
  const envScene = new Scene();
  const envSky = new Mesh(sky.geometry, sky.material);
  envSky.scale.setScalar(100);
  envSky.frustumCulled = false;
  envScene.add(envSky);
  let envRT = null, envP = -1, envAge = 99;
  function refreshEnv(force) {
    envAge++;
    const dp = Math.abs(envP - cur.p);
    if (!force && (dp < 0.012 || (envAge < 6 && dp < 0.05))) return;
    envP = cur.p; envAge = 0;
    const prev = renderer.getRenderTarget();
    const face = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
    const disc = sky.material.uniforms.uDiscCol.value.clone();
    sky.material.uniforms.uDiscCol.value.setRGB(0, 0, 0); // no sun disc in the IBL (the directional light carries it)
    const rt = pmrem.fromScene(envScene, 0, 1, 1000);
    sky.material.uniforms.uDiscCol.value.copy(disc);
    renderer.setRenderTarget(prev, face, mip);
    scene.environment = rt.texture;
    if (envRT) envRT.dispose();
    envRT = rt;
  }

  // water
  const mirror = low ? null : createMirror(0.5);
  const water = createWater(U, { normals: createWaterNormals(low ? 256 : 512), mirror, quality });
  scene.add(water.mesh);

  // bridge
  const bridge = createBridge(U, quality);
  bridge.group.position.set(0, 0, -760);
  bridge.group.rotation.y = -0.1;
  scene.add(bridge.group);
  bridge.update();
  const pylonTop = bridge.pylonTopLocal.clone().applyMatrix4(bridge.group.matrixWorld);
  const pylonMid = new Vector3(170, 70, 0).applyMatrix4(bridge.group.matrixWorld);
  const bridgeCenter = new Vector3(0, 40, 0).applyMatrix4(bridge.group.matrixWorld);
  const CAM = CAM_DEF.map((k) => {
    if (!k.L) return k;
    const a = new Vector3(k.v[0], k.v[1], k.v[2]).applyMatrix4(bridge.group.matrixWorld);
    const b = new Vector3(k.v[3], k.v[4], k.v[5]).applyMatrix4(bridge.group.matrixWorld);
    return { p: k.p, v: [a.x, a.y, a.z, b.x, b.y, b.z, k.v[6], k.v[7]] };
  });

  // city, banks, pyramids
  const city = createCity(U, quality);
  scene.add(city.group);

  // feluccas
  const fel = createFeluccas(U, quality);
  scene.add(fel.group);

  // birds
  const birds = createBirds(U, quality);
  scene.add(birds.mesh);

  // mist
  const sheets = createMistSheets(U, quality);
  scene.add(sheets.group);
  const curtain = createMistCurtain(U);
  scene.add(curtain.mesh);
  const dust = createDust(U, low ? 80 : 200);
  camera.add(dust);

  // ---------------- state ----------------
  const cur = { p: 0, init: false };
  const tod = {};
  const camV = new Array(8).fill(0);
  const camPos = new Vector3(), camTgt = new Vector3(), lookTmp = new Vector3();
  const sunDir = new Vector3(), sunDirSky = new Vector3(), tmpV = new Vector3();
  const tmpC = new Color();
  const ptr = { x: 0, y: 0 };
  let W = 16, H = 9, fovNow = 34, exposure = 1;
  const sunHint = { x: 0.6, y: 0.5, visible: false, intensity: 0 };
  const focus = { distance: 100, aperture: 0.3 };
  const grade = { warmth: 0.5, tealShadows: 0.3, saturation: 1.05, contrast: 1.05 };
  const HAZE_OFFS = [0, 5, 10, 20, 35, 55, 90, 180];
  const birdAnchor = new Vector3(), birdTravel = new Vector3(-1, 0, -0.25);
  {
    const v = hermiteKeys(CAM, 0.3, new Array(8));
    birdAnchor.set(v[0], 0, v[2]).add(new Vector3(v[3] - v[0], 0, v[5] - v[2]).normalize().multiplyScalar(55));
    birdAnchor.y = 10;
  }

  function applyTod(p) {
    sampleKeys(TOD, p, tod);
    const az = tod.az * DEG, el = tod.elev * DEG;
    sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    const elS = Math.max(el, -1.2 * DEG);
    sunDirSky.set(Math.sin(az) * Math.cos(elS), Math.sin(elS), -Math.cos(az) * Math.cos(elS));

    const su = sky.material.uniforms;
    su.sunPosition.value.copy(sunDirSky);
    su.uSunTrue.value.copy(sunDir);
    su.turbidity.value = tod.turb; su.rayleigh.value = tod.ray; su.mieCoefficient.value = tod.mie; su.mieDirectionalG.value = tod.mieG;
    su.uNight.value = tod.night; su.uDay.value = tod.day; su.uGlow.value = tod.glow; su.uBelt.value.fromArray(tod.belt);
    su.uDiscCol.value.fromArray(tod.sunC).multiplyScalar(tod.disc);
    su.uCloudCov.value = low ? tod.cloud * 0.8 : tod.cloud;
    su.uCloudLit.value.fromArray(tod.cloudLit); su.uCloudShade.value.fromArray(tod.cloudSh);
    su.uSkyGain.value = tod.gain;
    su.uSkyTint.value.setRGB(1.02, 0.97, 1.01).lerp(tmpC.setRGB(1, 1, 1), ss(0.5, 0.7, p));

    // haze colours sampled from the sky just above the horizon at increasing angles from the sun
    const A = U.atmos;
    const sAz = Math.atan2(sunDir.x, -sunDir.z);
    for (let i = 0; i < 8; i++) {
      const aa = sAz + HAZE_OFFS[i] * DEG;
      tmpV.set(Math.sin(aa), 0.04, -Math.cos(aa)).normalize();
      evalSky(sky, tmpV, A.uHaze.value[i]);
      const l = 0.2126 * A.uHaze.value[i].r + 0.7152 * A.uHaze.value[i].g + 0.0722 * A.uHaze.value[i].b;
      if (l > 6) A.uHaze.value[i].multiplyScalar(6 / l);
      const hz = A.uHaze.value[i], ll = 0.2126 * hz.r + 0.7152 * hz.g + 0.0722 * hz.b;
      hz.lerp(tmpC.setRGB(ll, ll, ll), 0.22);
    }
    evalSky(sky, tmpV.set(0.3, 0.5, -0.8).normalize(), A.uZenith.value);
    A.uSunDir.value.copy(sunDir);
    const sunAbove = ss(-2.5 * DEG, 2 * DEG, el);
    A.uSunCol.value.fromArray(tod.sunC).multiplyScalar(0.06 * tod.sunI * sunAbove + 0.12 * tod.glow * (1 - tod.night));
    A.uFogDens.value = tod.fog; A.uFogFall.value = tod.fall; A.uAerial.value = tod.aerial;
    A.uMieK.value = tod.mieK; A.uMieG.value = 0.86;
    // opening vapour
    const c = tod.curtain;
    A.uMistNear.value = 0.03 * c * c;
    su.uMist.value = 0.85 * c;
    // inside the vapour light is multiply scattered: bright, nearly uniform, warm white
    const mc = su.uMistCol.value.copy(A.uHaze.value[0]).add(A.uHaze.value[2]).add(A.uHaze.value[4]).multiplyScalar(1 / 3);
    const ml = 0.2126 * mc.r + 0.7152 * mc.g + 0.0722 * mc.b;
    mc.lerp(tmpC.setRGB(ml, ml, ml), 0.45).multiplyScalar(3.4 / Math.max(ml, 1e-3));
    curtain.material.uniforms.uMistCol.value.copy(mc);
    // inside / just out of the vapour the light is diffuse: pull the haze toward the luminous mist colour
    const hk = 0.85 * Math.sqrt(c) + 0.25 * (1 - ss(0.1, 0.22, p)) * (1 - c);
    if (hk > 0.001) {
      tmpC.copy(mc).multiplyScalar(0.72);
      for (let i = 0; i < 8; i++) A.uHaze.value[i].lerp(tmpC, hk);
    }
    // city sky-glow at night (sodium)
    const night = tod.night;
    A.uCityGlow.value.setRGB(0.09, 0.045, 0.02).multiplyScalar(ss(0.2, 0.9, night));

    // lights
    sun.color.fromArray(tod.sunC);
    sun.intensity = tod.sunI * sunAbove;
    U.uLightDir.value.copy(sunDir);
    hemi.color.copy(A.uZenith.value).multiplyScalar(2.0);
    hemi.groundColor.copy(A.uHaze.value[3]).multiplyScalar(0.5).lerp(tmpC.setRGB(0.05, 0.035, 0.025), ss(0.6, 0.8, p));
    hemi.intensity = 0.5 + 0.3 * sunAbove;
    U.uSunE.value.fromArray(tod.sunC).multiplyScalar(sun.intensity);

    // light cascade
    U.uLampsOn.value = ss(0.56, 0.68, p) * 1.05;
    U.uUpOn.value = ss(0.6, 0.7, p);
    U.uCarsOn.value = ss(0.58, 0.7, p);
    U.uCityOn.value = ss(0.57, 0.86, p) * 1.05;
    U.uBeaconOn.value = ss(0.6, 0.75, p) * 1.05;
    U.uTowerOn.value = ss(0.66, 0.74, p);
    U.uFlood.value = ss(0.72, 0.85, p) * 0.08;
    U.uWinI.value = lerp(1.2, 1.7, night);
    U.uStars.value = ss(0.74, 1.0, p) * 0.9;
    U.uSheet.value = tod.sheet;
    U.uCurtain.value = c;
    U.uShaft.value = 0; // crepuscular rays are left to the engine (getSun)
    U.uDust.value = (1 - ss(0.35, 0.55, p)) * (low ? 0.5 : 0.8) * (1 - c);
    U.uDustColor.value.fromArray(tod.sunC).multiplyScalar(0.9);

    // water
    const wu = water.material.uniforms;
    wu.uSunRad.value.copy(U.uSunE.value);
    const h6 = A.uHaze.value[6];
    wu.uBody.value.setRGB(0.05, 0.075, 0.055).multiply(h6).add(new Color(0.012, 0.016, 0.012).multiplyScalar(sun.intensity * 0.12));
    wu.uReflK.value = 1.0;
    wu.uRipple.value = 1.0;

    exposure = tod.exp;
    // grade hints
    grade.warmth = lerp(0.55, -0.45, ss(0.62, 0.85, p)) + 0.2 * ss(0.5, 0.62, p) * (1 - ss(0.62, 0.72, p));
    grade.tealShadows = lerp(0.25, 0.7, ss(0.55, 0.9, p));
    grade.saturation = lerp(1.05, 1.12, ss(0.45, 0.65, p)) - 0.08 * ss(0.8, 1, p);
    grade.contrast = lerp(1.0, 1.1, ss(0.1, 0.4, p));
  }

  function computeFov(baseFov) {
    const aspect = camera.aspect;
    // keep a minimum horizontal field on portrait screens
    const minH = 30 * DEG;
    const need = 2 * Math.atan(Math.tan(minH) / aspect) / DEG;
    return Math.min(78, Math.max(baseFov, aspect < 1 ? need : baseFov));
  }

  function updateCamera(p, time, dt) {
    hermiteKeys(CAM, p, camV);
    camPos.set(camV[0], camV[1], camV[2]);
    camTgt.set(camV[3], camV[4], camV[5]);
    const portrait = camera.aspect < 1;
    if (portrait) {
      // on portrait screens, favour the bridge's right pylon in the final frames
      const k = ss(0.7, 0.95, p);
      camTgt.x += 60 * k;
    }
    // pointer parallax + handheld breathing
    const kP = dampK(3, dt);
    if (reduced) { ptr.x = 0; ptr.y = 0; } else { ptr.x += (pointerIn.x - ptr.x) * kP; ptr.y += (pointerIn.y - ptr.y) * kP; }
    const fwd = lookTmp.subVectors(camTgt, camPos).normalize();
    const right = tmpV.set(-fwd.z, 0, fwd.x).normalize();
    const hh = reduced ? 0 : 1;
    const breath = hh * (1 - 0.6 * ss(0.85, 1, p));
    const lowAlt = 1 - ss(0.4, 0.5, p);
    const ox = ptr.x * (lowAlt ? 1.2 : 3.0) + breath * noise1(time * 0.23, 1) * 0.12;
    const oy = -ptr.y * 0.5 * (0.4 + 0.6 * (1 - lowAlt)) + breath * noise1(time * 0.31, 2) * 0.06;
    camPos.addScaledVector(right, ox);
    camPos.y = Math.max(0.9, camPos.y + oy);
    camera.position.copy(camPos);
    camera.up.set(0, 1, 0);
    camera.lookAt(camTgt);
    camera.rotateY(-ptr.x * 0.8 * DEG + breath * noise1(time * 0.17, 3) * 0.12 * DEG);
    camera.rotateX(-ptr.y * 0.5 * DEG + breath * noise1(time * 0.21, 4) * 0.09 * DEG);
    camera.rotateZ((camV[7] + breath * noise1(time * 0.13, 5) * 0.25) * DEG);
    fovNow = computeFov(camV[6]);
    if (Math.abs(camera.fov - fovNow) > 1e-3) { camera.fov = fovNow; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    U.uScale.value = H / (2 * Math.tan((camera.fov * DEG) / 2));
  }

  const pointerIn = { x: 0, y: 0 };
  const camRot = new Matrix3();

  function update(dt, time, progress, pointer) {
    const target = clamp(progress);
    if (!cur.init) { cur.p = target; cur.init = true; }
    else {
      const d = target - cur.p;
      cur.p = Math.abs(d) > 0.25 ? target : cur.p + d * dampK(reduced ? 12 : 5, dt);
    }
    const p = cur.p;
    if (pointer) { pointerIn.x = pointer.x || 0; pointerIn.y = pointer.y || 0; }
    const tAmb = reduced ? time * 0.3 : time;
    U.uTime.value = tAmb;
    U.uCarT.value = time;
    U.uFlapT.value = reduced ? time * 0.4 : time;
    U.uPR.value = renderer.getPixelRatio();
    U.uPush.value = p / 0.1;

    applyTod(p);
    updateCamera(p, time, dt);
    sky.position.copy(camera.position);
    stars.position.copy(camera.position);
    sky.material.uniforms.time.value = reduced ? 0 : tAmb;

    // sun light placement
    sun.position.copy(sunDir).multiplyScalar(1500).add(camera.position);
    sun.target.position.copy(camera.position);

    // boats + wakes
    fel.update(tAmb, p, reduced, water.boats);
    for (let i = fel.boats.length; i < MAX_BOATS; i++) water.boats[i].w = 0;

    // birds: cross the frame during the river glide
    const bu = ss(0.1, 0.46, p);
    birds.update(birdAnchor, birdTravel, bu, tAmb, p > 0.08 && p < 0.5);

    // curtain camera basis
    camRot.setFromMatrix4(camera.matrixWorld);
    const cu = curtain.material.uniforms;
    cu.uCamRot.value.copy(camRot);
    const tY = Math.tan((camera.fov * DEG) / 2);
    cu.uTan.value.set(tY * camera.aspect, tY);
    cu.uAspect.value = camera.aspect;
    curtain.mesh.visible = U.uCurtain.value > 0.001 || U.uShaft.value > 0.001;

    // sun on screen
    tmpV.copy(sunDir).multiplyScalar(5000).add(camera.position).project(camera);
    const inFront = tmpV.z < 1;
    sunHint.x = tmpV.x * 0.5 + 0.5; sunHint.y = tmpV.y * 0.5 + 0.5;
    const onScreen = inFront && sunHint.x > -0.25 && sunHint.x < 1.25 && sunHint.y > -0.25 && sunHint.y < 1.25;
    const above = ss(-1.5 * DEG, 1.5 * DEG, Math.asin(sunDir.y));
    sunHint.visible = onScreen && above > 0.01;
    sunHint.intensity = onScreen ? above * (0.55 + 0.45 * (1 - U.uCurtain.value)) * (tod.sunI / 9) * 1.4 : 0;
    U.uSunScreen.value = { x: sunHint.x, y: sunHint.y };

    // focus
    let fd;
    if (p < 0.46) {
      let best = 1e9;
      for (const b of fel.boats) {
        tmpV.copy(b.pos); tmpV.y = 5;
        const d = tmpV.distanceTo(camera.position);
        const pr = tmpV.clone().project(camera);
        if (pr.z < 1 && Math.abs(pr.x) < 0.85 && Math.abs(pr.y) < 0.9 && d < best) best = d;
      }
      fd = Math.min(best, 600);
    } else if (p < 0.74) fd = camera.position.distanceTo(pylonMid);
    else fd = camera.position.distanceTo(bridgeCenter);
    focus.distance += (fd - focus.distance) * (cur.init ? dampK(4, dt) : 1);
    focus.aperture = lerp(0.35, 0.55, ss(0.7, 0.95, p));

    // dynamic environment
    refreshEnv(envRT === null);

    // planar reflection
    if (mirror) {
      const pr = U.uPR.value;
      U.uPR.value = pr * mirror.scale;
      U.uCableFat.value = lerp(2.4, 1.3, ss(0.65, 0.85, cur.p));
      mirror.render(renderer, scene, camera, [water.mesh]);
      U.uPR.value = pr;
      U.uCableFat.value = 1;
    }
  }

  function resize(width, height) {
    W = Math.max(1, width); H = Math.max(1, height);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    if (mirror) {
      const pr = renderer.getPixelRatio();
      mirror.setSize(W * pr, H * pr);
    }
  }

  // ---------------- ready ----------------
  const ready = (async () => {
    applyTod(0);
    refreshEnv(true);
    hermiteKeys(CAM, 0, camV);
    camera.position.set(camV[0], camV[1], camV[2]);
    camera.lookAt(camV[3], camV[4], camV[5]);
    camera.updateMatrixWorld();
    try {
      if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
      else renderer.compile(scene, camera);
    } catch (e) {
      renderer.compile(scene, camera);
    }
  })();

  return {
    scene, camera, ready, update, resize,
    getSun: () => sunHint,
    getExposure: () => exposure,
    getFocus: () => focus,
    getGrade: () => grade,
    dispose() {
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      });
      water.material.uniforms.tNormal.value?.dispose();
      if (mirror) mirror.dispose();
      if (envRT) envRT.dispose();
      pmrem.dispose();
    },
  };
}
