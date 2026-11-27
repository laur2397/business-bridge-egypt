import{E as e,K as t,L as n,Q as r,R as i,U as a,X as o,_t as s,at as c,c as l,ct as u,d,gt as f,i as p,m,n as h,ot as g,r as _,t as ee,u as te,vt as v,y,yt as ne}from"./UnrealBloomPass-C28B2YMj.js";import{t as re}from"./RenderPass-D7SLf7nX.js";import{t as b}from"./main-Bs9npQj-.js";var ie=class{constructor(t,n,i){this.variables=[],this.currentTextureIndex=0;let o=e,s={passThruTexture:{value:null}},c=d(m(),s),l=new p(c);this.setDataType=function(e){return o=e,this},this.addVariable=function(e,t,n){let r={name:e,initialValueTexture:n,material:this.createShaderMaterial(t),dependencies:null,renderTargets:[],wrapS:null,wrapT:null,minFilter:a,magFilter:a};return this.variables.push(r),r},this.setVariableDependencies=function(e,t){e.dependencies=t},this.init=function(){if(i.capabilities.maxVertexTextures===0)return`No support for vertex shader textures.`;for(let e=0;e<this.variables.length;e++){let r=this.variables[e];r.renderTargets[0]=this.createRenderTarget(t,n,r.wrapS,r.wrapT,r.minFilter,r.magFilter),r.renderTargets[1]=this.createRenderTarget(t,n,r.wrapS,r.wrapT,r.minFilter,r.magFilter),this.renderTexture(r.initialValueTexture,r.renderTargets[0]),this.renderTexture(r.initialValueTexture,r.renderTargets[1]);let i=r.material,a=i.uniforms;if(r.dependencies!==null)for(let e=0;e<r.dependencies.length;e++){let t=r.dependencies[e];if(t.name!==r.name){let e=!1;for(let n=0;n<this.variables.length;n++)if(t.name===this.variables[n].name){e=!0;break}if(!e)return`Variable dependency not found. Variable=`+r.name+`, dependency=`+t.name}a[t.name]={value:null},i.fragmentShader=`
uniform sampler2D `+t.name+`;
`+i.fragmentShader}}return this.currentTextureIndex=0,null},this.compute=function(){let e=this.currentTextureIndex,t=+(this.currentTextureIndex===0);for(let n=0,r=this.variables.length;n<r;n++){let r=this.variables[n];if(r.dependencies!==null){let t=r.material.uniforms;for(let n=0,i=r.dependencies.length;n<i;n++){let i=r.dependencies[n];t[i.name].value=i.renderTargets[e].texture}}this.doRenderTarget(r.material,r.renderTargets[t])}this.currentTextureIndex=t},this.getCurrentRenderTarget=function(e){return e.renderTargets[this.currentTextureIndex]},this.getAlternateRenderTarget=function(e){return e.renderTargets[+(this.currentTextureIndex===0)]},this.dispose=function(){l.dispose();let e=this.variables;for(let t=0;t<e.length;t++){let n=e[t];n.initialValueTexture&&n.initialValueTexture.dispose();let r=n.renderTargets;for(let e=0;e<r.length;e++)r[e].dispose();n.material.dispose()}};function u(e){e.defines.resolution=`vec2( `+t.toFixed(1)+`, `+n.toFixed(1)+` )`}this.addResolutionDefine=u;function d(e,t){t=t||{};let n=new g({name:`GPUComputationShader`,uniforms:t,vertexShader:f(),fragmentShader:e});return u(n),n}this.createShaderMaterial=d,this.createRenderTarget=function(e,i,a,s,c,l){return e=e||t,i=i||n,a=a||1001,s=s||1001,c=c||1003,l=l||1003,new ne(e,i,{wrapS:a,wrapT:s,minFilter:c,magFilter:l,format:r,type:o,depthBuffer:!1})},this.createTexture=function(){let i=new Float32Array(t*n*4),a=new y(i,t,n,r,e);return a.needsUpdate=!0,a},this.renderTexture=function(e,t){s.passThruTexture.value=e,this.doRenderTarget(c,t),s.passThruTexture.value=null},this.doRenderTarget=function(e,t){let n=i.getRenderTarget(),r=i.xr.enabled,a=i.shadowMap.autoUpdate;i.xr.enabled=!1,i.shadowMap.autoUpdate=!1,l.material=e,i.setRenderTarget(t),l.render(i),l.material=c,i.xr.enabled=r,i.shadowMap.autoUpdate=a,i.setRenderTarget(n)};function f(){return`void main()	{

	gl_Position = vec4( position, 1.0 );

}
`}function m(){return`uniform sampler2D passThruTexture;

void main() {

	vec2 uv = gl_FragCoord.xy / resolution.xy;

	gl_FragColor = texture2D( passThruTexture, uv );

}
`}}};function ae(e){return e}function x(e){if(e==null)return ae;var t,n,r=e.scale[0],i=e.scale[1],a=e.translate[0],o=e.translate[1];return function(e,s){s||(t=n=0);var c=2,l=e.length,u=Array(l);for(u[0]=(t+=e[0])*r+a,u[1]=(n+=e[1])*i+o;c<l;)u[c]=e[c],++c;return u}}function S(e,t){for(var n,r=e.length,i=r-t;i<--r;)n=e[i],e[i++]=e[r],e[r]=n}function C(e,t){return typeof t==`string`&&(t=e.objects[t]),t.type===`GeometryCollection`?{type:`FeatureCollection`,features:t.geometries.map(function(t){return w(e,t)})}:w(e,t)}function w(e,t){var n=t.id,r=t.bbox,i=t.properties==null?{}:t.properties,a=T(e,t);return n==null&&r==null?{type:`Feature`,properties:i,geometry:a}:r==null?{type:`Feature`,id:n,properties:i,geometry:a}:{type:`Feature`,id:n,bbox:r,properties:i,geometry:a}}function T(e,t){var n=x(e.transform),r=e.arcs;function i(e,t){t.length&&t.pop();for(var i=r[e<0?~e:e],a=0,o=i.length;a<o;++a)t.push(n(i[a],a));e<0&&S(t,o)}function a(e){return n(e)}function o(e){for(var t=[],n=0,r=e.length;n<r;++n)i(e[n],t);return t.length<2&&t.push(t[0]),t}function s(e){for(var t=o(e);t.length<4;)t.push(t[0]);return t}function c(e){return e.map(s)}function l(e){var t=e.type,n;switch(t){case`GeometryCollection`:return{type:t,geometries:e.geometries.map(l)};case`Point`:n=a(e.coordinates);break;case`MultiPoint`:n=e.coordinates.map(a);break;case`LineString`:n=o(e.arcs);break;case`MultiLineString`:n=e.arcs.map(o);break;case`Polygon`:n=c(e.arcs);break;case`MultiPolygon`:n=e.arcs.map(c);break;default:return null}return{type:t,coordinates:n}}return l(t)}var oe=[[[36.866,22],[32.899,22],[29.022,22],[25,22],[25,25.682],[25,29.238],[24.702,30.043],[24.957,30.661],[24.802,31.089],[25.166,31.568],[26.494,31.585],[27.459,31.321],[28.449,31.025],[28.914,30.869],[29.684,31.188],[30.095,31.474],[30.977,31.557],[31.689,31.43],[31.959,30.934],[32.193,31.26],[32.993,31.023],[33.774,30.968],[34.267,31.22],[34.825,29.761],[34.922,29.502],[34.641,29.099],[34.425,28.344],[34.155,27.823],[33.921,27.649],[33.587,27.972],[33.137,28.417],[32.424,29.851],[32.319,29.761],[32.733,28.705],[33.349,27.699],[34.105,26.142],[34.472,25.599],[34.796,25.034],[35.693,23.927],[35.495,23.752],[35.527,23.102],[36.69,22.205],[36.866,22]]],E=2048,D=1024;function O(e,t){let n=[],r=t[0][0],i=0;for(let e=0;e<t.length;e++){let a=t[e][0];if(e>0){let e=a+i-r;e>180?i-=360:e<-180&&(i+=360)}a+=i,r=a,n.push(a,t[e][1])}for(let t of[-360,0,360]){e.moveTo((n[0]+t+180)/360*E,(90-n[1])/180*D);for(let r=2;r<n.length;r+=2)e.lineTo((n[r]+t+180)/360*E,(90-n[r+1])/180*D);e.closePath()}}function k(){let e=(typeof OffscreenCanvas<`u`?new OffscreenCanvas(E,D):Object.assign(document.createElement(`canvas`),{width:E,height:D})).getContext(`2d`,{willReadFrequently:!0});return e.fillStyle=`#000`,e.fillRect(0,0,E,D),e.fillStyle=`#fff`,e}function se(e){let t=k(),n=C(e,e.objects.land),r=n.features||[n];t.beginPath();for(let e of r){let n=e.geometry,r=n.type===`Polygon`?[n.coordinates]:n.coordinates;for(let e of r)for(let n of e)O(t,n)}return t.fill(`evenodd`),t.fillRect(0,174.5/180*D,E,D),t.getImageData(0,0,E,D).data}function ce(){let e=k();e.beginPath();for(let t of oe)O(e,t);return e.fill(),e.getImageData(0,0,E,D).data}function A(e,t,n){let r=Math.min(2047,Math.max(0,Math.floor((n+180)/360*E)));return e[(Math.min(1023,Math.max(0,Math.floor((90-t)/180*D)))*E+r)*4]>127}function j(e){let t=Math.sin(e*12.9898)*43758.5453;return t-Math.floor(t)}function le(e){return{land:se(e),egypt:ce()}}function M(e,t){let{land:n,egypt:r}=e,i=[],a=[],o=Math.PI/180;for(let e=0;e<t;e++){let s=-90+180*(e+.5)/t;if(s<-62)continue;let c=Math.max(1,Math.round(Math.cos(s*o)*t*2)),l=e*.618%1;for(let t=0;t<c;t++){let u=-180+360*(t+l)/c;if(!A(n,s,u))continue;let d=+!!A(r,s,u),f=Math.cos(s*o);i.push(f*Math.sin(u*o),Math.sin(s*o),f*Math.cos(u*o)),a.push(d,j(e*4099+t))}}return{positions:new Float32Array(i),flags:new Float32Array(a),count:i.length/3}}function ue(e){let t=e>>>0;return function(){t|=0,t=t+1831565813|0;let e=Math.imul(t^t>>>15,1|t);return e=e+Math.imul(e^e>>>7,61|e)^e,((e^e>>>14)>>>0)/4294967296}}function N(e){let t=0,n=0;for(;t===0;)t=e();for(;n===0;)n=e();return Math.sqrt(-2*Math.log(t))*Math.cos(2*Math.PI*n)}function de(e,t,n=24){let r=[],i=t=>e[Math.max(0,Math.min(e.length-1,t))];for(let t=0;t<e.length-1;t++){let e=i(t-1),a=i(t),o=i(t+1),s=i(t+2);for(let t=0;t<n;t++){let i=t/n,c=i*i,l=c*i,u=[0,0,0];for(let t=0;t<3;t++)u[t]=.5*(2*a[t]+(-e[t]+o[t])*i+(2*e[t]-5*a[t]+4*o[t]-s[t])*c+(-e[t]+3*a[t]-3*o[t]+s[t])*l);r.push(u)}}r.push(e[e.length-1].slice());let a=[0];for(let e=1;e<r.length;e++){let t=r[e-1],n=r[e];a.push(a[e-1]+Math.hypot(n[0]-t[0],n[1]-t[1],n[2]-t[2]))}let o=a[a.length-1],s=new Float32Array(t*3),c=0;for(let e=0;e<t;e++){let n=o*e/(t-1);for(;c<r.length-2&&a[c+1]<n;)c++;let i=(n-a[c])/Math.max(1e-9,a[c+1]-a[c]);for(let t=0;t<3;t++)s[e*3+t]=r[c][t]+(r[c+1][t]-r[c][t])*i}return{pts:s,length:o}}function fe(e,t,n){let r=!1;for(let i=0,a=e.length-1;i<e.length;a=i++){let o=e[i][0],s=e[i][1],c=e[a][0],l=e[a][1];s>n!=l>n&&t<(c-o)*(n-s)/(l-s)+o&&(r=!r)}return r}function P(e,t,n){let r=1/0;for(let i=0;i<e.length-1;i++){let a=e[i][0],o=e[i][1],s=e[i+1][0],c=e[i+1][1],l=s-a,u=c-o,d=Math.max(0,Math.min(1,((t-a)*l+(n-o)*u)/(l*l+u*u||1))),f=Math.hypot(a+l*d-t,o+u*d-n);f<r&&(r=f)}return r}function F(e,t,n){let r=[0];for(let t=1;t<e.length;t++)r.push(r[t-1]+Math.hypot(e[t][0]-e[t-1][0],e[t][1]-e[t-1][1]));let i=r[r.length-1],a=[],o=0;for(let s=0;s<t;s++){let c=n?n()*i:i*s/t;o=0;let l=0,u=r.length-1;for(;u-l>1;){let e=l+u>>1;r[e]<c?l=e:u=e}o=l;let d=(c-r[o])/Math.max(1e-9,r[o+1]-r[o]);a.push([e[o][0]+(e[o+1][0]-e[o][0])*d,e[o][1]+(e[o+1][1]-e[o][1])*d])}return a}var I={AMBIENT:0,NEBULA:1,FILL:2,OUTLINE:3,NILE:4,CAIRO:5,COAST:6,BANK:7,SEA:8,SHIP:9,LANE:10,ARC:11,GRID:12,BLOCK:13,PORT:14,LAND:15,OCEAN:16,EGLAND:17,GARC:18,RIM:19,TEXT:20,DELTA:21,RIPPLE:22,ZONE:23,GARCS:24,GCITY:25},pe=class{constructor(e,t){this.N=e,this.a=new Float32Array(e*4),this.n=0,this.rng=t}get left(){return this.N-this.n}push(e,t,n,r,i=1){if(this.n>=this.N)return;let a=this.n++*4,o=Math.min(.9,Math.max(0,1-i));this.a[a]=e,this.a[a+1]=t,this.a[a+2]=n,this.a[a+3]=r+o}pushV(e,t,n){this.push(e[0],e[1],e[2],t,n)}pushCurve(e,t,n,r,i=1){if(this.n>=this.N)return;let a=this.n++*4;this.a[a]=e,this.a[a+1]=t,this.a[a+2]=1+Math.round(Math.max(0,Math.min(1,i))*8)+Math.min(.99,Math.max(0,n)),this.a[a+3]=r}budget(e){return Math.min(this.left,Math.round(this.N*e))}ambient(){let e=this.rng;for(;this.n<this.N;){let t=-9.5+e()*17,n=-5.5+e()*11,r=-8+e()*10.5;this.push(t,n,r,I.AMBIENT,.35+.65*e())}}shuffle(){let e=this.a,t=this.rng;for(let n=this.N-1;n>0;n--){let r=Math.floor(t()*(n+1));for(let t=0;t<4;t++){let i=e[n*4+t];e[n*4+t]=e[r*4+t],e[r*4+t]=i}}return e}},L=class{constructor(){this.rows=[]}add(e,t){let{pts:n,length:r}=de(e,256);return this.rows.push({s:n,uSpeed:t/Math.max(1e-6,r),length:r}),{row:this.rows.length-1,length:r}}texture(){let t=Math.max(1,this.rows.length),n=new Float32Array(256*t*4);this.rows.forEach((e,t)=>{for(let r=0;r<256;r++){let i=(t*256+r)*4;n[i]=e.s[r*3],n[i+1]=e.s[r*3+1],n[i+2]=e.s[r*3+2],n[i+3]=e.uSpeed}});let i=new y(n,256,t,r,e);return i.minFilter=i.magFilter=a,i.needsUpdate=!0,i}};function R(e,t,n=0){let r=new i().makeRotationX(e);return r.multiply(new i().makeRotationY(t)),n&&r.multiply(new i().makeRotationZ(n)),r}function z(e,t,n,r=0){let i=new s(t,n,r).applyMatrix4(e);return[i.x,i.y,i.z]}function B(e,t,n,{width:r=6.6,z:i=-3.2,y:a=0,x:o=0}={}){if(typeof document>`u`||!t)return[];let s=document.createElement(`canvas`);s.width=1400,s.height=420;let c=s.getContext(`2d`,{willReadFrequently:!0});c.fillStyle=`#000`,c.fillRect(0,0,s.width,s.height),c.fillStyle=`#fff`,c.textAlign=`center`,c.textBaseline=`middle`;let l=e=>{c.font=`200 ${e}px "Archivo Variable", "Archivo", sans-serif`;try{c.fontStretch=`extra-condensed`}catch{}};l(330);let u=c.measureText(e).width,d=Math.min(1,1300/Math.max(1,u));l(Math.round(330*d)),c.fillText(e,s.width/2,s.height/2+10);let f=c.getImageData(0,0,s.width,s.height).data,p=[];for(let e=0;e<s.height;e+=2)for(let t=0;t<s.width;t+=2)f[(e*s.width+t)*4]>140&&p.push(t,e);if(!p.length)return[];let m=r/s.width,h=[];for(let e=0;e<t;e++){let e=Math.floor(n()*(p.length/2))*2;h.push([o+(p[e]+n()*2-s.width/2)*m,a-(p[e+1]+n()*2-s.height/2)*m,i+(n()-.5)*.05])}return h}var V=oe[0],H=Math.PI/180,me=30.8,U=26.85,W=.5,he=Math.cos(U*H),ge=(e,t)=>[(e-me)*he*W,(t-U)*W],G=[[31.3,21.8],[31.62,22.3],[31.95,22.66],[32.25,23.05],[32.56,23.45],[32.86,23.96],[32.9,24.09],[32.93,24.47],[32.87,24.98],[32.55,25.29],[32.64,25.69],[32.73,26.12],[32.5,26.12],[32.24,26.06],[31.7,26.56],[31.18,27.18],[30.84,27.73],[30.75,28.1],[30.92,28.6],[31.1,29.07],[31.3,29.7],[31.23,30.04],[31.12,30.2]],_e=G.slice(0,6),K=[[31.12,30.2],[30.97,30.45],[30.83,30.8],[30.7,31.05],[30.52,31.26],[30.4,31.42],[30.34,31.52]],ve=[[31.12,30.2],[31.2,30.47],[31.32,30.75],[31.38,31.04],[31.58,31.28],[31.74,31.44],[31.8,31.52]],q=[31.235,30.044];function ye(e){let t=[[30.095,31.474],[30.977,31.557],[31.689,31.43],[32.193,31.26]];for(let n=0;n<t.length-1;n++)if(e<=t[n+1][0]){let r=(e-t[n][0])/(t[n+1][0]-t[n][0]);return t[n][1]+(t[n+1][1]-t[n][1])*Math.max(0,r)}return 31.3}function be(e,t){let n=C(e,e.objects.land),r=[],i=e=>e[0]>=t[0]&&e[0]<=t[2]&&e[1]>=t[1]&&e[1]<=t[3];for(let e of n.features||[n]){let t=e.geometry,n=t.type===`Polygon`?[t.coordinates]:t.coordinates;for(let e of n)for(let t of e){let e=[];for(let n=0;n<t.length;n++)i(t[n])?e.push(t[n]):(e.length>1&&r.push(e),e=[]);e.length>1&&r.push(e)}}return{lines:r,geo:n}}function J(e,t,n){let r=Math.round((t[2]-t[0])/n),i=Math.round((t[3]-t[1])/n),a=document.createElement(`canvas`);a.width=r,a.height=i;let o=a.getContext(`2d`,{willReadFrequently:!0});o.fillStyle=`#000`,o.fillRect(0,0,r,i),o.fillStyle=`#fff`,o.beginPath();for(let r of e.features||[e]){let e=r.geometry,i=e.type===`Polygon`?[e.coordinates]:e.coordinates;for(let e of i)for(let r of e){let e=!1;for(let n of r)if(n[0]>t[0]-20&&n[0]<t[2]+20&&n[1]>t[1]-20&&n[1]<t[3]+20){e=!0;break}e&&(r.forEach((e,r)=>{let i=(e[0]-t[0])/n,a=(t[3]-e[1])/n;r===0?o.moveTo(i,a):o.lineTo(i,a)}),o.closePath())}}o.fill(`evenodd`);let s=o.getImageData(0,0,r,i).data,c=new Uint8Array(r*i);for(let e=0;e<r*i;e++)c[e]=+(s[e*4]>127);let l=new Float32Array(r*i);for(let e=0;e<r*i;e++)l[e]=c[e]?0:1e9;let u=(e,t,n,a,o)=>{let s=e+n,c=t+a;if(s<0||c<0||s>=r||c>=i)return;let u=l[c*r+s]+o;u<l[t*r+e]&&(l[t*r+e]=u)};for(let e=0;e<i;e++)for(let t=0;t<r;t++)u(t,e,-1,0,1),u(t,e,0,-1,1),u(t,e,-1,-1,1.41),u(t,e,1,-1,1.41);for(let e=i-1;e>=0;e--)for(let t=r-1;t>=0;t--)u(t,e,1,0,1),u(t,e,0,1,1),u(t,e,1,1,1.41),u(t,e,-1,1,1.41);return{land:(e,a)=>{let o=Math.floor((e-t[0])/n),s=Math.floor((t[3]-a)/n);return o>=0&&s>=0&&o<r&&s<i?c[s*r+o]:0},dist:(e,a)=>{let o=Math.floor((e-t[0])/n),s=Math.floor((t[3]-a)/n);return o>=0&&s>=0&&o<r&&s<i?l[s*r+o]*n:9}}}function xe(e,t){let n=new pe(e,t),r=n.budget(.6),i=n.budget(.14),a=n.budget(.08);for(let e=0;e<r;e++){let r=e%3,i=t()**.8,a=.25+5.6*i,o=Math.PI*2/3*r+i*3.4+N(t)*.18,s=(.04+.26*i)*(t()<.75?1:2.6),c=a*Math.cos(o)+N(t)*s,l=a*Math.sin(o)+N(t)*s,u=N(t)*(.2+.45*i);n.push(c,l,u,I.NEBULA,Math.min(1,(.35+.65*t())*(1.25-i*.6)))}let o=[];for(let e=0;e<26;e++){let e=.6+t()*5.2,n=t()*Math.PI*2;o.push([e*Math.cos(n),e*Math.sin(n),N(t)*.3,.25+t()*.6])}for(let e=0;e<i;e++){let e=o[Math.floor(t()*o.length)];n.push(e[0]+N(t)*e[3],e[1]+N(t)*e[3],e[2]+N(t)*e[3]*.5,I.NEBULA,.3+.5*t())}for(let e=0;e<a;e++){let e=Math.sqrt(t())*7.5,r=t()*Math.PI*2;n.push(e*Math.cos(r),e*Math.sin(r),N(t)*.8,I.NEBULA,.15+.5*t())}let s=n.budget(.012);for(let e=0;e<s;e++)n.push(-6+t()*10,-3.5+t()*7,2.5+t()*5,I.NEBULA,.5+.5*t());let c=n.budget(.04);for(let e=0;e<c;e++)n.push(N(t)*.35,N(t)*.35,N(t)*.15,I.NEBULA,1);return n.ambient(),n.shuffle()}var Y=R(-.46,.2,.02);function Se(e,t,n,r,i){let a=new pe(e,t),o=Y,s=(e,t,n=0)=>{let[r,i]=ge(e,t);return z(o,r,i,n)},c=a.budget(.12),l=F(V,c,t);for(let e=0;e<c;e++){let[n,r]=l[e],i=t()<.18,o=i?.05:.006;a.pushV(s(n+N(t)*o,r+N(t)*o),I.OUTLINE,i?.45:.75+.25*t())}let u=a.budget(.19),d=G.slice(6),f=0,p=0;for(;f<u&&p++<u*60;){let e=24.6+t()*12.4,n=21.9+t()*9.8;if(!fe(V,e,n))continue;let r=Math.min(P(d,e,n),P(K,e,n),P(ve,e,n)),i=n>30.15&&n<ye(e)&&e>29.9+(31.5-n)*.2&&e<32.25-(31.5-n)*.6,o=.17+(i?.9:0)+.85*Math.exp(-r/.12);if(t()>o)continue;let c=r<.3||i;a.pushV(s(e,n),I.FILL,c?.6+.4*t():.25+.45*t()),f++}let m=[];for(let e of[K,ve]){let t=[...G,...e.slice(1)].map(([e,t])=>s(e,t,.02));m.push(n.add(t,.22).row)}let h=a.budget(.085);for(let e=0;e<h;e++){let n=m[e%2],r=t()<.25;a.pushCurve(n,t(),r?.004:.008+t()*.016,I.NILE,r?1:.45+.4*t())}let g=[];for(let e of[29.95,30.55,30.85,31.1,31.4,31.6,32.05]){let r=ye(e)-.02,i=[[31.12,30.2],[(31.12+e)/2+(t()-.5)*.1,30.2+(r-30.2)*.55],[e,r]].map(([e,t])=>s(e,t,.015));g.push(n.add(i,.12).row)}let _=a.budget(.04);for(let e=0;e<_;e++)a.pushCurve(g[e%g.length],t(),.006+t()*.02,I.DELTA,.35+.5*t());let ee=a.budget(.012),te=F(_e,ee,t);for(let e=0;e<ee;e++)a.pushV(s(te[e][0]+N(t)*.05,te[e][1]+N(t)*.04,.01),I.SEA,.9);let v=a.budget(.004);for(let e=0;e<v;e++){let e=t();a.pushV(s(32.31+(32.55-32.31)*e+N(t)*.006,31.26-(31.26-29.95)*e),I.LANE,.8)}let y=s(q[0],q[1],.03),ne=a.budget(.002);for(let e=0;e<ne;e++){let e=t()<.5?.01:.03;a.push(y[0]+N(t)*e,y[1]+N(t)*e,y[2]+N(t)*e,I.CAIRO,1)}let re=a.budget(.01);for(let e=0;e<re;e++)a.push(y[0],y[1],y[2],I.RIPPLE,1);let b=[23.4,21,38.8,33.7],{lines:ie,geo:ae}=be(r,b),x=[],S=0;for(let e of ie)for(let t=0;t<e.length-1;t++){let n=Math.hypot(e[t+1][0]-e[t][0],e[t+1][1]-e[t][1]);x.push([e[t],e[t+1],n]),S+=n}let C=a.budget(.05);for(f=0,p=0;f<C&&p++<C*20&&x.length;){let e=t()*S,n=0;for(;n<x.length-1&&e>x[n][2];)e-=x[n][2],n++;let[r,i]=x[n],o=t(),c=r[0]+(i[0]-r[0])*o,l=r[1]+(i[1]-r[1])*o;if(P(V,c,l)<.12)continue;let u=Math.min(c-b[0],b[2]-c,l-b[1],b[3]-l);t()>Math.min(1,u/1.6)||(a.pushV(s(c+N(t)*.01,l+N(t)*.01),I.COAST,.6+.4*t()),f++)}let w=J(ae,b,.05),T=a.budget(.1);for(f=0,p=0;f<T&&p++<T*80;){let e=b[0]+t()*(b[2]-b[0]),n=b[1]+t()*(b[3]-b[1]);if(w.land(e,n))continue;let r=w.dist(e,n),i=Math.min(e-b[0],b[2]-e,n-b[1],b[3]-n),o=Math.exp(-r/.35)*Math.min(1,i/1.4);t()>o||(a.pushV(s(e,n,-.01),I.SEA,.25+.6*Math.exp(-r/.15)*t()),f++)}if(i)for(let e of B(i,a.budget(.045),t,{width:7.2,z:-3.6,y:.1}))a.pushV(e,I.TEXT,.5+.5*t());return a.ambient(),a.shuffle()}var Ce=[[0,2.24],[0,1.5],[-.03,.9],[-.06,.42],[0,0],[.08,-.5],[.12,-1],[.18,-1.5],[.28,-2.02]],we=e=>2.2+.09*Math.sin(e*1.1+.4)+.045*Math.sin(e*2.7+1)-.08*Math.exp(-((e+1.2)**2)/.6),Te=[[.2,-2.02],[.42,-2.45],[.75,-2.9],[1.1,-3.35],[1.45,-3.85]],Ee=[[.38,-2],[.62,-2.3],[1.05,-2.65],[1.65,-3.05],[2.3,-3.55]],De=R(-.62,.12,.04);function Oe(e){return Ce.map(([t,n])=>[t+e,n,0])}function ke(e,t,n,r){let i=new pe(e,t),a=De,o=(e,t,n=0)=>z(a,e*.88,t*.88-.3,n*.88),s=i.budget(.06),c=Oe(-.15).map(e=>[e[0],e[1]]),l=Oe(.15).map(e=>[e[0],e[1]]),u=[[-.06,.42,.24,.16],[.1,-.72,.3,.32],[.15,-1.18,.2,.14]];for(let e=0;e<s;e++)if(t()<.78){let[n]=F(e%2?c:l,1,t);i.pushV(o(n[0]+N(t)*.004,n[1],.005),I.BANK,.7+.3*t())}else{let e=u[Math.floor(t()*u.length)],n=t()*Math.PI*2;i.pushV(o(e[0]+Math.cos(n)*e[2],e[1]+Math.sin(n)*e[3],.003),I.BANK,.55)}let d=i.budget(.012);for(let e=0;e<d;e++){let e=u[Math.floor(t()*u.length)],n=t()*Math.PI*2,r=Math.sqrt(t());i.pushV(o(e[0]+Math.cos(n)*e[2]*r,e[1]+Math.sin(n)*e[3]*r,0),I.SEA,.6)}let f=i.budget(.006);for(let e=0;e<f;e++){let n=t(),r=e%2?1:-1;i.pushV(o(r*(.16+.07*n),we(0)+.42*n,.004),I.BANK,.85)}let p=i.budget(.05);for(let e=0;e<p;e++){let e=t();if(e<.55){let e=-3.9+t()*7.8;if(Math.abs(e)<.15)continue;let n=Math.min(1,(3.9-Math.abs(e))/1.2);i.pushV(o(e,we(e)+N(t)*.006),I.COAST,(.45+.55*t())*n)}else{let[n]=F(e<.78?Te:Ee,1,t);i.pushV(o(n[0]+N(t)*.006,n[1]),I.COAST,.5+.5*t())}}let m=i.budget(.2);for(let e=0;e<m;e++)if(t()<.68){let e=-4.1+t()*8.2,n=-Math.log(1-t()*.98)*.55,r=Math.min(1,(4.1-Math.abs(e))/1.5);i.pushV(o(e,we(e)+.02+n,-.005-n*.02),I.SEA,(.3+.7*Math.exp(-n/.3))*r)}else{let e=t(),[n]=F(Te,1,()=>e),[r]=F(Ee,1,()=>e),a=t();i.pushV(o(n[0]+(r[0]-n[0])*a,n[1]+(r[1]-n[1])*a,-.005),I.SEA,.3+.5*t())}let h=i.budget(.06);for(let e=0;e<h;e++){let e=-2+t()*4.1,n=t()<.5?-1:1,r=.2+-Math.log(1-t()*.97)*.55,a=n*r+.05*e*-1;e>we(a)-.04||i.pushV(o(a,e,0),I.FILL,.25+.6*Math.exp(-r/.5)*t())}let g=i.budget(.07);for(let e=0;e<g;e++){let e=Math.round((-3.4+t()*6.8)/.25)*.25,n=Math.round((-3.2+t()*5.2)/.25)*.25;if(n>we(e)-.1)continue;let r=(t()-.5)*.06,a=t()<.5,s=Math.min(1,(3.6-Math.abs(e))/1.5)*Math.min(1,(n+3.4)/1.2);i.pushV(o(e+(a?r:0),n+(a?0:r),0),I.GRID,.9*s)}let _=[[.06,2.62,.04]],ee=[[[-.5,3.05,.25],[-2.1,3.55,.7],[-4.9,4,1.3]],[[.4,3.05,.25],[1.7,3.6,.7],[4.4,4.3,1.3]],[[-.15,3.15,.3],[-.8,4,.8],[-1.5,5.2,1.4]]],te=[[[.72,-2.55,0],[1.1,-3.05,.1],[1.7,-3.6,.35],[2.9,-4.4,.8],[5,-5.3,1.4]],[[.68,-2.55,0],[1,-3.1,.1],[1.35,-3.7,.35],[1.75,-4.7,.8],[2.1,-6,1.4]],[[.7,-2.55,0],[1.15,-3,.1],[2,-3.4,.4],[3.6,-3.6,.9],[5.6,-3.4,1.4]]],v=[];for(let e=0;e<3;e++)for(let t of[1,-1]){let r=Oe(.06*t),i=te[(e+(t>0?0:1))%3].map(e=>[e[0]+.06*t,e[1],e[2]]),a=ee[(e+(t>0?0:2))%3],s=[...i.slice().reverse(),...r,..._.map(e=>[e[0]+.06*t,e[1],e[2]]),...a];t<0&&(s=s.reverse()),s=s.map(e=>o(e[0],e[1],e[2]));let c=n.add(s,.42);v.push(c)}let y=i.budget(.07),ne=Math.floor(y*.4);for(let e=0;e<ne;e++){let n=e%v.length,{row:r,length:a}=v[n],o=Math.floor(t()*9),s=.07/a,c=(o+n%3*.37)/9+(t()-.5)*s;i.pushCurve(r,c,.003+t()*.007,I.SHIP,.75+.25*t())}for(let e=ne;e<y;e++){let n=e%v.length,{row:r,length:a}=v[n],o=Math.floor(t()*9),s=t()**1.6*.45/a,c=(o+n%3*.37)/9-.035/a-s;i.pushCurve(r,c,.006+t()*.012,I.SHIP,.3*(1-s*a/.45)+.05)}let re=i.budget(.04);for(let e=0;e<re;e++){let[n]=F(Oe(e%2?.06:-.06).map(e=>[e[0],e[1]]),1,t);i.pushV(o(n[0]+N(t)*.004,n[1],.002),I.LANE,.5+.5*t())}let b=i.budget(.06);for(let e=0;e<b;e++){let r=v[e%v.length].row,a=n.rows[r].s,o=t(),s=Math.min(254,Math.floor(o*255)),c=o*255-s,l=a[s*3]+(a[s*3+3]-a[s*3])*c,u=a[s*3+1]+(a[s*3+4]-a[s*3+1])*c,d=a[s*3+2]+(a[s*3+5]-a[s*3+2])*c,f=Math.min(1,Math.min(o,1-o)/.12);i.push(l+N(t)*.006,u+N(t)*.006,d+N(t)*.006,I.ARC,(.35+.5*t())*f)}let ie=i.budget(.008);for(let e=0;e<ie;e++){let n=e%2?[0,2.24]:[.3,-2.02],r=t()<.5?.015:.05;i.pushV(o(n[0]+N(t)*r,n[1]+N(t)*r,.02),I.PORT,.9)}if(r)for(let e of B(r,i.budget(.045),t,{width:6.8,z:-3.6,y:.1}))i.pushV(e,I.TEXT,.5+.5*t());return i.ambient(),i.shuffle()}var X=R(-.92,0,.24),Ae=[[0,4.1],[0,3],[-.05,1.8],[0,.6],[.1,-.6],[.15,-1.6],[.25,-2.35],[.7,-3.3],[1.2,-4.2]],Z=[{name:`East Port Said`,c:[1.05,3.05],w:1.5,h:.9,nx:5,ny:3},{name:`Qantara West`,c:[-.9,1.65],w:1,h:.8,nx:3,ny:3},{name:`East Ismailia`,c:[.95,.25],w:1.1,h:1,nx:4,ny:3},{name:`Ain Sokhna`,c:[-1.1,-2.9],w:1.6,h:1.1,nx:5,ny:4}],je=[{name:`West Port Said`,c:[-.45,3.75]},{name:`East Port Said`,c:[.55,3.85]},{name:`Al Arish`,c:[2.85,3.55]},{name:`Adabiya`,c:[-.15,-2.15]},{name:`Ain Sokhna`,c:[-.15,-3.3]},{name:`El Tor`,c:[1.55,-3.6]}];function Me(e,t,n){let r=new pe(e,t),i=X,a=(e,t,n=0)=>z(i,e*.92+.15,t*.92+.25,n*.92),o=(e,t=.05)=>Math.round(e/t)*t,s=r.budget(.11),c=.25;for(let e=0;e<s;e++){let e=t()<.5,n,i;e?(i=o(-4.2+t()*8.6,c),n=-3.4+t()*6.8):(n=o(-3.4+t()*6.8,c),i=-4.2+t()*8.6);let s=t()<.25;s&&(n=o(n,c),i=o(i,c));let l=Math.min(1,(3.4-Math.abs(n))/1.4)*Math.min(1,(4.4-Math.abs(i-.1))/1.4),u=Math.abs(n/1-Math.round(n/1))<.01&&!e||Math.abs(i/1-Math.round(i/1))<.01&&e;r.pushV(a(n,i,0),I.GRID,(s?.9:u?.7:.35)*l)}let l=r.budget(.045),u=Ae.map(e=>[e[0],e[1]]);for(let e=0;e<l;e++){let[n]=F(u,1,t),i=e%3==0?0:e%3==1?.06:-.06;r.pushV(a(n[0]+i+N(t)*.004,n[1],.003),I.LANE,i===0?1:.6)}let d=r.budget(.07);for(let e=0;e<d;e++)if(t()<.6){let e=o(-3.4+t()*6.8,.1),n=o(4.15+t()**1.5*1.3,.1);r.pushV(a(e,n,0),I.SEA,.25+.5*t()*Math.min(1,(3.4-Math.abs(e))/1.4))}else{let e=t(),n=-2.35-e*2.2,i=.25+e*1,s=.15+e*.6;r.pushV(a(o(i+(t()-.5)*2*s,.1),o(n,.1),0),I.SEA,.3+.4*t())}let f=r.budget(.06);for(let e=0;e<f;e++){let n=Z[e%Z.length],i=2*(n.w+n.h),o=t()*i,s,c,l=n.c[0]-n.w/2,u=n.c[1]-n.h/2;o<n.w?(s=l+o,c=u):(o-=n.w)<n.h?(s=l+n.w,c=u+o):(o-=n.h)<n.w?(s=l+n.w-o,c=u+n.h):(o-=n.w,s=l,c=u+n.h-o);let d=t()<.2;r.pushV(a(s+(d?N(t)*.03:0),c+(d?N(t)*.03:0),.004),I.ZONE,d?.4:.85+.15*t())}let p=[];Z.forEach((e,n)=>{let r=.07,i=(e.w-r*(e.nx+1))/e.nx,a=(e.h-r*(e.ny+1))/e.ny;for(let s=0;s<e.nx;s++)for(let c=0;c<e.ny;c++){if(t()<.12)continue;let l=e.c[0]-e.w/2+r+s*(i+r),u=e.c[1]-e.h/2+r+c*(a+r),d=o(.06+t()**2*(n===3?.55:.38),.03);p.push([l,u,i,a,d])}});let m=r.budget(.2);for(let e=0;e<m;e++){let[n,i,s,c,l]=p[e%p.length],u=t(),d,f,m,h;if(u<.5){let e=2*(s+c),r=t()*e;r<s?(d=n+r,f=i):(r-=s)<c?(d=n+s,f=i+r):(r-=c)<s?(d=n+s-r,f=i+c):(r-=s,d=n,f=i+c-r),m=l,h=.85+.15*t()}else if(u<.72){let e=Math.floor(t()*4);d=n+(e&1?s:0),f=i+(e&2?c:0),m=t()*l,h=.55}else if(u<.9)d=n+o(t()*s,.04),f=i+o(t()*c,.04),m=l,h=.35;else{let e=2*(s+c),r=t()*e;r<s?(d=n+r,f=i):(r-=s)<c?(d=n+s,f=i+r):(r-=c)<s?(d=n+s-r,f=i+c):(r-=s,d=n,f=i+c-r),m=0,h=.45}r.pushV(a(d,f,m),I.BLOCK,h)}let h=r.budget(.045);for(let e=0;e<h;e++){let n=je[e%je.length],i=t();if(i<.35)r.pushV(a(n.c[0]+N(t)*.025,n.c[1]+N(t)*.025,.01),I.PORT,1);else if(i<.7){let e=t()*Math.PI*2;r.pushV(a(n.c[0]+Math.cos(e)*.13,n.c[1]+Math.sin(e)*.13,.005),I.PORT,.55)}else r.pushV(a(n.c[0]+N(t)*.006,n.c[1]+N(t)*.006,t()**1.4*.8),I.PORT,.5)}let g=r.budget(.025);for(let e=0;e<g;e++){let n=je[e%je.length],i=Z[0],o=1e9;for(let e of Z){let t=Math.hypot(e.c[0]-n.c[0],e.c[1]-n.c[1]);t<o&&(o=t,i=e)}let s=t();s*o*12%1>.55||r.pushV(a(n.c[0]+(i.c[0]-n.c[0])*s,n.c[1]+(i.c[1]-n.c[1])*s,.01+Math.sin(Math.PI*s)*.12),I.ARC,.7)}if(n)for(let e of B(n,r.budget(.045),t,{width:6.4,z:-3.6,y:.2}))r.pushV(e,I.TEXT,.5+.5*t());return r.ambient(),r.shuffle()}var Ne=2.3,Pe=[[51.5,-.13],[40.7,-74],[25.2,55.3],[31.2,121.5],[1.35,103.8],[6.5,3.4],[-1.3,36.8],[19.1,72.9],[24.7,46.7],[50.1,8.7],[55.8,37.6],[-26.2,28],[-23.5,-46.6],[35.7,139.7],[41,29],[33.9,-6.9],[48.9,2.35]],Fe=(e,t,n=1)=>{let r=Math.cos(e*H);return[r*Math.sin(t*H)*n,Math.sin(e*H)*n,r*Math.cos(t*H)*n]};function Ie(e,t,n,r,i){let a=new pe(e,t),o=Ne,s=le(r),c=Math.round(e*.42),l=Math.round(Math.sqrt(c/.36)),u=M(s,l);(u.count>c*1.15||u.count<c*.85)&&(l=Math.round(l*Math.sqrt(c/u.count)),u=M(s,l));let d=[...Array(u.count).keys()];for(let e=d.length-1;e>0;e--){let n=Math.floor(t()*(e+1));[d[e],d[n]]=[d[n],d[e]]}let f=Math.min(u.count,a.budget(.45));for(let e=0;e<f;e++){let t=d[e],n=u.flags[t*2]>.5,r=o*(1+(n?.006:0));a.push(u.positions[t*3]*r,u.positions[t*3+1]*r,u.positions[t*3+2]*r,n?I.EGLAND:I.LAND,n?1:.55+.45*u.flags[t*2+1])}let p=a.budget(.06),m=Math.PI*(3-Math.sqrt(5));for(let e=0;e<p;e++){let n=1-2*(e+.5)/p,r=Math.sqrt(1-n*n),i=m*e;a.push(Math.cos(i)*r*o*.995,n*o*.995,Math.sin(i)*r*o*.995,I.OCEAN,.4+.6*t())}let h=a.budget(.05);for(let e=0;e<h;e++){let e=t()*2-1,n=t()*Math.PI*2,r=Math.sqrt(1-e*e),i=o*(1.01+t()**2.2*.12);a.push(Math.cos(n)*r*i,e*i,Math.sin(n)*r*i,I.RIM,.4+.6*t())}let g=Fe(q[1],q[0]),_=[];for(let[e,t]of Pe){let r=Fe(e,t),i=Math.acos(Math.max(-1,Math.min(1,g[0]*r[0]+g[1]*r[1]+g[2]*r[2]))),a=.06+i/Math.PI*.32,s=[];for(let e=0;e<=32;e++){let t=e/32,n=Math.sin((1-t)*i)/Math.sin(i),c=Math.sin(t*i)/Math.sin(i),l=[g[0]*n+r[0]*c,g[1]*n+r[1]*c,g[2]*n+r[2]*c],u=o*(1.004+a*Math.sin(Math.PI*t));s.push([l[0]*u,l[1]*u,l[2]*u])}_.push({...n.add(s,.55),pts:s,c1:r})}let ee=a.budget(.07);for(let e=0;e<ee;e++){let n=_[e%_.length],r=Math.floor(t()*3),i=t()**2*.22;a.pushCurve(n.row,(r+e%7*.13)/3-i,.003+t()*.006,I.GARC,1-i/.22*.85)}let te=a.budget(.03);for(let e=0;e<te;e++){let r=_[e%_.length],i=t(),o=n.rows[r.row].s,s=Math.min(254,Math.floor(i*255));a.push(o[s*3],o[s*3+1],o[s*3+2],I.GARCS,(.4+.5*t())*Math.min(1,i/.12))}let v=a.budget(.01);for(let e=0;e<v;e++){let n=_[e%_.length],r=t()<.5?.012:.035;a.push(n.c1[0]*o+N(t)*r,n.c1[1]*o+N(t)*r,n.c1[2]*o+N(t)*r,I.GCITY,.9)}let y=a.budget(.0015);for(let e=0;e<y;e++){let e=t()<.5?.01:.03;a.push(g[0]*o*1.01+N(t)*e,g[1]*o*1.01+N(t)*e,g[2]*o*1.01+N(t)*e,I.CAIRO,1)}if(i)for(let e of B(i,a.budget(.045),t,{width:6.4,z:-4.2,y:.1}))a.pushV(e,I.TEXT,.5+.5*t());return a.ambient(),a.shuffle()}async function Le(e,{texts:t=[]}={}){let n=(await b(async()=>{let{default:e}=await import(`./land-110m-BQ7RsPpG.js`);return{default:e}},[])).default,r=new L,i=[xe(e,ue(11)),Se(e,ue(22),r,n,t[1]),ke(e,ue(33),r,t[2]),Me(e,ue(44),t[3]),Ie(e,ue(55),r,n,t[4])],a=z(Y,...ge(q[0],q[1]),.03),o=new s(1,0,0).applyMatrix4(Y),c=new s(0,1,0).applyMatrix4(Y);return{states:i,curveTex:r.texture(),curveRows:r.rows.length,cairoMap:a,mapX:o,mapY:c,cairoGlobe:Fe(q[1],q[0],Ne)}}var Re=`
#define PI 3.14159265
#define CURVE_RES 256
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
`,ze=`
${Re}
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
`,Be=`
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
`,Ve=`
${Re}
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
  uint id = uint(ij.y) * uint(RES) + uint(ij.x);
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
`,He=`
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
`,Ue={uniforms:{tDiffuse:{value:null},uBg:{value:null},uGlow:{value:null},uCenter:{value:null},uAspect:{value:1},uTime:{value:0},uExposure:{value:1},uGrain:{value:.035},uRes:{value:null}},vertexShader:`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,fragmentShader:`
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
  `},We=`#D9B27C`,Q=`#F0D3A4`,$=`#9CC3EA`,Ge=[null,null,null,`455`,null],Ke=32,qe=6.9;function Je(){let e=(e,t)=>new m(e).multiplyScalar(t),t=(e,t,n,r)=>new m(e).lerp(new m(t),n).multiplyScalar(r),n=Array(26).fill(null).map(()=>[e(We,1),.5,.016]),r=(e,t,r,i)=>{n[e]=[t,r,i]};return r(I.AMBIENT,t(We,$,.35,.9),.22,.016),r(I.NEBULA,t(We,Q,.4,1.6),.85,.018),r(I.FILL,e(We,1.25),.7,.014),r(I.OUTLINE,e(Q,2.1),.95,.015),r(I.NILE,new m(1,.84,.6).multiplyScalar(2),.8,.016),r(I.DELTA,e(Q,1.5),.7,.014),r(I.CAIRO,new m(1,.95,.88).multiplyScalar(3),1,.04),r(I.RIPPLE,e(Q,2.2),.9,.014),r(I.COAST,e($,1.7),.95,.013),r(I.SEA,e($,1),.6,.012),r(I.BANK,e(Q,1.8),.8,.013),r(I.SHIP,new m(1,.88,.68).multiplyScalar(2.1),.9,.016),r(I.LANE,e($,1.4),.6,.012),r(I.ARC,t($,Q,.35,1.1),.45,.012),r(I.GRID,e($,.9),.4,.011),r(I.BLOCK,e(We,1.7),.85,.014),r(I.PORT,new m(1,.92,.8).multiplyScalar(2.4),1,.02),r(I.LAND,e(We,1.35),.85,.016),r(I.OCEAN,e($,.75),.3,.012),r(I.EGLAND,new m(1,.88,.66).multiplyScalar(2.4),1,.018),r(I.GARC,t(Q,`#FFFFFF`,.3,1.8),.85,.015),r(I.RIM,e($,1.5),.5,.014),r(I.TEXT,e(Q,.9),.2,.014),r(I.ZONE,e(Q,2.2),.95,.014),r(I.GARCS,t($,Q,.5,1.2),.45,.011),r(I.GCITY,new m(1,.95,.86).multiplyScalar(2.2),1,.02),n}var Ye=(e,t,n,r)=>e+(t-e)*(1-Math.exp(-n*r));function Xe(p,{quality:ne=`high`}={}){let b=document.createElement(`canvas`).getContext(`webgl2`);if(!b)throw Error(`DataMorph: WebGL2 is not available`);let ae=b.getExtension(`WEBGL_lose_context`);ae&&ae.loseContext();let x=ne===`low`,S=x?180:300,C=S*S,w=typeof matchMedia<`u`&&matchMedia(`(prefers-reduced-motion: reduce)`).matches,T=new l({antialias:!1,alpha:!1,powerPreference:`high-performance`}),oe=x?1:1.75;T.setPixelRatio(Math.min(window.devicePixelRatio||1,oe)),T.setClearColor(0,1),T.toneMapping=0;let E=T.domElement;Object.assign(E.style,{position:`absolute`,inset:`0`,width:`100%`,height:`100%`,display:`block`,background:`#050B1A`}),getComputedStyle(p).position===`static`&&(p.style.position=`relative`),p.appendChild(E);let D=new c,O=new t(Ke,16/9,.1,80),k=new ie(S,S,T),se=k.createTexture(),ce=k.createTexture();{let e=se.image.data;for(let t=0;t<C;t++){let n=Math.random()*2-1,r=Math.random()*Math.PI*2,i=2.5+Math.random()*4,a=Math.sqrt(1-n*n);e[t*4]=Math.cos(r)*a*i,e[t*4+1]=n*i,e[t*4+2]=Math.sin(r)*a*i,e[t*4+3]=1}}let A=k.addVariable(`tDisp`,Be,se),j=k.addVariable(`tVel`,ze,ce);k.setVariableDependencies(A,[A,j]),k.setVariableDependencies(j,[A,j]);let le=new y(new Float32Array(4),1,1,r,e);le.needsUpdate=!0;let M={tA:{value:le},tB:{value:le},tCurves:{value:le},uRotA:{value:new n},uRotB:{value:new n},uNebTilt:{value:new n().setFromMatrix4(new i().makeRotationX(-1.08).multiply(new i().makeRotationZ(.35)))},uMapX:{value:new s(1,0,0)},uMapY:{value:new s(0,1,0)},uM:{value:0},uTime:{value:0}};Object.assign(j.material.uniforms,M,{uDt:{value:1/60},uK:{value:13},uC:{value:4.2},uTurb:{value:0},uIdle:{value:0},uAspect:{value:1},uPtrStr:{value:0},uPtrR:{value:.16},uPtr:{value:new f(9,9)},uPtrVel:{value:new f},uVP:{value:new i},uCamR:{value:new s(1,0,0)},uCamU:{value:new s(0,1,0)},uCamF:{value:new s(0,0,1)},uBurst:{value:new v(0,0,0,.35)}}),Object.assign(A.material.uniforms,{uDt:j.material.uniforms.uDt});let ue=k.init();if(ue)throw Error(`DataMorph: `+ue);let N=new Float32Array(C*2);for(let e=0;e<C;e++)N[e*2]=e%S,N[e*2+1]=Math.floor(e/S);let de=new d;de.setAttribute(`ref`,new te(N,2)),de.setAttribute(`position`,new te(new Float32Array(C*3),3)),de.boundingSphere=new u(new s,100);let fe=Je(),P=new g({defines:{RES:S},uniforms:Object.assign({},M,{tDisp:{value:null},tVel:{value:null},uStyle:{value:fe.map(([e,t])=>new v(e.r,e.g,e.b,t))},uSize:{value:fe.map(e=>e[2])},uPx:{value:400},uFocus:{value:11},uSizeMul:{value:1},uAlphaMul:{value:1},uIntro:{value:0},uSky:{value:new m($)}}),vertexShader:Ve,fragmentShader:He,transparent:!0,depthWrite:!1,depthTest:!1,blending:2}),F=new o(de,P);F.frustumCulled=!1,D.add(F);let I=new h(T);I.addPass(new re(D,O));let pe=new ee(new f(256,256),.5,.45,.9);I.addPass(pe);let L=new _(Ue);L.uniforms.uBg.value=new s(5/255,11/255,26/255),L.uniforms.uGlow.value=new s(.035,.055,.1),L.uniforms.uCenter.value=new f(.7,.5),L.uniforms.uRes.value=new f(1,1),L.uniforms.uGrain.value=.032,I.addPass(L);let R=1,z=1,B=11,V=new f;function H(){let e=p.getBoundingClientRect();R=Math.max(1,Math.round(e.width)),z=Math.max(1,Math.round(e.height)),T.setSize(R,z,!1),I.setPixelRatio(T.getPixelRatio()),I.setSize(R,z);let t=R/z,n,r;t>=1?(n=.55*R,r=.9*z,V.set(.225*R,0)):(n=.96*R,r=.5*z,V.set(0,.24*z));let i=Math.min(n,r)/qe,a=Math.tan(Ke/2*Math.PI/180);B=z/(2*a*i),O.aspect=t,O.setViewOffset(R,z,-V.x,V.y,R,z),O.updateProjectionMatrix();let o=T.getPixelRatio();P.uniforms.uPx.value=z*o/(2*a),P.uniforms.uSizeMul.value=Math.max(.85,Math.min(1.6,Math.sqrt(125/i)))*(x?1.35:1),P.uniforms.uAlphaMul.value=x?.75:.38,j.material.uniforms.uAspect.value=t,L.uniforms.uAspect.value=t,L.uniforms.uRes.value.set(R*o,z*o),L.uniforms.uCenter.value.set(.5+V.x/R,.5+V.y/z)}H();let me=new ResizeObserver(()=>H());me.observe(p);let U=null,W=0,he=0,ge=new f(9,9),G=new f(9,9),_e=new f(9,9),K=0,ve=0,q=-1,ye=null,be=0,J=0,xe=0,Y=new f,Se=e=>{let t=w?0:.42*Math.sin(e*.05)+.06*Math.sin(e*.13),r=new i().makeRotationX(.4).multiply(new i().makeRotationY(-31.2*Math.PI/180-.32+t));return new n().setFromMatrix4(r)},Ce=new n,we=(async()=>{if(document.fonts)try{await Promise.race([Promise.all([document.fonts.load(`200 100px "Archivo Variable"`),document.fonts.ready]),new Promise(e=>setTimeout(e,2500))])}catch{}let t=!document.fonts||document.fonts.check(`200 100px "Archivo Variable"`),n=await Le(C,{texts:t?Ge:[]});U=n.states.map(t=>{let n=new y(t,S,S,r,e);return n.minFilter=n.magFilter=a,n.needsUpdate=!0,n}),M.tCurves.value=n.curveTex,M.uMapX.value.copy(n.mapX),M.uMapY.value.copy(n.mapY),Ee||(M.tA.value=U[0],M.tB.value=U[1],je(1/60,!0),T.compile(D,O),Ee||I.render(),Te=!0,Z()&&Pe())})(),Te=!1,Ee=!1,De=!1,Oe=!0,ke=document.hidden,X=0,Ae=0,Z=()=>Te&&!Ee&&!De&&Oe&&!ke;function je(e,t=!1){J+=e,w||(be+=e),xe=t?0:Math.min(1,xe+e/1.2),P.uniforms.uIntro.value=1-(1-xe)**3,he=Ye(he,W,3.2,e),Math.abs(he-W)<1e-4&&(he=W);let n=Math.min(4,Math.max(0,he*4)),r=Math.min(3,Math.floor(n)),i=n-r;M.tA.value=U[r],M.tB.value=U[r+1],M.uRotA.value.copy(r===4?Se(be):Ce),M.uRotB.value.copy(r+1===4?Se(be):Ce),M.uM.value=i,M.uTime.value=be;let a=K?G:new f(0,0);Y.x=Ye(Y.x,a.x*.35,2.5,e),Y.y=Ye(Y.y,-a.y*.22,2.5,e);let o=+!w,s=Math.sin(J*.071)*.22*o+Y.x,c=Math.cos(J*.053)*.14*o+Y.y,l=Math.sin(J*.037)*.25*o;O.position.set(s,c,B+l),O.lookAt(s*.35,c*.35,0),O.updateMatrixWorld(),P.uniforms.uFocus.value=B;let u=j.material.uniforms;u.uDt.value=e,u.uTurb.value=w?0:7,u.uIdle.value=w?0:.5,u.uVP.value.multiplyMatrices(O.projectionMatrix,O.matrixWorldInverse);let d=O.matrixWorld.elements;u.uCamR.value.set(d[0],d[1],d[2]),u.uCamU.value.set(d[4],d[5],d[6]),u.uCamF.value.set(d[8],d[9],d[10]),G.x=Ye(G.x,ge.x,14,e),G.y=Ye(G.y,ge.y,14,e);let p=J-q>2.5;ve=Ye(ve,K&&!p?1:K?.55:0,4,e),u.uPtr.value.set(G.x,-G.y),u.uPtrVel.value.set((G.x-_e.x)/Math.max(e,.001),-(G.y-_e.y)/Math.max(e,.001)).clampLength(0,3),_e.copy(G),u.uPtrStr.value=ve,ye?(u.uBurst.value.set(ye[0],-ye[1],1,.3),ye=null):u.uBurst.value.z=0,k.compute(),P.uniforms.tDisp.value=k.getCurrentRenderTarget(A).texture,P.uniforms.tVel.value=k.getCurrentRenderTarget(j).texture,L.uniforms.uTime.value=J}function Me(e){if(X=0,!Z())return;let t=Ae?Math.min(1/30,Math.max(1/240,(e-Ae)/1e3)):1/60;Ae=e,je(t),I.render(t),X=requestAnimationFrame(Me)}function Pe(){!X&&Z()&&(Ae=0,X=requestAnimationFrame(Me))}function Fe(){X&&cancelAnimationFrame(X),X=0}let Ie=new IntersectionObserver(e=>{Oe=e.some(e=>e.isIntersecting),Oe?Pe():Fe()},{threshold:0});Ie.observe(p);let Re=()=>{ke=document.hidden,ke?Fe():Pe()};return document.addEventListener(`visibilitychange`,Re),{ready:we,setProgress(e){W=Math.min(1,Math.max(0,+e||0))},setPointer(e,t){!isFinite(e)||!isFinite(t)||Math.abs(e)>1.5||Math.abs(t)>1.5?K=0:(K||(G.set(e,t),_e.set(e,t)),ge.set(e,t),K=1,q=J)},burst(e,t){ye=[e,t]},pause(){De=!0,Fe()},resume(){De=!1,Pe()},dispose(){Ee=!0,Fe(),Ie.disconnect(),me.disconnect(),document.removeEventListener(`visibilitychange`,Re),k.dispose(),de.dispose(),P.dispose(),U&&U.forEach(e=>e.dispose()),M.tCurves.value&&M.tCurves.value.dispose(),le.dispose(),I.dispose&&I.dispose(),pe.dispose(),T.dispose(),T.forceContextLoss&&T.forceContextLoss(),E.remove()},_debug:{jump(e){W=he=Math.min(1,Math.max(0,e))},step(e=1/60,t=1){for(let n=0;n<t;n++)je(e);I.render(e)},get counts(){return{particles:C,tex:S}},renderer:T,GLOBE_R:Ne}}}export{Xe as createDataMorph,Xe as default};