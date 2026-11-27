import{F as e,I as t,K as n,N as r,P as i,R as a,_t as o,a as s,at as c,c as l,et as u,gt as d,h as f,i as p,k as m,lt as h,m as g,mt as _,n as v,ot as y,q as b,r as x,rt as S,t as C,vt as w,yt as T,z as E}from"./UnrealBloomPass-C28B2YMj.js";import{t as D}from"./RenderPass-D7SLf7nX.js";var O={name:`OutputShader`,uniforms:{tDiffuse:{value:null},toneMappingExposure:{value:1}},vertexShader:`
		precision highp float;

		uniform mat4 modelViewMatrix;
		uniform mat4 projectionMatrix;

		attribute vec3 position;
		attribute vec2 uv;

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		precision highp float;

		uniform sampler2D tDiffuse;

		#include <tonemapping_pars_fragment>
		#include <colorspace_pars_fragment>

		varying vec2 vUv;

		void main() {

			gl_FragColor = texture2D( tDiffuse, vUv );

			// tone mapping

			#ifdef LINEAR_TONE_MAPPING

				gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );

			#elif defined( REINHARD_TONE_MAPPING )

				gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );

			#elif defined( CINEON_TONE_MAPPING )

				gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );

			#elif defined( ACES_FILMIC_TONE_MAPPING )

				gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );

			#elif defined( AGX_TONE_MAPPING )

				gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );

			#elif defined( NEUTRAL_TONE_MAPPING )

				gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );

			#elif defined( CUSTOM_TONE_MAPPING )

				gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );

			#endif

			// color space

			#ifdef SRGB_TRANSFER

				gl_FragColor = sRGBTransferOETF( gl_FragColor );

			#endif

		}`},k=class extends s{constructor(){super(),this.isOutputPass=!0,this.uniforms=_.clone(O.uniforms),this.material=new u({name:O.name,uniforms:this.uniforms,vertexShader:O.vertexShader,fragmentShader:O.fragmentShader}),this._fsQuad=new p(this.material),this._outputColorSpace=null,this._toneMapping=null}render(e,t,n){this.uniforms.tDiffuse.value=n.texture,this.uniforms.toneMappingExposure.value=e.toneMappingExposure,(this._outputColorSpace!==e.outputColorSpace||this._toneMapping!==e.toneMapping)&&(this._outputColorSpace=e.outputColorSpace,this._toneMapping=e.toneMapping,this.material.defines={},f.getTransfer(this._outputColorSpace)===`srgb`&&(this.material.defines.SRGB_TRANSFER=``),this._toneMapping===1?this.material.defines.LINEAR_TONE_MAPPING=``:this._toneMapping===2?this.material.defines.REINHARD_TONE_MAPPING=``:this._toneMapping===3?this.material.defines.CINEON_TONE_MAPPING=``:this._toneMapping===4?this.material.defines.ACES_FILMIC_TONE_MAPPING=``:this._toneMapping===6?this.material.defines.AGX_TONE_MAPPING=``:this._toneMapping===7?this.material.defines.NEUTRAL_TONE_MAPPING=``:this._toneMapping===5&&(this.material.defines.CUSTOM_TONE_MAPPING=``),this.material.needsUpdate=!0),this.renderToScreen===!0?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(t),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this._fsQuad.render(e))}dispose(){this.material.dispose(),this._fsQuad.dispose()}};function A(){let e=document.createElement(`canvas`).getContext(`webgl2`);if(!e)throw Error(`WebGL2 is required for this showcase scene`);e.getExtension(`WEBGL_lose_context`)?.loseContext()}var j=(e,n,r,i)=>t.lerp(e,n,1-Math.exp(-r*i)),M=e=>Math.min(1,Math.max(0,e)),N={name:`ShowcaseFinish`,uniforms:{tDiffuse:{value:null},uTime:{value:0},uRes:{value:new d(1,1)},uVignette:{value:.55},uGrain:{value:.045},uCA:{value:.0018},uLift:{value:new o(5/255,11/255,26/255)},uVigCenter:{value:new d(.5,.5)}},vertexShader:`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
  `,fragmentShader:`
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain, uCA;
    uniform vec2 uRes, uVigCenter;
    uniform vec3 uLift;
    varying vec2 vUv;
    float hash(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 off = d * r2 * uCA * 4.0;
      vec3 c;
      c.r = texture2D(tDiffuse, vUv - off).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv + off).b;
      // vignette (elliptical, aspect aware), centred slightly off when the composition asks for it
      vec2 vd = (vUv - uVigCenter) * vec2(uRes.x / uRes.y, 1.0) * 0.82;
      float vig = 1.0 - uVignette * smoothstep(0.25, 1.05, length(vd));
      c *= vig;
      // lifted blacks toward the brand night (film toe)
      c = c + uLift * 0.55 * (1.0 - smoothstep(0.0, 0.18, c));
      // grain: luminance-weighted, animated
      float t = floor(uTime * 24.0);
      float g = hash(vec3(gl_FragCoord.xy, t)) + hash(vec3(gl_FragCoord.xy + 17.0, t + 3.0)) - 1.0;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c += g * uGrain * (0.35 + 0.65 * (1.0 - l)) * (0.25 + l * 1.2);
      // triangular dither at 8-bit
      float dn = hash(vec3(gl_FragCoord.xy, t + 7.0)) - hash(vec3(gl_FragCoord.yx + 3.1, t + 11.0));
      c += dn / 255.0;
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }
  `};function P(t,{quality:r=`high`,exposure:i=1,bloom:a={},clearColor:o=330522}={}){A();let s=r!==`low`,u=document.createElement(`canvas`);u.style.cssText=`position:absolute;inset:0;width:100%;height:100%;display:block;`,u.setAttribute(`aria-hidden`,`true`),getComputedStyle(t).position===`static`&&(t.style.position=`relative`),t.appendChild(u);let f=new l({canvas:u,antialias:!1,alpha:!1,stencil:!1,powerPreference:`high-performance`}),p=s?Math.min(window.devicePixelRatio||1,1.25):1;f.setPixelRatio(p),f.setClearColor(o,1),f.toneMapping=4,f.toneMappingExposure=i,f.outputColorSpace=S,s||(f.transmissionResolutionScale=.75);let h=new T(2,2,{type:m,samples:s?4:0,colorSpace:e}),g=new v(f,h),_=new D(new c,new n);g.addPass(_);let y=new C(new d(256,256),a.strength??.55,a.radius??.6,a.threshold??1);g.addPass(y),g.addPass(new k);let b=new x(N);g.addPass(b);let w={w:1,h:1},E=[];function O(){let e=Math.max(1,t.clientWidth),n=Math.max(1,t.clientHeight);(e!==w.w||n!==w.h)&&(w.w=e,w.h=n,f.setSize(e,n,!1),g.setPixelRatio(p),g.setSize(e,n),y.setSize(Math.round(e*p*(s?.5:.35)),Math.round(n*p*(s?.5:.35))),b.uniforms.uRes.value.set(e*p,n*p),E.forEach(t=>t(e,n)))}let j=new ResizeObserver(O);return j.observe(t),{renderer:f,canvas:u,composer:g,bloomPass:y,finishPass:b,size:w,high:s,setScene(e,t){_.scene=e,_.camera=t},resize(){w.w=0,O()},onResize(e){E.push(e)},render(e,t){b.uniforms.uTime.value=t,g.render(e)},dispose(){j.disconnect(),g.dispose?.(),h.dispose(),y.dispose?.(),f.dispose(),f.forceContextLoss?.(),u.remove()}}}function F(e,t){let n=0,r=0,i=!0,a=!1,o=!1,s=performance.now();function c(e){n=requestAnimationFrame(c);let i=Math.min(.1,r?(e-r)/1e3:1/60);r=e,t(i,(e-s)/1e3)}function l(){let e=i&&!a&&!document.hidden;e&&!o?(o=!0,r=0,n=requestAnimationFrame(c)):!e&&o&&(o=!1,cancelAnimationFrame(n))}let u=new IntersectionObserver(e=>{i=e[e.length-1].isIntersecting,l()},{rootMargin:`100px`});u.observe(e);let d=()=>l();return document.addEventListener(`visibilitychange`,d),{start(){l()},pause(){a=!0,l()},resume(){a=!1,l()},get running(){return o},dispose(){u.disconnect(),document.removeEventListener(`visibilitychange`,d),cancelAnimationFrame(n),o=!1}}}function I(){return typeof matchMedia==`function`&&matchMedia(`(prefers-reduced-motion: reduce)`).matches}function L(t,{height:s=0,scale:c=.5,clipBias:l=.003}={}){let u=new T(2,2,{type:m,generateMipmaps:!0,minFilter:i,magFilter:r,colorSpace:e}),f=new a,p=new n,h=new o(0,1,0),g=new o(0,s,0),_=new o,v=new o,y=new o,x=new o,S=new a,C=new b,E=new w,D=new w,O=new d,k=new a;return{texture:u.texture,textureMatrix:f,update(e,n,r=[]){t.getDrawingBufferSize(O);let i=Math.max(2,Math.round(O.x*c)),a=Math.max(2,Math.round(O.y*c));(u.width!==i||u.height!==a)&&u.setSize(i,a),_.setFromMatrixPosition(n.matrixWorld),v.subVectors(g,_),v.reflect(h).negate().add(g),S.extractRotation(n.matrixWorld),y.set(0,0,-1).applyMatrix4(S).add(_),x.subVectors(g,y).reflect(h).negate().add(g),p.position.copy(v),p.up.set(0,1,0).applyMatrix4(S).reflect(h),p.lookAt(x),p.far=n.far,p.near=n.near,p.updateMatrixWorld(),p.projectionMatrix.copy(n.projectionMatrix),p.projectionMatrix.elements[8]*=-1,p.projectionMatrix.elements[12]*=-1,f.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),f.multiply(p.projectionMatrix),f.multiply(p.matrixWorldInverse),f.multiply(k),C.setFromNormalAndCoplanarPoint(h,g),C.applyMatrix4(p.matrixWorldInverse),E.set(C.normal.x,C.normal.y,C.normal.z,C.constant);let o=p.projectionMatrix;D.x=(Math.sign(E.x)+o.elements[8])/o.elements[0],D.y=(Math.sign(E.y)+o.elements[9])/o.elements[5],D.z=-1,D.w=(1+o.elements[10])/o.elements[14],E.multiplyScalar(2/E.dot(D)),o.elements[2]=E.x,o.elements[6]=E.y,o.elements[10]=E.z+1-l,o.elements[14]=E.w,p.projectionMatrixInverse.copy(o).invert();let s=r.map(e=>e.visible);r.forEach(e=>{e.visible=!1});let d=t.getRenderTarget();t.setRenderTarget(u),t.state.buffers.depth.setMask(!0),t.clear(),t.render(e,p),t.setRenderTarget(d),r.forEach((e,t)=>{e.visible=s[t]})},dispose(){u.dispose()}}}var R=`
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`;function z({radius:e=400,horizon:t=330522,top:n=0,glow:r=793139,glowStrength:i=.6}={}){let a=new y({side:1,depthWrite:!1,fog:!1,uniforms:{uHorizon:{value:new g(t)},uTop:{value:new g(n)},uGlow:{value:new g(r)},uGlowStrength:{value:i}},vertexShader:`
      varying vec3 vDir;
      void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }
    `,fragmentShader:`
      uniform vec3 uHorizon, uTop, uGlow; uniform float uGlowStrength;
      varying vec3 vDir;
      void main() {
        float y = vDir.y;
        vec3 c = mix(uHorizon, uTop, smoothstep(0.0, 0.45, abs(y)));
        c += uGlow * uGlowStrength * exp(-abs(y) * 14.0);
        gl_FragColor = vec4(c, 1.0);
      }
    `}),o=new E(new h(e,48,24),a);return o.frustumCulled=!1,o.renderOrder=-10,o}export{L as a,I as c,F as i,M as n,P as o,z as r,j as s,R as t};