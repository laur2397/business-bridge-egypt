// Final display-space pass: subtle chromatic aberration at the edges, vignette,
// a gentle darkening of the lower-left (headline zone) and fine animated film grain.
import { Vector2 } from 'three';

export const FilmShader = {
  name: 'HeroFilmShader',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new Vector2(1, 1) },
    uGrain: { value: 0.045 },
    uVignette: { value: 0.42 },
    uCA: { value: 0.006 },
    uShade: { value: 0.3 },
    uGrade: { value: 1 }
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime; uniform vec2 uRes;
    uniform float uGrain; uniform float uVignette; uniform float uCA; uniform float uShade; uniform float uGrade;
    varying vec2 vUv;
    float hash12( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
    void main() {
      vec2 uv = vUv;
      vec2 d = uv - 0.5;
      float r2 = dot( d, d );
      vec2 off = d * r2 * uCA;
      vec3 col;
      col.r = texture2D( tDiffuse, uv - off ).r;
      col.g = texture2D( tDiffuse, uv ).g;
      col.b = texture2D( tDiffuse, uv + off ).b;

      // vignette (aspect-aware, soft)
      vec2 dv = d * vec2( uRes.x / uRes.y, 1.0 ) / max( 1.0, uRes.x / uRes.y * 0.75 );
      float vig = 1.0 - uVignette * smoothstep( 0.18, 0.95, dot( dv, dv ) * 1.6 );
      col *= vig;

      // calmer, darker lower-left for the headline
      float ll = 1.0 - smoothstep( 0.0, 0.85, length( ( uv - vec2( 0.05, 0.0 ) ) * vec2( 0.95, 1.55 ) ) );
      col *= 1.0 - uShade * ll;

      // gentle split-tone: cool shadows, warm highlights
      float lum = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
      vec3 shadowTint = vec3( 0.94, 0.98, 1.06 );
      vec3 hiTint = vec3( 1.03, 1.0, 0.96 );
      col *= mix( vec3( 1.0 ), mix( shadowTint, hiTint, smoothstep( 0.15, 0.7, lum ) ), uGrade );

      // film grain (luma weighted, animated)
      vec2 px = uv * uRes;
      float t = floor( uTime * 24.0 );
      float n = hash12( px + t * 17.13 ) + hash12( px * 1.37 - t * 7.7 ) - 1.0;
      col += n * uGrain * ( 0.35 + 0.65 * ( 1.0 - lum ) ) * 0.6;

      gl_FragColor = vec4( max( col, 0.0 ), 1.0 );
    }`
};
