// Physically based sky (Preetham, three/addons Sky) + a blue-hour / night layer,
// plus a CPU port of the same model so fog colour always matches the horizon.
import { Color, Vector3 } from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

export function createSky(shared) {
  const sky = new Sky();
  sky.name = 'hero-sky';
  sky.scale.setScalar(10000);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  const u = sky.material.uniforms;
  u.turbidity.value = 9;
  u.rayleigh.value = 2.2;
  u.mieCoefficient.value = 0.006;
  u.mieDirectionalG.value = 0.86;
  u.cloudCoverage.value = 0.22;
  u.cloudDensity.value = 0.25;
  u.cloudElevation.value = 0.55;
  u.cloudScale.value = 0.00016;
  u.cloudSpeed.value = 0.00001;

  u.uNight = shared.uNight;
  u.uDay = { value: 1 };
  u.uNightZenith = { value: new Color().setRGB(0.003, 0.0085, 0.032) };
  u.uNightHorizon = { value: new Color().setRGB(0.024, 0.034, 0.076) };
  u.uGlowColor = { value: new Color().setRGB(0.42, 0.13, 0.045) };
  u.uGlow = { value: 0 };
  u.uSunScale = { value: 1 };

  sky.material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('uniform float time;', `uniform float time;
        uniform float uNight; uniform float uDay; uniform vec3 uNightZenith; uniform vec3 uNightHorizon;
        uniform vec3 uGlowColor; uniform float uGlow; uniform float uSunScale;`)
      .replace('vec3 sundiscColor = ( 760.0 * sundisc )', 'vec3 sundiscColor = ( 760.0 * uSunScale * sundisc )')
      .replace('gl_FragColor = vec4( texColor, 1.0 );', `
        {
          float hh = clamp( direction.y, 0.0, 1.0 );
          vec3 nightCol = mix( uNightHorizon, uNightZenith, pow( hh, 0.45 ) );
          vec2 sa = normalize( vSunDirection.xz + 1e-5 );
          vec2 da = normalize( direction.xz + 1e-5 );
          float az = max( dot( sa, da ), 0.0 );
          float glow = pow( az, 6.0 ) * exp( -hh * 12.0 ) + 0.1 * pow( az, 3.0 ) * exp( -hh * 5.0 );
          texColor += uGlowColor * glow * uGlow;
          texColor = texColor * uDay + nightCol * uNight;
          // soft highlight compression: keeps the sun hot but bounded (photographic shoulder)
          float lumS = dot( texColor, vec3( 0.2126, 0.7152, 0.0722 ) );
          texColor *= 1.0 / ( 1.0 + lumS / 30.0 );
        }
        gl_FragColor = vec4( texColor, 1.0 );`);
  };
  return sky;
}

// ---- CPU port of the Preetham sky for a single direction (linear HDR, pre-tonemap) ----
const totalRayleigh = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
const MieConst = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
const cutoffAngle = 1.6110731556870734, steepness = 1.5, EE = 1000.0;

function sunIntensity(c) {
  c = Math.min(1, Math.max(-1, c));
  return EE * Math.max(0, 1 - Math.exp(-((cutoffAngle - Math.acos(c)) / steepness)));
}

export function evalSky(sky, dir, out) {
  const u = sky.material.uniforms;
  const sd = new Vector3().copy(u.sunPosition.value).normalize();
  const sunE = sunIntensity(sd.y);
  const sunfade = 1 - Math.min(1, Math.max(0, 1 - Math.exp(u.sunPosition.value.y / 450000)));
  const rc = u.rayleigh.value - (1 - sunfade);
  const T = u.turbidity.value;
  const c = 0.2 * T * 10e-18;
  const betaR = totalRayleigh.map((v) => v * rc);
  const betaM = MieConst.map((v) => 0.434 * c * v * u.mieCoefficient.value);
  const zen = Math.acos(Math.max(0, dir.y));
  const inv = 1 / (Math.cos(zen) + 0.15 * Math.pow(93.885 - (zen * 180) / Math.PI, -1.253));
  const sR = 8.4e3 * inv, sM = 1.25e3 * inv;
  const cosT = dir.dot(sd);
  const rPhase = (3 / (16 * Math.PI)) * (1 + Math.pow(cosT * 0.5 + 0.5, 2));
  const g = u.mieDirectionalG.value, g2 = g * g;
  const mPhase = (1 / (4 * Math.PI)) * ((1 - g2) / Math.pow(1 - 2 * g * cosT + g2, 1.5));
  const k = Math.min(1, Math.max(0, Math.pow(1 - sd.y, 5)));
  const res = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const Fex = Math.exp(-(betaR[i] * sR + betaM[i] * sM));
    const ratio = (betaR[i] * rPhase + betaM[i] * mPhase) / (betaR[i] + betaM[i]);
    let Lin = Math.pow(sunE * ratio * (1 - Fex), 1.5);
    Lin *= 1 + (Math.pow(sunE * ratio * Fex, 0.5) - 1) * k;
    const L0 = 0.1 * Fex;
    res[i] = (Lin + L0) * 0.04 + [0, 0.0003, 0.00075][i];
  }
  // night / glow layer (mirror of the GLSL above)
  const hh = Math.min(1, Math.max(0, dir.y));
  const nz = u.uNightZenith.value, nh = u.uNightHorizon.value, gc = u.uGlowColor.value;
  const t = Math.pow(hh, 0.45);
  const night = [nh.r + (nz.r - nh.r) * t, nh.g + (nz.g - nh.g) * t, nh.b + (nz.b - nh.b) * t];
  const la = Math.hypot(sd.x, sd.z) || 1, lb = Math.hypot(dir.x, dir.z) || 1;
  const az = Math.max(0, (sd.x * dir.x + sd.z * dir.z) / (la * lb));
  const glow = Math.pow(az, 6) * Math.exp(-hh * 12) + 0.1 * Math.pow(az, 3) * Math.exp(-hh * 5);
  const gcol = [gc.r, gc.g, gc.b];
  const nv = u.uNight.value;
  for (let i = 0; i < 3; i++) {
    let v = res[i] + gcol[i] * glow * u.uGlow.value;
    v = v * u.uDay.value + night[i] * nv;
    res[i] = v;
  }
  const lumS = 0.2126 * res[0] + 0.7152 * res[1] + 0.0722 * res[2];
  const k2 = 1 / (1 + lumS / 30);
  res[0] *= k2; res[1] *= k2; res[2] *= k2;
  return out.setRGB(res[0], res[1], res[2]);
}

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const DEG = Math.PI / 180;

// Art-directed time of day for scroll progress p. Writes sky uniforms, returns the
// "true" sun direction (used for lighting / water), which keeps sinking below the
// Preetham cut-off while the sky model itself holds a dim civil-twilight sun.
export function applySkyProgress(sky, p, outSunDir) {
  const u = sky.material.uniforms;
  const az = lerp(19, 20.5, p) * DEG;
  const elev = lerp(1.7, -7, ss(0, 0.92, p)) * DEG;
  const elevSky = lerp(1.7, -1.5, ss(0, 0.62, p)) * DEG;
  outSunDir.set(Math.sin(az) * Math.cos(elev), Math.sin(elev), -Math.cos(az) * Math.cos(elev));
  u.sunPosition.value.set(Math.sin(az) * Math.cos(elevSky), Math.sin(elevSky), -Math.cos(az) * Math.cos(elevSky));
  u.turbidity.value = lerp(5.5, 4, ss(0.3, 1, p));
  u.rayleigh.value = lerp(2.0, 3.0, ss(0.2, 0.9, p));
  u.mieCoefficient.value = lerp(0.0038, 0.003, p);
  u.mieDirectionalG.value = lerp(0.8, 0.76, p);
  u.uNight.value = ss(0.18, 0.8, p);
  u.uDay.value = 1 - 0.9 * ss(0.55, 1.0, p);
  u.uGlow.value = ss(0.2, 0.55, p) * (1 - 0.7 * ss(0.65, 1.0, p));
  u.uSunScale.value = 0.06;
  return elev;
}
