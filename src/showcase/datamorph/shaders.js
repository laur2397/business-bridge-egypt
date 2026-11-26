// GLSL for the DataMorph particle system.
// Shared chunk evaluates each particle's morphing target analytically on the GPU
// (state A -> state B with staggered, curved paths). The GPGPU pass only simulates a
// spring displacement + velocity around that target (pointer, burst, turbulence).
import { CURVE_RES } from './shapes.js';

export const commonGLSL = /* glsl */ `
#define PI 3.14159265
#define CURVE_RES ${CURVE_RES}
uniform sampler2D tA;
uniform sampler2D tB;
uniform sampler2D tCurves;
uniform mat3 uRotA;
uniform mat3 uRotB;
uniform mat3 uNebTilt;
uniform vec3 uMapX;
uniform vec3 uMapY;
uniform float uM;
uniform float uTime;

uint pcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
float h1(uint v) { return float(pcg(v)) * (1.0 / 4294967295.0); }
vec3 hv3(uint v) { return vec3(h1(v * 3u + 11u), h1(v * 3u + 12u), h1(v * 3u + 13u)) * 2.0 - 1.0; }

bool isCurve(int k) { return k == 4 || k == 9 || k == 18 || k == 21; }
bool isGlobe(int k) { return (k >= 15 && k <= 19) || k == 24 || k == 25; }

vec3 curveAt(int row, float u) {
  float x = clamp(u, 0.0, 1.0) * float(CURVE_RES - 1);
  int i0 = int(floor(x));
  int i1 = min(i0 + 1, CURVE_RES - 1);
  vec3 a = texelFetch(tCurves, ivec2(i0, row), 0).xyz;
  vec3 b = texelFetch(tCurves, ivec2(i1, row), 0).xyz;
  return mix(a, b, x - float(i0));
}

// returns target position; kind, brightness, curve param (-1 if static)
vec3 targetOf(sampler2D T, mat3 R, ivec2 ij, uint id, out int kind, out float br, out float cu) {
  vec4 d = texelFetch(T, ij, 0);
  kind = int(floor(d.w + 0.001));
  br = 1.0 - fract(d.w + 0.001) + 0.001;
  cu = -1.0;
  vec3 p = d.xyz;
  if (isCurve(kind)) {
    int row = int(d.x + 0.5);
    float spd = texelFetch(tCurves, ivec2(0, row), 0).w;
    float u = fract(d.y + uTime * spd);
    cu = u;
    br = (floor(d.z) - 1.0) / 8.0;
    p = curveAt(row, u) + hv3(id * 5u + 1u) * fract(d.z);
  } else if (kind == 1) {
    float r = length(p.xy);
    float a = uTime * 0.045 / (0.3 + 0.22 * r);
    float c = cos(a), s = sin(a);
    p.xy = mat2(c, s, -s, c) * p.xy;
    p.z += sin(uTime * 0.21 + r * 1.3 + p.x * 0.4) * 0.12;
    p = uNebTilt * p;
  } else if (kind == 0) {
    float a = uTime * 0.012;
    float c = cos(a), s = sin(a);
    p.xz = mat2(c, s, -s, c) * (p.xz + vec2(0.0, 2.5)) - vec2(0.0, 2.5);
    p.y += sin(uTime * 0.17 + h1(id) * 6.2831) * 0.06;
  } else if (kind == 22) {
    float ph = fract(uTime * 0.32 + h1(id * 7u + 3u));
    float ang = h1(id * 5u + 9u) * 6.2831853;
    p += (uMapX * cos(ang) + uMapY * sin(ang)) * (0.03 + ph * 0.6);
    br = (1.0 - ph) * (1.0 - ph) * 0.9;
  }
  if (isGlobe(kind) || kind == 5) p = R * p;
  return p;
}

vec3 morphTarget(ivec2 ij, uint id,
    out int kA, out int kB, out float bA, out float bB, out float cA, out float cB,
    out vec3 pa, out vec3 pb, out float e) {
  pa = targetOf(tA, uRotA, ij, id, kA, bA, cA);
  pb = targetOf(tB, uRotB, ij, id, kB, bB, cB);
  // per-particle stagger: random + a sweep across the destination (top-right first)
  vec3 lead = (pa + pb) * 0.5; // direction independent: reversing scroll mid-morph never jumps
  float sweep = clamp(0.5 - (lead.y * 0.6 - lead.x * 0.4) * 0.14, 0.0, 1.0);
  float delay = 0.5 * (0.7 * h1(id * 13u + 1u) + 0.3 * sweep);
  float x = clamp((uM - delay) / 0.5, 0.0, 1.0);
  e = x < 0.5 ? 4.0 * x * x * x : 1.0 - pow(-2.0 * x + 2.0, 3.0) * 0.5;
  vec3 dl = pb - pa;
  float L = length(dl);
  vec3 side = normalize(cross(dl + vec3(1e-4, 2e-4, 0.0), normalize(hv3(id * 7u + 3u) + vec3(0.0, 0.0, 1e-3))));
  float s = sin(PI * e);
  return mix(pa, pb, e) + side * s * L * (0.16 + 0.24 * h1(id * 17u + 2u)) + vec3(0.0, 0.0, 1.0) * s * min(L, 6.0) * 0.18;
}

// cheap divergence-free ABC flow, two octaves
vec3 abc(vec3 p, float t) {
  vec3 q = p * 0.9 + vec3(t * 0.21, -t * 0.17, t * 0.13);
  vec3 v = vec3(sin(q.z) + cos(q.y), sin(q.x) + cos(q.z), sin(q.y) + cos(q.x));
  q = p.yzx * 2.3 - vec3(t * 0.33, t * 0.29, -t * 0.31);
  v += 0.5 * vec3(sin(q.z) + cos(q.y), sin(q.x) + cos(q.z), sin(q.y) + cos(q.x));
  return v;
}
`;

export const velocityShader = /* glsl */ `
${commonGLSL}
uniform float uDt;
uniform float uK;
uniform float uC;
uniform float uTurb;
uniform float uIdle;
uniform float uAspect;
uniform float uPtrStr;
uniform float uPtrR;
uniform vec2 uPtr;
uniform vec2 uPtrVel;
uniform mat4 uVP;
uniform vec3 uCamR;
uniform vec3 uCamU;
uniform vec3 uCamF;
uniform vec4 uBurst;

void main() {
  ivec2 ij = ivec2(gl_FragCoord.xy);
  uint id = uint(ij.y) * uint(resolution.x) + uint(ij.x);
  vec3 d = texelFetch(tDisp, ij, 0).xyz;
  vec3 v = texelFetch(tVel, ij, 0).xyz;
  int kA, kB; float bA, bB, cA, cB, e; vec3 pa, pb;
  vec3 p0 = morphTarget(ij, id, kA, kB, bA, bB, cA, cB, pa, pb, e);
  vec3 wp = p0 + d;

  float hk = 0.75 + 0.5 * h1(id * 31u + 7u);
  vec3 acc = -uK * hk * d - uC * v;

  float act = sin(PI * e);
  float dusty = (kA <= 1 ? 1.0 - e : 0.0) + (kB <= 1 ? e : 0.0);
  acc += abc(wp, uTime) * (uTurb * act * act + uIdle * dusty);

  vec4 clip = uVP * vec4(wp, 1.0);
  if (clip.w > 0.05) {
    vec2 ndc = clip.xy / clip.w;
    vec2 dd = (ndc - uPtr) * vec2(uAspect, 1.0);
    float r2 = dot(dd, dd);
    float depthScale = clip.w * 0.09;
    vec2 dir2 = dd / sqrt(r2 + 1e-5);
    vec3 push = uCamR * dir2.x + uCamU * dir2.y;
    vec3 swirl = uCamR * -dir2.y + uCamU * dir2.x;
    float f = exp(-r2 / (uPtrR * uPtrR));
    acc += (push * 1.0 + swirl * 0.75 + uCamF * 0.35 + vec3(uPtrVel * 0.6, 0.0)) * f * uPtrStr * depthScale * 26.0;
    if (uBurst.z > 0.0) {
      vec2 bd = (ndc - uBurst.xy) * vec2(uAspect, 1.0);
      float br2 = dot(bd, bd);
      float fb = exp(-br2 / (uBurst.w * uBurst.w));
      vec2 bdir = bd / sqrt(br2 + 1e-4);
      vec3 imp = (uCamR * bdir.x + uCamU * bdir.y) * (0.6 + h1(id * 41u)) + hv3(id * 43u + 5u) * 0.9 + uCamF * 0.5;
      v += imp * fb * uBurst.z * depthScale * 7.5;
    }
  }
  v += acc * uDt;
  gl_FragColor = vec4(v, 1.0);
}
`;

export const dispShader = /* glsl */ `
uniform float uDt;
void main() {
  ivec2 ij = ivec2(gl_FragCoord.xy);
  vec3 d = texelFetch(tDisp, ij, 0).xyz;
  vec3 v = texelFetch(tVel, ij, 0).xyz;
  d += v * uDt;
  float l = length(d);
  if (l > 7.0) d *= 7.0 / l;
  gl_FragColor = vec4(d, 1.0);
}
`;

export const renderVertex = /* glsl */ `
${commonGLSL}
attribute vec2 ref;
uniform sampler2D tDisp;
uniform sampler2D tVel;
uniform vec4 uStyle[26];
uniform float uSize[26];
uniform float uPx;
uniform float uFocus;
uniform float uSizeMul;
uniform float uAlphaMul;
uniform float uIntro;
uniform vec3 uSky;
varying vec3 vCol;
varying float vA;
varying float vSharp;

float kindAlpha(int k, float br, float cu, vec3 p) {
  float a = 1.0;
  if (isCurve(k)) {
    float ends = smoothstep(0.0, k == 18 ? 0.1 : 0.035, cu) * smoothstep(1.0, 0.95, cu);
    a *= ends;
  }
  if (isGlobe(k) || k == 5) {
    vec3 n = normalize(p);
    vec3 toCam = normalize(cameraPosition - p);
    float facing = dot(n, toCam);
    if (k == 19) a *= pow(1.0 - abs(facing), 3.0) * 1.6;
    else a *= mix(0.07, 1.0, smoothstep(-0.12, 0.32, facing));
  }
  return a;
}

void main() {
  ivec2 ij = ivec2(ref);
  uint id = uint(ij.y) * uint(${'RES'}) + uint(ij.x);
  int kA, kB; float bA, bB, cA, cB, e; vec3 pa, pb;
  vec3 p0 = morphTarget(ij, id, kA, kB, bA, bB, cA, cB, pa, pb, e);
  vec3 d = texelFetch(tDisp, ij, 0).xyz;
  vec3 v = texelFetch(tVel, ij, 0).xyz;
  vec3 wp = p0 + d;
  vec4 mv = modelViewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mv;

  vec4 sA = uStyle[kA], sB = uStyle[kB];
  float aA = sA.a * kindAlpha(kA, bA, cA, pa) * bA;
  float aB = sB.a * kindAlpha(kB, bB, cB, pb) * bB;
  vec3 col = mix(sA.rgb, sB.rgb, e);
  float a = mix(aA, aB, e);
  float sz = mix(uSize[kA], uSize[kB], e);

  float hv = h1(id * 29u + 5u);
  // accents: a few gold particles turn sky / white-hot
  float acc = h1(id * 37u + 3u);
  if (acc > 0.93 && (kA <= 3 || kB <= 3)) col = mix(col, uSky * 1.2, 0.85);
  else if (acc < 0.025) col = mix(col, vec3(1.6, 1.45, 1.25), 0.7);
  col *= 0.7 + 0.6 * hv;

  // pulses
  int kk = e < 0.5 ? kA : kB;
  if (kk == 5) { float pu = 0.5 + 0.5 * sin(uTime * 3.2); col *= 1.0 + 1.6 * pu * pu; sz *= 1.0 + 0.5 * pu; }
  if (kk == 14 || kk == 25) { float pu = 0.5 + 0.5 * sin(uTime * 2.2 + hv * 0.6 + float(ij.x % 6)); col *= 0.75 + 0.7 * pu; }

  // motion makes particles hot
  float sp = length(v);
  col += vec3(1.0, 0.82, 0.55) * min(sp * 0.22, 2.2);
  float mid = sin(PI * e);
  col += vec3(0.9, 0.75, 0.5) * mid * 0.35;

  float depth = max(0.1, -mv.z);
  float coc = abs(depth - uFocus);
  float px = sz * uSizeMul * uPx / depth;
  px *= 1.0 + coc * 0.16;
  a /= 1.0 + coc * coc * 0.08;
  a *= exp(-max(0.0, depth - uFocus - 1.5) * 0.12);
  vSharp = clamp(1.0 - coc * 0.25, 0.0, 1.0);
  if (px < 1.5) { a *= px / 1.5; px = 1.5; }
  if (px > 48.0) { a *= 48.0 / px; px = 48.0; }
  gl_PointSize = px;
  vCol = col;
  vA = a * uAlphaMul * uIntro;
}
`;

export const renderFragment = /* glsl */ `
varying vec3 vCol;
varying float vA;
varying float vSharp;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float soft = exp(-r2 * 3.2);
  float core = exp(-r2 * 14.0);
  float f = mix(soft, soft * 0.55 + core, vSharp);
  gl_FragColor = vec4(vCol, vA * f);
}
`;

export const finalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uBg: { value: null },
    uGlow: { value: null },
    uCenter: { value: null },
    uAspect: { value: 1 },
    uTime: { value: 0 },
    uExposure: { value: 1 },
    uGrain: { value: 0.035 },
    uRes: { value: null },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 uBg;
    uniform vec3 uGlow;
    uniform vec2 uCenter;
    uniform float uAspect;
    uniform float uTime;
    uniform float uExposure;
    uniform float uGrain;
    uniform vec2 uRes;
    varying vec2 vUv;
    vec3 aces(vec3 x) {
      const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c) {
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }
    float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
    void main() {
      vec3 hdr = texture2D(tDiffuse, vUv).rgb;
      vec3 m = toSRGB(aces(hdr * uExposure));
      vec2 q = (vUv - uCenter) * vec2(uAspect, 1.0);
      vec3 bg = uBg + uGlow * exp(-dot(q, q) * 2.6);
      vec3 col = 1.0 - (1.0 - bg) * (1.0 - m);
      vec2 vq = (vUv - 0.5) * vec2(uAspect, 1.0);
      col *= mix(1.0, 0.5, smoothstep(0.45, 1.25, length(vq)));
      float g = hash(vUv * uRes + fract(uTime * 7.31) * 113.0) - 0.5;
      col += g * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
