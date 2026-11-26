// GLSL for the Orbit chapter. Units: Earth radius = 1.

// Physical constants (scale heights exaggerated ~1.8x for readability on screen; optical depths kept real).
export const ATMO = {
  RG: 1.0,
  RA: 1.0 + 0.034,
  RC: 1.0 + 24 / 6371, // cloud shell (≈ top of the volumetric slab in the dive)
  HR: 0.0036, // Rayleigh scale height (~23 km, exaggerated ~2.8x so the limb reads on screen)
  HM: 0.00085, // Mie scale height (~5.4 km)
  // vertical optical depths (real Earth, 680/550/440 nm)
  TAU_R: [0.046, 0.108, 0.265],
  TAU_M: 0.03,
  TAU_O: [0.018, 0.042, 0.002], // ozone absorption (gives the blue twilight band)
};

const v3 = (a) => `vec3(${a.map((x) => x.toFixed(5)).join(',')})`;

export const atmoCommon = /* glsl */ `
#define RG ${ATMO.RG.toFixed(6)}
#define RA ${ATMO.RA.toFixed(6)}
#define RC ${ATMO.RC.toFixed(6)}
#define HR ${ATMO.HR.toFixed(6)}
#define HM ${ATMO.HM.toFixed(6)}
#define PI 3.14159265
const vec3 BR = ${v3(ATMO.TAU_R)} / HR;
const vec3 BO = ${v3(ATMO.TAU_O)} / HR;
const float BM = ${ATMO.TAU_M.toFixed(4)} / HM;
const float BME = BM * 1.11;
const float BA = 0.007 / 0.004;   // stratospheric aerosol (scattering only, forward glow at the limb)

vec2 rsi(vec3 o, vec3 d, float r) {
  float b = dot(o, d);
  float c = dot(o, o) - r * r;
  float h = b * b - c;
  if (h < 0.0) return vec2(-1.0, -1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

// Chapman-function approximation (Schuler). Returns optical length / rho0 in world units
// from radius r toward direction with cosine mu (relative to local zenith) to space.
float chapX(float X, float mu) { float c = sqrt(1.5707963 * X); return c / ((c - 1.0) * mu + 1.0); }
float optDepth(float r, float mu, float H) {
  float X = r / H;
  float h = (r - RG) / H;
  if (mu >= 0.0) return H * exp(-h) * chapX(X, mu);
  float s = sqrt(max(1.0 - mu * mu, 0.0));
  float X0 = X * s;
  float h0 = X0 - RG / H;
  float full = H * 2.0 * exp(min(-h0, 60.0)) * sqrt(1.5707963 * X0);
  return max(full - H * exp(-h) * chapX(X, -mu), 0.0);
}
vec3 sunTrans(float r, float mu) {
  float dR = optDepth(r, mu, HR);
  float dM = optDepth(r, mu, HM);
  return exp(-(BR + BO) * dR - BME * dM);
}
float phaseR(float c) { return 3.0 / (16.0 * PI) * (1.0 + c * c); }
float phaseM(float c, float g) {
  float g2 = g * g;
  return 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + c * c)) / ((2.0 + g2) * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5));
}
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

// lat/long uv from a unit direction (equirect, u=0 at lng -180, v=1 at north pole)
vec2 dirUV(vec3 n) {
  return vec2(atan(n.x, n.z) * (0.5 / PI) + 0.5, asin(clamp(n.y, -1.0, 1.0)) / PI + 0.5);
}
`;

// Cloud coverage, shared by the planet pass and the dive raymarcher.
// A cloud bank is grafted over the Nile Delta / east Mediterranean by borrowing
// real convective structure from another part of the cloud map.
export const cloudCommon = /* glsl */ `
uniform sampler2D tClouds;
uniform sampler3D tNoise;
uniform float uCloudRot;
uniform vec3 uBankDir;     // unit vector: centre of the Delta cloud bank
uniform vec3 uCoreDir;     // unit vector: the dive point (a dense cloud mass is guaranteed there)
uniform float uBankAmt;
float cloudRaw(vec2 uv) { return texture(tClouds, uv).r; }
float cloudCovUV(vec2 uv, vec3 n) {
  float c = smoothstep(0.16, 0.82, cloudRaw(uv));
  float bd = dot(n, uBankDir);
  float bank = smoothstep(0.9935, 0.9990, bd) * uBankAmt; // ~3-6 degrees
  vec2 buv = uv + vec2(-0.287, -0.172);
  float bc = smoothstep(0.12, 0.7, cloudRaw(buv));
  return max(c, bank * bc);
}
// procedural cumulus field (features ~30-60 km) grafted over the Delta
float bankCov(vec3 n, float fw) {
  float bd = dot(n, uBankDir);
  float m = smoothstep(0.9915, 0.9985, bd) * uBankAmt;   // ~3-7.5 degrees
  if (m <= 0.0) return 0.0;
  float a = textureLod(tNoise, n * 34.0, 0.0).r;
  float b = textureLod(tNoise, n * 97.0 + 0.37, 0.0).r;
  float c = textureLod(tNoise, n * 260.0 + 0.71, 0.0).g;
  float v = a * 0.62 + b * 0.28 + c * 0.10 * (1.0 - fw);
  float core = smoothstep(0.99985, 0.999985, dot(n, uCoreDir));   // ~35 km radius
  return max(m * 0.8 * smoothstep(0.46 - 0.1 * m, 0.72, v), core * 0.7);
}
// cheaper variant for the raymarcher (2 noise taps)
float cloudCovDive(vec2 uv, vec3 n) {
  float c = smoothstep(0.16, 0.82, textureLod(tClouds, uv, 0.0).r);
  float bd = dot(n, uBankDir);
  float m = smoothstep(0.9915, 0.9985, bd) * uBankAmt;
  float a = textureLod(tNoise, n * 34.0, 0.0).r;
  float b = textureLod(tNoise, n * 97.0 + 0.37, 0.0).r;
  float v = a * 0.62 + b * 0.28 + 0.05;
  float core = smoothstep(0.99985, 0.999985, dot(n, uCoreDir));
  return max(c, max(m * 0.8 * smoothstep(0.46 - 0.1 * m, 0.72, v), core * 0.7));
}
float cloudCovGrad(vec2 uv, vec3 n, vec2 gx, vec2 gy) {
  float c = smoothstep(0.16, 0.82, textureGrad(tClouds, uv, gx, gy).r);
  float fw = clamp(length(gx) * 300.0, 0.0, 1.0);
  return max(c, bankCov(n, fw));
}
float cloudCovLod(vec2 uv, vec3 n, float lod) {
  float c = smoothstep(0.16, 0.82, textureLod(tClouds, uv, lod).r);
  return max(c, bankCov(n, clamp(lod * 0.3, 0.0, 1.0)));
}
// analytic transmittance along a ray to space (0 if the ground blocks it)
vec3 rayTrans(vec3 o, vec3 d) {
  float r = length(o);
  float mu = dot(o, d) / r;
  float dR, dM;
  if (r > RA) {
    if (mu >= 0.0) return vec3(1.0);
    float rmin = r * sqrt(1.0 - mu * mu);
    if (rmin < RG) return vec3(0.0);
    if (rmin > RA) return vec3(1.0);
    dR = 2.0 * HR * exp(-(rmin - RG) / HR) * sqrt(1.5707963 * rmin / HR);
    dM = 2.0 * HM * exp(-(rmin - RG) / HM) * sqrt(1.5707963 * rmin / HM);
  } else {
    vec2 g = rsi(o, d, RG);
    if (g.x > 0.0) return vec3(0.0);
    dR = optDepth(r, mu, HR); dM = optDepth(r, mu, HM);
  }
  return exp(-(BR + BO) * dR - BME * dM);
}
`;

export const fullscreenVert = /* glsl */ `
uniform mat4 uProjInv;
uniform mat4 uCamWorld;
varying vec3 vDir;
void main() {
  vec4 v = uProjInv * vec4(position.xy, 1.0, 1.0);
  v /= v.w;
  vDir = (uCamWorld * vec4(v.xyz, 0.0)).xyz;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

export const planetFrag = (steps) => /* glsl */ `
precision highp float;
precision highp sampler3D;
${atmoCommon}
${cloudCommon}
uniform vec3 uCam;
uniform vec3 uSun;
uniform float uSunI;
uniform float uSunRad;    // angular radius (cos space handled in shader)
uniform mat4 uViewProj;
uniform sampler2D tDay;
uniform sampler2D tNight;
uniform sampler2D tBump;
uniform sampler2D tWater;
uniform sampler2D tStars;
uniform float uLightsI;
uniform float uStarsI;
uniform float uTime;
uniform vec2 uShellNear;
uniform float uCloudFade;  // fades the shell clouds when the volumetric layer takes over
varying vec3 vDir;

// Seam-safe gradients for equirect lookups (Tarini)
void seamGrad(vec2 uv, out vec2 dx, out vec2 dy) {
  vec2 uv2 = vec2(fract(uv.x + 0.5) - 0.5, uv.y);
  vec2 d1x = dFdx(uv), d1y = dFdy(uv);
  vec2 d2x = dFdx(uv2), d2y = dFdy(uv2);
  if (abs(d2x.x) + abs(d2y.x) < abs(d1x.x) + abs(d1y.x)) { dx = d2x; dy = d2y; } else { dx = d1x; dy = d1y; }
}

vec3 nightLights(vec3 raw) {
  float lev = max(raw.r - 0.15 * raw.b - 0.012, 0.0);
  float L = pow(lev, 2.1);
  // warm sodium gold; the brightest cores bleach toward white
  vec3 c = mix(vec3(1.0, 0.56, 0.22), vec3(1.0, 0.82, 0.6), smoothstep(0.02, 0.12, L));
  return c * L;
}

void main() {
  vec3 rd = normalize(vDir);
  vec3 ro = uCam;
  vec3 L = uSun;
  float camR = length(ro);
  float mu = dot(rd, L);

  vec2 ta = rsi(ro, rd, RA);
  vec2 tg = rsi(ro, rd, RG);
  bool hitG = tg.x > 0.0;
  bool hitA = ta.y > 0.0;
  vec2 tcs = rsi(ro, rd, RC);

  // Surface points and their uv gradients, evaluated for every pixel (uniform control flow) so
  // that derivatives stay valid at the limb. Misses fall back to the closest-approach point.
  float tca = max(-dot(ro, rd), 0.0);
  vec3 Pg = hitG ? ro + rd * tg.x : normalize(ro + rd * tca);
  vec3 n0 = normalize(Pg);
  vec2 uv = dirUV(n0);
  vec2 gx, gy; seamGrad(uv, gx, gy);
  float tCs = tcs.x > 0.0 ? tcs.x : (tcs.y > 0.0 ? tcs.y : tca);
  vec3 nc = normalize(ro + rd * tCs);
  vec2 cuv = dirUV(nc) + vec2(-uCloudRot, 0.0);
  vec2 cgx, cgy; seamGrad(cuv, cgx, cgy);
  // clamp footprints at grazing angles (keeps the limb crisp, avoids smearing)
  float gl0 = max(length(gx), length(gy));
  if (gl0 > 0.01) { gx *= 0.01 / gl0; gy *= 0.01 / gl0; }
  float fpMin = 1.6 / 4096.0;
  if (gl0 < fpMin) { float k = fpMin / max(gl0, 1e-7); gx *= k; gy *= k; }
  float gl1 = max(length(cgx), length(cgy));
  if (gl1 > 0.01) { cgx *= 0.01 / gl1; cgy *= 0.01 / gl1; }

  // ---------------- background: stars, milky way, sun ----------------
  vec3 bg = vec3(0.0);
  if (!hitG) {
    vec2 suv = dirUV(rd);
    vec3 st = textureLod(tStars, suv, 0.0).rgb;
    st = pow(st, vec3(1.7)) * 2.2;
    // procedural Milky Way band (galactic plane tilted ~60 deg)
    vec3 gN = normalize(vec3(-0.62, 0.55, 0.56));
    float gl = dot(rd, gN);
    float band = exp(-gl * gl / 0.035);
    float core = exp(-pow(length(rd - normalize(vec3(0.55, -0.25, 0.8))), 2.0) / 0.25);
    float n1 = textureLod(tNoise, rd * 1.3, 0.0).r;
    float n2 = textureLod(tNoise, rd * 4.1 + 0.3, 0.0).g;
    float dust = smoothstep(0.35, 0.75, textureLod(tNoise, rd * 2.3 + 0.7, 0.0).r);
    float mw = band * (0.45 + 0.9 * n1 * n2) * (1.0 - 0.75 * dust * band) * (0.6 + 1.6 * core);
    bg = st * uStarsI + vec3(0.62, 0.66, 0.78) * mw * 0.06 * uStarsI + vec3(0.9, 0.75, 0.6) * mw * core * 0.04 * uStarsI;
    // sun: limb-darkened HDR disc + tight aureole
    float ca = clamp(mu, -1.0, 1.0);
    float ang = acos(ca);
    float disc = 1.0 - smoothstep(uSunRad * 0.92, uSunRad * 1.06, ang);
    float ld = 1.0 - 0.45 * (1.0 - sqrt(max(1.0 - pow(ang / uSunRad, 2.0), 0.0)));
    vec3 sunC = vec3(1.0, 0.95, 0.88);
    if (ang < 0.12) sunC *= rayTrans(ro, rd); else sunC = vec3(0.0);
    bg += sunC * disc * ld * 45.0;
    bg += sunC * (exp(-ang / 0.0035) * 2.5 + exp(-ang / 0.02) * 0.08);
  }

  vec3 col = bg;
  float depth = 1.0;

  if (hitA) {
    float t0 = max(ta.x, 0.0);
    float t1 = hitG ? tg.x : ta.y;
    float len = t1 - t0;
    bool inside = camR < RA;

    // cloud shell hit (near side)
    float tC = -1.0;
    if (tcs.x > 0.0) tC = tcs.x; else if (tcs.y > 0.0 && camR < RC) tC = tcs.y;
    if (hitG && tC > tg.x) tC = -1.0;
    if (uCloudFade <= 0.0) tC = -1.0;

    float jit = ign(gl_FragCoord.xy + fract(uTime * 7.31) * 113.0);
    const int N = ${steps};
    vec3 S = vec3(0.0); float odR = 0.0, odM = 0.0; float AG = 0.0;
    vec3 Sc = vec3(0.0); vec3 Tc = vec3(1.0); bool rec = false;
    float pR = phaseR(mu), pM = phaseM(mu, 0.78), pA = phaseM(mu, 0.92);
    int mode = inside ? 2 : (hitG ? 1 : 0);
    for (int i = 0; i < N; i++) {
      float x = (float(i) + jit) / float(N);
      float t, ds;
      if (mode == 0) {           // limb: dense samples around closest approach
        float u = 2.0 * x - 1.0;
        t = t0 + len * 0.5 * (1.0 + sign(u) * u * u);
        ds = len * abs(u) * 2.0 / float(N);
      } else if (mode == 1) {    // looking down from space: dense near the ground
        t = t0 + len * (1.0 - (1.0 - x) * (1.0 - x));
        ds = 2.0 * (1.0 - x) * len / float(N);
      } else {                   // inside the atmosphere: dense near the camera
        t = t0 + len * x * x;
        ds = 2.0 * x * len / float(N);
      }
      if (!rec && tC > 0.0 && t >= tC) {
        Sc = S; Tc = exp(-(BR + BO) * odR - BME * odM); rec = true;
      }
      vec3 P = ro + rd * t;
      float r = length(P);
      float h = max(r - RG, 0.0);
      float dR = exp(-h / HR), dM = exp(-h / HM);
      odR += dR * ds; odM += dM * ds;
      float m = dot(P, L) / r;
      vec3 Tl = exp(-(BR + BO) * (odR + optDepth(r, m, HR)) - BME * (odM + optDepth(r, m, HM)));
      float dA = exp(-pow((h - 0.003) / 0.0022, 2.0));
      S += (dR * BR * pR + dA * BA * pA + dM * BM * pM) * Tl * ds;
      // airglow: a faint green/amber emission shell ~95 km up, visible edge-on at the night limb
      float ag = exp(-pow((h - 0.0145) / 0.0011, 2.0));
      AG += ag * ds;
    }
    vec3 T = exp(-(BR + BO) * odR - BME * odM);
    if (tC > 0.0 && !rec) { Sc = S; Tc = T; rec = true; }
    S *= uSunI; Sc *= uSunI;
    // faint multiple-scatter fill so the night limb keeps a thin blue line
    S += (1.0 - T) * vec3(0.10, 0.22, 0.55) * 0.012 * uSunI;
    S += AG * vec3(0.35, 0.85, 0.45) * 0.35 * smoothstep(0.3, -0.2, dot(normalize(ro + rd * (t0 + len * 0.5)), L));

    vec3 behind = bg;
    if (hitG) {
      vec3 P = Pg;
      vec3 alb = textureGrad(tDay, uv, gx, gy).rgb;
      // slight grade of Blue Marble: deeper oceans, less candy greens
      float al = dot(alb, vec3(0.2126, 0.7152, 0.0722));
      alb = mix(vec3(al), alb, 0.85) * 0.95;
      float water = textureGrad(tWater, uv, gx, gy).r;
      alb *= mix(1.0, 0.65, water);

      // bump relief
      vec3 east = normalize(vec3(n0.z, 0.0, -n0.x) + 1e-5);
      vec3 north = cross(n0, east);
      vec2 tx = vec2(1.0 / 2048.0, 1.0 / 1024.0);
      float b0 = textureGrad(tBump, uv, gx, gy).r;
      float bx = textureGrad(tBump, uv + vec2(tx.x, 0.0), gx, gy).r;
      float by = textureGrad(tBump, uv + vec2(0.0, tx.y), gx, gy).r;
      vec3 n = normalize(n0 - 0.9 * ((bx - b0) * east + (by - b0) * north));

      float ms = dot(n0, L);
      vec3 Ts = sunTrans(1.0, ms);
      // cloud shadow: project along the sun to the shell
      vec3 Ps = normalize(n0 + L * (RC - 1.0) / max(ms, 0.08));
      float cs = cloudCovLod(dirUV(Ps) + vec2(-uCloudRot, 0.0), Ps, 1.5) * uCloudFade;
      float shadow = 1.0 - 0.75 * cs;
      float ndl = dot(n, L);
      float dif = clamp((ndl + 0.04) / 1.04, 0.0, 1.0);
      // skylight
      vec3 sky = vec3(0.30, 0.48, 0.85) * 0.05 * smoothstep(-0.12, 0.35, ms) + vec3(0.9, 0.5, 0.3) * 0.01 * smoothstep(-0.15, 0.05, ms) * smoothstep(0.25, 0.0, ms);
      vec3 g = alb * (uSunI * Ts * dif * shadow + sky * uSunI);

      // ocean sun glint (GGX, two lobes) + sky fresnel
      vec3 V = -rd;
      vec3 Hh = normalize(L + V);
      float ndh = max(dot(n0, Hh), 0.0);
      float ndv = max(dot(n0, V), 1e-3);
      float F = 0.02 + 0.98 * pow(1.0 - max(dot(Hh, V), 0.0), 5.0);
      float a1 = 0.035, a2 = 0.16;
      float D1 = a1 * a1 / (PI * pow(ndh * ndh * (a1 * a1 - 1.0) + 1.0, 2.0));
      float D2 = a2 * a2 / (PI * pow(ndh * ndh * (a2 * a2 - 1.0) + 1.0, 2.0));
      float spec = (0.35 * D1 + 0.65 * D2) * F / (4.0 * ndv) * max(ndl, 0.0);
      // glitter: break the glint into sparkles
      float gl = textureLod(tNoise, P * 900.0, 0.0).g;
      spec *= mix(0.6, 1.6, smoothstep(0.45, 0.85, gl));
      g += water * spec * uSunI * Ts * shadow;
      float Fv = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
      g += water * Fv * vec3(0.25, 0.45, 0.9) * 0.06 * uSunI * smoothstep(-0.1, 0.3, ms);

      // city lights on the night side, dimmed under clouds, with a warm terminator edge
      vec3 nraw = textureGrad(tNight, uv, gx, gy).rgb;
      vec3 nl = nightLights(nraw);
      // Black Marble's moonlit base: keeps continents faintly readable on the night side
      g += pow(nraw, vec3(2.2)) * vec3(0.5, 0.65, 1.0) * 0.06 * smoothstep(0.0, -0.15, ms);
      float nightF = smoothstep(0.02, -0.12, ms);
      // when the texture is magnified, break the lights into street-scale sparkle instead of soft blobs
      float mag = clamp(1.0 - gl0 * 4096.0 / 1.2, 0.0, 1.0);
      float sp = textureLod(tNoise, P * 1400.0, 0.0).g * 0.6 + textureLod(tNoise, P * 4100.0 + 0.3, 0.0).g * 0.4;
      nl *= mix(1.0, 0.55 + smoothstep(0.3, 0.75, sp) * 0.9, mag * 0.5);
      float covHere = cloudCovGrad(uv + vec2(-uCloudRot, 0.0), n0, gx, gy) * uCloudFade;
      g += nl * nightF * uLightsI * (1.0 - 0.75 * covHere);

      behind = g;
      vec4 cp = uViewProj * vec4(P, 1.0);
      depth = clamp(cp.z / cp.w * 0.5 + 0.5, 0.0, 1.0);
    }

    col = S + T * behind;

    if (rec) {
      float cov = cloudCovGrad(cuv, nc, cgx, cgy);
      float a = smoothstep(0.02, 0.75, cov) * 0.97 * uCloudFade;
      a *= smoothstep(uShellNear.x, uShellNear.y, tC);
      // pseudo-normal from coverage gradient: gives the cloud tops relief
      vec2 ctx = vec2(1.0 / 2048.0, 1.0 / 1024.0) * 1.5;
      float cx = cloudCovGrad(cuv + vec2(ctx.x, 0.0), nc, cgx, cgy);
      float cy = cloudCovGrad(cuv + vec2(0.0, ctx.y), nc, cgx, cgy);
      vec3 ce = normalize(vec3(nc.z, 0.0, -nc.x) + 1e-5);
      vec3 cn = cross(nc, ce);
      vec3 nn = normalize(nc - 1.6 * ((cx - cov) * ce + (cy - cov) * cn));
      float mc = dot(nc, L);
      vec3 Tsc = sunTrans(RC, mc);
      float dl = clamp(dot(nn, L) * 0.55 + 0.45 * clamp(mc * 1.4 + 0.2, 0.0, 1.0), 0.0, 1.0);
      // thin edges glow when back-lit (forward scattering / silver lining)
      float fwd = phaseM(mu, 0.6) * (1.0 - a * 0.6) * 1.5;
      vec3 amb = vec3(0.32, 0.5, 0.85) * 0.06 * smoothstep(-0.12, 0.35, mc);
      vec3 cc = vec3(0.96, 0.97, 1.0) * (uSunI * Tsc * (dl * 0.95 + fwd) + amb * uSunI);
      // night: under-lit by the cities, a hint of moon
      vec3 glow = nightLights(textureLod(tNight, dirUV(nc), 4.5).rgb) * uLightsI * 0.07;
      cc += (glow + vec3(0.004, 0.006, 0.01)) * smoothstep(0.05, -0.1, mc);
      // atmosphere in front of the cloud, the cloud, then (through its gaps) what lies behind
      col = Sc + a * Tc * cc + (1.0 - a) * (S - Sc + T * behind);
    }
  }

  gl_FragColor = vec4(max(col, 0.0), 1.0);
  gl_FragDepth = depth;
}
`;

// ---------------------------------------------------------------- arcs
export const arcVert = /* glsl */ `
attribute vec3 aNext;
attribute float aT;
attribute float aSide;
uniform vec2 uRes;
uniform float uWidth;
uniform vec3 uCam;
varying float vT;
varying float vSide;
varying float vVis;
void main() {
  vec4 c0 = projectionMatrix * viewMatrix * vec4(position, 1.0);
  vec4 c1 = projectionMatrix * viewMatrix * vec4(aNext, 1.0);
  vec2 s0 = c0.xy / c0.w, s1 = c1.xy / c1.w;
  vec2 d = (s1 - s0) * uRes;
  d = length(d) > 1e-6 ? normalize(d) : vec2(1.0, 0.0);
  vec2 nrm = vec2(-d.y, d.x);
  c0.xy += nrm * aSide * uWidth / uRes * 2.0 * c0.w;
  gl_Position = c0;
  vT = aT; vSide = aSide;
  // soft occlusion by the planet: closest approach of the eye ray to the centre
  // fade anything whose ground point lies beyond the visible horizon (no loops over the far side)
  float hc = 1.0 / length(uCam);
  float facing = dot(normalize(position), normalize(uCam));
  vVis = smoothstep(hc + 0.04, hc + 0.28, facing);
}
`;

export const arcFrag = /* glsl */ `
uniform float uHead;     // 0..1 position of the travelling head; >1 = arrived
uniform float uAlpha;
uniform float uTime;
uniform float uPhase;
varying float vT;
varying float vSide;
varying float vVis;
void main() {
  float drawn = smoothstep(uHead + 0.002, uHead - 0.004, vT);
  if (drawn <= 0.0 || vVis <= 0.0) discard;
  float core = exp(-vSide * vSide * 9.0);
  float halo = exp(-vSide * vSide * 2.2);
  float behindHead = max(uHead - vT, 0.0);
  float head = exp(-behindHead * 28.0) * step(uHead, 1.02);
  float trail = mix(0.35, 1.0, exp(-behindHead * 4.0));
  // endless soft pulse travelling toward Cairo once drawn
  float pul = pow(0.5 + 0.5 * sin((vT - uTime * 0.22 + uPhase) * 6.2831 * 2.0), 24.0) * smoothstep(1.0, 1.3, uHead);
  float ends = smoothstep(0.0, 0.035, vT) * (0.6 + 0.4 * smoothstep(1.0, 0.94, vT));
  vec3 gold = vec3(1.0, 0.58, 0.24);
  vec3 hot = vec3(1.0, 0.86, 0.66);
  float grad = mix(0.45, 1.0, vT * vT);   // gathers energy as it reaches Cairo
  vec3 c = gold * (core * 1.7 * trail + halo * 0.25 * trail) * grad + hot * core * (head * 22.0 + pul * 4.0) + gold * halo * head * 2.5;
  gl_FragColor = vec4(c * drawn * ends * vVis * uAlpha, 1.0);
}
`;

// ---------------------------------------------------------------- nodes (points)
export const nodeVert = /* glsl */ `
attribute float aSize;
attribute float aKind;
uniform float uScale;
uniform vec3 uCam;
varying float vKind;
varying float vVis;
void main() {
  vec4 mv = viewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale;
  vKind = aKind;
  vec3 dd = position - uCam;
  float tt = clamp(-dot(uCam, dd) / dot(dd, dd), 0.0, 1.0);
  vVis = smoothstep(0.999, 1.012, length(uCam + dd * tt));
}
`;

export const nodeFrag = /* glsl */ `
uniform float uCairo;   // 0..1 intensity of the Cairo node
uniform float uSrc;     // 0..1 source nodes
uniform float uTime;
varying float vKind;
varying float vVis;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(q, q);
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 60.0);
  float glow = exp(-r2 * 9.0) * (1.0 - r2);
  vec3 c;
  if (vKind > 0.5) {
    float fl = 0.92 + 0.08 * sin(uTime * 3.1) * sin(uTime * 1.7);
    c = (vec3(1.0, 0.9, 0.75) * core * 40.0 + vec3(1.0, 0.6, 0.26) * glow * 2.5) * uCairo * fl;
  } else {
    c = (vec3(1.0, 0.85, 0.65) * core * 8.0 + vec3(1.0, 0.6, 0.26) * glow * 0.5) * uSrc;
  }
  gl_FragColor = vec4(c * vVis, 1.0);
}
`;

// ---------------------------------------------------------------- Cairo ring (surface tangent quad)
export const ringFrag = /* glsl */ `
uniform float uTime;
uniform float uAmt;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float acc = 0.0;
  for (int k = 0; k < 3; k++) {
    float rr = fract(uTime * 0.16 + float(k) / 3.0);
    float w = 0.012 + 0.03 * rr;
    acc += exp(-pow((r - rr) / w, 2.0)) * pow(1.0 - rr, 1.6);
  }
  float disc = exp(-r * r * 60.0) * 0.6;
  vec3 c = vec3(1.0, 0.62, 0.28) * (acc * 3.0 + disc) * uAmt * smoothstep(1.0, 0.85, r);
  gl_FragColor = vec4(c, 1.0);
}
`;
export const ringVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
