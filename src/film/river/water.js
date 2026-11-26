// Nile water: planar mirror reflection (own pass, half resolution, restores the render target),
// multi-octave scrolling normals, Kelvin boat wakes, Schlick fresnel, GGX sun glitter in HDR,
// murky green-brown body colour and the shared atmosphere.
import {
  Color, HalfFloatType, Matrix4, Mesh, PerspectiveCamera, Plane, PlaneGeometry, ShaderMaterial,
  Vector3, Vector4, WebGLRenderTarget, LinearFilter,
} from 'three';
import { ATMOS_GLSL, bindAtmos } from './atmos.js';

export const MAX_BOATS = 6;

export function createMirror(scale = 0.5) {
  const rt = new WebGLRenderTarget(2, 2, { type: HalfFloatType, samples: 0, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: true });
  const cam = new PerspectiveCamera();
  cam.layers.set(0);
  const textureMatrix = new Matrix4();
  const normal = new Vector3(0, 1, 0), mirrorPos = new Vector3(0, 0, 0);
  const camPos = new Vector3(), view = new Vector3(), target = new Vector3(), lookAt = new Vector3();
  const rot = new Matrix4(), plane = new Plane(), clip = new Vector4(), q = new Vector4();
  return {
    rt, camera: cam, textureMatrix, scale,
    setSize(w, h) { rt.setSize(Math.max(2, Math.floor(w * scale)), Math.max(2, Math.floor(h * scale))); },
    render(renderer, scene, camera, hide = []) {
      camPos.setFromMatrixPosition(camera.matrixWorld);
      view.subVectors(mirrorPos, camPos);
      view.reflect(normal).negate().add(mirrorPos);
      rot.extractRotation(camera.matrixWorld);
      lookAt.set(0, 0, -1).applyMatrix4(rot).add(camPos);
      target.subVectors(mirrorPos, lookAt).reflect(normal).negate().add(mirrorPos);
      cam.position.copy(view);
      cam.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal);
      cam.lookAt(target);
      cam.far = camera.far; cam.near = camera.near;
      cam.updateMatrixWorld();
      cam.projectionMatrix.copy(camera.projectionMatrix);
      cam.projectionMatrix.elements[8] *= -1;
      cam.projectionMatrix.elements[12] *= -1;
      textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
      textureMatrix.multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
      // oblique near plane = water plane (slightly lowered to avoid seams at the bank)
      plane.setFromNormalAndCoplanarPoint(normal, mirrorPos.set(0, -0.05, 0));
      mirrorPos.set(0, 0, 0);
      plane.applyMatrix4(cam.matrixWorldInverse);
      clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
      const pm = cam.projectionMatrix.elements;
      q.x = (Math.sign(clip.x) + pm[8]) / pm[0];
      q.y = (Math.sign(clip.y) + pm[9]) / pm[5];
      q.z = -1.0;
      q.w = (1.0 + pm[10]) / pm[14];
      clip.multiplyScalar(2.0 / clip.dot(q));
      pm[2] = clip.x; pm[6] = clip.y; pm[10] = clip.z + 1.0; pm[14] = clip.w;
      cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();

      const vis = hide.map((o) => o.visible);
      hide.forEach((o) => { o.visible = false; });
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(rt);
      renderer.state.buffers.depth.setMask(true);
      renderer.clear();
      renderer.render(scene, cam);
      renderer.setRenderTarget(prev);
      hide.forEach((o, i) => { o.visible = vis[i]; });
    },
    dispose() { rt.dispose(); },
  };
}

export function createWater(U, { normals, mirror, quality }) {
  const boats = Array.from({ length: MAX_BOATS }, () => new Vector4(0, 0, 0, 0));
  const mat = new ShaderMaterial({
    name: 'river-water',
    defines: { HAS_MIRROR: mirror ? 1 : 0, MAX_BOATS },
    uniforms: Object.assign({
      tMirror: { value: mirror ? mirror.rt.texture : null },
      uTexMat: { value: mirror ? mirror.textureMatrix : new Matrix4() },
      tNormal: { value: normals },
      uTime: U.uTime,
      uLightDir: U.uLightDir,
      uSunRad: { value: new Color(10, 7, 4) },
      uBody: { value: new Color(0.02, 0.03, 0.025) },
      uReflK: { value: 1 },
      uBoats: { value: boats },
      uWakeK: { value: 1 },
      uRipple: { value: 1 },
      uNightSpec: { value: 0 },
    }, {}),
    vertexShader: /* glsl */`
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4( position, 1.0 );
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tMirror;
      uniform mat4 uTexMat;
      uniform sampler2D tNormal;
      uniform float uTime;
      uniform vec3 uLightDir;
      uniform vec3 uSunRad;
      uniform vec3 uBody;
      uniform float uReflK;
      uniform vec4 uBoats[ MAX_BOATS ];
      uniform float uWakeK;
      uniform float uRipple;
      ${ATMOS_GLSL}
      varying vec3 vW;

      float wakeH( vec2 p, vec4 b ) {
        // b: x, z, heading (rad), strength
        vec2 fwd = vec2( cos( b.z ), sin( b.z ) );
        vec2 d = p - b.xy;
        float along = dot( d, fwd );
        float lat = dot( d, vec2( -fwd.y, fwd.x ) );
        float behind = -along + 3.0;
        if ( behind < -2.0 || behind > 220.0 ) return 0.0;
        float bpos = max( behind, 0.0 );
        float edge = abs( lat ) - bpos * 0.36;
        float w = 1.2 + bpos * 0.05;
        float arm = exp( -edge * edge / ( w * w ) );
        float inner = smoothstep( 0.0, -6.0 - bpos * 0.1, edge ) * 0.45;
        float k = 1.15;
        float waves = sin( k * ( bpos * 0.95 + abs( lat ) * 0.45 ) - uTime * 2.6 ) * ( arm + inner * sin( bpos * 0.6 - uTime * 1.3 ) );
        float centre = exp( -lat * lat / ( 1.2 + bpos * 0.06 ) ) * sin( bpos * 2.1 + lat * 1.7 - uTime * 4.0 ) * 0.6;
        float fade = exp( -bpos / 70.0 ) * smoothstep( -2.0, 2.0, behind );
        return ( waves + centre ) * fade * b.w;
      }

      void main() {
        vec3 toCam = cameraPosition - vW;
        float dist = length( toCam );
        vec3 V = toCam / dist;
        vec2 p = vW.xz;
        float t = uTime;
        // multi-octave scrolling normals (river flows toward +z, wind across)
        vec2 s = vec2( 0.0 );
        s += ( texture2D( tNormal, p * 0.0065 + vec2( 0.003, 0.009 ) * t ).xy * 2.0 - 1.0 ) * 0.55;
        s += ( texture2D( tNormal, p * 0.021 + vec2( -0.006, 0.016 ) * t ).xy * 2.0 - 1.0 ) * 0.5;
        s += ( texture2D( tNormal, p * 0.067 + vec2( 0.021, 0.012 ) * t ).xy * 2.0 - 1.0 ) * 0.38;
        s += ( texture2D( tNormal, p * 0.19 + vec2( -0.03, -0.024 ) * t ).xy * 2.0 - 1.0 ) * 0.26 * smoothstep( 160.0, 15.0, dist );
        s *= uRipple * mix( 1.0, 0.55, smoothstep( 80.0, 2500.0, dist ) );
        // boat wakes (finite differences)
        vec2 ws = vec2( 0.0 );
        #if MAX_BOATS > 0
        for ( int i = 0; i < MAX_BOATS; i ++ ) {
          vec4 b = uBoats[ i ];
          if ( b.w <= 0.0 ) continue;
          float h0 = wakeH( p, b );
          ws += vec2( wakeH( p + vec2( 0.25, 0.0 ), b ) - h0, wakeH( p + vec2( 0.0, 0.25 ), b ) - h0 ) * 4.0;
        }
        #endif
        s += ws * 0.18 * uWakeK;
        vec3 N = normalize( vec3( s.x * 0.16, 1.0, s.y * 0.16 ) );

        float NdV = max( dot( N, V ), 0.02 );
        float F = 0.02 + 0.98 * pow( 1.0 - NdV, 5.0 );

        // reflection
        vec3 refl;
        #if HAS_MIRROR
          vec4 mc = uTexMat * vec4( vW, 1.0 );
          vec2 muv = mc.xy / mc.w;
          vec2 dist2 = vec2( s.x * 0.8, s.y * 1.6 ) * ( 0.006 + 2.2 / ( dist + 8.0 ) ) * 0.09;
          dist2 += vec2( ws.x, ws.y ) * 0.012;
          vec2 uv = muv + dist2;
          float bl = 0.0018 + 0.0025 * smoothstep( 50.0, 600.0, dist );
          refl = texture2D( tMirror, uv ).rgb * 0.36;
          refl += texture2D( tMirror, uv + vec2( 0.0, bl ) ).rgb * 0.22;
          refl += texture2D( tMirror, uv - vec2( 0.0, bl ) ).rgb * 0.22;
          refl += texture2D( tMirror, uv + vec2( 0.0, 2.2 * bl ) ).rgb * 0.1;
          refl += texture2D( tMirror, uv - vec2( 0.0, 2.2 * bl ) ).rgb * 0.1;
        #else
          vec3 R = reflect( -V, N );
          R.y = abs( R.y );
          refl = atmHaze( R );
        #endif
        refl *= uReflK;

        // sun glitter: GGX with a tight lobe -> HDR highlights that bloom into a glitter path
        vec3 L = normalize( uLightDir );
        vec3 H = normalize( L + V );
        float NdH = max( dot( N, H ), 0.0 );
        float NdL = max( dot( N, L ), 0.0 );
        float a = 0.05;
        float a2 = a * a;
        float dd = NdH * NdH * ( a2 - 1.0 ) + 1.0;
        float D = a2 / ( 3.14159 * dd * dd );
        float VdH = max( dot( V, H ), 0.0 );
        float Fs = 0.02 + 0.98 * pow( 1.0 - VdH, 5.0 );
        float Gv = 1.0 / ( NdV + sqrt( a2 + ( 1.0 - a2 ) * NdV * NdV ) );
        float Gl = 1.0 / ( NdL + sqrt( a2 + ( 1.0 - a2 ) * NdL * NdL ) );
        vec3 spec = uSunRad * min( D * Fs * Gv * Gl * NdL, 900.0 );
        spec *= step( 0.0, L.y + 0.01 );

        // body: Nile water is silty olive / teal; upwelling grows where we look down into it
        vec3 body = uBody * ( 0.55 + 0.45 * smoothstep( 0.0, 0.6, V.y ) );
        vec3 col = mix( body, refl, F ) + spec;
        col = atmApply( col, vW, 1.0 );
        gl_FragColor = vec4( col, 1.0 );
      }`,
  });
  bindAtmos(mat.uniforms, U.atmos);
  const size = quality === 'low' ? 24000 : 30000;
  const mesh = new Mesh(new PlaneGeometry(size, size), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.name = 'river-water';
  mesh.frustumCulled = false;
  return { mesh, material: mat, boats };
}
