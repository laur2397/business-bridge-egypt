// Shared atmosphere model for every material in the river chapter.
//  - exponential height fog with an analytic optical-depth integral
//  - uniform aerial extinction for kilometre-scale haze
//  - in-scatter colour = sky horizon colour looked up by angle to the sun (from the sky model on the CPU)
//    + Henyey-Greenstein Mie lobe toward the sun + city sky-glow at night
// Applied per material with onBeforeCompile (no ShaderChunk patching).
import { Color, Vector3 } from 'three';

export function createAtmosUniforms() {
  return {
    uSunDir: { value: new Vector3(0, 0.05, -1).normalize() },
    uSunCol: { value: new Color(1, 0.7, 0.4) },
    uHaze: { value: Array.from({ length: 8 }, () => new Color(0.5, 0.45, 0.4)) },
    uZenith: { value: new Color(0.1, 0.2, 0.4) },
    uFogDens: { value: 0.004 },
    uFogFall: { value: 0.03 },
    uAerial: { value: 0.00012 },
    uMieG: { value: 0.75 },
    uMieK: { value: 1.0 },
    uMistNear: { value: 0.0 },
    uCityGlow: { value: new Color(0, 0, 0) },
    uCityDir: { value: new Vector3(0.7, 0, -0.7).normalize() },
  };
}

export const ATMOS_GLSL = /* glsl */`
  uniform vec3 uSunDir;
  uniform vec3 uSunCol;
  uniform vec3 uHaze[ 8 ];
  uniform vec3 uZenith;
  uniform float uFogDens;
  uniform float uFogFall;
  uniform float uAerial;
  uniform float uMieG;
  uniform float uMieK;
  uniform float uMistNear;
  uniform vec3 uCityGlow;
  uniform vec3 uCityDir;

  vec3 atmHaze( vec3 dir ) {
    vec2 a = normalize( dir.xz + vec2( 1e-6 ) );
    vec2 b = normalize( uSunDir.xz + vec2( 1e-6 ) );
    float ang = degrees( acos( clamp( dot( a, b ), -1.0, 1.0 ) ) );
    vec3 c = uHaze[ 7 ];
    if ( ang < 5.0 ) c = mix( uHaze[ 0 ], uHaze[ 1 ], ang / 5.0 );
    else if ( ang < 10.0 ) c = mix( uHaze[ 1 ], uHaze[ 2 ], ( ang - 5.0 ) / 5.0 );
    else if ( ang < 20.0 ) c = mix( uHaze[ 2 ], uHaze[ 3 ], ( ang - 10.0 ) / 10.0 );
    else if ( ang < 35.0 ) c = mix( uHaze[ 3 ], uHaze[ 4 ], ( ang - 20.0 ) / 15.0 );
    else if ( ang < 55.0 ) c = mix( uHaze[ 4 ], uHaze[ 5 ], ( ang - 35.0 ) / 20.0 );
    else if ( ang < 90.0 ) c = mix( uHaze[ 5 ], uHaze[ 6 ], ( ang - 55.0 ) / 35.0 );
    else c = mix( uHaze[ 6 ], uHaze[ 7 ], ( ang - 90.0 ) / 90.0 );
    // looking up through the haze layer: thinner, bluer
    c = mix( c, uZenith, smoothstep( 0.05, 0.6, dir.y ) * 0.6 );
    // city light pollution (sodium sky-glow) low over the skyline
    float cg = pow( max( dot( a, normalize( uCityDir.xz ) ), 0.0 ), 4.0 );
    c += uCityGlow * cg * exp( -max( dir.y, 0.0 ) * 14.0 );
    return c;
  }

  float atmHG( float mu, float g ) {
    float g2 = g * g;
    return ( 1.0 - g2 ) / ( 12.566371 * pow( max( 1.0 + g2 - 2.0 * g * mu, 1e-4 ), 1.5 ) );
  }

  // optical depth from the camera to world point wp
  float atmDepth( vec3 wp, out vec3 dir ) {
    vec3 cam = cameraPosition;
    vec3 d = wp - cam;
    float dist = length( d );
    dir = d / max( dist, 1e-4 );
    dir.y = abs( dir.y ) * sign( wp.y - cam.y + 1e-5 );
    float y0 = abs( cam.y );
    float y1 = max( wp.y, 0.0 );
    float b = uFogFall;
    float dy = y1 - y0;
    float e0 = exp( -b * y0 );
    float hf = abs( dy ) > 0.05 ? ( e0 - exp( -b * y1 ) ) / ( b * dy ) : e0;
    return ( uFogDens * hf + uAerial + uMistNear ) * dist;
  }

  vec3 atmApply( vec3 col, vec3 wp, float mul ) {
    vec3 dir;
    float od = atmDepth( wp, dir ) * mul;
    float T = exp( -od );
    float mu = dot( dir, uSunDir );
    vec3 ins = atmHaze( dir ) + uSunCol * atmHG( mu, uMieG ) * uMieK;
    return col * T + ins * ( 1.0 - T );
  }

  float atmTrans( vec3 wp, float mul ) {
    vec3 dir;
    return exp( -atmDepth( wp, dir ) * mul );
  }
`;

export function bindAtmos(shaderUniforms, U) {
  for (const k in U) shaderUniforms[k] = U[k];
}

/**
 * Patch a built-in (MeshStandard/Physical) material: replaces three's fog with the atmosphere model.
 * extra(shader) may add more injections. key makes the program cache unique.
 */
export function patchAtmos(material, U, { key = material.name || 'm', mul = 1, extra = null } = {}) {
  material.onBeforeCompile = (shader, r) => {
    bindAtmos(shader.uniforms, U);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${ATMOS_GLSL}\nvarying vec3 vAtmW;`)
      .replace('#include <fog_fragment>', `gl_FragColor.rgb = atmApply( gl_FragColor.rgb, vAtmW, ${mul.toFixed(3)} );`);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAtmW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        {
          vec4 atmP = vec4( transformed, 1.0 );
          #ifdef USE_BATCHING
            atmP = batchingMatrix * atmP;
          #endif
          #ifdef USE_INSTANCING
            atmP = instanceMatrix * atmP;
          #endif
          vAtmW = ( modelMatrix * atmP ).xyz;
        }`);
    if (extra) extra(shader, r);
  };
  material.customProgramCacheKey = () => 'river-' + key;
  return material;
}
