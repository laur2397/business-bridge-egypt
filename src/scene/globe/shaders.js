// GLSL for the Business Bridge Egypt globe. Colours are authored in sRGB and written
// straight to the (non tone-mapped) output, so they match the CSS palette 1:1.

// Shared: tangent basis on the unit sphere for surface-aligned quads.
const TANGENT = /* glsl */ `
  vec3 tangentOf(vec3 n) {
    vec3 up = abs(n.y) > 0.995 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    return normalize(cross(up, n));
  }
`;

// ---------------------------------------------------------------- sphere body
export const bodyVert = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vWN;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    vN = vWN;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const bodyFrag = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uEdge;
  uniform vec3 uRim;
  uniform vec3 uLightDir;
  uniform float uRimStrength;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vWN;
  void main() {
    vec3 n = normalize(vN);
    float facing = clamp(dot(n, normalize(vV)), 0.0, 1.0);
    float light = clamp(dot(n, uLightDir) * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(uEdge, uCore, smoothstep(0.0, 0.9, facing));
    col += uCore * 0.3 * pow(light, 2.2);                  // soft key light from top-left
    float fres = pow(1.0 - facing, 3.2);
    col += uRim * fres * uRimStrength * (0.55 + 0.6 * light);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// ---------------------------------------------------------------- outer halo (camera-facing disc)
export const haloVert = /* glsl */ `
  varying vec2 vP;
  void main() {
    vP = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const haloFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uColor2;
  uniform float uR;       // silhouette radius in the plane through the globe centre
  uniform float uStrength;
  varying vec2 vP;
  void main() {
    float r = length(vP);
    float x = (r - uR) / uR;
    if (x < -0.02) discard;
    x = max(x, 0.0);
    float tight = exp(-x * 26.0);
    float wide = exp(-x * 5.5) * 0.32;
    float g = (tight * 0.9 + wide) * smoothstep(-0.02, 0.012, (r - uR) / uR);
    // slightly brighter towards upper-left, like the body's key light
    float dirk = 0.75 + 0.25 * dot(normalize(vP), normalize(vec2(-0.6, 0.8)));
    vec3 col = mix(uColor2, uColor, tight);
    gl_FragColor = vec4(col * g * uStrength * dirk, 1.0);
  }
`;

// ---------------------------------------------------------------- land dots (instanced, surface aligned)
export const dotVert = /* glsl */ `
  attribute vec3 aPos;
  attribute vec2 aFlag;      // x: isEgypt, y: random
  uniform float uSize;
  uniform float uEgyptBoost;
  uniform float uTime;
  uniform float uMotion;
  varying vec2 vUv;
  varying float vFacing;
  varying float vEgypt;
  varying float vRnd;
  varying float vLight;
  uniform vec3 uLightDir;
  ${TANGENT}
  void main() {
    vec3 n = aPos;
    vec3 t = tangentOf(n);
    vec3 b = cross(n, t);
    float eg = aFlag.x * uEgyptBoost;
    float s = uSize * (1.0 + 0.2 * eg) * (0.9 + 0.2 * aFlag.y);
    vec3 p = n * 1.0025 + (t * position.x + b * position.y) * s;
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vec3 wn = normalize(mat3(modelMatrix) * n);
    vFacing = dot(wn, normalize(cameraPosition - wp.xyz));
    vLight = clamp(dot(wn, uLightDir) * 0.5 + 0.5, 0.0, 1.0);
    vUv = position.xy * 2.0;
    vEgypt = eg;
    vRnd = aFlag.y;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const dotFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uEgyptColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uMotion;
  varying vec2 vUv;
  varying float vFacing;
  varying float vEgypt;
  varying float vRnd;
  varying float vLight;
  void main() {
    float d = length(vUv);
    float a = smoothstep(1.0, 0.55, d);
    if (a <= 0.0) discard;
    float limb = smoothstep(0.02, 0.45, vFacing);
    float shade = mix(0.55, 1.0, vLight) * (0.82 + 0.18 * vRnd);
    float tw = 1.0 + uMotion * 0.18 * sin(uTime * 1.6 + vRnd * 40.0) * vEgypt;
    vec3 col = mix(uColor, uEgyptColor, vEgypt);
    float alpha = a * limb * mix(uOpacity * shade, 0.95 * tw, vEgypt);
    gl_FragColor = vec4(col * (1.0 + 0.25 * vEgypt), alpha);
  }
`;

// ---------------------------------------------------------------- arcs (tubes)
export const arcVert = /* glsl */ `
  attribute vec3 aCenter;
  uniform float uThick;
  varying float vT;
  varying float vSoft;
  varying float vFront;
  void main() {
    vec3 p = aCenter + (position - aCenter) * uThick;
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vec3 wn = normalize(mat3(modelMatrix) * normal);
    vSoft = abs(dot(wn, normalize(cameraPosition - wp.xyz)));
    vT = uv.x;
    vec3 wc = (modelMatrix * vec4(aCenter, 1.0)).xyz;
    vec3 gc = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vFront = dot(normalize(wc - gc), normalize(cameraPosition - gc));
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const arcFrag = /* glsl */ `
  uniform vec3 uFrom;
  uniform vec3 uTo;
  uniform vec3 uPulseColor;
  uniform float uDraw;
  uniform float uTime;
  uniform float uMotion;
  uniform float uOffset;
  uniform float uIntensity;   // focus multiplier
  uniform float uGlow;        // 0 = core tube, 1 = soft halo tube
  varying float vT;
  varying float vSoft;
  varying float vFront;
  void main() {
    if (vT > uDraw) discard;
    float front = smoothstep(0.3, 0.8, vFront);
    float soft = uGlow > 0.5 ? pow(vSoft, 2.0) : pow(vSoft, 0.7);
    vec3 col = mix(uFrom, uTo, smoothstep(0.0, 0.85, vT));
    float base = 0.42;
    // bright head while drawing
    float drawing = 1.0 - smoothstep(0.985, 1.0, uDraw);
    float head = exp(-(uDraw - vT) * 28.0) * 1.6 * drawing;
    // travelling light pulse (Cairo -> destination)
    float ph = fract(uTime * 0.16 + uOffset) * 1.5 - 0.25;
    float dp = vT - ph;
    float pulse = exp(-dp * dp * 260.0) * 1.7 * uMotion * (1.0 - drawing);
    float trail = (dp < 0.0 ? exp(dp * 9.0) * 0.35 : 0.0) * uMotion * (1.0 - drawing);
    float ends = smoothstep(0.0, 0.03, vT);
    float b = (base + head + pulse + trail) * ends * soft * uIntensity * front;
    vec3 c = mix(col, uPulseColor, clamp(pulse * 0.6 + head * 0.4, 0.0, 1.0));
    gl_FragColor = vec4(c * b * (uGlow > 0.5 ? 0.22 : 1.0), 1.0);
  }
`;

// ---------------------------------------------------------------- nodes (Cairo + destinations)
export const nodeVert = /* glsl */ `
  uniform vec3 uPos;
  uniform float uSize;
  varying vec2 vUv;
  varying float vFacing;
  ${TANGENT}
  void main() {
    vec3 n = normalize(uPos);
    vec3 t = tangentOf(n);
    vec3 b = cross(n, t);
    vec3 p = n * 1.006 + (t * position.x + b * position.y) * uSize;
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vec3 wn = normalize(mat3(modelMatrix) * n);
    vFacing = dot(wn, normalize(cameraPosition - wp.xyz));
    vUv = position.xy * 2.0;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const nodeFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uCoreColor;
  uniform float uTime;
  uniform float uMotion;
  uniform float uAmount;     // 0..1 visibility
  uniform float uRings;      // number of ring pulses (0..2)
  uniform float uPhase;
  uniform float uCore;       // core radius (uv units)
  varying vec2 vUv;
  varying float vFacing;
  void main() {
    float d = length(vUv);
    if (d > 1.0) discard;
    float limb = smoothstep(0.0, 0.3, vFacing);
    float core = smoothstep(uCore, uCore * 0.35, d);
    float glow = exp(-d * d / (uCore * uCore * 6.0)) * 0.55;
    float rings = 0.0;
    for (int k = 0; k < 2; k++) {
      if (float(k) >= uRings) break;
      float ph = uMotion > 0.5 ? fract(uTime * 0.38 + uPhase + float(k) * 0.5) : 0.55 + float(k) * 0.25;
      float r = mix(uCore * 1.2, 0.96, ph);
      float w = 0.018 + 0.03 * ph;
      rings += smoothstep(w, 0.0, abs(d - r)) * pow(1.0 - ph, 1.4) * 1.3;
    }
    vec3 col = uColor * (glow + rings) + uCoreColor * core;
    gl_FragColor = vec4(col * uAmount * limb, 1.0);
  }
`;
