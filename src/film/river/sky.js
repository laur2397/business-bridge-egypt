// Physically-based sky for the river chapter: Preetham scattering (after three/addons Sky),
// art-directed sun disc in HDR, soft cloud field, sunset glow, belt of Venus, night layer
// and city sky-glow. evalSky() is a CPU port used to drive the fog / haze colours.
import { BackSide, BoxGeometry, Color, Mesh, ShaderMaterial, Vector3 } from 'three';

const VERT = /* glsl */`
  uniform vec3 sunPosition;
  uniform float rayleigh;
  uniform float turbidity;
  uniform float mieCoefficient;
  varying vec3 vWorldPosition;
  varying vec3 vSunDirection;
  varying float vSunfade;
  varying vec3 vBetaR;
  varying vec3 vBetaM;
  varying float vSunE;
  const float e = 2.718281828459045;
  const vec3 totalRayleigh = vec3( 5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5 );
  const vec3 MieConst = vec3( 1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14 );
  const float cutoffAngle = 1.6110731556870734;
  const float steepness = 1.5;
  const float EE = 1000.0;
  float sunIntensity( float c ) {
    c = clamp( c, -1.0, 1.0 );
    return EE * max( 0.0, 1.0 - pow( e, -( ( cutoffAngle - acos( c ) ) / steepness ) ) );
  }
  vec3 totalMie( float T ) { float c = ( 0.2 * T ) * 10E-18; return 0.434 * c * MieConst; }
  void main() {
    vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    gl_Position.z = gl_Position.w;
    vSunDirection = normalize( sunPosition );
    vSunE = sunIntensity( vSunDirection.y );
    vSunfade = 1.0 - clamp( 1.0 - exp( ( sunPosition.y / 450000.0 ) ), 0.0, 1.0 );
    float rayleighCoefficient = rayleigh - ( 1.0 * ( 1.0 - vSunfade ) );
    vBetaR = totalRayleigh * rayleighCoefficient;
    vBetaM = totalMie( turbidity ) * mieCoefficient;
  }`;

const FRAG = /* glsl */`
  varying vec3 vWorldPosition;
  varying vec3 vSunDirection;
  varying vec3 vBetaR;
  varying vec3 vBetaM;
  varying float vSunE;
  uniform float mieDirectionalG;
  uniform float time;
  uniform float uCloudCov;
  uniform float uCloudDen;
  uniform vec3 uCloudLit;
  uniform vec3 uCloudShade;
  uniform float uNight;
  uniform float uDay;
  uniform vec3 uNightZenith;
  uniform vec3 uNightHorizon;
  uniform vec3 uGlowColor;
  uniform float uGlow;
  uniform vec3 uBelt;
  uniform vec3 uSunTrue;
  uniform vec3 uDiscCol;
  uniform float uSkyGain;
  uniform vec3 uSkyTint;
  uniform vec3 uCityGlow;
  uniform vec3 uCityDir;
  uniform float uMist;
  uniform vec3 uMistCol;

  const float pi = 3.141592653589793;
  const float rayleighZenithLength = 8.4E3;
  const float mieZenithLength = 1.25E3;
  float rayleighPhase( float c ) { return 0.05968310365946075 * ( 1.0 + c * c ); }
  float hgPhase( float c, float g ) { float g2 = g * g; return 0.07957747154594767 * ( 1.0 - g2 ) / pow( 1.0 - 2.0 * g * c + g2, 1.5 ); }

  vec2 grad2( vec2 i ) {
    vec3 p = fract( i.xyx * vec3( 0.1031, 0.1030, 0.0973 ) );
    p += dot( p, p.yzx + 33.33 );
    return fract( ( p.xx + p.yz ) * p.zy ) * 2.0 - 1.0;
  }
  float gnoise( vec2 p ) {
    vec2 i = floor( p ); vec2 f = fract( p );
    vec2 u = f * f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 );
    float a = dot( grad2( i ), f );
    float b = dot( grad2( i + vec2( 1, 0 ) ), f - vec2( 1, 0 ) );
    float c = dot( grad2( i + vec2( 0, 1 ) ), f - vec2( 0, 1 ) );
    float d = dot( grad2( i + vec2( 1, 1 ) ), f - vec2( 1, 1 ) );
    return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y ) * 1.6;
  }
  float fbm( vec2 p ) {
    float r = 0.0, a = 0.5;
    for ( int i = 0; i < 5; i ++ ) { r += a * gnoise( p ); p = mat2( 1.6, 1.2, -1.2, 1.6 ) * p + 3.1; a *= 0.5; }
    return r;
  }

  void main() {
    vec3 direction = normalize( vWorldPosition - cameraPosition );
    float dy = direction.y;
    direction.y = max( direction.y, 0.0005 );
    direction = normalize( direction );
    float zenithAngle = acos( max( 0.0, direction.y ) );
    float inverse = 1.0 / ( cos( zenithAngle ) + 0.15 * pow( 93.885 - ( ( zenithAngle * 180.0 ) / pi ), -1.253 ) );
    float sR = rayleighZenithLength * inverse;
    float sM = mieZenithLength * inverse;
    vec3 Fex = exp( -( vBetaR * sR + vBetaM * sM ) );
    float cosTheta = dot( direction, vSunDirection );
    vec3 betaRTheta = vBetaR * rayleighPhase( cosTheta * 0.5 + 0.5 );
    vec3 betaMTheta = vBetaM * hgPhase( cosTheta, mieDirectionalG );
    vec3 Lin = pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * ( 1.0 - Fex ), vec3( 1.5 ) );
    Lin *= mix( vec3( 1.0 ), pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * Fex, vec3( 0.5 ) ), clamp( pow( 1.0 - vSunDirection.y, 5.0 ), 0.0, 1.0 ) );
    vec3 L0 = vec3( 0.1 ) * Fex;
    vec3 sky = ( Lin + L0 ) * 0.04 + vec3( 0.0, 0.0003, 0.00075 );

    float hh = clamp( direction.y, 0.0, 1.0 );
    vec2 sa = normalize( vSunDirection.xz + 1e-5 );
    vec2 da = normalize( direction.xz + 1e-5 );
    float azc = dot( sa, da );
    float az = max( azc, 0.0 );
    // sunset glow hugging the horizon around the sun azimuth
    float glow = pow( az, 6.0 ) * exp( -hh * 12.0 ) + 0.12 * pow( az, 2.0 ) * exp( -hh * 4.0 );
    sky += uGlowColor * glow * uGlow;
    // belt of Venus: pink band above the anti-solar horizon, earth shadow below it
    float anti = max( -azc, 0.0 );
    float belt = smoothstep( 0.0, 0.08, hh ) * exp( -hh * 9.0 ) * ( 0.4 + 0.6 * anti );
    sky += uBelt * belt;
    sky = sky * uDay + mix( uNightHorizon, uNightZenith, pow( hh, 0.45 ) ) * uNight;
    // city sky-glow
    float cg = pow( max( dot( da, normalize( uCityDir.xz ) ), 0.0 ), 4.0 );
    sky += uCityGlow * cg * exp( -hh * 14.0 );
    sky *= uSkyGain * uSkyTint;

    // clouds: thin, stretched alto-cumulus / cirrus deck, lit from the low sun
    if ( uCloudCov > 0.0 ) {
      vec2 cuv = direction.xz / ( direction.y + 0.06 );
      cuv = vec2( cuv.x * 0.8, cuv.y * 3.4 ) * 0.55 + vec2( time * 0.002, 0.0 );
      float n = fbm( cuv ) * 0.5 + 0.5;
      float region = gnoise( cuv * 0.21 + 7.0 ) * 0.5 + 0.5;
      float cov = clamp( uCloudCov + ( region - 0.5 ) * 0.9, 0.0, 1.0 );
      float th = 1.0 - cov;
      float m = smoothstep( th, th + 0.3, n + 0.06 * gnoise( cuv * 11.0 ) );
      m *= smoothstep( 0.015, 0.12, direction.y ) * smoothstep( 0.95, 0.4, direction.y );
      float depth = max( 0.0, n - th );
      float silver = clamp( 0.51 / pow( 1.49 - cosTheta * 1.4, 1.5 ), 0.0, 4.0 );
      float edge = m * ( 1.0 - m ) * 4.0;
      vec3 cc = mix( uCloudLit, uCloudShade, smoothstep( 0.0, 0.35, depth ) );
      cc += uCloudLit * silver * edge * 0.5;
      // distant clouds dissolve into the horizon colour
      cc = mix( sky, cc, smoothstep( 0.0, 0.35, direction.y ) * 0.85 + 0.15 );
      float alpha = ( 1.0 - exp( -depth * uCloudDen * 14.0 ) ) * m;
      sky = mix( sky, cc, alpha );
    }

    // sun disc in HDR with limb darkening (true sun, may sit below the sky model's held sun)
    vec3 sd = normalize( uSunTrue );
    float ct = dot( normalize( vec3( direction.x, dy, direction.z ) ), sd );
    float r = acos( clamp( ct, -1.0, 1.0 ) ) / 0.0058; // ~0.33 deg radius (art: slightly large at the horizon)
    float disc = smoothstep( 1.0, 0.92, r );
    float limb = sqrt( max( 1.0 - r * r, 0.0 ) );
    sky += uDiscCol * disc * ( 0.55 + 0.45 * limb ) * smoothstep( -0.004, 0.002, dy );

    // opening mist: the whole sky is washed into lit vapour
    sky = mix( sky, uMistCol, uMist );
    gl_FragColor = vec4( sky, 1.0 );
  }`;

export function createSky(U) {
  const mat = new ShaderMaterial({
    name: 'river-sky',
    uniforms: {
      turbidity: { value: 6 }, rayleigh: { value: 2 }, mieCoefficient: { value: 0.004 }, mieDirectionalG: { value: 0.8 },
      sunPosition: { value: new Vector3(0, 0.05, -1) }, time: { value: 0 },
      uCloudCov: { value: 0.3 }, uCloudDen: { value: 0.4 },
      uCloudLit: { value: new Color(1, 0.7, 0.5) }, uCloudShade: { value: new Color(0.3, 0.3, 0.4) },
      uNight: { value: 0 }, uDay: { value: 1 },
      uNightZenith: { value: new Color().setRGB(0.0025, 0.006, 0.022) },
      uNightHorizon: { value: new Color().setRGB(0.02, 0.03, 0.065) },
      uGlowColor: { value: new Color().setRGB(0.42, 0.13, 0.045) }, uGlow: { value: 0 },
      uBelt: { value: new Color(0, 0, 0) },
      uSunTrue: { value: new Vector3(0, 0.05, -1) },
      uDiscCol: { value: new Color(60, 40, 20) },
      uSkyGain: { value: 1 }, uSkyTint: { value: new Color(1, 1, 1) },
      uCityGlow: U.uCityGlow, uCityDir: U.uCityDir,
      uMist: { value: 0 }, uMistCol: { value: new Color(1, 1, 1) },
    },
    vertexShader: VERT, fragmentShader: FRAG,
    side: BackSide, depthWrite: false,
  });
  const sky = new Mesh(new BoxGeometry(1, 1, 1), mat);
  sky.scale.setScalar(12000);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  sky.name = 'river-sky';
  return sky;
}

// ---- CPU port (no clouds, no disc) ----
const totalRayleigh = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
const MieConst = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
const cutoffAngle = 1.6110731556870734, steepness = 1.5, EE = 1000.0;
const _sd = new Vector3();
function sunIntensity(c) {
  c = Math.min(1, Math.max(-1, c));
  return EE * Math.max(0, 1 - Math.exp(-((cutoffAngle - Math.acos(c)) / steepness)));
}

export function evalSky(sky, dir, out) {
  const u = sky.material.uniforms;
  const sd = _sd.copy(u.sunPosition.value).normalize();
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
    res[i] = (Lin + 0.1 * Fex) * 0.04 + [0, 0.0003, 0.00075][i];
  }
  const hh = Math.min(1, Math.max(0, dir.y));
  const nz = u.uNightZenith.value, nh = u.uNightHorizon.value, gc = u.uGlowColor.value, bc = u.uBelt.value;
  const t = Math.pow(hh, 0.45);
  const night = [nh.r + (nz.r - nh.r) * t, nh.g + (nz.g - nh.g) * t, nh.b + (nz.b - nh.b) * t];
  const la = Math.hypot(sd.x, sd.z) || 1, lb = Math.hypot(dir.x, dir.z) || 1;
  const azc = (sd.x * dir.x + sd.z * dir.z) / (la * lb);
  const az = Math.max(0, azc);
  const glow = Math.pow(az, 6) * Math.exp(-hh * 12) + 0.12 * Math.pow(az, 2) * Math.exp(-hh * 4);
  const anti = Math.max(-azc, 0);
  const s8 = Math.min(1, hh / 0.08); const belt = s8 * s8 * (3 - 2 * s8) * Math.exp(-hh * 9) * (0.4 + 0.6 * anti);
  const gcol = [gc.r, gc.g, gc.b], bcol = [bc.r, bc.g, bc.b];
  for (let i = 0; i < 3; i++) {
    let v = res[i] + gcol[i] * glow * u.uGlow.value + bcol[i] * belt;
    res[i] = (v * u.uDay.value + night[i] * u.uNight.value) * u.uSkyGain.value * [u.uSkyTint.value.r, u.uSkyTint.value.g, u.uSkyTint.value.b][i];
  }
  return out.setRGB(res[0], res[1], res[2]);
}
