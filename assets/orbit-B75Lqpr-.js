import{$ as e,C as t,J as n,K as r,N as i,O as a,P as o,R as s,T as c,X as l,Z as u,_t as d,at as f,d as p,gt as m,ht as h,k as g,nt as _,ot as v,p as y,v as b,yt as x,z as S}from"./UnrealBloomPass-C28B2YMj.js";var C={RG:1,RA:1.034,RC:1+24/6371,HR:.0036,HM:85e-5,TAU_R:[.046,.108,.265],TAU_M:.03,TAU_O:[.018,.042,.002]},w=e=>`vec3(${e.map(e=>e.toFixed(5)).join(`,`)})`,T=`
#define RG ${C.RG.toFixed(6)}
#define RA ${C.RA.toFixed(6)}
#define RC ${C.RC.toFixed(6)}
#define HR ${C.HR.toFixed(6)}
#define HM ${C.HM.toFixed(6)}
#define PI 3.14159265
const vec3 BR = ${w(C.TAU_R)} / HR;
const vec3 BO = ${w(C.TAU_O)} / HR;
const float BM = ${C.TAU_M.toFixed(4)} / HM;
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
`,E=`
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
`,ee=`
uniform mat4 uProjInv;
uniform mat4 uCamWorld;
varying vec3 vDir;
void main() {
  vec4 v = uProjInv * vec4(position.xy, 1.0, 1.0);
  v /= v.w;
  vDir = (uCamWorld * vec4(v.xyz, 0.0)).xyz;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`,te=e=>`
precision highp float;
precision highp sampler3D;
${T}
${E}
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
    const int N = ${e};
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
`,ne=`
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
`,re=`
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
`,ie=`
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
`,ae=`
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
`,oe=`
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
`,se=`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`,ce=(e,t)=>`
precision highp float;
precision highp sampler3D;
${T}
${E}
uniform vec3 uCamL;        // camera in local km
uniform vec3 uE; uniform vec3 uU; uniform vec3 uN;  // world basis of the local frame
uniform vec3 uSunL;        // sun dir in local frame
uniform vec3 uSunCol;      // sunlight at cloud altitude (HDR, already reddened)
uniform vec3 uSkyCol;      // ambient sky
uniform vec3 uHazeCol;     // distant aerial perspective colour
uniform vec3 uMistCol;
uniform float uFade;
uniform float uMist;
uniform float uNear;
uniform float uTime;
varying vec3 vDir;

#define RE 6371.0
#define BASE 12.0
#define TOP 25.0

float remap(float v, float a, float b, float c, float d) { return c + (v - a) / (b - a) * (d - c); }

vec2 shell(vec3 o, vec3 d, float r) {
  float lo = length(o);
  float b = dot(o, d);
  float c = (lo - r) * (lo + r);
  float h = b * b - c;
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

float coverageAt(vec3 q) {
  vec3 n = normalize(uE * q.x + uU * q.y + uN * q.z);
  vec2 uv = dirUV(n) + vec2(-uCloudRot, 0.0);
  return cloudCovDive(uv, n);
}

float density(vec3 p, float alt, float cov, bool cheap) {
  float hf = clamp((alt - BASE) / (TOP - BASE), 0.0, 1.0);
  // cumulus profile: soft base, rounded tops whose height follows coverage
  float top = 0.45 + 0.55 * cov;
  float prof = smoothstep(0.0, 0.14, hf) * smoothstep(top, top * 0.55, hf);
  vec3 w = vec3(uTime * 0.25, 0.0, uTime * 0.08);
  float base = texture(tNoise, (p + w) * 0.028).r * 0.7 + texture(tNoise, (p + w) * 0.0105 + 0.3).r * 0.3;
  float shape = remap(base * prof, 1.0 - cov * 0.92, 1.0, 0.0, 1.0);
  if (shape <= 0.0) return 0.0;
  if (!cheap) {
    float det = texture(tNoise, (p + w * 1.6) * 0.11 + vec3(0.0, uTime * 0.004, 0.0)).g;
    float er = mix(det, 1.0 - det, clamp(hf * 2.5, 0.0, 1.0));
    shape = remap(shape, er * 0.5, 1.0, 0.0, 1.0);
    // close-range wisps
    float hi = texture(tNoise, (p + w * 3.0) * 0.42).g;
    shape = remap(shape, hi * 0.3 * uNear, 1.0, 0.0, 1.0);
  }
  return clamp(shape, 0.0, 1.0);
}

float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }

void main() {
  vec3 dw = normalize(vDir);
  vec3 rd = normalize(vec3(dot(dw, uE), dot(dw, uU), dot(dw, uN)));
  vec3 C0 = vec3(0.0, -RE, 0.0);
  vec3 ro = uCamL - C0;            // centre-relative
  float camAlt = length(ro) - RE;

  vec2 tb = shell(ro, rd, RE + BASE);
  vec2 tt = shell(ro, rd, RE + TOP);
  float t0 = -1.0, t1 = -1.0;
  if (camAlt > TOP) {
    if (tt.x > 0.0) { t0 = tt.x; t1 = tb.x > 0.0 ? tb.x : tt.y; }
  } else if (camAlt > BASE) {
    t0 = 0.0; t1 = tb.x > 0.0 ? tb.x : tt.y;
  } else {
    if (tb.y > 0.0) { t0 = tb.y; t1 = tt.y; }
  }
  t1 = min(t1, t0 + 320.0);

  vec3 S = vec3(0.0); float T = 1.0;
  if (t1 > t0 && t0 >= 0.0 && uFade > 0.001) {
    float jit = ign(gl_FragCoord.xy + fract(uTime * 5.17) * 97.0);
    float cth = dot(rd, uSunL);
    float ph = mix(hg(cth, 0.6), hg(cth, -0.2), 0.3) + hg(cth, 0.9) * 0.3;
    float t = t0 + (0.22 + 0.034 * t0) * jit;
    for (int i = 0; i < ${e}; i++) {
      if (t >= t1) break;
      float ds = 0.22 + 0.034 * t;
      vec3 q = ro + rd * (t + ds * 0.5);
      float alt = length(q) - RE;
      float cov = coverageAt(q);
      if (cov > 0.02) {
        vec3 p = q + C0;
        float d = density(p, alt, cov, t > 35.0) * smoothstep(80.0, 55.0, t);
        if (d > 0.003) {
          float sig = clamp(d * 3.0, 0.0, 1.0) * 3.2;
          // light march toward the sun
          float od = 0.0; float lt = 0.35;
          for (int j = 0; j < ${t}; j++) {
            vec3 lq = q + uSunL * lt;
            od += clamp(density(lq + C0, length(lq) - RE, cov, true) * 3.0, 0.0, 1.0) * lt * 1.6;
            lt *= 2.2;
          }
          float beer = exp(-od) * 0.68 + exp(-od * 0.15) * 0.24 + 0.08 * exp(-od * 0.03); // multiple-scatter approximation
          float powder = 1.0 - exp(-sig * 1.2);
          float hf = clamp((alt - BASE) / (TOP - BASE), 0.0, 1.0);
          vec3 Ls = uSunCol * beer * ph * mix(1.0, powder, 0.5) * 3.2;
          vec3 La = uSkyCol * (0.3 + 0.7 * hf);
          vec3 Lc = Ls + La;
          float haze = 1.0 - exp(-(t + ds * 0.5) / 160.0);
          Lc = mix(Lc, uHazeCol, haze * 0.75);
          float tr = exp(-sig * ds);
          S += T * Lc * (1.0 - tr);
          T *= tr;
          if (T < 0.01) break;
        }
      }
      t += ds;
    }
  }
  float alpha = (1.0 - T) * uFade;
  vec3 outc = S * uFade;
  // final whiteout: thick sunlit mist
  outc = mix(outc, uMistCol, uMist);
  alpha = mix(alpha, 1.0, uMist);
  gl_FragColor = vec4(outc, alpha);
}
`,le=`
uniform sampler2D tDive;
uniform vec2 uTexel;
varying vec2 vUv;
// 5-tap tent filter: resolves the raymarch jitter while upsampling
void main() {
  vec4 c = texture2D(tDive, vUv) * 0.28;
  c += texture2D(tDive, vUv + uTexel * vec2( 0.9,  0.9)) * 0.18;
  c += texture2D(tDive, vUv + uTexel * vec2(-0.9,  0.9)) * 0.18;
  c += texture2D(tDive, vUv + uTexel * vec2( 0.9, -0.9)) * 0.18;
  c += texture2D(tDive, vUv + uTexel * vec2(-0.9, -0.9)) * 0.18;
  gl_FragColor = c;
}
`,ue=`
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 1.0, 1.0); }
`;function de(t=64){let n=t,r=new Uint8Array(n*n*n*2),a=1337,o=()=>(a=a*1664525+1013904223>>>0,a/4294967296),s=e=>{let t=new Float32Array(e*e*e*3);for(let e=0;e<t.length;e++)t[e]=o();return t},c=(e,t,n,r,i)=>{let a=e*r,o=t*r,s=n*r,c=Math.floor(a),l=Math.floor(o),u=Math.floor(s),d=1e9;for(let e=-1;e<=1;e++)for(let t=-1;t<=1;t++)for(let n=-1;n<=1;n++){let f=c+n,p=l+t,m=u+e,h=(f%r+r)%r,g=(p%r+r)%r,_=(((m%r+r)%r*r+g)*r+h)*3,v=f+i[_]-a,y=p+i[_+1]-o,b=m+i[_+2]-s,x=v*v+y*y+b*b;x<d&&(d=x)}return Math.sqrt(d)},l=new Float32Array(512);for(let e=0;e<l.length;e++)l[e]=o();let u=(e,t,n,r)=>{let i=(e%r+r)%r,a=(t%r+r)%r,o=(n%r+r)%r,s=(i*73856093^a*19349663^o*83492791^r*2654435761)>>>0;return l[s%l.length]},d=e=>e*e*e*(e*(e*6-15)+10),f=(e,t,n,r)=>{let i=e*r,a=t*r,o=n*r,s=Math.floor(i),c=Math.floor(a),l=Math.floor(o),f=d(i-s),p=d(a-c),m=d(o-l),h=(e,t,n)=>e+(t-e)*n,g=u(s,c,l,r),_=u(s+1,c,l,r),v=u(s,c+1,l,r),y=u(s+1,c+1,l,r),b=u(s,c,l+1,r),x=u(s+1,c,l+1,r),S=u(s,c+1,l+1,r),C=u(s+1,c+1,l+1,r);return h(h(h(g,_,f),h(v,y,f),p),h(h(b,x,f),h(S,C,f),p),m)},p=s(4),m=s(8),g=s(16),v=s(8),y=s(16),x=s(32),S=(e,t,n,r,i)=>r+(e-t)/(n-t)*(i-r),C=e=>Math.min(1,Math.max(0,e)),w=0;for(let e=0;e<n;e++){let t=(e+.5)/n;for(let e=0;e<n;e++){let i=(e+.5)/n;for(let e=0;e<n;e++){let a=(e+.5)/n,o=(1-c(a,i,t,4,p))*.625+(1-c(a,i,t,8,m))*.25+(1-c(a,i,t,16,g))*.125,s=C(C(S(f(a,i,t,4)*.5+f(a,i,t,8)*.3+f(a,i,t,16)*.2,o-1,1,0,1))*.55+o*.6-.1),l=C((1-c(a,i,t,8,v))*.6+(1-c(a,i,t,16,y))*.28+(1-c(a,i,t,32,x))*.12);r[w++]=Math.round(s*255),r[w++]=Math.round(l*255)}}}let T=new b(r,n,n,n);return T.format=e,T.type=h,T.minFilter=i,T.magFilter=i,T.wrapS=T.wrapT=T.wrapR=_,T.unpackAlignment=1,T.needsUpdate=!0,T}var D=Math.PI/180,O=e=>Math.min(1,Math.max(0,e)),k=(e,t,n)=>e+(t-e)*n,A=(e,t,n)=>{let r=O((n-e)/(t-e));return r*r*(3-2*r)};function j(e,t,n=1,r=new d){let i=Math.cos(e*D);return r.set(i*Math.sin(t*D)*n,Math.sin(e*D)*n,i*Math.cos(t*D)*n)}var M={lat:30.04,lng:31.24},N={lat:30.75,lng:31.05},fe={lat:31.1,lng:31.6},pe=[{name:`London`,lat:51.5,lng:-.13},{name:`Frankfurt`,lat:50.1,lng:8.7},{name:`New York`,lat:40.7,lng:-74},{name:`Lagos`,lat:6.5,lng:3.4},{name:`Riyadh`,lat:24.7,lng:46.7},{name:`Dubai`,lat:25.2,lng:55.3},{name:`Johannesburg`,lat:-26.2,lng:28},{name:`Nairobi`,lat:-1.29,lng:36.8},{name:`Singapore`,lat:1.35,lng:103.8},{name:`Shanghai`,lat:31.2,lng:121.5}],me=.17,he=.028,ge=.085,P=[{p:0,lat:27.17,lng:-15.78,alt:3.6,w:0,ox:-.24,oy:-.033,roll:-22,pitch:-40,hd:-12,hfov:54,slng:152.8},{p:.15,lat:29.14,lng:-14.74,alt:3.15,w:0,ox:-.22,oy:-.026,roll:-18,pitch:-40,hd:-12,hfov:54,slng:147.5},{p:.33,lat:27.29,lng:0,alt:1.9,w:0,ox:.159,oy:.026,roll:18.3,pitch:-40,hd:-12,hfov:54,slng:147},{p:.55,lat:8.85,lng:20.92,alt:.95,w:0,ox:.125,oy:.319,roll:5.3,pitch:-49,hd:-12,hfov:52,slng:147},{p:.64,lat:27,lng:21.5,alt:.45,w:.5,ox:.06,oy:.12,roll:2,pitch:-52,hd:-12,hfov:52,slng:147},{p:.71,lat:28.8,lng:26,alt:.19,w:.97,ox:0,oy:0,roll:0,pitch:-37,hd:-12,hfov:53,slng:146.8},{p:.78,lat:29.8,lng:28.8,alt:.05,w:1,ox:0,oy:0,roll:0,pitch:-21.8,hd:-11,hfov:54,slng:131.2},{p:.83,lat:30.3,lng:29.9,alt:.02,w:1,ox:0,oy:0,roll:0,pitch:-15.4,hd:-11,hfov:55,slng:120.3},{p:.88,lat:30.55,lng:30.5,alt:.009,w:1,ox:0,oy:0,roll:0,pitch:-11.7,hd:-10,hfov:56,slng:108.4},{p:.93,lat:30.7,lng:30.85,alt:.0053,w:1,ox:0,oy:0,roll:0,pitch:-9.9,hd:-9,hfov:60,slng:103.3},{p:1,lat:30.75,lng:31.05,alt:.003,w:1,ox:0,oy:0,roll:0,pitch:-16,hd:-8,hfov:64,slng:99.3}],F=[`lat`,`lng`,`alt`,`w`,`ox`,`oy`,`pitch`,`hd`,`hfov`,`roll`,`slng`];function I(e,t,n,r,i){let a=i*i,o=a*i;return .5*(2*t+(-e+n)*i+(2*e-5*t+4*n-r)*a+(-e+3*t-3*n+r)*o)}function _e(e,t){let n=0;for(;n<P.length-2&&e>P[n+1].p;)n++;let r=P[Math.max(n-1,0)],i=P[n],a=P[n+1],o=P[Math.min(n+2,P.length-1)],s=O((e-i.p)/(a.p-i.p));for(let e of F)e===`alt`?t.alt=Math.exp(I(Math.log(r.alt),Math.log(i.alt),Math.log(a.alt),Math.log(o.alt),s)):e===`w`?t.w=O(k(i.w,a.w,s*s*(3-2*s))):t[e]=I(r[e],i[e],a[e],o[e],s);return t}function L(e,t){let n=Math.sqrt(1.5707963*e);return n/((n-1)*t+1)}function R(e,t,n){let r=e/n,i=(e-1)/n;if(t>=0)return n*Math.exp(-i)*L(r,t);let a=r*Math.sqrt(Math.max(1-t*t,0)),o=a-1/n,s=n*2*Math.exp(Math.min(-o,60))*Math.sqrt(1.5707963*a);return Math.max(s-n*Math.exp(-i)*L(r,-t),0)}function ve(e,t,n){let r=e.length(),i=e.dot(t)/r,a,o;if(r>C.RA){if(i>=0)return n.set(1,1,1);let e=r*Math.sqrt(1-i*i);if(e<1)return n.set(0,0,0);if(e>C.RA)return n.set(1,1,1);a=2*C.HR*Math.exp(-(e-1)/C.HR)*Math.sqrt(1.5707963*e/C.HR),o=2*C.HM*Math.exp(-(e-1)/C.HM)*Math.sqrt(1.5707963*e/C.HM)}else{let s=e.dot(t),c=r*r-1;if(s<0&&s*s-c>0)return n.set(0,0,0);a=R(r,i,C.HR),o=R(r,i,C.HM)}let s=e=>Math.exp(-((C.TAU_R[e]+C.TAU_O[e])/C.HR)*a-C.TAU_M*1.11/C.HM*o);return n.set(s(0),s(1),s(2))}function ye(e){let t=new p;t.setAttribute(`position`,new c([-1,-1,0,3,-1,0,-1,3,0],3));let n=new S(t,e);return n.frustumCulled=!1,n}function be(e,t,n=160){let r=j(e.lat,e.lng),i=j(t.lat,t.lng),a=r.angleTo(i),o=Math.min(.022+a*.07,.085),s=[];for(let e=0;e<=n;e++){let t=e/n,c=Math.sin(a),l=r.clone().multiplyScalar(Math.sin((1-t)*a)/c).add(i.clone().multiplyScalar(Math.sin(t*a)/c)),u=Math.sin(Math.PI*t**.85)*o;s.push(l.normalize().multiplyScalar(1.0015+u))}let l=[],u=[],d=[],f=[],m=[];for(let e=0;e<=n;e++){let t=s[e],r=e<n?s[e+1]:s[e].clone().multiplyScalar(2).sub(s[e-1]);for(let i of[-1,1])l.push(t.x,t.y,t.z),u.push(r.x,r.y,r.z),d.push(e/n),f.push(i);if(e<n){let t=e*2;m.push(t,t+1,t+2,t+1,t+3,t+2)}}let h=new p;return h.setAttribute(`position`,new c(l,3)),h.setAttribute(`aNext`,new c(u,3)),h.setAttribute(`aT`,new c(d,1)),h.setAttribute(`aSide`,new c(f,1)),h.setIndex(m),h}function xe(e){let{renderer:h,quality:b,reduced:C,base:w,assets:T}=e,E=b!==`low`,P=new f,F=new r(30,16/9,.01,50);F.position.set(0,0,4);let I=de(E?64:48),L={tClouds:{value:null},uCloudRot:{value:0},uBankDir:{value:j(fe.lat,fe.lng)},uBankAmt:{value:1},uCoreDir:{value:j(N.lat,N.lng)}},R=new v({vertexShader:ee,fragmentShader:te(E?22:12),uniforms:{...L,uProjInv:{value:new s},uCamWorld:{value:new s},uCam:{value:new d},uSun:{value:new d(1,0,0)},uSunI:{value:5},uSunRad:{value:.36*D},uViewProj:{value:new s},tDay:{value:null},tNight:{value:null},tBump:{value:null},tWater:{value:null},tStars:{value:null},tNoise:{value:I},uLightsI:{value:70},uStarsI:{value:1},uTime:{value:0},uCloudFade:{value:1},uShellNear:{value:new m(0,0)}},depthTest:!0,depthWrite:!0,depthFunc:1}),xe=ye(R);xe.renderOrder=-10,P.add(xe);let Se=[],Ce=new a;P.add(Ce);let we=new m(1,1);pe.forEach((e,t)=>{let n=new v({vertexShader:ne,fragmentShader:re,uniforms:{uRes:{value:we},uWidth:{value:3.2},uCam:{value:new d},uHead:{value:0},uAlpha:{value:1},uTime:{value:0},uPhase:{value:t*.37}},blending:2,transparent:!0,depthWrite:!1,depthTest:!0,side:2}),r=new S(be(e,M),n);r.frustumCulled=!1,r.renderOrder=2,Ce.add(r),Se.push({mesh:r,mat:n,start:me+t*he})});let Te=[],Ee=[],De=[],Oe=j(M.lat,M.lng,1.003);Te.push(Oe.x,Oe.y,Oe.z),Ee.push(64),De.push(1),pe.forEach(e=>{let t=j(e.lat,e.lng,1.002);Te.push(t.x,t.y,t.z),Ee.push(14),De.push(0)});let z=new p;z.setAttribute(`position`,new c(Te,3)),z.setAttribute(`aSize`,new c(Ee,1)),z.setAttribute(`aKind`,new c(De,1));let B=new v({vertexShader:ie,fragmentShader:ae,uniforms:{uScale:{value:1},uCam:{value:new d},uCairo:{value:0},uSrc:{value:0},uTime:{value:0}},blending:2,transparent:!0,depthWrite:!1,depthTest:!0}),V=new l(z,B);V.frustumCulled=!1,V.renderOrder=3,P.add(V);let H=new v({vertexShader:se,fragmentShader:oe,uniforms:{uTime:{value:0},uAmt:{value:0}},blending:2,transparent:!0,depthWrite:!1,depthTest:!0,side:2}),U=new S(new n(.16,.16),H);U.position.copy(j(M.lat,M.lng,1.0018)),U.lookAt(j(M.lat,M.lng,2)),U.renderOrder=1,U.frustumCulled=!1,P.add(U);let ke=new d,Ae=new d,je=new d;{let e=N.lat*D,t=N.lng*D;Ae.copy(j(N.lat,N.lng)),ke.set(Math.cos(t),0,-Math.sin(t)),je.set(-Math.sin(e)*Math.sin(t),Math.cos(e),-Math.sin(e)*Math.cos(t))}let W=new v({vertexShader:ee,fragmentShader:ce(E?80:44,E?4:3),uniforms:{...L,uProjInv:R.uniforms.uProjInv,uCamWorld:R.uniforms.uCamWorld,uCamL:{value:new d},uE:{value:ke},uU:{value:Ae},uN:{value:je},uSunL:{value:new d(0,1,0)},uSunCol:{value:new d(1,1,1)},uSkyCol:{value:new d(.3,.4,.6)},uHazeCol:{value:new d(.6,.6,.7)},uMistCol:{value:new d(3.1,2.8,2.4)},uFade:{value:0},uMist:{value:0},uNear:{value:1},uTime:{value:0},tNoise:{value:I}},depthTest:!1,depthWrite:!1,blending:0});W.uniforms.tClouds=L.tClouds,W.uniforms.uCloudRot=L.uCloudRot,W.uniforms.uCoreDir=L.uCoreDir;let Me=new f;Me.add(ye(W));let Ne=E?.5:.35,G=new x(4,4,{type:g,depthBuffer:!1}),Pe=new m,K=ye(new v({vertexShader:ue,fragmentShader:le,uniforms:{tDive:{value:G.texture},uTexel:{value:new m(.25,.25)}},transparent:!0,depthTest:!1,depthWrite:!1,blending:5,blendSrc:201,blendDst:205,blendSrcAlpha:201,blendDstAlpha:205}));K.renderOrder=20,K.visible=!1,P.add(K);function Fe(){h.getDrawingBufferSize(Pe);let e=Math.max(4,Math.round(Pe.x*Ne)),t=Math.max(4,Math.round(Pe.y*Ne));(G.width!==e||G.height!==t)&&(G.setSize(e,t),K.material.uniforms.uTexel.value.set(1/e,1/t));let n=h.getRenderTarget();h.setRenderTarget(G),h.render(Me,F),h.setRenderTarget(n)}let q=(e,t=`srgb`)=>T.texture(`${w}textures/${e}`,{colorSpace:t}),Ie=Promise.all([q(`earth-day-2k.jpg`),q(`earth-night-2k.jpg`,`linear`),q(`earth-clouds-2k.jpg`,`linear`),q(`earth-bump-2k.jpg`,`linear`),q(`earth-water-2k.jpg`,`linear`),q(`milkyway-2k.jpg`)]).then(([e,t,n,r,a,s])=>{for(let i of[e,t,n,r,a])i.wrapS=_,i.wrapT=y,i.generateMipmaps=!0,i.minFilter=o,i.needsUpdate=!0;s.wrapS=_,s.generateMipmaps=!1,s.minFilter=i,s.needsUpdate=!0;let c=R.uniforms;c.tDay.value=e,c.tNight.value=t,c.tBump.value=r,c.tWater.value=a,c.tStars.value=s,L.tClouds.value=n,We(0,0,J.target,{x:0,y:0},!0);let l=K.visible;K.visible=!0,h.compile(P,F),h.compile(Me,F),K.visible=l,J.first=!0}),J={target:0,p:0,v:0,first:!0,key:{},sunScreen:{x:2,y:.5,visible:!1,intensity:0},exposure:1,focus:{distance:3,aperture:0},grade:{warmth:-.1,tealShadows:.35,saturation:1,contrast:1.05},look:new d(0,0,-1),up:new d(0,1,0),width:1,height:1},Y=new d,X=new d,Le=new d,Z=new d,Q=new d,$=new d,Re=new d,ze=new d(0,1,0),Be=new u,Ve=new t;new s;function He(e){return _e(e,J.key),j(-20.2,J.key.slng,1,Z),Z}function Ue(e,t,n,r){let i=_e(e,J.key),a=J.width/J.height,o=O((1.25-a)/.8),s=Math.min(Math.max((e=>2*Math.atan(Math.tan(e*D/2)/a)/D)(i.hfov),22),62),c=1+o*.45*(1-i.w),l=i.alt*c;j(i.lat,i.lng,1+l,Q);let f=Y.copy(Q).multiplyScalar(-1).normalize(),p=X.crossVectors(f,ze).normalize(),m=Le.crossVectors(p,f).normalize(),h=i.ox*(1-o),g=i.oy+o*.04,_=f.clone().addScaledVector(p,h).addScaledVector(m,g).normalize(),v=new u().setFromAxisAngle(_,i.roll*D),y=m.clone().applyQuaternion(v),b=Q.clone().normalize(),x=new d(b.z,0,-b.x).normalize(),S=new d().crossVectors(b,x),w=Math.atan2(Z.dot(x),Z.dot(S))+i.hd*D,T=S.clone().multiplyScalar(Math.cos(w)).addScaledVector(x,Math.sin(w)).multiplyScalar(Math.cos(i.pitch*D)).addScaledVector(b,Math.sin(i.pitch*D)).normalize(),E=i.w,ee=_.clone().lerp(T,E).normalize(),te=y.clone().lerp(b,E).normalize(),ne=J.first?1:1-Math.exp(-r*6);if(J.look.lerp(ee,ne).normalize(),J.up.lerp(te,ne).normalize(),F.position.copy(Q),F.up.copy(J.up),F.lookAt(Y.copy(Q).add(J.look)),!C){let r=k(7e-4,.0035,A(.8,1,e)),i=(Math.sin(t*.31)*.6+Math.sin(t*.73+1.3)*.3+Math.sin(t*1.37+.2)*.1)*r,a=(Math.sin(t*.27+2.1)*.6+Math.sin(t*.61+.4)*.3+Math.sin(t*1.13+2.7)*.1)*r;Ve.set(a+n.y*.012,i-n.x*.018,0),Be.setFromEuler(Ve),F.quaternion.multiply(Be)}F.fov=s;let re=Q.length()-1;return F.near=Math.max(re*.25,2e-4),F.far=Q.length()+2.5,F.updateProjectionMatrix(),F.updateMatrixWorld(!0),i}function We(e,t,n,r={x:0,y:0},i=!1){if(J.target=O(n),J.first||i)J.p=J.target,J.v=0;else{let t=2/.45,n=t*e,r=1/(1+n+.48*n*n+.235*n*n*n),i=J.p-J.target,a=(J.v+t*i)*e;J.v=(J.v-t*a)*r,J.p=J.target+(i+a)*r}let a=J.p;He(a),Ue(a,t,r,e),J.first=!1;let o=R.uniforms;o.uProjInv.value.copy(F.projectionMatrixInverse),o.uCamWorld.value.copy(F.matrixWorld),o.uCam.value.copy(F.position),o.uSun.value.copy(Z),o.uViewProj.value.multiplyMatrices(F.projectionMatrix,F.matrixWorldInverse),o.uTime.value=t,L.uCloudRot.value=C?0:t*12e-5,o.uStarsI.value=k(1,.25,A(.55,.8,a));let s=A(.835,.905,a);o.uCloudFade.value=1-A(.965,.995,a),o.uShellNear.value.set(58/6371,86/6371).multiplyScalar(s);let c=1-A(.6,.7,a);Ce.visible=c>.001;let l=0;for(let e of Se){let n=(a-e.start)/ge;e.mat.uniforms.uHead.value=Math.max(n,0)*1+Math.max(n-1,0)*.3,e.mesh.visible=n>0&&c>.001,e.mat.uniforms.uAlpha.value=c,e.mat.uniforms.uTime.value=t,e.mat.uniforms.uCam.value.copy(F.position),n>=1&&l++}h.getDrawingBufferSize(we);let u=we.y/Math.max(J.height,1);for(let e of Se)e.mat.uniforms.uWidth.value=2.8*u;B.uniforms.uScale.value=u,B.uniforms.uCam.value.copy(F.position),B.uniforms.uTime.value=t,B.uniforms.uSrc.value=A(.12,.2,a)*c;let d=A(.23800000000000002,.2635,a);if(B.uniforms.uCairo.value=d*(.6+.4*l/Se.length)*(1-A(.62,.74,a)),V.visible=a<.76,H.uniforms.uTime.value=C?1.3:t,H.uniforms.uAmt.value=d*(1-A(.6,.7,a)),U.visible=H.uniforms.uAmt.value>.001,K.visible=s>.001,K.visible||i){let e=W.uniforms,n=F.position;e.uCamL.value.set(n.dot(ke)*6371,(n.dot(Ae)-1)*6371,n.dot(je)*6371),e.uSunL.value.set(Z.dot(ke),Z.dot(Ae),Z.dot(je)).normalize(),ve(j(N.lat,N.lng,1+20/6371),Z,X);let r=o.uSunI.value;e.uSunCol.value.set(X.x*r,X.y*r,X.z*r),e.uSkyCol.value.set(.3,.42,.66).multiplyScalar(r*.11),e.uHazeCol.value.set(.55+X.x*.5,.58+X.y*.35,.72+X.z*.2).multiplyScalar(r*.11),e.uFade.value=s,e.uMist.value=A(.955,1,a),e.uTime.value=C?0:t,K.visible&&Fe()}Y.copy(F.position).addScaledVector(Z,10).project(F);let f=Z.dot(F.getWorldDirection(X))>0,p=Y.x*.5+.5,m=Y.y*.5+.5,g=X.crossVectors(Z,ze).normalize(),_=Le.crossVectors(g,Z).normalize(),v=R.uniforms.uSunRad.value,y=0;for(let e=0;e<7;e++){let t=e/6*Math.PI*2,n=e===6?0:v;Re.copy(Z).addScaledVector(g,Math.cos(t)*n).addScaledVector(_,Math.sin(t)*n).normalize(),ve(F.position,Re,$),y+=($.x*.2126+$.y*.7152+$.z*.0722)/7}let b=f&&p>-.15&&p<1.15&&m>-.15&&m<1.15;J.sunScreen.x=p,J.sunScreen.y=m,J.sunScreen.visible=b&&y>.01&&s<.95,J.sunScreen.intensity=b?y*(1-s*.8):0,J.exposure=k(1,.9,A(.6,.85,a))*k(1,.92,A(.9,1,a)),J.focus.distance=F.position.length()-1+0,J.focus.aperture=A(.86,.95,a)*.02,a>.86&&(J.focus.distance=Math.max(4/6371,F.position.length()-1-20/6371));let x=A(.62,.85,a);J.grade.warmth=k(-.12,.26,x),J.grade.tealShadows=k(.4,.2,x),J.grade.saturation=k(.95,.94,x),J.grade.contrast=k(1.08,.95,A(.85,1,a))}return{scene:P,camera:F,ready:Ie,update:We,resize(e,t){J.width=e,J.height=t,F.aspect=e/t,F.updateProjectionMatrix()},getSun:()=>J.sunScreen,getExposure:()=>J.exposure,getFocus:()=>J.focus,getGrade:()=>J.grade,dispose(){P.traverse(e=>{e.geometry?.dispose(),e.material?.dispose()}),Me.traverse(e=>{e.geometry?.dispose(),e.material?.dispose()}),G.dispose(),I.dispose()}}}export{xe as createChapter};