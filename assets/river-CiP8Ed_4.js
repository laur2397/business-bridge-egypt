import{A as e,G as t,H as n,J as r,K as i,L as a,N as o,O as s,P as c,R as l,S as u,X as d,Z as f,_ as p,_t as m,at as h,d as g,f as _,g as v,gt as y,j as b,k as x,l as S,lt as C,m as w,nt as T,o as ee,ot as E,q as te,st as D,u as O,vt as k,w as ne,yt as re,z as A}from"./UnrealBloomPass-C28B2YMj.js";function ie(){return{uSunDir:{value:new m(0,.05,-1).normalize()},uSunCol:{value:new w(1,.7,.4)},uHaze:{value:Array.from({length:8},()=>new w(.5,.45,.4))},uZenith:{value:new w(.1,.2,.4)},uFogDens:{value:.004},uFogFall:{value:.03},uAerial:{value:12e-5},uMieG:{value:.75},uMieK:{value:1},uMistNear:{value:0},uCityGlow:{value:new w(0,0,0)},uCityDir:{value:new m(.7,0,-.7).normalize()}}}var j=`
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
`;function M(e,t){for(let n in t)e[n]=t[n]}function N(e,t,{key:n=e.name||`m`,mul:r=1,extra:i=null}={}){return e.onBeforeCompile=(e,n)=>{M(e.uniforms,t),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>\n${j}\nvarying vec3 vAtmW;`).replace(`#include <fog_fragment>`,`gl_FragColor.rgb = atmApply( gl_FragColor.rgb, vAtmW, ${r.toFixed(3)} );`),e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
varying vec3 vAtmW;`).replace(`#include <project_vertex>`,`#include <project_vertex>
        {
          vec4 atmP = vec4( transformed, 1.0 );
          #ifdef USE_BATCHING
            atmP = batchingMatrix * atmP;
          #endif
          #ifdef USE_INSTANCING
            atmP = instanceMatrix * atmP;
          #endif
          vAtmW = ( modelMatrix * atmP ).xyz;
        }`),i&&i(e,n)},e.customProgramCacheKey=()=>`river-`+n,e}var ae=`
  uniform vec3 sunPosition;
  uniform float rayleigh;
  uniform float turbidity;
  uniform float mieCoefficient;
  varying vec3 vWorldPosition;
  varying vec3 vSunDirection;
  varying float vSunfade;
  varying vec3 vBetaR;
  varying vec3 vBetaM;
  varying float vSunE;
  const float e = 2.718281828459045;
  const vec3 totalRayleigh = vec3( 5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5 );
  const vec3 MieConst = vec3( 1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14 );
  const float cutoffAngle = 1.6110731556870734;
  const float steepness = 1.5;
  const float EE = 1000.0;
  float sunIntensity( float c ) {
    c = clamp( c, -1.0, 1.0 );
    return EE * max( 0.0, 1.0 - pow( e, -( ( cutoffAngle - acos( c ) ) / steepness ) ) );
  }
  vec3 totalMie( float T ) { float c = ( 0.2 * T ) * 10E-18; return 0.434 * c * MieConst; }
  void main() {
    vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    gl_Position.z = gl_Position.w;
    vSunDirection = normalize( sunPosition );
    vSunE = sunIntensity( vSunDirection.y );
    vSunfade = 1.0 - clamp( 1.0 - exp( ( sunPosition.y / 450000.0 ) ), 0.0, 1.0 );
    float rayleighCoefficient = rayleigh - ( 1.0 * ( 1.0 - vSunfade ) );
    vBetaR = totalRayleigh * rayleighCoefficient;
    vBetaM = totalMie( turbidity ) * mieCoefficient;
  }`,oe=`
  varying vec3 vWorldPosition;
  varying vec3 vSunDirection;
  varying vec3 vBetaR;
  varying vec3 vBetaM;
  varying float vSunE;
  uniform float mieDirectionalG;
  uniform float time;
  uniform float uCloudCov;
  uniform float uCloudDen;
  uniform vec3 uCloudLit;
  uniform vec3 uCloudShade;
  uniform float uNight;
  uniform float uDay;
  uniform vec3 uNightZenith;
  uniform vec3 uNightHorizon;
  uniform vec3 uGlowColor;
  uniform float uGlow;
  uniform vec3 uBelt;
  uniform vec3 uSunTrue;
  uniform vec3 uDiscCol;
  uniform float uSkyGain;
  uniform vec3 uSkyTint;
  uniform vec3 uCityGlow;
  uniform vec3 uCityDir;
  uniform float uMist;
  uniform vec3 uMistCol;

  const float pi = 3.141592653589793;
  const float rayleighZenithLength = 8.4E3;
  const float mieZenithLength = 1.25E3;
  float rayleighPhase( float c ) { return 0.05968310365946075 * ( 1.0 + c * c ); }
  float hgPhase( float c, float g ) { float g2 = g * g; return 0.07957747154594767 * ( 1.0 - g2 ) / pow( 1.0 - 2.0 * g * c + g2, 1.5 ); }

  vec2 grad2( vec2 i ) {
    vec3 p = fract( i.xyx * vec3( 0.1031, 0.1030, 0.0973 ) );
    p += dot( p, p.yzx + 33.33 );
    return fract( ( p.xx + p.yz ) * p.zy ) * 2.0 - 1.0;
  }
  float gnoise( vec2 p ) {
    vec2 i = floor( p ); vec2 f = fract( p );
    vec2 u = f * f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 );
    float a = dot( grad2( i ), f );
    float b = dot( grad2( i + vec2( 1, 0 ) ), f - vec2( 1, 0 ) );
    float c = dot( grad2( i + vec2( 0, 1 ) ), f - vec2( 0, 1 ) );
    float d = dot( grad2( i + vec2( 1, 1 ) ), f - vec2( 1, 1 ) );
    return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y ) * 1.6;
  }
  float fbm( vec2 p ) {
    float r = 0.0, a = 0.5;
    for ( int i = 0; i < 5; i ++ ) { r += a * gnoise( p ); p = mat2( 1.6, 1.2, -1.2, 1.6 ) * p + 3.1; a *= 0.5; }
    return r;
  }

  void main() {
    vec3 direction = normalize( vWorldPosition - cameraPosition );
    float dy = direction.y;
    direction.y = max( direction.y, 0.0005 );
    direction = normalize( direction );
    float zenithAngle = acos( max( 0.0, direction.y ) );
    float inverse = 1.0 / ( cos( zenithAngle ) + 0.15 * pow( 93.885 - ( ( zenithAngle * 180.0 ) / pi ), -1.253 ) );
    float sR = rayleighZenithLength * inverse;
    float sM = mieZenithLength * inverse;
    vec3 Fex = exp( -( vBetaR * sR + vBetaM * sM ) );
    float cosTheta = dot( direction, vSunDirection );
    vec3 betaRTheta = vBetaR * rayleighPhase( cosTheta * 0.5 + 0.5 );
    vec3 betaMTheta = vBetaM * hgPhase( cosTheta, mieDirectionalG );
    vec3 Lin = pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * ( 1.0 - Fex ), vec3( 1.5 ) );
    Lin *= mix( vec3( 1.0 ), pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * Fex, vec3( 0.5 ) ), clamp( pow( 1.0 - vSunDirection.y, 5.0 ), 0.0, 1.0 ) );
    vec3 L0 = vec3( 0.1 ) * Fex;
    vec3 sky = ( Lin + L0 ) * 0.04 + vec3( 0.0, 0.0003, 0.00075 );

    float hh = clamp( direction.y, 0.0, 1.0 );
    vec2 sa = normalize( vSunDirection.xz + 1e-5 );
    vec2 da = normalize( direction.xz + 1e-5 );
    float azc = dot( sa, da );
    float az = max( azc, 0.0 );
    // sunset glow hugging the horizon around the sun azimuth
    float glow = pow( az, 6.0 ) * exp( -hh * 12.0 ) + 0.12 * pow( az, 2.0 ) * exp( -hh * 4.0 );
    sky += uGlowColor * glow * uGlow;
    // belt of Venus: pink band above the anti-solar horizon, earth shadow below it
    float anti = max( -azc, 0.0 );
    float belt = smoothstep( 0.0, 0.08, hh ) * exp( -hh * 9.0 ) * ( 0.4 + 0.6 * anti );
    sky += uBelt * belt;
    sky = sky * uDay + mix( uNightHorizon, uNightZenith, pow( hh, 0.45 ) ) * uNight;
    // city sky-glow
    float cg = pow( max( dot( da, normalize( uCityDir.xz ) ), 0.0 ), 4.0 );
    sky += uCityGlow * cg * exp( -hh * 14.0 );
    sky *= uSkyGain * uSkyTint;

    // clouds: thin, stretched alto-cumulus / cirrus deck, lit from the low sun
    if ( uCloudCov > 0.0 ) {
      vec2 cuv = direction.xz / ( direction.y + 0.06 );
      cuv = vec2( cuv.x * 0.8, cuv.y * 3.4 ) * 0.55 + vec2( time * 0.002, 0.0 );
      float n = fbm( cuv ) * 0.5 + 0.5;
      float region = gnoise( cuv * 0.21 + 7.0 ) * 0.5 + 0.5;
      float cov = clamp( uCloudCov + ( region - 0.5 ) * 0.9, 0.0, 1.0 );
      float th = 1.0 - cov;
      float m = smoothstep( th, th + 0.3, n + 0.06 * gnoise( cuv * 11.0 ) );
      m *= smoothstep( 0.015, 0.12, direction.y ) * smoothstep( 0.95, 0.4, direction.y );
      float depth = max( 0.0, n - th );
      float silver = clamp( 0.51 / pow( 1.49 - cosTheta * 1.4, 1.5 ), 0.0, 4.0 );
      float edge = m * ( 1.0 - m ) * 4.0;
      vec3 cc = mix( uCloudLit, uCloudShade, smoothstep( 0.0, 0.35, depth ) );
      cc += uCloudLit * silver * edge * 0.5;
      // distant clouds dissolve into the horizon colour
      cc = mix( sky, cc, smoothstep( 0.0, 0.35, direction.y ) * 0.85 + 0.15 );
      float alpha = ( 1.0 - exp( -depth * uCloudDen * 14.0 ) ) * m;
      sky = mix( sky, cc, alpha );
    }

    // sun disc in HDR with limb darkening (true sun, may sit below the sky model's held sun)
    vec3 sd = normalize( uSunTrue );
    float ct = dot( normalize( vec3( direction.x, dy, direction.z ) ), sd );
    float r = acos( clamp( ct, -1.0, 1.0 ) ) / 0.0058; // ~0.33 deg radius (art: slightly large at the horizon)
    float disc = smoothstep( 1.0, 0.92, r );
    float limb = sqrt( max( 1.0 - r * r, 0.0 ) );
    sky += uDiscCol * disc * ( 0.55 + 0.45 * limb ) * smoothstep( -0.004, 0.002, dy );

    // opening mist: the whole sky is washed into lit vapour
    sky = mix( sky, uMistCol, uMist );
    gl_FragColor = vec4( sky, 1.0 );
  }`;function se(e){let t=new E({name:`river-sky`,uniforms:{turbidity:{value:6},rayleigh:{value:2},mieCoefficient:{value:.004},mieDirectionalG:{value:.8},sunPosition:{value:new m(0,.05,-1)},time:{value:0},uCloudCov:{value:.3},uCloudDen:{value:.4},uCloudLit:{value:new w(1,.7,.5)},uCloudShade:{value:new w(.3,.3,.4)},uNight:{value:0},uDay:{value:1},uNightZenith:{value:new w().setRGB(.0025,.006,.022)},uNightHorizon:{value:new w().setRGB(.02,.03,.065)},uGlowColor:{value:new w().setRGB(.42,.13,.045)},uGlow:{value:0},uBelt:{value:new w(0,0,0)},uSunTrue:{value:new m(0,.05,-1)},uDiscCol:{value:new w(60,40,20)},uSkyGain:{value:1},uSkyTint:{value:new w(1,1,1)},uCityGlow:e.uCityGlow,uCityDir:e.uCityDir,uMist:{value:0},uMistCol:{value:new w(1,1,1)}},vertexShader:ae,fragmentShader:oe,side:1,depthWrite:!1}),n=new A(new S(1,1,1),t);return n.scale.setScalar(12e3),n.frustumCulled=!1,n.renderOrder=-10,n.name=`river-sky`,n}var P=[5804542996261093e-21,13562911419845635e-21,30265902468824876e-21],F=[183999185144339.78,277980239196605.28,407904795438610.94],I=1.6110731556870734,L=1.5,R=1e3,z=new m;function B(e){return e=Math.min(1,Math.max(-1,e)),R*Math.max(0,1-Math.exp(-((I-Math.acos(e))/L)))}function ce(e,t,n){let r=e.material.uniforms,i=z.copy(r.sunPosition.value).normalize(),a=B(i.y),o=1-Math.min(1,Math.max(0,1-Math.exp(r.sunPosition.value.y/45e4))),s=r.rayleigh.value-(1-o),c=.2*r.turbidity.value*1e-17,l=P.map(e=>e*s),u=F.map(e=>.434*c*e*r.mieCoefficient.value),d=Math.acos(Math.max(0,t.y)),f=1/(Math.cos(d)+.15*(93.885-d*180/Math.PI)**-1.253),p=8400*f,m=1250*f,h=t.dot(i),g=3/(16*Math.PI)*(1+(h*.5+.5)**2),_=r.mieDirectionalG.value,v=_*_,y=1/(4*Math.PI)*((1-v)/(1-2*_*h+v)**1.5),b=Math.min(1,Math.max(0,(1-i.y)**5)),x=[0,0,0];for(let e=0;e<3;e++){let t=Math.exp(-(l[e]*p+u[e]*m)),n=(l[e]*g+u[e]*y)/(l[e]+u[e]),r=(a*n*(1-t))**1.5;r*=1+((a*n*t)**.5-1)*b,x[e]=(r+.1*t)*.04+[0,3e-4,75e-5][e]}let S=Math.min(1,Math.max(0,t.y)),C=r.uNightZenith.value,w=r.uNightHorizon.value,T=r.uGlowColor.value,ee=r.uBelt.value,E=S**.45,te=[w.r+(C.r-w.r)*E,w.g+(C.g-w.g)*E,w.b+(C.b-w.b)*E],D=Math.hypot(i.x,i.z)||1,O=Math.hypot(t.x,t.z)||1,k=(i.x*t.x+i.z*t.z)/(D*O),ne=Math.max(0,k),re=ne**6*Math.exp(-S*12)+.12*ne**2*Math.exp(-S*4),A=Math.max(-k,0),ie=Math.min(1,S/.08),j=ie*ie*(3-2*ie)*Math.exp(-S*9)*(.4+.6*A),M=[T.r,T.g,T.b],N=[ee.r,ee.g,ee.b];for(let e=0;e<3;e++){let t=x[e]+M[e]*re*r.uGlow.value+N[e]*j;x[e]=(t*r.uDay.value+te[e]*r.uNight.value)*r.uSkyGain.value*[r.uSkyTint.value.r,r.uSkyTint.value.g,r.uSkyTint.value.b][e]}return n.setRGB(x[0],x[1],x[2])}function le(e=.5){let t=new re(2,2,{type:x,samples:0,minFilter:o,magFilter:o,depthBuffer:!0}),n=new i;n.layers.set(0);let r=new l,a=new m(0,1,0),s=new m(0,0,0),c=new m,u=new m,d=new m,f=new m,p=new l,h=new te,g=new k,_=new k;return{rt:t,camera:n,textureMatrix:r,scale:e,setSize(n,r){t.setSize(Math.max(2,Math.floor(n*e)),Math.max(2,Math.floor(r*e)))},render(e,i,o,l=[]){c.setFromMatrixPosition(o.matrixWorld),u.subVectors(s,c),u.reflect(a).negate().add(s),p.extractRotation(o.matrixWorld),f.set(0,0,-1).applyMatrix4(p).add(c),d.subVectors(s,f).reflect(a).negate().add(s),n.position.copy(u),n.up.set(0,1,0).applyMatrix4(p).reflect(a),n.lookAt(d),n.far=o.far,n.near=o.near,n.updateMatrixWorld(),n.projectionMatrix.copy(o.projectionMatrix),n.projectionMatrix.elements[8]*=-1,n.projectionMatrix.elements[12]*=-1,r.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),r.multiply(n.projectionMatrix).multiply(n.matrixWorldInverse),h.setFromNormalAndCoplanarPoint(a,s.set(0,-.05,0)),s.set(0,0,0),h.applyMatrix4(n.matrixWorldInverse),g.set(h.normal.x,h.normal.y,h.normal.z,h.constant);let m=n.projectionMatrix.elements;_.x=(Math.sign(g.x)+m[8])/m[0],_.y=(Math.sign(g.y)+m[9])/m[5],_.z=-1,_.w=(1+m[10])/m[14],g.multiplyScalar(2/g.dot(_)),m[2]=g.x,m[6]=g.y,m[10]=g.z+1,m[14]=g.w,n.projectionMatrixInverse.copy(n.projectionMatrix).invert();let v=l.map(e=>e.visible);l.forEach(e=>{e.visible=!1});let y=e.getRenderTarget();e.setRenderTarget(t),e.state.buffers.depth.setMask(!0),e.clear(),e.render(i,n),e.setRenderTarget(y),l.forEach((e,t)=>{e.visible=v[t]})},dispose(){t.dispose()}}}function ue(e,{normals:t,mirror:n,quality:i}){let a=Array.from({length:6},()=>new k(0,0,0,0)),o=new E({name:`river-water`,defines:{HAS_MIRROR:+!!n,MAX_BOATS:6},uniforms:Object.assign({tMirror:{value:n?n.rt.texture:null},uTexMat:{value:n?n.textureMatrix:new l},tNormal:{value:t},uTime:e.uTime,uLightDir:e.uLightDir,uSunRad:{value:new w(10,7,4)},uBody:{value:new w(.02,.03,.025)},uReflK:{value:1},uBoats:{value:a},uWakeK:{value:1},uRipple:{value:1},uNightSpec:{value:0}},{}),vertexShader:`
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4( position, 1.0 );
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,fragmentShader:`
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
      ${j}
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
      }`});M(o.uniforms,e.atmos);let s=i===`low`?24e3:3e4,c=new A(new r(s,s),o);return c.rotation.x=-Math.PI/2,c.name=`river-water`,c.frustumCulled=!1,{mesh:c,material:o,boats:a}}var V=Math.PI/180,de=(e,t=0,n=1)=>Math.min(n,Math.max(t,e)),H=(e,t,n)=>e+(t-e)*n,U=(e,t,n)=>{let r=de((n-e)/(t-e));return r*r*(3-2*r)},W=(e,t)=>1-Math.exp(-e*t);function G(e){let t=e>>>0;return function(){t|=0,t=t+1831565813|0;let e=Math.imul(t^t>>>15,1|t);return e=e+Math.imul(e^e>>>7,61|e)^e,((e^e>>>14)>>>0)/4294967296}}function fe(e,t,n={}){let r=0;for(;r<e.length-2&&t>e[r+1].p;)r++;let i=e[r],a=e[r+1],o=de((t-i.p)/(a.p-i.p)),s=o*o*(3-2*o);for(let e in i){if(e===`p`)continue;let t=i[e],r=a[e]??t;if(Array.isArray(t)){let i=n[e]||(n[e]=Array(t.length));for(let e=0;e<t.length;e++)i[e]=t[e]+(r[e]-t[e])*s}else n[e]=t+(r-t)*s}return n}function pe(e,t,n){let r=e.length;if(t<=e[0].p){for(let t=0;t<n.length;t++)n[t]=e[0].v[t];return n}if(t>=e[r-1].p){for(let t=0;t<n.length;t++)n[t]=e[r-1].v[t];return n}let i=0;for(;i<r-2&&t>e[i+1].p;)i++;let a=e[i],o=e[i+1],s=e[Math.max(0,i-1)],c=e[Math.min(r-1,i+2)],l=o.p-a.p,u=(t-a.p)/l,d=u*u,f=d*u,p=2*f-3*d+1,m=f-2*d+u,h=-2*f+3*d,g=f-d;for(let e=0;e<n.length;e++){let t=i===0?0:(o.v[e]-s.v[e])/(o.p-s.p),u=i+1===r-1?0:(c.v[e]-a.v[e])/(c.p-a.p);n[e]=p*a.v[e]+m*l*t+h*o.v[e]+g*l*u}return n}function me(e,t=0){let n=Math.floor(e),r=e-n,i=e=>{let n=Math.sin((e+t*57.13)*127.1)*43758.5453;return n-Math.floor(n)},a=r*r*(3-2*r);return(i(n)*(1-a)+i(n+1)*a)*2-1}function K(e,t,n){let r=new Float32Array(t*t);for(let e=0;e<r.length;e++)r[e]=n()*2-1;let i=new Float32Array(e*e),a=t/e;for(let n=0;n<e;n++){let o=n*a,s=Math.floor(o),c=o-s,l=c*c*c*(c*(c*6-15)+10),u=s%t*t,d=(s+1)%t*t;for(let o=0;o<e;o++){let s=o*a,c=Math.floor(s),f=s-c,p=f*f*f*(f*(f*6-15)+10),m=c%t,h=(c+1)%t,g=r[u+m],_=r[u+h],v=r[d+m],y=r[d+h];i[n*e+o]=g+(_-g)*p+(v+(y-v)*p-(g+(_-g)*p))*l}}return i}function he(e=512,t=7){let n=G(t),r=new Float32Array(e*e);for(let t of[{p:4,a:1},{p:8,a:.55},{p:16,a:.3},{p:32,a:.16},{p:64,a:.08}]){let i=K(e,t.p,n);for(let e=0;e<r.length;e++)r[e]+=i[e]*t.a}let i=[{kx:3,ky:9,a:.12,ph:n()*6.28},{kx:-5,ky:13,a:.08,ph:n()*6.28},{kx:11,ky:21,a:.05,ph:n()*6.28}];for(let t=0;t<e;t++)for(let n=0;n<e;n++){let a=0;for(let r of i)a+=Math.sin((r.kx*n+r.ky*t)/e*Math.PI*2+r.ph)*r.a;r[t*e+n]+=a}let a=document.createElement(`canvas`);a.width=a.height=e;let s=a.getContext(`2d`),l=s.createImageData(e,e),u=e/64;for(let t=0;t<e;t++){let n=(t-1+e)%e*e,i=(t+1)%e*e,a=t*e;for(let t=0;t<e;t++){let o=(t-1+e)%e,s=(r[a+(t+1)%e]-r[a+o])*u,c=(r[i+t]-r[n+t])*u,d=-s,f=-c,p=1,m=Math.hypot(d,f,p);d/=m,f/=m,p/=m;let h=(a+t)*4;l.data[h]=(d*.5+.5)*255,l.data[h+1]=(f*.5+.5)*255,l.data[h+2]=(p*.5+.5)*255,l.data[h+3]=255}}s.putImageData(l,0,0);let d=new _(a);return d.wrapS=d.wrapT=T,d.colorSpace=``,d.minFilter=c,d.magFilter=o,d.anisotropy=4,d.needsUpdate=!0,d}function q(e,t=!1){let n=e[0].index!==null,r=new Set(Object.keys(e[0].attributes)),i=new Set(Object.keys(e[0].morphAttributes)),a={},o={},s=e[0].morphTargetsRelative,c=new g;c.morphTargetsRelative=s;let l=0;for(let u=0;u<e.length;++u){let d=e[u],f=0,p=0;if(n!==(d.index!==null))return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them.`),null;for(let e in d.attributes){if(!r.has(e))return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. All geometries must have compatible attributes; make sure "`+e+`" attribute exists among all geometries, or in none of them.`),null;a[e]===void 0&&(a[e]=[]),a[e].push(d.attributes[e]),f++}if(f!==r.size)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. Make sure all geometries have the same number of attributes.`),null;if(s!==d.morphTargetsRelative)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. .morphTargetsRelative must be consistent throughout all geometries.`),null;for(let t in d.morphAttributes){if(!i.has(t))return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`.  .morphAttributes must be consistent throughout all geometries.`),null;if(d.morphAttributes[t].length!==e[0].morphAttributes[t].length)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. All geometries must have the same number of morph targets for the "`+t+`" morph attribute.`),null;o[t]===void 0&&(o[t]=[]),o[t].push(d.morphAttributes[t]),p++}if(p!==i.size)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. Make sure all geometries have the same number of morph attributes.`),null;if(t){let e;if(n)e=d.index.count;else if(d.attributes.position!==void 0)e=d.attributes.position.count;else return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. The geometry must have either an index or a position attribute`),null;c.addGroup(l,e,u),l+=e}}if(n){let t=0,n=[];for(let r=0;r<e.length;++r){let i=e[r].index;for(let e=0;e<i.count;++e)n.push(i.getX(e)+t);t+=e[r].attributes.position.count}c.setIndex(n)}for(let e in a){let t=J(a[e]);if(!t)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the `+e+` attribute.`),null;c.setAttribute(e,t)}for(let e in o){let t=o[e][0].length;if(t!==0){c.morphAttributes=c.morphAttributes||{},c.morphAttributes[e]=[];for(let n=0;n<t;++n){let t=[];for(let r=0;r<o[e].length;++r)t.push(o[e][r][n]);let r=J(t);if(!r)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the `+e+` morphAttribute.`),null;c.morphAttributes[e].push(r)}}}return c}function J(e){let t,n,r,i=-1,a=0;for(let o=0;o<e.length;++o){let s=e[o];if(t===void 0&&(t=s.array.constructor),t!==s.array.constructor)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.array must be of consistent array types across matching attributes.`),null;if(n===void 0&&(n=s.itemSize),n!==s.itemSize)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.itemSize must be consistent across matching attributes.`),null;if(r===void 0&&(r=s.normalized),r!==s.normalized)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.normalized must be consistent across matching attributes.`),null;if(i===-1&&(i=s.gpuType),i!==s.gpuType)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.gpuType must be consistent across matching attributes.`),null;a+=s.count*n}let o=new t(a),s=new O(o,n,r),c=0;for(let t=0;t<e.length;++t){let r=e[t];if(r.isInterleavedBufferAttribute){let e=c/n;for(let t=0,i=r.count;t<i;t++)for(let i=0;i<n;i++){let n=r.getComponent(t,i);s.setComponent(t+e,i,n)}}else o.set(r.array,c);c+=r.count*n}return i!==void 0&&(s.gpuType=i),s}var Y=`
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
`,ge=`( vec4( normal, 0.0 ) * viewMatrix ).xyz`;function _e(e,t){let n={uScale:e.uScale,uPR:e.uPR,uTime:e.uTime,...t};return M(n,e.atmos),n}function ve(e,t,n={}){let r=new g;r.setAttribute(`position`,new O(t.positions,3)),r.setAttribute(`aColor`,new O(t.colors,3)),r.setAttribute(`aSize`,new O(t.sizes,1)),r.setAttribute(`aRand`,new O(t.rands,1));let i=new E({name:`river-glow`,uniforms:_e(e,{uOn:n.on||{value:1},uIntensity:n.intensity||{value:1},uMinPx:{value:n.minPx??1.6},uBlink:{value:+!!n.blink},uFogMul:{value:n.fogMul??1}}),vertexShader:`
      uniform float uScale; uniform float uPR; uniform float uTime;
      uniform float uOn; uniform float uIntensity; uniform float uMinPx; uniform float uBlink; uniform float uFogMul;
      ${j}
      attribute vec3 aColor; attribute float aSize; attribute float aRand;
      varying vec3 vCol;
      void main() {
        vec4 wp = modelMatrix * vec4( position, 1.0 );
        vec4 mv = viewMatrix * wp;
        float dist = max( -mv.z, 0.001 );
        float on = smoothstep( aRand, aRand + 0.05, uOn );
        if ( uBlink > 0.5 ) on *= mix( 0.15, 1.0, step( 0.5, fract( uTime * 0.6 + aRand * 7.0 ) ) );
        float px = aSize * uScale / dist * uPR;
        float minPx = uMinPx * uPR;
        float energy = px < minPx ? ( px / minPx ) : 1.0;
        px = clamp( px, minPx, 48.0 * uPR );
        float T = atmTrans( wp.xyz, uFogMul );
        vCol = aColor * uIntensity * on * T * mix( 0.3, 1.0, sqrt( energy ) );
        gl_PointSize = on > 0.001 ? px : 0.0;
        gl_Position = projectionMatrix * mv;
      }`,fragmentShader:`
      varying vec3 vCol;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r2 = dot( d, d ) * 4.0;
        float core = exp( -r2 * 14.0 );
        float halo = exp( -r2 * 3.5 ) * 0.22;
        float a = ( core + halo ) * smoothstep( 1.0, 0.55, r2 );
        gl_FragColor = vec4( vCol * a, 1.0 );
      }`,transparent:!0,depthWrite:!1,blending:2}),a=new d(r,i);return a.frustumCulled=!1,a.renderOrder=2,a}function X(e,t){let n=G(99),r=t.trail,i=t.count*r,a=new Float32Array(i*3),o=new Float32Array(i),s=new Float32Array(i),c=new Float32Array(i),l=new Float32Array(i),u=new Float32Array(i*3),f=0;for(let e=0;e<t.count;e++){let i=t.lanes[e%t.lanes.length],d=n(),p=(13+n()*9)/t.length,m=.75+n()*.5;for(let e=0;e<r;e++)a[f*3+1]=t.deckY,a[f*3+2]=i.z,o[f]=d,s[f]=p,c[f]=e/r,l[f]=i.dir,u[f*3]=i.color.r*m,u[f*3+1]=i.color.g*m,u[f*3+2]=i.color.b*m,f++}let p=new g;p.setAttribute(`position`,new O(a,3)),p.setAttribute(`aOff`,new O(o,1)),p.setAttribute(`aSpeed`,new O(s,1)),p.setAttribute(`aTrail`,new O(c,1)),p.setAttribute(`aDir`,new O(l,1)),p.setAttribute(`aColor`,new O(u,3));let m=new E({name:`river-cars`,uniforms:_e(e,{uOn:t.on,uLen:{value:t.length},uTrailLen:{value:t.trailLen},uCarT:e.uCarT}),vertexShader:`
      uniform float uScale; uniform float uPR; uniform float uTime; uniform float uCarT;
      uniform float uOn; uniform float uLen; uniform float uTrailLen;
      ${j}
      attribute float aOff; attribute float aSpeed; attribute float aTrail; attribute float aDir; attribute vec3 aColor;
      varying vec3 vCol;
      void main() {
        float u = fract( aOff + uCarT * aSpeed );
        float x = ( u - 0.5 ) * uLen * aDir - aDir * aTrail * uTrailLen;
        vec4 wp = modelMatrix * vec4( x, position.y, position.z, 1.0 );
        vec4 mv = viewMatrix * wp;
        float dist = max( -mv.z, 0.001 );
        float edge = smoothstep( 0.0, 0.04, u ) * smoothstep( 1.0, 0.96, u );
        float tr = pow( 1.0 - aTrail, 1.4 );
        float px = clamp( 1.1 * uScale / dist * uPR, 1.6 * uPR, 14.0 * uPR );
        vCol = aColor * uOn * edge * tr * atmTrans( wp.xyz, 1.0 );
        gl_PointSize = uOn > 0.001 ? px : 0.0;
        gl_Position = projectionMatrix * mv;
      }`,fragmentShader:`
      varying vec3 vCol;
      void main() {
        vec2 d = gl_PointCoord - 0.5; float r2 = dot( d, d ) * 4.0;
        gl_FragColor = vec4( vCol * exp( -r2 * 7.0 ) * smoothstep( 1.0, 0.5, r2 ), 1.0 );
      }`,transparent:!0,depthWrite:!1,blending:2}),h=new d(p,m);return h.frustumCulled=!1,h.renderOrder=2,h}function ye(e,t,n){let r=G(2024),i=new Float32Array(t*3),a=new Float32Array(t),o=new Float32Array(t),s=new Float32Array(t*3),c=5e3,l=new w(1,.86,.7),u=new w(.75,.85,1);for(let e=0;e<t;e++){let t=Math.asin(.04+r()*.96),n=r()*Math.PI*2;i[e*3]=Math.cos(t)*Math.cos(n)*c,i[e*3+1]=Math.sin(t)*c,i[e*3+2]=Math.cos(t)*Math.sin(n)*c,a[e]=r()**7,o[e]=r()*100;let d=r()<.5?l:u,f=r();s[e*3]=1+(d.r-1)*f,s[e*3+1]=1+(d.g-1)*f,s[e*3+2]=1+(d.b-1)*f}let f=new g;f.setAttribute(`position`,new O(i,3)),f.setAttribute(`aMag`,new O(a,1)),f.setAttribute(`aPh`,new O(o,1)),f.setAttribute(`aColor`,new O(s,3));let p=new E({name:`river-stars`,uniforms:{uStars:e.uStars,uTime:e.uTime,uPR:e.uPR,uTwinkle:{value:+!n}},vertexShader:`
      uniform float uStars; uniform float uTime; uniform float uPR; uniform float uTwinkle;
      attribute float aMag; attribute float aPh; attribute vec3 aColor;
      varying vec3 vCol;
      void main() {
        vec4 mv = modelViewMatrix * vec4( position, 1.0 );
        float h = normalize( position ).y;
        float horizon = smoothstep( 0.04, 0.4, h );
        float tw = 1.0 + uTwinkle * 0.3 * sin( uTime * ( 1.5 + fract( aPh ) * 3.0 ) + aPh );
        vCol = aColor * ( 0.03 + aMag * 1.6 ) * tw * uStars * horizon;
        gl_PointSize = ( 1.0 + aMag * 1.6 ) * uPR;
        gl_Position = projectionMatrix * mv;
        gl_Position.z = gl_Position.w * 0.99999;
      }`,fragmentShader:`
      varying vec3 vCol;
      void main() { vec2 d = gl_PointCoord - 0.5; float r2 = dot( d, d ) * 4.0; gl_FragColor = vec4( vCol * exp( -r2 * 5.0 ), 1.0 ); }`,transparent:!0,depthWrite:!1,blending:2}),m=new d(f,p);return m.frustumCulled=!1,m.renderOrder=-9,m}function be(e,t){let n=G(5),r=new Float32Array(t*3),i=new Float32Array(t);for(let e=0;e<t;e++)r[e*3]=n(),r[e*3+1]=n(),r[e*3+2]=n(),i[e]=n();let a=new g;a.setAttribute(`position`,new O(r,3)),a.setAttribute(`aSeed`,new O(i,1));let o=new E({name:`river-dust`,uniforms:{uTime:e.uTime,uPR:e.uPR,uScale:e.uScale,uDust:e.uDust,uDustColor:e.uDustColor,uSunScreen:e.uSunScreen},vertexShader:`
      uniform float uTime; uniform float uPR; uniform float uScale; uniform float uDust; uniform vec2 uSunScreen;
      attribute float aSeed;
      varying float vA;
      void main() {
        vec3 p = position;
        p.x = fract( p.x + uTime * 0.004 * ( 0.5 + aSeed ) );
        p.y = fract( p.y + uTime * 0.002 * ( aSeed - 0.3 ) + 0.02 * sin( uTime * 0.3 + aSeed * 30.0 ) );
        vec3 cp = vec3( ( p.x - 0.5 ) * 24.0, ( p.y - 0.45 ) * 10.0, -3.0 - p.z * 30.0 );
        vec4 mv = modelViewMatrix * vec4( cp, 1.0 );
        float dist = -mv.z;
        float px = clamp( 0.025 * uScale / dist * uPR, 0.8 * uPR, 5.0 * uPR );
        vec4 clip = projectionMatrix * mv;
        vec2 sp = clip.xy / clip.w * 0.5 + 0.5;
        float sunNear = exp( -length( ( sp - uSunScreen ) * vec2( 2.3, 1.0 ) ) * 2.2 );
        vA = uDust * ( 0.15 + 1.6 * sunNear ) * ( 0.25 + 0.75 * fract( aSeed * 13.7 ) ) * smoothstep( 3.0, 7.0, dist );
        gl_PointSize = px;
        gl_Position = clip;
      }`,fragmentShader:`
      uniform vec3 uDustColor;
      varying float vA;
      void main() { vec2 d = gl_PointCoord - 0.5; float r2 = dot( d, d ) * 4.0; gl_FragColor = vec4( uDustColor * vA * exp( -r2 * 4.0 ), 1.0 ); }`,transparent:!0,depthWrite:!1,depthTest:!1,blending:2}),s=new d(a,o);return s.frustumCulled=!1,s.layers.set(1),s.renderOrder=10,s}var xe={half:380,pylonX:170,deckY:18,deckW:28,pylonH:132};function Z(e,t,n,r,i,a){let o=new S(e,t,n);return o.translate(r,i,a),o}function Q(e,t,n,r,i,a,o,s,c,l){let u=new S(1,1,1,1,6,1),d=u.attributes.position;for(let u=0;u<d.count;u++){let f=d.getX(u),p=d.getY(u),m=d.getZ(u),h=p+.5,g=o+(c-o)*h,_=s+(l-s)*h;d.setXYZ(u,e+(r-e)*h+f*g,t+(i-t)*h,n+(a-n)*h+m*_)}return u.computeVertexNormals(),u}function Se(e,t){let r=t===`low`,i=xe,a=new s;a.name=`river-bridge`;let o=i.half*2,c=[],u=new n({color:new w(.62,.58,.52),roughness:.82,metalness:0,envMapIntensity:1});u.name=`concrete`;let d={value:Array.from({length:8},()=>new m)};N(u,e.atmos,{key:`concrete`,extra:t=>{t.uniforms.uUpPos=d,t.uniforms.uUpOn=e.uUpOn,t.uniforms.uBridgeInv=g,t.fragmentShader=t.fragmentShader.replace(`#include <common>`,`#include <common>\n${Y}\nuniform vec3 uUpPos[ 8 ]; uniform float uUpOn; uniform mat4 uBridgeInv;`).replace(`#include <color_fragment>`,`#include <color_fragment>
          {
            vec3 w = vAtmW;
            float n = rFbm( w * vec3( 0.35, 0.12, 0.35 ) );
            float stain = rNoise( vec3( w.x * 0.9 + w.z * 0.9, w.y * 0.04, 3.0 ) );
            float joint = smoothstep( 0.06, 0.0, abs( fract( w.y / 4.2 ) - 0.5 ) - 0.44 );
            diffuseColor.rgb *= ( 0.82 + 0.3 * n ) * ( 1.0 - 0.18 * smoothstep( 0.55, 0.9, stain ) ) * ( 1.0 - 0.12 * joint );
            diffuseColor.rgb *= mix( 0.55, 1.0, smoothstep( 0.0, 6.0, w.y ) ); // wet/dark tide line at the water
            // pylon: recessed vertical groove on every face + steel anchorage zone at the head
            vec3 lp = ( uBridgeInv * vec4( w, 1.0 ) ).xyz;
            vec3 ln = normalize( mat3( uBridgeInv ) * cross( dFdx( vAtmW ), dFdy( vAtmW ) ) );
            float px = abs( abs( lp.x ) - ${i.pylonX.toFixed(1)} );
            if ( px < 6.0 && w.y > ${(i.deckY+2).toFixed(1)} ) {
              float across = abs( ln.x ) > 0.6 ? abs( lp.z ) : px;
              float groove = abs( ln.x ) > 0.6 && abs( lp.z ) > 4.0 ? 0.0 : smoothstep( 0.55, 0.35, across );
              diffuseColor.rgb *= 1.0 - 0.45 * groove;
              float anch = smoothstep( ${(i.pylonH-31).toFixed(1)}, ${(i.pylonH-30).toFixed(1)}, w.y ) * smoothstep( ${(i.pylonH-1).toFixed(1)}, ${(i.pylonH-2).toFixed(1)}, w.y );
              diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.24, 0.24, 0.25 ) * ( 0.85 + 0.3 * n ), anch * 0.85 );
            }
          }`).replace(`#include <emissivemap_fragment>`,`#include <emissivemap_fragment>
          if ( uUpOn > 0.001 ) {
            vec3 Nw = normalize( ${ge} );
            vec3 acc = vec3( 0.0 );
            for ( int i = 0; i < 8; i ++ ) {
              vec3 d = uUpPos[ i ] - vAtmW;
              float l2 = dot( d, d );
              vec3 Ld = d * inversesqrt( l2 );
              float cone = smoothstep( 0.15, 0.65, -Ld.y );   // fixtures aim upward
              acc += vec3( max( dot( Nw, Ld ), 0.0 ) * cone / ( 1.0 + l2 * 0.0012 ) );
            }
            totalEmissiveRadiance += diffuseColor.rgb * acc * vec3( 1.0, 0.74, 0.48 ) * uUpOn * 1.8;
          }`)}});let h=new n({color:new w(.42,.42,.42),roughness:.55,metalness:.35});h.name=`steel`;let g={value:new l};N(h,e.atmos,{key:`steel`,extra:t=>{t.uniforms.uLampsOn=e.uLampsOn,t.uniforms.uBridgeInv=g,t.fragmentShader=t.fragmentShader.replace(`#include <common>`,`#include <common>
uniform float uLampsOn; uniform mat4 uBridgeInv;`).replace(`#include <emissivemap_fragment>`,`#include <emissivemap_fragment>
          {
            vec3 lp = ( uBridgeInv * vec4( vAtmW, 1.0 ) ).xyz;
            vec3 Nw = normalize( ${ge} );
            // pools of warm light from the lamp standards on the road surface and the parapet tops
            float pool = pow( 0.5 + 0.5 * cos( lp.x / 20.0 * 6.2831 ), 3.0 );
            float top = smoothstep( 0.6, 0.9, Nw.y ) * step( ${(i.deckY-.3).toFixed(2)}, lp.y );
            float edge = smoothstep( 6.0, 13.0, abs( lp.z ) );
            totalEmissiveRadiance += vec3( 1.0, 0.62, 0.32 ) * uLampsOn * top * ( 0.2 + 0.8 * pool ) * mix( 0.5, 1.0, edge ) * 0.06;
            // underside catches a little bounce
            totalEmissiveRadiance += vec3( 1.0, 0.75, 0.5 ) * uLampsOn * smoothstep( -0.5, -0.9, Nw.y ) * 0.02;
          }`)}});let _=new n({color:new w(.86,.84,.8),roughness:.32,metalness:0});_.name=`cable`,N(_,e.atmos,{key:`cable`,extra:t=>{t.uniforms.uUpOn=e.uUpOn,t.uniforms.uFat=e.uCableFat,t.vertexShader=t.vertexShader.replace(`#include <common>`,`#include <common>
uniform float uFat;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
transformed.xz *= uFat;`),t.fragmentShader=t.fragmentShader.replace(`#include <common>`,`#include <common>
uniform float uUpOn;`).replace(`#include <emissivemap_fragment>`,`#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3( 1.0, 0.72, 0.45 ) * uUpOn * 0.08 * exp( -max( vAtmW.y - ${i.deckY.toFixed(1)}, 0.0 ) / 45.0 );`)}});let v=new n({color:new w(.2,.2,.21),roughness:.5,metalness:.6});v.name=`lamppost`,N(v,e.atmos,{key:`lamppost`});let y=[Z(o,2.2,i.deckW,0,i.deckY-1.1,0),Z(o,2.6,1.2,0,i.deckY-2.2,i.deckW/2+.2),Z(o,2.6,1.2,0,i.deckY-2.2,-i.deckW/2-.2),Z(o,2,i.deckW-8,0,i.deckY-3.6,0),Z(o,1.1,.5,0,i.deckY+.55,i.deckW/2-.3),Z(o,1.1,.5,0,i.deckY+.55,-i.deckW/2+.3),Z(o,.8,.8,0,i.deckY+.4,0),Z(o,.12,.12,0,i.deckY+1.35,i.deckW/2-.3),Z(o,.12,.12,0,i.deckY+1.35,-i.deckW/2+.3)],x=new A(q(y),h);a.add(x);let C=i.pylonH,T=[];for(let e of[-1,1]){let t=e*i.pylonX,n=i.deckW/2+5,r=C-34;T.push(Q(t,-2,n,t,r,2.4,6.5,6,4.6,4.2)),T.push(Q(t,-2,-n,t,r,-2.4,6.5,6,4.6,4.2)),T.push(Q(t,r-6,0,t,C,0,5.4,7.2,4.4,5.6)),T.push(Z(5.2,1.2,6.4,t,C+.4,0)),T.push(Z(7,4,i.deckW+10,t,i.deckY-5,0)),T.push(Z(18,3.5,i.deckW+22,t,.2,0));for(let t of[85,170]){let n=e*(i.pylonX+t);T.push(Q(n,-2,7,n,i.deckY-4,7,3.6,3.6,3,3)),T.push(Q(n,-2,-7,n,i.deckY-4,-7,3.6,3.6,3,3)),T.push(Z(4.5,2.5,i.deckW-2,n,i.deckY-5,0))}T.push(Z(12,i.deckY,i.deckW+6,e*(i.half-6),i.deckY/2-2,0));for(let e of[n-3.5,-(n-3.5)])c.push(new m(t-8,i.deckY+1.2,e)),c.push(new m(t+8,i.deckY+1.2,e))}let ee=new A(q(T),u);a.add(ee);let E=r?9:15,te=new p(1,1,1,6,1,!0),D=8*E,O=new b(te,_,D),k=new l,ne=new f,re=new m(0,1,0),ie=new m,j=new m,M=new m,ae=new m,oe=new m,se=[],P=0;for(let e of[-1,1]){let t=e*i.pylonX;for(let n of[-1,1])for(let a of[-1,1])for(let o=0;o<E;o++){let s=o/(E-1);ie.set(t+a*2,C-4-(1-s)*24,n*1.6);let c=18+s*(i.pylonX-24);j.set(t+a*c,i.deckY+.6,n*(i.deckW/2+.4)),M.subVectors(j,ie);let l=M.length();M.normalize(),ae.addVectors(ie,j).multiplyScalar(.5),ne.setFromUnitVectors(re,M);let u=(r?.36:.26)+.1*s;oe.set(u,l,u),k.compose(ae,ne,oe),O.setMatrixAt(P++,k),n===1&&e===1&&a===-1&&se.push(j.clone())}}O.instanceMatrix.needsUpdate=!0,O.computeBoundingSphere(),a.add(O);let F=r?30:20,I=Math.floor(o/F),L=q([(()=>{let e=new p(.12,.2,10,6);return e.translate(0,5,0),e})(),(()=>{let e=new S(.15,.15,2.4);return e.translate(0,10,-1.1),e})(),(()=>{let e=new S(.5,.22,.9);return e.translate(0,9.9,-2.2),e})()]),R=new b(L,v,I*2),z=I*2,B=[],ce=[],le=[],ue=[],V=new w(1,.7,.4),de=0;for(let e of[-1,1])for(let t=0;t<I;t++){let n=-o/2+F*(t+.5),r=e*(i.deckW/2-.6);ne.setFromAxisAngle(re,e>0?0:Math.PI),k.compose(new m(n,i.deckY,r),ne,new m(1,1,1)),R.setMatrixAt(de,k),B.push(n,i.deckY+9.75,r-e*2.2),ce.push(V.r*14,V.g*14,V.b*14),le.push(1),ue.push(.05+.85*Math.abs(n)/(o/2)),de++}R.instanceMatrix.needsUpdate=!0,R.computeBoundingSphere(),a.add(R);for(let e of[-1,1])B.push(e*i.pylonX,C+1.6,0),ce.push(14,.8,.4),le.push(1.6),ue.push(.2);let H=ve(e,{positions:new Float32Array(B.slice(0,z*3)),colors:new Float32Array(ce.slice(0,z*3)),sizes:new Float32Array(le.slice(0,z)),rands:new Float32Array(ue.slice(0,z))},{on:e.uLampsOn,minPx:1.6});a.add(H);let U=ve(e,{positions:new Float32Array(B.slice(z*3)),colors:new Float32Array(ce.slice(z*3)),sizes:new Float32Array(le.slice(z)),rands:new Float32Array(ue.slice(z))},{on:e.uBeaconOn,minPx:2,blink:!0});a.add(U);let W=new w(1,.9,.75).multiplyScalar(9),G=new w(1,.06,.03).multiplyScalar(8),fe=X(e,{count:r?26:56,trail:r?5:9,trailLen:12,length:o,deckY:i.deckY+.9,on:e.uCarsOn,lanes:[{z:10.5,dir:-1,color:W},{z:7,dir:-1,color:W},{z:3.5,dir:-1,color:W},{z:-3.5,dir:1,color:G},{z:-7,dir:1,color:G},{z:-10.5,dir:1,color:G}]});return a.add(fe),{group:a,pylonTopLocal:new m(i.pylonX,C,0),materials:[u,h,_,v],update(){a.updateMatrixWorld(),g.value.copy(a.matrixWorld).invert(),c.forEach((e,t)=>d.value[t].copy(e).applyMatrix4(a.matrixWorld))}}}var $=[[-420,3e3],[-330,1200],[-290,300],[-285,-400],[-300,-760],[-330,-1200],[-440,-2200],[-380,-3400],[-220,-5600],[-120,-14e3]],Ce=[[440,3e3],[360,1200],[320,300],[305,-400],[312,-760],[350,-1200],[500,-2200],[440,-3400],[280,-5600],[160,-14e3]],we=2.2;function Te(e,t){for(let n=0;n<e.length-1;n++){let[r,i]=e[n],[a,o]=e[n+1];if(t<=i&&t>=o)return r+(t-i)/(o-i)*(a-r)}return null}function Ee(e,t,n=0){let r=Te($,t),i=Te(Ce,t);return r===null||i===null?t>0:e>r-n&&e<i+n}function De(e,t,n,r){N(e,t.atmos,{key:n,extra:e=>{e.uniforms.uOn=t.uCityOn,e.uniforms.uWin=t.uWinI,e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
varying vec3 vLP; varying vec3 vON; varying float vSeed; varying float vHgt;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
          {
            vec3 sc = vec3( 1.0 );
            #ifdef USE_INSTANCING
              sc = vec3( length( instanceMatrix[0].xyz ), length( instanceMatrix[1].xyz ), length( instanceMatrix[2].xyz ) );
              vSeed = fract( sin( dot( instanceMatrix[3].xz, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
            #else
              vSeed = 0.5;
            #endif
            vLP = position * sc;
            vHgt = sc.y;
            vON = normal;
          }`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
          ${Y}
          uniform float uOn; uniform float uWin;
          varying vec3 vLP; varying vec3 vON; varying float vSeed; varying float vHgt;
          float gWin; float gLit; vec3 gWinCol;`).replace(`#include <color_fragment>`,`#include <color_fragment>
          gWin = 0.0; gLit = 0.0; gWinCol = vec3( 0.0 );
          {
            float side = abs( vON.y ) < 0.5 ? 1.0 : 0.0;
            float hc = abs( vON.x ) > 0.5 ? vLP.z : vLP.x;
            float floorH = ${r?`3.8`:`3.2`};
            vec2 c = vec2( hc / ${r?`2.0`:`3.4`}, vLP.y / floorH );
            vec2 cell = floor( c ); vec2 f = fract( c );
            vec2 fw = fwidth( c );
            float aa = smoothstep( 0.2, 0.6, max( fw.x, fw.y ) );
            float mask = smoothstep( 0.16, 0.24, f.x ) * smoothstep( 0.84, 0.76, f.x ) * smoothstep( 0.24, 0.32, f.y ) * smoothstep( 0.86, 0.78, f.y );
            ${r?`mask = smoothstep( 0.04, 0.1, f.x ) * smoothstep( 0.96, 0.9, f.x ) * smoothstep( 0.08, 0.14, f.y ) * smoothstep( 0.96, 0.9, f.y );`:``}
            mask = mix( mask, ${r?`0.75`:`0.35`}, aa ) * side * step( 0.6, vLP.y / floorH );
            gWin = mask;
            // facade: weathering, darker ground floor, slab edges, AO at the base
            float n = rNoise( vec3( vLP.x * 0.08, vLP.y * 0.05, vLP.z * 0.08 ) + vSeed * 40.0 );
            diffuseColor.rgb *= 0.8 + 0.35 * n;
            diffuseColor.rgb *= mix( 0.45, 1.0, smoothstep( 0.0, 5.0, vLP.y ) ) * mix( 0.8, 1.06, clamp( vLP.y / max( vHgt, 1.0 ), 0.0, 1.0 ) );
            diffuseColor.rgb *= 0.9 + 0.2 * rHash2( vec2( floor( hc / 9.0 ), vSeed * 31.0 ) ) * side;
            diffuseColor.rgb *= 1.0 - 0.15 * smoothstep( 0.92, 1.0, f.y ) * side * ( 1.0 - aa );
            diffuseColor.rgb = mix( diffuseColor.rgb, vec3( ${r?`0.03, 0.04, 0.05`:`0.06, 0.06, 0.065`} ), mask * ${r?`0.8`:`0.68`} );
            // night: lit windows
            float bOn = smoothstep( vSeed * 0.8, vSeed * 0.8 + 0.15, uOn );
            float r = rHash2( cell + vSeed * 91.7 + vON.xz * 13.0 );
            float r2 = rHash2( cell * 1.37 + vSeed * 17.1 );
            float density = mix( 0.08, 0.42, fract( vSeed * 7.3 ) );
            gLit = step( r, density * bOn );
            vec3 warm = vec3( 1.0, 0.6, 0.28 );
            vec3 cool = vec3( 0.7, 0.82, 1.0 );
            gWinCol = mix( warm, cool, step( 0.8, r2 ) ) * ( 0.15 + 1.1 * r2 * r2 );
            vec3 avg = mix( warm, cool, 0.2 ) * 0.07 * density * bOn;
            gWinCol = mix( gWinCol * gLit, avg, aa ) * mask;
          }`).replace(`#include <roughnessmap_fragment>`,`#include <roughnessmap_fragment>
          roughnessFactor = mix( roughnessFactor, ${r?`0.18`:`0.2`}, gWin );`).replace(`#include <emissivemap_fragment>`,`#include <emissivemap_fragment>
          totalEmissiveRadiance += gWinCol * uWin;`)}})}function Oe(e){let t=[],n=new p(.17,.27,1,6,6,!0);n.translate(0,.5,0);let r=n.attributes.position;for(let e=0;e<r.count;e++){let t=r.getY(e);r.setX(e,r.getX(e)+t*t*.07)}let i=new Float32Array(r.count*3).fill(0);n.setAttribute(`aLeaf`,new O(i,3)),n.deleteAttribute(`uv`),t.push(n);for(let n=0;n<11;n++){let r=n/11*Math.PI*2+e()*.3,i=.32+e()*.08,a=(e()*.5+.2)*.12,o=[],s=[],c=[],l=Math.cos(r),u=Math.sin(r),d=-u,f=l;for(let e=0;e<=7;e++){let t=e/7,n=t*i,r=1+a*Math.sin(t*Math.PI*.9)-t*t*i*.75,c=.075*Math.sin(Math.PI*Math.min(1,t*1.1+.05))**.6+.004,p=.07+l*n,m=u*n,h=-c*.35;o.push(p+d*c,r+h,m+f*c,p,r,m,p-d*c,r+h,m-f*c),s.push(t,1,1,t,0,1,t,-1,1)}for(let e=0;e<7;e++){let t=e*3;c.push(t,t+3,t+1,t+1,t+3,t+4,t+1,t+4,t+2,t+2,t+4,t+5)}let p=new g;p.setAttribute(`position`,new O(new Float32Array(o),3)),p.setAttribute(`aLeaf`,new O(new Float32Array(s),3)),p.setIndex(c),p.computeVertexNormals(),t.push(p)}return n.toNonIndexed,q(t.map(e=>e.index?e.toNonIndexed():e))}function ke(e,r){let i=r===`low`,a=G(1234),o=new s;o.name=`river-city`;let c=new l,u=new f,d=new m,h=new m,_=new m(0,1,0),y=new D;y.moveTo(-3e4,-4e3),y.lineTo(3e4,-4e3),y.lineTo(3e4,3e4),y.lineTo(-3e4,3e4),y.closePath();let x=new t;[...$,...Ce.slice().reverse()].forEach(([e,t],n)=>n===0?x.moveTo(e,-t):x.lineTo(e,-t)),x.closePath(),y.holes.push(x);let T=new ne(y,{depth:5.2,bevelEnabled:!1,curveSegments:1});T.rotateX(-Math.PI/2),T.translate(0,-3,0);let ee=new n({color:new w(.3,.27,.2),roughness:1});ee.name=`land`,N(ee,e.atmos,{key:`land`,extra:e=>{e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>\n${Y}`).replace(`#include <color_fragment>`,`#include <color_fragment>
          {
            float n = rFbm2( vAtmW.xz * 0.004 );
            diffuseColor.rgb *= 0.7 + 0.6 * n;
            diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.12, 0.15, 0.08 ), smoothstep( 0.45, 0.7, rFbm2( vAtmW.xz * 0.01 + 5.0 ) ) * 0.6 );
          }`)}});let E=new n({color:new w(.5,.45,.38),roughness:.9});E.name=`embank`,N(E,e.atmos,{key:`embank`,extra:e=>{e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>\n${Y}`).replace(`#include <color_fragment>`,`#include <color_fragment>
          {
            vec3 w = vAtmW;
            float blk = rHash2( floor( vec2( ( w.x + w.z ) / 1.6, w.y / 0.6 ) ) );
            diffuseColor.rgb *= 0.75 + 0.35 * blk;
            diffuseColor.rgb *= mix( 0.35, 1.0, smoothstep( 0.0, 1.2, w.y ) ); // wet line
          }`)}});let te=new A(T,[ee,E]);o.add(te);let k=new n({color:new w(.62,.47,.3),roughness:1});k.name=`dune`,N(k,e.atmos,{key:`dune`});let re=new C(1,48,12,0,Math.PI*2,0,Math.PI/2),ie=re.attributes.position;for(let e=0;e<ie.count;e++){let t=ie.getY(e);ie.setY(e,t**.35)}re.computeVertexNormals();let j=new A(re,k);j.scale.set(2600,44,1500),j.position.set(-2350,-2,-4100),o.add(j);let M=new n({color:new w(.78,.6,.4),roughness:.95,flatShading:!0});M.name=`pyr`,N(M,e.atmos,{key:`pyr`,mul:.42,extra:t=>{t.uniforms.uFlood=e.uFlood,t.fragmentShader=t.fragmentShader.replace(`#include <common>`,`#include <common>\n${Y}\nuniform float uFlood;`).replace(`#include <emissivemap_fragment>`,`#include <emissivemap_fragment>
          totalEmissiveRadiance += diffuseColor.rgb * vec3( 1.0, 0.8, 0.55 ) * uFlood * ( 0.35 + 0.65 * smoothstep( 0.0, 0.8, normalize( cross( dFdx( vAtmW ), dFdy( vAtmW ) ) ).z ) );`).replace(`#include <color_fragment>`,`#include <color_fragment>
          {
            float course = smoothstep( 0.35, 0.5, abs( fract( vAtmW.y / 1.5 ) - 0.5 ) );
            diffuseColor.rgb *= 0.9 + 0.1 * course;
            diffuseColor.rgb *= 0.85 + 0.25 * rNoise( vAtmW * 0.05 );
          }`)}});let ae=Math.tan(51.84*Math.PI/180),oe=[{h:146.6,x:-2e3,z:-3700,rot:.06},{h:143.5,x:-2330,z:-4050,rot:.06,cap:!0},{h:65.5,x:-2630,z:-4380,rot:.06}];for(let e=0;e<3;e++)oe.push({h:20+e*2,x:-1830+e*45,z:-3860,rot:.06});let se=new s;for(let e of oe){let t=e.h/ae,n=new v(t*Math.SQRT2,e.h,4,1).toNonIndexed();n.rotateY(Math.PI/4+e.rot),n.translate(0,e.h/2,0),n.computeVertexNormals();let r=new A(n,M);r.position.set(e.x,40,e.z),se.add(r)}o.add(se);let P=i?{block:650,tower:70,glass:24}:{block:1500,tower:150,glass:46},F=new S(1,1,1);F.translate(0,.5,0);let I=q([(()=>{let e=new S(1,.82,1);return e.translate(0,.41,0),e})(),(()=>{let e=new S(.78,.14,.78);return e.translate(0,.89,0),e})(),(()=>{let e=new S(.4,.05,.4);return e.translate(0,.985,0),e})()]),L=new n({color:16777215,roughness:.88});L.name=`blocks`,De(L,e,`blocks`,!1);let R=new n({color:16777215,roughness:.75});R.name=`towers`,De(R,e,`towers`,!1);let z=new n({color:16777215,roughness:.3,metalness:.4});z.name=`glass`,De(z,e,`glass`,!0);let B=new b(F,L,P.block),ce=new b(I,R,P.tower),le=new b(F,z,P.glass),ue=[new w(.5,.42,.33),new w(.58,.51,.41),new w(.44,.38,.31),new w(.62,.58,.52),new w(.47,.4,.34),new w(.4,.38,.36),new w(.55,.55,.53)],V=[new w(.3,.38,.42),new w(.35,.32,.28),new w(.25,.3,.36)],de=[],H=[],U=0,W=0,fe=0,pe=0,me=P.block+P.tower+P.glass;for(;(U<P.block||W<P.tower||fe<P.glass)&&pe++<me*40;){let e=600-a()**1.25*6600,t=900+Math.max(0,-e)*.6,n=(a()*2-1)*t;if(Ee(n,e,45))continue;let r=n<0,o=Math.atan2(-n,-e+300)/(Math.PI/180),s=Math.atan2(-n-10,-e-185)/(Math.PI/180),l=r&&(o>20&&o<36||s>22&&s<40)&&e<300;if(l&&a()<.5)continue;let f=Ee(n,e,160),p=!r&&e<-700&&e>-2800&&n<1800,m=`block`,g=a();if(p&&g<.12&&fe<P.glass?m=`glass`:(p&&g<.3||f&&!r&&g<.05)&&(m=W<P.tower?`tower`:`block`),m===`block`&&U>=P.block)continue;let v,y,b;m===`glass`?(v=90+a()**1.3*90,y=26+a()*16,b=26+a()*16):m===`tower`?(v=55+a()**1.4*85,y=22+a()*18,b=20+a()*16):(v=12+a()**2*(f?40:30),y=16+a()*26,b=14+a()*24,l&&(v=Math.min(v,3+Math.hypot(n,e-300)*.007)),e>-500&&(v=Math.min(v,10+a()*18)));let x=Te(r?$:Ce,e);if(x!==null&&Math.abs(n-x)<55+y*.6)continue;let S=(a()-.5)*.3+(a()<.12?Math.PI/4:0);u.setFromAxisAngle(_,S),d.set(n,1.7000000000000002,e),h.set(y,v,b),c.compose(d,u,h),m===`glass`?(le.setMatrixAt(fe,c),le.setColorAt(fe,V[Math.floor(a()*3)]),fe++):m===`tower`?(ce.setMatrixAt(W,c),ce.setColorAt(W,ue[Math.floor(a()*ue.length)].clone().multiplyScalar(.9+a()*.2)),W++):(B.setMatrixAt(U,c),B.setColorAt(U,ue[Math.floor(a()*ue.length)].clone().multiplyScalar(.8+a()*.35)),U++,!i&&v>14&&a()<.7&&H.push([n+(a()-.5)*y*.5,1.7000000000000002+v,e+(a()-.5)*b*.5,2+a()*4,1.5+a()*2.5,S])),v>60&&de.push([n,we+v,e])}for(let[e,t]of[[B,U],[ce,W],[le,fe]])e.count=t,e.instanceMatrix.needsUpdate=!0,e.instanceColor&&(e.instanceColor.needsUpdate=!0),e.computeBoundingSphere(),o.add(e);if(H.length){let t=new n({color:new w(.45,.42,.38),roughness:.9});t.name=`roof`,N(t,e.atmos,{key:`roof`});let r=new b(F,t,H.length);H.forEach((e,t)=>{u.setFromAxisAngle(_,e[5]),c.compose(d.set(e[0],e[1],e[2]),u,h.set(e[3],e[4],e[3]*.8)),r.setMatrixAt(t,c)}),r.instanceMatrix.needsUpdate=!0,r.computeBoundingSphere(),o.add(r)}let K=new n({color:new w(.11,.14,.07),roughness:1,side:2});K.name=`treeline`,N(K,e.atmos,{key:`treeline`,extra:e=>{e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
attribute vec2 aRib; varying vec2 vRib;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
vRib = aRib;`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>\n${Y}\nvarying vec2 vRib;`).replace(`#include <clipping_planes_fragment>`,`#include <clipping_planes_fragment>
          {
            float a = vRib.x;
            float crown = 0.45 + 0.55 * rFbm2( vec2( a * 0.09, 0.0 ) ) + 0.25 * rNoise2( vec2( a * 0.6, 3.0 ) );
            crown *= mix( 0.6, 1.0, smoothstep( 0.2, 0.5, rNoise2( vec2( a * 0.012, 9.0 ) ) ) );
            float lumpy = 0.06 * rNoise2( vec2( a * 2.5, vRib.y * 6.0 ) );
            if ( vRib.y > crown + lumpy ) discard;
          }`).replace(`#include <color_fragment>`,`#include <color_fragment>
          diffuseColor.rgb *= 0.65 + 0.6 * rNoise2( vec2( vRib.x * 0.8, vRib.y * 8.0 ) ) * smoothstep( 0.0, 0.6, vRib.y );`)}});let he=[];for(let e of[$,Ce]){let t=e===$?-1:1;for(let[n,r,i]of[[24,16,0],[46,22,500]]){let a=[],o=[],s=[],c=i,l=null,u=0;for(let d=2800;d>-5200;d-=12){let f=Te(e,d);if(f===null)continue;let p=f+t*(n+6*Math.sin(d*.01+i));if(l&&(c+=Math.hypot(p-l[0],d-l[1])),l=[p,d],a.push(p,1.7000000000000002,d,p,we+r,d),o.push(c,0,c,1),u>0){let e=(u-1)*2;s.push(e,e+2,e+1,e+1,e+2,e+3)}u++}let d=new g;d.setAttribute(`position`,new O(new Float32Array(a),3)),d.setAttribute(`aRib`,new O(new Float32Array(o),2)),d.setIndex(s),d.computeVertexNormals(),he.push(d)}}let J=new A(q(he),K);J.frustumCulled=!1,o.add(J);let _e=new n({color:16777215,roughness:.85,side:2});_e.name=`palm`,N(_e,e.atmos,{key:`palm`,extra:t=>{t.uniforms.uWind=e.uTime,t.vertexShader=t.vertexShader.replace(`#include <common>`,`#include <common>
attribute vec3 aLeaf; varying vec3 vLeaf; uniform float uWind;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
          vLeaf = aLeaf;
          if ( aLeaf.z > 0.5 ) {
            float ph = 0.0;
            #ifdef USE_INSTANCING
              ph = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.07;
            #endif
            transformed.y += sin( uWind * 1.3 + ph + aLeaf.x * 2.0 ) * 0.008 * aLeaf.x;
          }`),t.fragmentShader=t.fragmentShader.replace(`#include <common>`,`#include <common>
varying vec3 vLeaf;`).replace(`#include <clipping_planes_fragment>`,`#include <clipping_planes_fragment>
          if ( vLeaf.z > 0.5 ) {
            float u = vLeaf.x, v = abs( vLeaf.y );
            float comb = fract( u * 26.0 - v * 1.6 );
            if ( v > 0.18 && comb > 0.55 ) discard;
            if ( v > 1.0 - 0.6 * u ) discard;
          }`).replace(`#include <color_fragment>`,`#include <color_fragment>
          diffuseColor.rgb = vLeaf.z > 0.5 ? mix( vec3( 0.12, 0.16, 0.06 ), vec3( 0.2, 0.22, 0.09 ), vLeaf.x ) : vec3( 0.2, 0.15, 0.1 );`)}});let X=Oe(a),ye=i?220:520,be=new b(X,_e,ye),xe=0;for(let e=0;e<ye*4&&xe<ye;e++){let e=a()<.5?$:Ce,t=e===$?-1:1,n=2600-a()**1.15*6e3,r=Te(e,n);if(r===null)continue;let i=r+t*(5+a()**1.5*70),o=10+a()*9;u.setFromAxisAngle(_,a()*Math.PI*2);let s=new f().setFromAxisAngle(new m(a()-.5,0,a()-.5).normalize(),(a()-.5)*.25);u.premultiply(s),c.compose(d.set(i,1.9000000000000001,n),u,h.set(o,o,o)),be.setMatrixAt(xe++,c)}be.count=xe,be.instanceMatrix.needsUpdate=!0,be.computeBoundingSphere(),o.add(be);let Z=new n({color:new w(.62,.56,.48),roughness:.8});Z.name=`ctower`,N(Z,e.atmos,{key:`ctower`,extra:t=>{t.uniforms.uTowerOn=e.uTowerOn,t.fragmentShader=t.fragmentShader.replace(`#include <common>`,`#include <common>
uniform float uTowerOn;`).replace(`#include <color_fragment>`,`#include <color_fragment>
          float lat = 0.0;
          {
            vec3 w = vAtmW - vec3( -430.0, 0.0, -1400.0 );
            float ang = atan( w.z, w.x ) * 6.0;
            vec2 g = vec2( ang + w.y * 0.32, ang - w.y * 0.32 );
            vec2 f = abs( fract( g ) - 0.5 );
            lat = smoothstep( 0.12, 0.05, min( f.x, f.y ) ) * step( 8.0, w.y ) * step( w.y, 154.0 );
            diffuseColor.rgb *= 1.0 - 0.55 * lat;
          }`).replace(`#include <emissivemap_fragment>`,`#include <emissivemap_fragment>
          {
            float y = vAtmW.y;
            vec3 Nw = normalize( ${ge} );
            float up = smoothstep( 160.0, 10.0, y ) * 0.18 + smoothstep( 150.0, 160.0, y ) * smoothstep( 175.0, 165.0, y ) * 0.18;
            totalEmissiveRadiance += vec3( 1.0, 0.72, 0.42 ) * uTowerOn * up * ( 1.0 - 0.7 * lat ) * 1.2;
          }`)}});let Q=[];{let e=new p(6,4.4,150,20,1,!0);e.translate(0,77,0),Q.push(e)}{let e=new p(15,17,6,20);e.translate(0,3,0),Q.push(e)}{let e=new p(10.5,6.5,10,20);e.translate(0,157,0),Q.push(e)}{let e=new p(7.5,10.5,5,20);e.translate(0,164.5,0),Q.push(e)}{let e=new p(.8,1.8,18,8);e.translate(0,176,0),Q.push(e)}let Se=new A(q(Q),Z);Se.position.set(-430,we,-1400),o.add(Se),de.push([-430,188.2,-1400]);let ke=[],Ae=[1,.5,.17],je=[1,.86,.68];for(let e of[$,Ce]){let t=e===$?-1:1;for(let n=2200;n>-4600;n-=i?40:24){let r=Te(e,n);r!==null&&ke.push([r+t*6,9.2,n,...Ae.map(e=>e*9),.9,.05+.5*Math.abs(n+760)/4e3+a()*.08])}}let Me=i?900:2600;for(let e=0,t=0;e<Me&&t<Me*12;t++){let t=1500-a()**1.3*6800,n=900+Math.max(0,-t)*.6,r=(a()*2-1)*n;if(Ee(r,t,30))continue;let i=a()<.65?Ae:je,o=4+a()*7;ke.push([r,5.2+a()*7,t,i[0]*o,i[1]*o,i[2]*o,.9+a()*.8,.2+a()*.75]),e++}let Ne=ke.length,Pe=new Float32Array(Ne*3),Fe=new Float32Array(Ne*3),Ie=new Float32Array(Ne),Le=new Float32Array(Ne);ke.forEach((e,t)=>{Pe.set(e.slice(0,3),t*3),Fe.set(e.slice(3,6),t*3),Ie[t]=e[6],Le[t]=e[7]}),o.add(ve(e,{positions:Pe,colors:Fe,sizes:Ie,rands:Le},{on:e.uCityOn,minPx:1.3,fogMul:.6}));let Re=de.length,ze=new Float32Array(Re*3),Be=new Float32Array(Re*3),Ve=new Float32Array(Re),He=new Float32Array(Re);return de.forEach((e,t)=>{ze.set(e,t*3),Be.set([10,.6,.3],t*3),Ve[t]=1.8,He[t]=a()}),o.add(ve(e,{positions:ze,colors:Be,sizes:Ve,rands:He},{on:e.uBeaconOn,minPx:1.6,blink:!0})),o.add(ve(e,{positions:new Float32Array([-430,170.2,-1400]),colors:new Float32Array([2,1.4,.75]),sizes:new Float32Array([2.2]),rands:new Float32Array([0])},{on:e.uTowerOn,minPx:3})),{group:o,cairoTowerTop:new m(-430,172.2,-1400),pyramidCenter:new m(-2300,100,-4e3),materials:[ee,E,k,M,L,R,z,K,_e,Z]}}function Ae(){let e=[],t=[],n=[],r=[.78,.75,.68],i=[.08,.22,.42],a=[.6,.18,.08],o=[.16,.1,.07];for(let n=0;n<=28;n++){let s=n/28,c=-4.6+s*9.6,l=Math.max(s-.4,0)/.6,u=1.3*(1-l**2.3)*(.72+.28*U(0,.35,s))+.01,d=.85+.75*l**2.2+.35*(1-s)**3,f=-.38*(1-.6*l**1.5)*(.75+.25*U(0,.3,s));for(let n=0;n<=14;n++){let s=n/14*Math.PI-Math.PI/2,l=Math.cos(s),p=u*Math.sin(s)*(.35+.65*Math.abs(Math.sin(s))**.25),m=d-(d-f)*l**.55;e.push(c,m,p);let h=d-m,g=r;h<.16?g=i:h<.24&&(g=a),m<.06&&(g=o),t.push(...g)}}for(let e=0;e<28;e++)for(let t=0;t<14;t++){let r=e*15+t,i=r+14+1;n.push(r,i,r+1,r+1,i,i+1)}let s=e.length/3;e.push(-4.6,.75,0),t.push(...r);for(let e=0;e<14;e++)n.push(s,e+1,e);let c=new g;return c.setAttribute(`position`,new O(new Float32Array(e),3)),c.setAttribute(`color`,new O(new Float32Array(t),3)),c.setIndex(n),c.computeVertexNormals(),c}function je(e,t,n,r){let i=[],a=[],o=[],s=new m().subVectors(n,e),c=s.length();s.normalize();let l=new m().subVectors(t,e).cross(s).normalize(),u=new m,d=[],f=0;for(let o=0;o<=18;o++){d.push(f);for(let d=0;d<=18-o;d++){let p=o/18,h=d/18,g=1-p-h;u.set(0,0,0).addScaledVector(e,g).addScaledVector(t,p).addScaledVector(n,h);let _=Math.max(g*p*h*27,0)**.6+.35*h*p*4*(1-g);u.addScaledVector(l,r*_),i.push(u.x,u.y,u.z);let v=new m(u.x,u.y,u.z).sub(e);a.push(v.dot(s)/c,p),f++}}for(let e=0;e<18;e++)for(let t=0;t<18-e;t++){let n=d[e]+t,r=d[e+1]+t;o.push(n,n+1,r),t<18-e-1&&o.push(n+1,r+1,r)}let p=new g;return p.setAttribute(`position`,new O(new Float32Array(i),3)),p.setAttribute(`uv`,new O(new Float32Array(a),2)),p.setIndex(o),p.computeVertexNormals(),p}function Me(e,t,n,r){let i=new m().subVectors(t,e),a=new p(r,n,i.length(),6,1);a.translate(0,i.length()/2,0);let o=new A(a);return o.position.copy(e),o.quaternion.setFromUnitVectors(new m(0,1,0),i.normalize()),o.updateMatrix(),a.applyMatrix4(o.matrix),a}function Ne(e,t){let r=t===`low`,i=new n({vertexColors:!0,roughness:.62,side:2});i.name=`hull`,N(i,e.atmos,{key:`hull`,extra:e=>{e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>\n${Y}`).replace(`#include <color_fragment>`,`#include <color_fragment>
          diffuseColor.rgb *= gl_FrontFacing ? ( 0.85 + 0.25 * rNoise( vAtmW * vec3( 0.6, 4.0, 0.6 ) ) ) : 0.35;`)}});let a=new n({color:new w(.24,.17,.11),roughness:.7});a.name=`spar`,N(a,e.atmos,{key:`spar`});let o=new n({color:new w(.92,.88,.79),roughness:.92,side:2});o.name=`sail`,N(o,e.atmos,{key:`sail`,extra:t=>{t.uniforms.uLightDir=e.uLightDir,t.uniforms.uSunE=e.uSunE,t.vertexShader=t.vertexShader.replace(`#include <common>`,`#include <common>
varying vec2 vSail;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
vSail = uv;`),t.fragmentShader=t.fragmentShader.replace(`#include <common>`,`#include <common>\n${Y}\nvarying vec2 vSail; uniform vec3 uLightDir; uniform vec3 uSunE;\nfloat gSeam;`).replace(`#include <color_fragment>`,`#include <color_fragment>
          {
            float seam = smoothstep( 0.44, 0.49, abs( fract( vSail.x * 13.0 ) - 0.5 ) );
            float hem = smoothstep( 0.03, 0.0, vSail.y ) * 0.7;
            float stain = rFbm( vec3( vSail * 9.0, 1.0 ) );
            gSeam = clamp( seam + hem, 0.0, 1.0 );
            diffuseColor.rgb *= ( 0.92 + 0.12 * stain ) * ( 1.0 - 0.1 * gSeam );
            diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.92, 0.84, 0.7 ), smoothstep( 0.55, 0.8, stain ) * 0.6 );
          }`).replace(`#include <emissivemap_fragment>`,`#include <emissivemap_fragment>
          {
            vec3 Nw = normalize( ${ge} );
            vec3 L = normalize( uLightDir );
            vec3 V = normalize( cameraPosition - vAtmW );
            float back = max( -dot( Nw, L ), 0.0 );
            float fwd = pow( max( dot( -V, L ), 0.0 ), 4.0 );
            float thick = 1.0 + gSeam * 1.8;
            vec3 tr = uSunE * diffuseColor.rgb * vec3( 1.0, 0.9, 0.72 ) * ( back * 0.42 + fwd * 0.5 ) * exp( -( thick - 1.0 ) * 0.9 ) / 3.14159;
            totalEmissiveRadiance += tr;
          }`)}});let c=Ae(),l=new m(4.2,1.35,0),u=new m(-5.2,14.2,0),d=new m(-3.9,1.95,0),f=new m(1.2,.2,0),p=[Me(f,new m(1.05,6.6,0),.12,.08),Me(l.clone().add(new m(.5,-.65,0)),u.clone().add(new m(-.3,.4,0)),.09,.05),Me(l.clone().add(new m(.2,-.05,0)),d.clone().add(new m(-.25,0,0)),.07,.06)],h=[{x:2,z:150,h:-1.95,s:1,sheet:.45,belly:1,v:1,hero:!0},{x:62,z:-60,h:-1.35,s:1.05,sheet:-.4,belly:.9,v:.8},{x:-105,z:-300,h:-1.75,s:.95,sheet:.5,belly:1.1,v:.7},{x:140,z:-470,h:-2.4,s:1.1,sheet:-.55,belly:.9,v:.6},{x:-40,z:-620,h:-1.2,s:1,sheet:.35,belly:1,v:.6},{x:60,z:-1250,h:-1.6,s:1.1,sheet:.4,belly:1,v:.5}],g=r?h.filter((e,t)=>t%2==0||t===1):h,_=G(77),v=g.map((t,n)=>{let r=new s;r.name=`felucca-`+n;let h=new A(c,i);r.add(h);let v=new s;v.position.copy(f);let y=new A(je(l.clone().sub(f),u.clone().sub(f),d.clone().sub(f),.9*t.belly*(t.sheet>0?1:-1)),o);v.add(y);for(let e of p){let t=new A(e,a);t.position.copy(f).negate(),v.add(t)}return v.rotation.y=t.sheet,r.add(v),r.add(ve(e,{positions:new Float32Array([1.4,2.6,0]),colors:new Float32Array([7,4.2,1.8]),sizes:new Float32Array([.5]),rands:new Float32Array([.3+.4*(n/g.length)])},{on:e.uCityOn,minPx:1.4})),r.scale.setScalar(t.s),{group:r,cfg:t,phase:_()*10,pos:new m}}),y=new s;return v.forEach(e=>y.add(e.group)),{group:y,boats:v,materials:[i,a,o],update(e,t,n,r){let i=n?.35:1;v.forEach((a,o)=>{let s=a.cfg,c=t*160*s.v+(n?0:e*.15*s.v),l=Math.cos(s.h),u=Math.sin(s.h);a.pos.set(s.x+l*c,0,s.z+u*c);let d=e+a.phase;a.group.position.set(a.pos.x,(.06*Math.sin(d*1.1)+.03*Math.sin(d*2.3))*i-.05,a.pos.z),a.group.rotation.set(.035*Math.sin(d*.8)*i+.06*Math.sign(s.sheet),-s.h,.02*Math.sin(d*.95+1)*i,`YXZ`),r&&r[o]&&r[o].set(a.pos.x+l*4*s.s,a.pos.z+u*4*s.s,s.h,.9*s.v+.3)})}}}function Pe(){let e=[],t=[],n=[],r=(n,r,i,a)=>(e.push(n,r,i),t.push(a),e.length/3-1),i=r(.32,.03,0,0),a=r(-.42,0,0,0),o=r(0,.07,0,0),s=r(0,-.06,0,0),c=r(0,0,.08,0),l=r(0,0,-.08,0);n.push(i,o,c,i,l,o,i,c,s,i,s,l,a,c,o,a,o,l,a,s,c,a,l,s);let u=r(.46,.08,0,0),d=r(.62,.05,0,0),f=r(.42,.12,0,0);n.push(i,u,f,u,d,f);let p=r(-.4,-.02,.02,0),m=r(-.72,-.05,0,0),h=r(-.4,-.04,-.02,0);n.push(p,m,h);for(let e of[1,-1]){let t=r(.12,.02,.06*e,.06*e),i=r(-.14,.02,.06*e,.06*e),a=r(.14,.02,.38*e,.38*e),o=r(-.18,.02,.38*e,.38*e),s=r(.04,.02,.78*e,.78*e),c=r(-.12,.02,.74*e,.74*e);n.push(t,a,i,i,a,o,a,s,o,o,s,c)}let _=new g;return _.setAttribute(`position`,new O(new Float32Array(e),3)),_.setAttribute(`aWing`,new O(new Float32Array(t),1)),_.setIndex(n),_.computeVertexNormals(),_}function Fe(e,t){let r=t===`low`?9:17,i=new n({color:16777215,roughness:.9,side:2,envMapIntensity:.6});i.name=`birds`,N(i,e.atmos,{key:`birds`,extra:t=>{t.uniforms.uFlap=e.uFlapT,t.vertexShader=t.vertexShader.replace(`#include <common>`,`#include <common>
attribute float aWing; uniform float uFlap;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
          {
            float ph = 0.0;
            #ifdef USE_INSTANCING
              ph = fract( instanceMatrix[3].x * 0.137 + instanceMatrix[3].z * 0.071 ) * 6.2831;
            #endif
            float glide = smoothstep( 0.55, 0.9, sin( uFlap * 0.31 + ph * 1.7 ) );
            float beat = sin( uFlap * 5.2 + ph );
            float a = mix( beat * 0.85 + 0.15, 0.08, glide );
            float s = abs( aWing );
            float sg = sign( aWing );
            float inner = min( s, 0.38 );
            float outer = max( s - 0.38, 0.0 );
            float a2 = a * 1.5 + 0.25 * cos( uFlap * 5.2 + ph ) * ( 1.0 - glide );
            float y = sin( a ) * inner + sin( a2 ) * outer;
            float z = cos( a ) * inner + cos( a2 ) * outer;
            if ( s > 0.0 ) { transformed.y += y; transformed.z = sg * ( z + 0.0 ); }
            transformed.y += 0.03 * beat * ( 1.0 - glide ) * ( 1.0 - step( 0.001, s ) );
          }`)}});let a=new b(Pe(),i,r),o=G(31),s=[],c=new w(.6,.6,.6),u=new w(.05,.045,.045);for(let e=0;e<r;e++){let t=o()<.45;s.push({off:new m(-Math.abs(e-r/2)*3.2+(o()-.5)*4,(o()-.5)*3+e*.15,(e-r/2)*2.6+(o()-.5)*3),scale:t?1.25+o()*.2:1.1+o()*.15,wob:o()*10}),a.setColorAt(e,t?c:u)}a.instanceColor.needsUpdate=!0,a.frustumCulled=!1,a.layers.set(1);let d=new l,p=new f,h=new m,g=new m,_=new m,v=new m(0,1,0);return{mesh:a,material:i,update(e,t,n,r,i){if(a.visible=i,!i)return;_.copy(t).normalize();let o=Math.atan2(-_.z,_.x);s.forEach((t,i)=>{h.copy(e).addScaledVector(_,(n-.5)*260);let s=t.off.x,c=t.off.z;h.x+=_.x*s-_.z*c,h.z+=_.z*s+_.x*c,h.y+=t.off.y+Math.sin(r*.7+t.wob)*.5,h.x+=Math.sin(r*.5+t.wob)*.8,p.setFromAxisAngle(v,o+Math.sin(r*.4+t.wob)*.08),g.setScalar(t.scale),d.compose(h,p,g),a.setMatrixAt(i,d)}),a.instanceMatrix.needsUpdate=!0}}}function Ie(e,t){let n=new s,i=t===`low`?[1.5,6]:[1,3.2,6.5,11],a=new r(2400,5200);a.rotateX(-Math.PI/2),a.translate(0,0,-1300);let o=[];return i.forEach((t,r)=>{let i=new E({name:`river-mist`,uniforms:{uTime:e.uTime,uSheet:e.uSheet,uLayer:{value:r},uY:{value:t}},vertexShader:`
        varying vec3 vW;
        void main() { vec4 w = modelMatrix * vec4( position, 1.0 ); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,fragmentShader:`
        uniform float uTime; uniform float uSheet; uniform float uLayer; uniform float uY;
        ${j}
        ${Y}
        varying vec3 vW;
        void main() {
          vec3 d = vW - cameraPosition;
          float dist = length( d );
          vec3 dir = d / dist;
          vec2 p = vW.xz * 0.0045 + vec2( uLayer * 3.7, uLayer * 1.3 ) + vec2( 0.004, 0.0015 ) * uTime;
          float n = rFbm2( p ) ;
          float n2 = rFbm2( vW.xz * 0.02 + vec2( -0.01, 0.006 ) * uTime + uLayer );
          float dens = smoothstep( 0.32, 0.75, n * 0.75 + n2 * 0.4 );
          // thickest over open water, thinner near the camera (no hard intersection), fade with height
          float thick = dens * uSheet * ( 1.0 - uLayer * 0.16 );
          float graze = 0.12 / max( abs( dir.y ), 0.02 );
          float a = 1.0 - exp( -thick * graze );
          a *= smoothstep( 40.0, 260.0, dist ) * smoothstep( 4200.0, 1800.0, dist );
          float mu = dot( dir, uSunDir );
          vec3 col = atmHaze( dir ) * 1.02 + uSunCol * atmHG( mu, 0.8 ) * uMieK * 1.0;
          // the sheet itself sits inside the atmosphere
          float T = atmTrans( vW, 0.6 );
          col = col * T + atmHaze( dir ) * ( 1.0 - T );
          gl_FragColor = vec4( col, a * 0.85 );
        }`,transparent:!0,depthWrite:!1,side:2,blending:1});M(i.uniforms,e.atmos);let s=new A(a,i);s.position.y=t,s.renderOrder=3+r,s.frustumCulled=!1,n.add(s),o.push(i)}),{group:n,materials:o}}function Le(e){let t=new E({name:`river-curtain`,uniforms:{uTime:e.uTime,uCurtain:e.uCurtain,uShaft:e.uShaft,uSunScreen:e.uSunScreen,uAspect:{value:1},uCamRot:{value:new a},uTan:{value:new y(1,1)},uPush:e.uPush,uMistCol:{value:new w(2,1.8,1.5)}},vertexShader:`
      varying vec2 vNdc;
      void main() { vNdc = position.xy; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`,fragmentShader:`
      uniform float uTime; uniform float uCurtain; uniform float uShaft; uniform vec2 uSunScreen; uniform float uAspect;
      uniform mat3 uCamRot; uniform vec2 uTan; uniform float uPush; uniform vec3 uMistCol;
      ${j}
      ${Y}
      varying vec2 vNdc;
      void main() {
        vec3 dir = normalize( uCamRot * vec3( vNdc.x * uTan.x, vNdc.y * uTan.y, -1.0 ) );
        float mu = dot( dir, uSunDir );
        vec3 base = mix( atmHaze( dir ) * 1.1 + uSunCol * atmHG( mu, 0.6 ) * uMieK * 2.0, uMistCol * ( 0.75 + 0.9 * atmHG( mu, 0.6 ) ), smoothstep( 0.0, 0.3, uCurtain ) );
        vec2 sp = vNdc * vec2( uAspect, 1.0 );
        float r = length( sp );
        float a = 0.0;
        if ( uCurtain > 0.001 ) {
          // fly-through: the vapour field zooms outward as we push forward
          float zoom = 1.0 / ( 1.0 + uPush * 2.5 );
          vec2 q = sp * zoom * 1.4 + vec2( uTime * 0.01, 0.0 );
          float n = rFbm2( q * 0.9 + 2.0 ) * 0.7 + rFbm2( q * 2.4 - uTime * 0.02 ) * 0.3;
          float open = 1.0 - uCurtain;
          float thr = open * 1.25 - 0.15 + 0.35 * open * ( 1.0 - smoothstep( 0.0, 1.4, r ) );
          a = smoothstep( thr - 0.05, thr + 0.3, n + 0.1 * ( 1.0 - r ) );
          a = mix( a, 1.0, smoothstep( 0.85, 1.0, uCurtain ) );
          // denser where the vapour is thick: a hint of self-shadow
          base *= mix( 0.82, 1.08, smoothstep( 0.3, 0.8, n ) );
        }
        // sun shafts raking through the mist
        vec2 toSun = ( vNdc * 0.5 + 0.5 ) - uSunScreen;
        toSun.x *= uAspect;
        float ang = atan( toSun.y, toSun.x );
        float ds = length( toSun );
        float rays = rNoise2( vec2( ang * 22.0, uTime * 0.03 ) ) * rNoise2( vec2( ang * 7.0 + 3.0, uTime * 0.02 ) );
        float shaft = smoothstep( 0.25, 0.7, rays ) * exp( -ds * 2.2 ) * smoothstep( 0.02, 0.15, ds ) * uShaft * smoothstep( -0.01, 0.06, dir.y );
        vec3 col = base;
        float alpha = clamp( a + shaft * 0.12, 0.0, 1.0 );
        gl_FragColor = vec4( col, alpha );
      }`,transparent:!0,depthTest:!1,depthWrite:!1});M(t.uniforms,e.atmos);let n=new A(new r(2,2),t);return n.frustumCulled=!1,n.renderOrder=20,n.layers.set(1),{mesh:n,material:t}}var Re=[{p:0,elev:1.4,az:13,turb:5,ray:1.4,mie:.005,mieG:.87,night:0,day:1,glow:.25,belt:[0,0,0],sunI:5,sunC:[1,.62,.36],disc:40,fog:.0045,fall:.07,aerial:26e-5,mieK:1.3,sheet:1.3,curtain:1,exp:.6,cloud:.2,cloudLit:[1.2,.75,.5],cloudSh:[.35,.3,.32],gain:1},{p:.1,elev:2,az:13.5,turb:4.8,ray:1.5,mie:.0036,mieG:.87,night:0,day:1,glow:.22,belt:[0,0,0],sunI:6.5,sunC:[1,.64,.38],disc:45,fog:.0024,fall:.06,aerial:22e-5,mieK:1.2,sheet:1.1,curtain:0,exp:.56,cloud:.22,cloudLit:[1.3,.8,.55],cloudSh:[.35,.3,.32],gain:1},{p:.28,elev:3.8,az:14.5,turb:4.6,ray:1.6,mie:.0036,mieG:.87,night:0,day:1,glow:.15,belt:[0,0,0],sunI:8.5,sunC:[1,.7,.45],disc:50,fog:.001,fall:.05,aerial:2e-4,mieK:1,sheet:.65,curtain:0,exp:.6,cloud:.25,cloudLit:[1.5,1,.72],cloudSh:[.4,.37,.38],gain:1},{p:.45,elev:4.2,az:16,turb:4.8,ray:1.8,mie:.0036,mieG:.87,night:0,day:1,glow:.2,belt:[0,0,0],sunI:9,sunC:[1,.68,.42],disc:50,fog:8e-4,fall:.045,aerial:18e-5,mieK:.9,sheet:.4,curtain:0,exp:.66,cloud:.28,cloudLit:[1.5,.95,.65],cloudSh:[.4,.36,.38],gain:1},{p:.55,elev:2,az:17.5,turb:5.5,ray:2.2,mie:.0036,mieG:.87,night:0,day:1,glow:.45,belt:[0,0,0],sunI:7,sunC:[1,.62,.38],disc:45,fog:8e-4,fall:.045,aerial:18e-5,mieK:1,sheet:.15,curtain:0,exp:.8,cloud:.22,cloudLit:[1.6,.75,.4],cloudSh:[.35,.28,.3],gain:1},{p:.63,elev:.1,az:18.5,turb:7,ray:2.6,mie:.006,mieG:.8,night:.08,day:1,glow:.85,belt:[.02,.008,.012],sunI:3.5,sunC:[1,.5,.26],disc:30,fog:8e-4,fall:.045,aerial:2e-4,mieK:1,sheet:.05,curtain:0,exp:1.05,cloud:.24,cloudLit:[1.5,.5,.25],cloudSh:[.22,.16,.2],gain:1.15},{p:.7,elev:-2.5,az:19.5,turb:6,ray:3,mie:.005,mieG:.78,night:.4,day:.85,glow:.7,belt:[.03,.012,.02],sunI:0,sunC:[1,.35,.15],disc:0,fog:7e-4,fall:.045,aerial:2e-4,mieK:.6,sheet:0,curtain:0,exp:1.9,cloud:.3,cloudLit:[.5,.18,.12],cloudSh:[.06,.05,.08],gain:1.3},{p:.8,elev:-5.5,az:20.5,turb:5,ray:3,mie:.004,mieG:.76,night:.85,day:.3,glow:.35,belt:[.008,.004,.008],sunI:0,sunC:[.9,.3,.15],disc:0,fog:65e-5,fall:.045,aerial:22e-5,mieK:.25,sheet:0,curtain:0,exp:2.6,cloud:.26,cloudLit:[.12,.06,.07],cloudSh:[.02,.022,.035],gain:1.3},{p:1,elev:-10,az:22,turb:4,ray:3,mie:.003,mieG:.76,night:1,day:.035,glow:.12,belt:[0,0,0],sunI:0,sunC:[.8,.3,.2],disc:0,fog:6e-4,fall:.045,aerial:24e-5,mieK:.1,sheet:0,curtain:0,exp:3,cloud:.22,cloudLit:[.03,.03,.045],cloudSh:[.012,.014,.024],gain:1.3}],ze=[{p:0,v:[6,3,470,22,9,-500,34,0]},{p:.1,v:[4,2.6,395,20,8,-500,34,0]},{p:.2,v:[-2,2,280,12,7,-500,34,-.4]},{p:.3,v:[2,1.7,150,14,7,-520,34,.3]},{p:.4,v:[14,2.6,-60,50,18,-640,35,0]},{p:.49,L:!0,v:[250,10,175,176,62,0,38,.5]},{p:.56,L:!0,v:[232,20,110,172,82,0,42,1]},{p:.62,L:!0,v:[212,34,80,168,100,0,46,1.4]},{p:.68,L:!0,v:[165,62,115,40,50,0,44,.8]},{p:.75,L:!0,v:[70,62,270,-20,44,0,40,.3]},{p:.83,v:[20,30,-320,4,46,-760,37,0]},{p:.9,v:[-6,17,-210,0,46,-760,36,0]},{p:1,v:[-10,15,-185,-2,46,-760,36,0]}];function Be(t){let{renderer:n,quality:r,reduced:o}=t,s=r===`low`,c={atmos:ie(),uScale:{value:500},uPR:{value:1},uTime:{value:0},uCarT:{value:0},uFlapT:{value:0},uLightDir:{value:new m(0,.05,-1)},uSunE:{value:new w(5,3,2)},uLampsOn:{value:0},uCityOn:{value:0},uCarsOn:{value:0},uBeaconOn:{value:0},uUpOn:{value:0},uTowerOn:{value:0},uWinI:{value:2.2},uStars:{value:0},uDust:{value:0},uDustColor:{value:new w(1,.75,.5)},uSunScreen:{value:{x:.6,y:.5}},uSheet:{value:1},uCableFat:{value:1},uFlood:{value:0},uCurtain:{value:1},uShaft:{value:0},uPush:{value:0}},l=new h;l.name=`river`;let d=new i(34,16/9,.5,24e3);d.layers.enable(1),l.add(d);let f=se(c.atmos);l.add(f);let p=ye(c,s?900:2200,o);l.add(p);let g=new u(16777215,5);l.add(g,g.target);let _=new e(8952251,6965808,.3);l.add(_);let v=new ee(n),y=new h,b=new A(f.geometry,f.material);b.scale.setScalar(100),b.frustumCulled=!1,y.add(b);let x=null,S=-1,C=99;function T(e){C++;let t=Math.abs(S-P.p);if(!e&&(t<.012||C<6&&t<.05))return;S=P.p,C=0;let r=n.getRenderTarget(),i=n.getActiveCubeFace(),a=n.getActiveMipmapLevel(),o=f.material.uniforms.uDiscCol.value.clone();f.material.uniforms.uDiscCol.value.setRGB(0,0,0);let s=v.fromScene(y,0,1,1e3);f.material.uniforms.uDiscCol.value.copy(o),n.setRenderTarget(r,i,a),l.environment=s.texture,x&&x.dispose(),x=s}let E=s?null:le(.5),te=ue(c,{normals:he(s?256:512),mirror:E,quality:r});l.add(te.mesh);let D=Se(c,r);D.group.position.set(0,0,-760),D.group.rotation.y=-.1,l.add(D.group),D.update(),D.pylonTopLocal.clone().applyMatrix4(D.group.matrixWorld);let O=new m(170,70,0).applyMatrix4(D.group.matrixWorld),k=new m(0,40,0).applyMatrix4(D.group.matrixWorld),ne=ze.map(e=>{if(!e.L)return e;let t=new m(e.v[0],e.v[1],e.v[2]).applyMatrix4(D.group.matrixWorld),n=new m(e.v[3],e.v[4],e.v[5]).applyMatrix4(D.group.matrixWorld);return{p:e.p,v:[t.x,t.y,t.z,n.x,n.y,n.z,e.v[6],e.v[7]]}}),re=ke(c,r);l.add(re.group);let j=Ne(c,r);l.add(j.group);let M=Fe(c,r);l.add(M.mesh);let N=Ie(c,r);l.add(N.group);let ae=Le(c);l.add(ae.mesh);let oe=be(c,s?80:200);d.add(oe);let P={p:0,init:!1},F={},I=Array(8).fill(0),L=new m,R=new m,z=new m,B=new m,G=new m,K=new m,q=new w,J={x:0,y:0},Y=16,ge=9,_e=34,ve=1,X={x:.6,y:.5,visible:!1,intensity:0},xe={distance:100,aperture:.3},Z={warmth:.5,tealShadows:.3,saturation:1.05,contrast:1.05},Q=[0,5,10,20,35,55,90,180],$=new m,Ce=new m(-1,0,-.25);{let e=pe(ne,.3,Array(8));$.set(e[0],0,e[2]).add(new m(e[3]-e[0],0,e[5]-e[2]).normalize().multiplyScalar(55)),$.y=10}function we(e){fe(Re,e,F);let t=F.az*V,n=F.elev*V;B.set(Math.sin(t)*Math.cos(n),Math.sin(n),-Math.cos(t)*Math.cos(n));let r=Math.max(n,-1.2*V);G.set(Math.sin(t)*Math.cos(r),Math.sin(r),-Math.cos(t)*Math.cos(r));let i=f.material.uniforms;i.sunPosition.value.copy(G),i.uSunTrue.value.copy(B),i.turbidity.value=F.turb,i.rayleigh.value=F.ray,i.mieCoefficient.value=F.mie,i.mieDirectionalG.value=F.mieG,i.uNight.value=F.night,i.uDay.value=F.day,i.uGlow.value=F.glow,i.uBelt.value.fromArray(F.belt),i.uDiscCol.value.fromArray(F.sunC).multiplyScalar(F.disc),i.uCloudCov.value=s?F.cloud*.8:F.cloud,i.uCloudLit.value.fromArray(F.cloudLit),i.uCloudShade.value.fromArray(F.cloudSh),i.uSkyGain.value=F.gain,i.uSkyTint.value.setRGB(1.02,.97,1.01).lerp(q.setRGB(1,1,1),U(.5,.7,e));let a=c.atmos,o=Math.atan2(B.x,-B.z);for(let e=0;e<8;e++){let t=o+Q[e]*V;K.set(Math.sin(t),.04,-Math.cos(t)).normalize(),ce(f,K,a.uHaze.value[e]);let n=.2126*a.uHaze.value[e].r+.7152*a.uHaze.value[e].g+.0722*a.uHaze.value[e].b;n>6&&a.uHaze.value[e].multiplyScalar(6/n);let r=a.uHaze.value[e],i=.2126*r.r+.7152*r.g+.0722*r.b;r.lerp(q.setRGB(i,i,i),.22)}ce(f,K.set(.3,.5,-.8).normalize(),a.uZenith.value),a.uSunDir.value.copy(B);let l=U(-2.5*V,2*V,n);a.uSunCol.value.fromArray(F.sunC).multiplyScalar(.06*F.sunI*l+.12*F.glow*(1-F.night)),a.uFogDens.value=F.fog,a.uFogFall.value=F.fall,a.uAerial.value=F.aerial,a.uMieK.value=F.mieK,a.uMieG.value=.86;let u=F.curtain;a.uMistNear.value=.03*u*u,i.uMist.value=.85*u;let d=i.uMistCol.value.copy(a.uHaze.value[0]).add(a.uHaze.value[2]).add(a.uHaze.value[4]).multiplyScalar(1/3),p=.2126*d.r+.7152*d.g+.0722*d.b;d.lerp(q.setRGB(p,p,p),.45).multiplyScalar(3.4/Math.max(p,.001)),ae.material.uniforms.uMistCol.value.copy(d);let m=.85*Math.sqrt(u)+.25*(1-U(.1,.22,e))*(1-u);if(m>.001){q.copy(d).multiplyScalar(.72);for(let e=0;e<8;e++)a.uHaze.value[e].lerp(q,m)}let h=F.night;a.uCityGlow.value.setRGB(.09,.045,.02).multiplyScalar(U(.2,.9,h)),g.color.fromArray(F.sunC),g.intensity=F.sunI*l,c.uLightDir.value.copy(B),_.color.copy(a.uZenith.value).multiplyScalar(2),_.groundColor.copy(a.uHaze.value[3]).multiplyScalar(.5).lerp(q.setRGB(.05,.035,.025),U(.6,.8,e)),_.intensity=.5+.3*l,c.uSunE.value.fromArray(F.sunC).multiplyScalar(g.intensity),c.uLampsOn.value=U(.56,.68,e)*1.05,c.uUpOn.value=U(.6,.7,e),c.uCarsOn.value=U(.58,.7,e),c.uCityOn.value=U(.57,.86,e)*1.05,c.uBeaconOn.value=U(.6,.75,e)*1.05,c.uTowerOn.value=U(.66,.74,e),c.uFlood.value=U(.72,.85,e)*.08,c.uWinI.value=H(1.2,1.7,h),c.uStars.value=U(.74,1,e)*.9,c.uSheet.value=F.sheet,c.uCurtain.value=u,c.uShaft.value=0,c.uDust.value=(1-U(.35,.55,e))*(s?.5:.8)*(1-u),c.uDustColor.value.fromArray(F.sunC).multiplyScalar(.9);let v=te.material.uniforms;v.uSunRad.value.copy(c.uSunE.value);let y=a.uHaze.value[6];v.uBody.value.setRGB(.05,.075,.055).multiply(y).add(new w(.012,.016,.012).multiplyScalar(g.intensity*.12)),v.uReflK.value=1,v.uRipple.value=1,ve=F.exp,Z.warmth=H(.55,-.45,U(.62,.85,e))+.2*U(.5,.62,e)*(1-U(.62,.72,e)),Z.tealShadows=H(.25,.7,U(.55,.9,e)),Z.saturation=H(1.05,1.12,U(.45,.65,e))-.08*U(.8,1,e),Z.contrast=H(1,1.1,U(.1,.4,e))}function Te(e){let t=d.aspect,n=30*V,r=2*Math.atan(Math.tan(n)/t)/V;return Math.min(78,Math.max(e,t<1?r:e))}function Ee(e,t,n){if(pe(ne,e,I),L.set(I[0],I[1],I[2]),R.set(I[3],I[4],I[5]),d.aspect<1){let t=U(.7,.95,e);R.x+=60*t}let r=W(3,n);o?(J.x=0,J.y=0):(J.x+=(De.x-J.x)*r,J.y+=(De.y-J.y)*r);let i=z.subVectors(R,L).normalize(),a=K.set(-i.z,0,i.x).normalize(),s=+!o*(1-.6*U(.85,1,e)),l=1-U(.4,.5,e),u=J.x*(l?1.2:3)+s*me(t*.23,1)*.12,f=-J.y*.5*(.4+.6*(1-l))+s*me(t*.31,2)*.06;L.addScaledVector(a,u),L.y=Math.max(.9,L.y+f),d.position.copy(L),d.up.set(0,1,0),d.lookAt(R),d.rotateY(-J.x*.8*V+s*me(t*.17,3)*.12*V),d.rotateX(-J.y*.5*V+s*me(t*.21,4)*.09*V),d.rotateZ((I[7]+s*me(t*.13,5)*.25)*V),_e=Te(I[6]),Math.abs(d.fov-_e)>.001&&(d.fov=_e,d.updateProjectionMatrix()),d.updateMatrixWorld(),c.uScale.value=ge/(2*Math.tan(d.fov*V/2))}let De={x:0,y:0},Oe=new a;function Ae(e,t,r,i){let a=de(r);if(!P.init)P.p=a,P.init=!0;else{let t=a-P.p;P.p=Math.abs(t)>.25?a:P.p+t*W(o?12:5,e)}let s=P.p;i&&(De.x=i.x||0,De.y=i.y||0);let u=o?t*.3:t;c.uTime.value=u,c.uCarT.value=t,c.uFlapT.value=o?t*.4:t,c.uPR.value=n.getPixelRatio(),c.uPush.value=s/.1,we(s),Ee(s,t,e),f.position.copy(d.position),p.position.copy(d.position),f.material.uniforms.time.value=o?0:u,g.position.copy(B).multiplyScalar(1500).add(d.position),g.target.position.copy(d.position),j.update(u,s,o,te.boats);for(let e=j.boats.length;e<6;e++)te.boats[e].w=0;let m=U(.1,.46,s);M.update($,Ce,m,u,s>.08&&s<.5),Oe.setFromMatrix4(d.matrixWorld);let h=ae.material.uniforms;h.uCamRot.value.copy(Oe);let _=Math.tan(d.fov*V/2);h.uTan.value.set(_*d.aspect,_),h.uAspect.value=d.aspect,ae.mesh.visible=c.uCurtain.value>.001||c.uShaft.value>.001,K.copy(B).multiplyScalar(5e3).add(d.position).project(d);let v=K.z<1;X.x=K.x*.5+.5,X.y=K.y*.5+.5;let y=v&&X.x>-.25&&X.x<1.25&&X.y>-.25&&X.y<1.25,b=U(-1.5*V,1.5*V,Math.asin(B.y));X.visible=y&&b>.01,X.intensity=y?b*(.55+.45*(1-c.uCurtain.value))*(F.sunI/9)*1.4:0,c.uSunScreen.value={x:X.x,y:X.y};let S;if(s<.46){let e=1e9;for(let t of j.boats){K.copy(t.pos),K.y=5;let n=K.distanceTo(d.position),r=K.clone().project(d);r.z<1&&Math.abs(r.x)<.85&&Math.abs(r.y)<.9&&n<e&&(e=n)}S=Math.min(e,600)}else S=s<.74?d.position.distanceTo(O):d.position.distanceTo(k);if(xe.distance+=(S-xe.distance)*(P.init?W(4,e):1),xe.aperture=H(.35,.55,U(.7,.95,s)),T(x===null),E){let e=c.uPR.value;c.uPR.value=e*E.scale,c.uCableFat.value=H(2.4,1.3,U(.65,.85,P.p)),E.render(n,l,d,[te.mesh]),c.uPR.value=e,c.uCableFat.value=1}}function je(e,t){if(Y=Math.max(1,e),ge=Math.max(1,t),d.aspect=Y/ge,d.updateProjectionMatrix(),E){let e=n.getPixelRatio();E.setSize(Y*e,ge*e)}}return{scene:l,camera:d,ready:(async()=>{we(0),T(!0),pe(ne,0,I),d.position.set(I[0],I[1],I[2]),d.lookAt(I[3],I[4],I[5]),d.updateMatrixWorld();try{n.compileAsync?await n.compileAsync(l,d):n.compile(l,d)}catch{n.compile(l,d)}})(),update:Ae,resize:je,getSun:()=>X,getExposure:()=>ve,getFocus:()=>xe,getGrade:()=>Z,dispose(){l.traverse(e=>{e.geometry&&e.geometry.dispose(),e.material&&(Array.isArray(e.material)?e.material:[e.material]).forEach(e=>e.dispose())}),te.material.uniforms.tNormal.value?.dispose(),E&&E.dispose(),x&&x.dispose(),v.dispose()}}}export{Be as createChapter};