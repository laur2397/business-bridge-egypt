// Shader patches applied per-material (never touches global ShaderChunk, so other
// three.js scenes on the page are unaffected).

// Haze colour looked up from the sky model by azimuth distance to the sun
// (offsets 0,5,10,20,35,55,90,180 deg), so distant objects dissolve into the
// exact sky colour behind them.
const HAZE_GLSL = /* glsl */`
  uniform vec3 uHaze[ 8 ];
  uniform vec3 uSunWorld;
  vec3 heroHaze( vec3 wdir ) {
    vec2 a = normalize( wdir.xz + vec2( 1e-6 ) );
    vec2 b = normalize( uSunWorld.xz + vec2( 1e-6 ) );
    float ang = degrees( acos( clamp( dot( a, b ), -1.0, 1.0 ) ) );
    float offs[ 8 ] = float[ 8 ]( 0.0, 5.0, 10.0, 20.0, 35.0, 55.0, 90.0, 180.0 );
    vec3 c = uHaze[ 7 ];
    for ( int i = 0; i < 7; i ++ ) {
      if ( ang <= offs[ i + 1 ] ) { c = mix( uHaze[ i ], uHaze[ i + 1 ], ( ang - offs[ i ] ) / ( offs[ i + 1 ] - offs[ i ] ) ); break; }
    }
    return c;
  }
`;

// Directional aerial perspective: the haze is brighter/warmer when looking toward the sun.
export function patchFogStandard(material, shared, extra, fogMul = 1) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, r) => {
    shader.uniforms.uSunWorld = shared.uSunWorld;
    shader.uniforms.uHaze = shared.uHaze;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${HAZE_GLSL}`)
      .replace('#include <fog_fragment>', `
        #ifdef USE_FOG
          float fdF = fogDensity * ${fogMul.toFixed(3)} * vFogDepth;
          float fogFactor = 1.0 - exp( - fdF * fdF );
          vec3 wdirF = normalize( ( vec4( -vViewPosition, 0.0 ) * viewMatrix ).xyz );
          gl_FragColor.rgb = mix( gl_FragColor.rgb, heroHaze( wdirF ), fogFactor );
        #endif`);
    if (extra) extra(shader, r);
    if (prev) prev(shader, r);
  };
  material.customProgramCacheKey = () => material.name + '-heroFog';
}

export function patchFogWater(material, shared) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSunWorld = shared.uSunWorld;
    shader.uniforms.uHaze = shared.uHaze;
    shader.uniforms.uWaterNight = shared.uWaterNight;
    shader.fragmentShader = shader.fragmentShader
      .replace('uniform vec3 waterColor;', `uniform vec3 waterColor;
        ${HAZE_GLSL}
        uniform float uWaterNight;`)
      // softer, broader sun glitter + slightly calmer specular for a photographic river
      .replace('sunLight( surfaceNormal, eyeDirection, 100.0, 2.0, 0.5, diffuseLight, specularLight );',
        'sunLight( surfaceNormal, eyeDirection, 140.0, 1.6, 0.5, diffuseLight, specularLight );')
      // anisotropic distortion: reflections smear vertically into long streaks (like a real river)
      .replace('vec2 distortion = surfaceNormal.xz * ( 0.001 + 1.0 / distance ) * distortionScale;',
        'vec2 distortion = surfaceNormal.xz * vec2( 0.45, 1.7 ) * ( 0.001 + 1.0 / distance ) * distortionScale;')
      .replace('vec3 reflectionSample = vec3( texture2D( mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion ) );',
        'vec3 reflectionSample = vec3( texture2D( mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion ) ) * mix( 0.92, 0.62, uWaterNight );')
      .replace('#include <fog_fragment>', `
        #ifdef USE_FOG
          float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
          gl_FragColor.rgb = mix( gl_FragColor.rgb, heroHaze( normalize( worldPosition.xyz - eye ) ), fogFactor );
        #endif`);
  };
}

// Procedural lit windows on instanced building boxes (unit box with base at y=0).
// Anti-aliased: when a window cell becomes sub-pixel it fades to its average glow.
export function patchWindows(material, shared) {
  patchFogStandard(material, shared, (shader) => {
    shader.uniforms.uOn = shared.uCityOn;
    shader.uniforms.uWin = shared.uWinIntensity;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vLP; varying vec3 vON; varying float vSeed;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 sc = vec3( 1.0 );
          #ifdef USE_INSTANCING
            sc = vec3( length( instanceMatrix[0].xyz ), length( instanceMatrix[1].xyz ), length( instanceMatrix[2].xyz ) );
            vSeed = fract( sin( dot( instanceMatrix[3].xz, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
          #else
            vSeed = 0.5;
          #endif
          vLP = position * sc;
          vON = normal;
        }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uOn; uniform float uWin;
        varying vec3 vLP; varying vec3 vON; varying float vSeed;
        float h21( vec2 p ) { p = fract( p * vec2( 233.34, 851.73 ) ); p += dot( p, p + 23.45 ); return fract( p.x * p.y ); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if ( abs( vON.y ) < 0.5 && uOn > 0.001 ) {
          float hc = abs( vON.x ) > 0.5 ? vLP.z : vLP.x;
          vec2 c = vec2( hc / 3.2, vLP.y / 3.5 );
          vec2 cell = floor( c ); vec2 f = fract( c );
          float bOn = smoothstep( vSeed * 0.75, vSeed * 0.75 + 0.18, uOn );
          float r = h21( cell + vSeed * 91.7 + vON.xz * 13.0 );
          float r2 = h21( cell * 1.37 + vSeed * 17.1 );
          float density = mix( 0.18, 0.62, fract( vSeed * 7.3 ) );
          float lit = step( r, density * bOn ) * step( 0.5, cell.y );
          float mask = smoothstep( 0.18, 0.24, f.x ) * smoothstep( 0.82, 0.76, f.x ) * smoothstep( 0.22, 0.3, f.y ) * smoothstep( 0.78, 0.7, f.y );
          vec3 warm = vec3( 1.0, 0.62, 0.3 );
          vec3 cool = vec3( 0.75, 0.85, 1.0 );
          vec3 wc = mix( warm, cool, step( 0.78, r2 ) ) * ( 0.55 + 0.9 * r2 );
          vec3 pat = wc * mask * lit;
          vec3 avg = mix( warm, cool, 0.22 ) * 0.11 * density * bOn;
          vec2 fw = fwidth( c );
          float blend = smoothstep( 0.25, 0.7, max( fw.x, fw.y ) );
          totalEmissiveRadiance += mix( pat, avg, blend ) * uWin;
        }`);
  });
  material.customProgramCacheKey = () => 'heroWindows';
}
