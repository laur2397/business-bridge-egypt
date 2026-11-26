// Small GLSL helpers shared by river materials.
export const NOISE_GLSL = /* glsl */`
  float rHash( vec3 p ) { p = fract( p * 0.3183099 + vec3( 0.71, 0.113, 0.419 ) ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
  float rHash2( vec2 p ) { p = fract( p * vec2( 233.34, 851.73 ) ); p += dot( p, p + 23.45 ); return fract( p.x * p.y ); }
  float rNoise( vec3 x ) {
    vec3 i = floor( x ); vec3 f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( mix( rHash( i ), rHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( rHash( i + vec3( 0, 1, 0 ) ), rHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
                mix( mix( rHash( i + vec3( 0, 0, 1 ) ), rHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( rHash( i + vec3( 0, 1, 1 ) ), rHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
  }
  float rNoise2( vec2 x ) {
    vec2 i = floor( x ); vec2 f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( rHash2( i ), rHash2( i + vec2( 1, 0 ) ), f.x ), mix( rHash2( i + vec2( 0, 1 ) ), rHash2( i + vec2( 1, 1 ) ), f.x ), f.y );
  }
  float rFbm( vec3 p ) { float r = 0.0, a = 0.5; for ( int i = 0; i < 4; i ++ ) { r += a * rNoise( p ); p = p * 2.03 + 1.7; a *= 0.5; } return r; }
  float rFbm2( vec2 p ) { float r = 0.0, a = 0.5; for ( int i = 0; i < 5; i ++ ) { r += a * rNoise2( p ); p = mat2( 1.6, 1.2, -1.2, 1.6 ) * p + 1.7; a *= 0.5; } return r; }
`;

// world-space normal from three's view-space `normal` in a fragment shader
export const WORLD_NORMAL = '( vec4( normal, 0.0 ) * viewMatrix ).xyz';
