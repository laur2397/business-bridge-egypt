// Volumetric cloud dive: a full-screen raymarch through a sunlit cumulus shell over the Nile Delta.
// Works in a local km frame (x east, y up, z north; Earth centre at (0,-6371,0)) so the cloud deck
// follows the planet's curvature and meets the orbital cloud shell at the horizon. Output is premultiplied.
import { atmoCommon, cloudCommon } from './shaders.js';

export const diveFrag = (steps, lightSteps) => /* glsl */ `
precision highp float;
precision highp sampler3D;
${atmoCommon}
${cloudCommon}
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
    for (int i = 0; i < ${steps}; i++) {
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
          for (int j = 0; j < ${lightSteps}; j++) {
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
`;

export const compositeFrag = /* glsl */ `
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
`;
export const compositeVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 1.0, 1.0); }
`;
