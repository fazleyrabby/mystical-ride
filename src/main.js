import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { initVisitorCounter } from './visitorCounter.js';
import './style.css';

initVisitorCounter();

const root = document.querySelector('#app');
const mount = document.querySelector('#scene');
const loading = document.querySelector('#loading');
const error = document.querySelector('#error');
const status = document.querySelector('#status');
const sceneHeading=document.querySelector('#scene-heading');
const scenePrompt=document.querySelector('#scene-prompt');
const soundButton = document.querySelector('#sound-button');
const weatherButton = document.querySelector('#weather-button');
const weatherLabel = document.querySelector('#weather-label');
const resetButton = document.querySelector('#reset-button');

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
let seed = 192705;
const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const range = (a, b) => a + (b - a) * random();
let weatherMode=0;
const compactDevice=innerWidth<=700||matchMedia('(pointer: coarse)').matches;
const displayPixelRatio=Math.min(devicePixelRatio,compactDevice?1:1.8);
const reflectionScale=compactDevice?.46:.65;
const reflectionPixelRatio=Math.min(devicePixelRatio,compactDevice?1:1.5);

// The waterway: opens straight, then meanders, narrows and widens, and finally closes into forest.
const RIDE_START=80,RIDE_END=-640;
function channelCenter(z){
  return THREE.MathUtils.smoothstep(-z,85,170)*(Math.sin(z*.0118+.6)*15+Math.sin(z*.027)*5.5);
}
function shoreX(side,z){
  const open=THREE.MathUtils.smoothstep(z,RIDE_END-60,RIDE_END-8);
  return channelCenter(z)+side*open*(19.5+Math.sin(z*.035+side)*3.2+Math.sin(z*.078)*1.35+Math.sin(z*.0083+2)*4.5);
}
const channelGLSL=`
  float channelCenter(float z){return smoothstep(85.,170.,-z)*(sin(z*.0118+.6)*15.+sin(z*.027)*5.5);}
  float shoreX(float side,float z){
    float open=smoothstep(${RIDE_END-60}.,${RIDE_END-8}.,z);
    return channelCenter(z)+side*open*(19.5+sin(z*.035+side)*3.2+sin(z*.078)*1.35+sin(z*.0083+2.)*4.5);
  }
`;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(displayPixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.42;
  mount.appendChild(renderer.domElement);
} catch (cause) {
  console.error('WebGL could not start:', cause);
  loading.hidden = true;
  error.hidden = false;
  throw cause;
}

const scene = new THREE.Scene();
scene.background = new THREE.Color('#07131b');
scene.fog = new THREE.FogExp2(0x081b1c, 0.0056);
const camera = new THREE.PerspectiveCamera(59, innerWidth / innerHeight, 0.1, 450);
camera.position.set(0, 3.4, 17.4);

const hemiLight=new THREE.HemisphereLight(0x9ebbd0, 0x071315, 2.15);
scene.add(hemiLight);
const moonLight = new THREE.DirectionalLight(0xffe8bd, 2.7);
moonLight.position.set(-5, 24, -80);
scene.add(moonLight);

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(260, 48, 32),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uWeather: { value: 0 }, uFlash: { value: 0 }, uTornado: { value: new THREE.Vector3(0,0,-1) } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vDir; uniform float uTime; uniform float uWeather; uniform float uFlash; uniform vec3 uTornado;
      float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y); }
      void main(){
        float h=clamp(vDir.y,0.,1.);
        vec3 horizon=vec3(.075,.157,.181);
        vec3 middle=vec3(.029,.084,.119);
        vec3 zenith=vec3(.009,.027,.048);
        vec3 color=mix(horizon,middle,smoothstep(.0,.36,h));
        color=mix(color,zenith,smoothstep(.29,.92,h));
        float cloud=noise(vDir.xz*14.+vec2(uTime*.004,0.))*0.55+noise(vDir.xz*29.-vec2(uTime*.008,0.))*0.3;
        float cloudMask=smoothstep(.48,.69,cloud)*(.34+smoothstep(.5,.05,h)*.2);
        color=mix(color,vec3(.18,.23,.25),cloudMask*.26);
        float lowerGlow=exp(-pow((vDir.y-.08)/.14,2.))*exp(-pow(vDir.x/.37,2.));
        color+=vec3(.10,.12,.11)*lowerGlow;
        float dawn=1.-step(.5,abs(uWeather-1.));
        float rain=step(1.5,uWeather);
        vec3 dawnSky=mix(vec3(.72,.34,.25),vec3(.25,.23,.34),smoothstep(.02,.43,h));
        dawnSky=mix(dawnSky,vec3(.075,.13,.23),smoothstep(.38,.94,h));
        float dawnCloud=smoothstep(.42,.72,noise(vDir.xz*12.+vec2(uTime*.003,0.)));
        dawnSky=mix(dawnSky,vec3(.67,.40,.38),dawnCloud*.26);
        dawnSky+=vec3(.24,.10,.055)*exp(-pow((vDir.y-.08)/.13,2.));
        vec3 rainSky=mix(vec3(.18,.225,.25),vec3(.045,.068,.083),smoothstep(.01,.77,h));
        float rainCloud=noise(vDir.xz*9.+vec2(uTime*.018,-uTime*.007))*.65
                       +noise(vDir.xz*23.-vec2(uTime*.024,0.))*.35;
        rainSky=mix(rainSky,vec3(.035,.049,.061),smoothstep(.31,.68,rainCloud)*.57);
        float stormCloud=noise(vDir.xz*7.+vec2(uTime*.06,-uTime*.025))*.6+noise(vDir.xz*19.-vec2(uTime*.09,0.))*.4;
        vec3 stormSky=mix(vec3(.15,.175,.165),vec3(.028,.038,.044),smoothstep(0.,.62,h));
        stormSky=mix(stormSky,vec3(.012,.017,.022),smoothstep(.3,.66,stormCloud)*.7);
        stormSky+=vec3(.085,.11,.095)*exp(-pow(distance(normalize(vDir),uTornado)/.4,2.));
        stormSky+=vec3(.5,.56,.66)*uFlash*(.25+.75*smoothstep(.36,.7,stormCloud))*smoothstep(-.1,.5,1.-h);
        rainSky=mix(rainSky,stormSky,step(2.5,uWeather));
        color=mix(color,dawnSky,dawn);
        color=mix(color,rainSky,rain);
        gl_FragColor=vec4(color,1.);
      }`
  })
);
scene.add(sky);

const starPositions = [];
const starColors = [];
for (let i = 0; i < 620; i++) {
  const y = range(0.14, 0.98);
  const a = range(0, TAU);
  const radius = 225;
  const horizontal = Math.sqrt(1 - y * y);
  starPositions.push(Math.cos(a) * horizontal * radius, y * radius, Math.sin(a) * horizontal * radius);
  const brightness = range(.37, .95);
  starColors.push(brightness * .76, brightness * .87, brightness);
}
const starsGeometry = new THREE.BufferGeometry();
starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
starsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3));
const stars = new THREE.Points(starsGeometry, new THREE.PointsMaterial({ size: .72, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: .8, depthWrite: false }));
scene.add(stars);

// ── Fireflies ──────────────────────────────────────────────────────────
const fireflyCount=compactDevice?64:180;
const fireflyHomes=new Float32Array(fireflyCount*3);
const fireflyParams=new Float32Array(fireflyCount*4);
for(let i=0;i<fireflyCount;i++){
  const side=random()>.5?1:-1;const z=range(RIDE_END-20,72);const edge=shoreX(side,z);
  fireflyHomes[i*3]=edge+side*range(-6,4.5);fireflyHomes[i*3+1]=range(1.0,4.2);fireflyHomes[i*3+2]=z;
  fireflyParams[i*4]=range(.5,1.8);fireflyParams[i*4+1]=range(.18,.42);fireflyParams[i*4+2]=range(.12,.28);fireflyParams[i*4+3]=range(0,TAU);
}
const fireflyGeo=new THREE.BufferGeometry();
fireflyGeo.setAttribute('position',new THREE.Float32BufferAttribute(fireflyHomes,3));
fireflyGeo.setAttribute('aParams',new THREE.Float32BufferAttribute(fireflyParams,4));
const fireflyMaterial=new THREE.ShaderMaterial({
  transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  uniforms:{uTime:{value:0},uWeather:{value:0}},
  vertexShader:`
    attribute vec4 aParams;uniform float uTime;uniform float uWeather;
    varying float vGlow;varying float vWarmth;
    void main(){
      float t=uTime,r=aParams.x,spd=aParams.y,freq=aParams.z,ph=aParams.w;
      vec3 pos=position+vec3(
        r*sin(t*spd+ph)+r*.32*sin(t*spd*1.73+ph*2.3),
        r*.35*sin(t*spd*1.17+ph*.7+1.2),
        r*sin(t*spd*.81+ph*1.4+2.8)+r*.28*sin(t*spd*2.1+ph));
      float cycle=fract(t*freq+ph*.159);
      float onRatio=.22,ramp=.06;
      vGlow=smoothstep(0.,ramp,cycle)*smoothstep(onRatio,onRatio-ramp,cycle);
      vGlow*=vGlow;
      vWarmth=smoothstep(0.,.12,cycle);
      float dawn=1.-step(.5,abs(uWeather-1.));float rain=step(1.5,uWeather);
      vGlow*=(1.-dawn)*(1.-rain);
      vec4 mv=modelViewMatrix*vec4(pos,1.);
      gl_PointSize=max((1.4+vGlow*5.)*160./-mv.z,0.);
      gl_Position=projectionMatrix*mv;
    }`,
  fragmentShader:`
    varying float vGlow;varying float vWarmth;
    void main(){
      if(vGlow<.005)discard;
      float d=length(gl_PointCoord-.5)*2.;
      float core=exp(-d*d*14.);float halo=exp(-d*d*1.8)*.18;float shape=core+halo;
      float alpha=shape*vGlow;
      vec3 col=mix(vec3(.35,.58,.14),vec3(.68,.80,.28),core/max(core+halo,.001));
      col=mix(col,vec3(.82,.72,.24),vWarmth*.25);
      gl_FragColor=vec4(col*alpha*.85,alpha*.65);
    }`
});
const fireflies=new THREE.Points(fireflyGeo,fireflyMaterial);
fireflies.frustumCulled=false;scene.add(fireflies);

function moonTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const c = 256;
  const radial = ctx.createRadialGradient(c - 54, c - 68, 18, c, c, 246);
  radial.addColorStop(0, '#e5dfcb');
  radial.addColorStop(.58, '#c7c8b9');
  radial.addColorStop(.88, '#a5aea7');
  radial.addColorStop(1, '#788883');
  ctx.beginPath(); ctx.arc(c, c, 245, 0, TAU); ctx.fillStyle = radial; ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(c, c, 243, 0, TAU); ctx.clip();
  const maria = [
    [174,150,72,52,.42],[234,180,48,61,.34],[310,166,65,43,.44],
    [348,247,48,70,.39],[220,270,71,44,.29],[147,302,40,56,.28],
    [288,329,63,46,.35],[382,325,33,52,.25]
  ];
  for (const [x,y,rx,ry,opacity] of maria) {
    ctx.save(); ctx.translate(x,y); ctx.rotate(range(-.7,.7)); ctx.scale(rx,ry);
    const shade=ctx.createRadialGradient(0,0,.16,0,0,1.1);
    shade.addColorStop(0,`rgba(45,67,70,${opacity})`);
    shade.addColorStop(.57,`rgba(57,77,76,${opacity*.72})`);
    shade.addColorStop(1,'rgba(60,78,76,0)');
    ctx.fillStyle=shade; ctx.beginPath(); ctx.arc(0,0,1.1,0,TAU); ctx.fill();ctx.restore();
  }
  for (let i = 0; i < 1200; i++) {
    const x=range(17,495),y=range(17,495),r=range(1.5,16);
    ctx.globalAlpha=range(.025,.13);
    ctx.fillStyle=random()>.36?'#526c6c':'#fff5db';
    ctx.beginPath();ctx.ellipse(x,y,r*range(.55,1.3),r*range(.4,1.05),range(0,TAU),0,TAU);ctx.fill();
  }
  ctx.globalAlpha=1;
  for(let i=0;i<110;i++){
    const x=range(25,487),y=range(25,487),r=range(2,12);
    const crater=ctx.createRadialGradient(x-r*.18,y-r*.18,r*.12,x,y,r);
    crater.addColorStop(0,'rgba(52,66,65,.18)');
    crater.addColorStop(.58,'rgba(75,86,81,.11)');
    crater.addColorStop(.78,'rgba(247,243,217,.21)');
    crater.addColorStop(1,'rgba(247,243,217,0)');
    ctx.fillStyle=crater;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();
  }
  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function glowTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d'); const gradient = ctx.createRadialGradient(128,128,8,128,128,128);
  gradient.addColorStop(0,'rgba(255,241,201,.55)');
  gradient.addColorStop(.26,'rgba(241,229,200,.23)');
  gradient.addColorStop(.62,'rgba(186,207,209,.07)');
  gradient.addColorStop(1,'rgba(155,189,198,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0,0,256,256);
  return new THREE.CanvasTexture(canvas);
}
const moonPosition = new THREE.Vector3(-1.5, 24, -145);
const halo = new THREE.Mesh(new THREE.PlaneGeometry(51,51), new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
halo.position.copy(moonPosition); halo.position.z -= .25; scene.add(halo);
const moon = new THREE.Mesh(new THREE.PlaneGeometry(15.6,15.6), new THREE.MeshBasicMaterial({ map: moonTexture(), transparent: true, depthWrite: false, fog: false, toneMapped: false, color: 0xffffff }));
moon.position.copy(moonPosition); scene.add(moon);
function sunTexture(halo=false){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d');
  const gradient=ctx.createRadialGradient(128,128,halo?4:14,128,128,halo?126:122);
  if(halo){
    gradient.addColorStop(0,'rgba(255,190,117,.48)');
    gradient.addColorStop(.4,'rgba(255,125,79,.19)');
    gradient.addColorStop(1,'rgba(255,116,73,0)');
  }else{
    gradient.addColorStop(0,'#fff1c4');
    gradient.addColorStop(.63,'#ffd69e');
    gradient.addColorStop(.91,'#f6ad72');
    gradient.addColorStop(1,'rgba(244,152,98,0)');
  }
  ctx.fillStyle=gradient;ctx.fillRect(0,0,256,256);
  return new THREE.CanvasTexture(canvas);
}
const sunPosition=new THREE.Vector3(7,13,-145);
const sunHalo=new THREE.Mesh(new THREE.PlaneGeometry(63,63),new THREE.MeshBasicMaterial({map:sunTexture(true),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));
sunHalo.position.copy(sunPosition);sunHalo.position.z-=.25;sunHalo.visible=false;scene.add(sunHalo);
const sun=new THREE.Mesh(new THREE.PlaneGeometry(14,14),new THREE.MeshBasicMaterial({map:sunTexture(),transparent:true,depthWrite:false,fog:false,toneMapped:false}));
sun.position.copy(sunPosition);sun.visible=false;scene.add(sun);

// ── Storm: wind, and a tornado far off on the horizon ──────────────────
const windUniforms={uSway:{value:0},uGust:{value:1}};
// Bends instanced plants downwind from the root up, and makes leaves shiver.
function windSway(material,nativeHeight,flutter){
  material.onBeforeCompile=shader=>{
    shader.uniforms.uSway=windUniforms.uSway;shader.uniforms.uGust=windUniforms.uGust;
    shader.vertexShader='uniform float uSway;uniform float uGust;\n'+shader.vertexShader.replace('#include <project_vertex>',`
      vec4 mvPosition=vec4(transformed,1.);
      #ifdef USE_INSTANCING
        mvPosition=instanceMatrix*mvPosition;
        vec3 windRoot=instanceMatrix[3].xyz;
        float windSize=length(instanceMatrix[1].xyz);
        float windRise=clamp((mvPosition.y-windRoot.y)/(windSize*${nativeHeight.toFixed(1)}),0.,1.4);
        float windPhase=windRoot.x*.37+windRoot.z*.21;
        float windForce=min(uGust,6.);
        float windLean=(.35*(windForce-1.)+sin(uSway*.8+windPhase)+.4*sin(uSway*1.9+windPhase*1.7))*windRise*windRise*windSize*.12*(.6+.4*windForce);
        mvPosition.xz+=vec2(.94,.34)*windLean;
        mvPosition.y-=abs(windLean)*.12*windRise;
        mvPosition.xyz+=vec3(
          sin(uSway*3.3+dot(mvPosition.xyz,vec3(1.7,1.1,2.3))),
          sin(uSway*2.7+dot(mvPosition.xyz,vec3(2.1,.7,1.3)))*.5,
          cos(uSway*3.9+dot(mvPosition.xyz,vec3(1.3,1.9,.9))))*${flutter.toFixed(3)}*windSize*windRise*(.5+.5*min(uGust,5.));
      #endif
      mvPosition=modelViewMatrix*mvPosition;
      gl_Position=projectionMatrix*mvPosition;`);
  };
  return material;
}
const tornadoUniforms={uTime:{value:0},uFlash:{value:0}};
const tornadoNoise=`
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
`;
const TORNADO_HEIGHT=84;
const tornado=new THREE.Group();tornado.visible=false;scene.add(tornado);
// A rope that flares into the cloud base: a dense core inside a thin, ragged sheath.
const funnelGeometry=new THREE.LatheGeometry(Array.from({length:40},(_,i)=>{
  const h=i/39;
  return new THREE.Vector2(2.2+5*h+26*Math.pow(h,4.2),h*TORNADO_HEIGHT);
}),48);
function funnelMaterial(shell,opacity){
  return new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.DoubleSide,fog:false,
    uniforms:{...tornadoUniforms,uShell:{value:shell},uOpacity:{value:opacity}},
    vertexShader:`
      uniform float uTime;uniform float uShell;
      varying vec2 vUv;varying float vEdge;varying float vSide;
      ${tornadoNoise}
      void main(){
        vUv=uv;float h=uv.y,low=1.-h,a=uv.x*6.2832;
        float ragged=noise(vec2(cos(a),sin(a))*1.8+vec2(h*7.-uTime*.9,uTime*.35+uShell*3.))-.5;
        vec3 pos=position;
        pos.xz*=uShell*(1.+ragged*(.28+.3*h));
        pos.x+=sin(h*4.2-uTime*.7)*8.*low*h+h*14.;
        pos.z+=cos(h*3.6+uTime*.5)*3.*low;
        vec4 mv=modelViewMatrix*vec4(pos,1.);
        vec3 n=normalize(normalMatrix*normal);
        vEdge=abs(dot(n,normalize(-mv.xyz)));vSide=n.x;
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader:`
      uniform float uTime;uniform float uFlash;uniform float uOpacity;
      varying vec2 vUv;varying float vEdge;varying float vSide;
      ${tornadoNoise}
      void main(){
        float h=vUv.y,a=vUv.x*6.2832+uTime*(2.6-1.4*h)+h*9.;
        float bands=noise(vec2(cos(a),sin(a))*2.4+vec2(0.,h*11.-uTime*1.1))*.55+noise(vec2(cos(a*3.),sin(a*3.))*2.+vec2(h*26.,uTime*.6))*.45;
        float lit=.5+.5*vSide;
        vec3 color=mix(vec3(.018,.024,.028),vec3(.16,.185,.19),lit*(.4+.6*bands));
        color+=vec3(.35,.4,.48)*uFlash*(.3+.7*bands);
        float alpha=smoothstep(0.,.5,vEdge)*(1.-smoothstep(.86,1.,h))*smoothstep(0.,.04,h)*(.8+.2*bands)*uOpacity;
        gl_FragColor=vec4(color,alpha);
      }`
  });
}
tornado.add(new THREE.Mesh(funnelGeometry,funnelMaterial(1.4,.3)));
tornado.add(new THREE.Mesh(funnelGeometry,funnelMaterial(1,1)));
// Soft masses: spray thrown up at the foot, and the lowered wall cloud the funnel hangs from.
function stormCloud(radius,flatten,dark,light,opacity){
  const cloud=new THREE.Mesh(
    new THREE.SphereGeometry(radius,24,12),
    new THREE.ShaderMaterial({
      transparent:true,depthWrite:false,fog:false,
      uniforms:{...tornadoUniforms,uDark:{value:new THREE.Color(dark)},uLight:{value:new THREE.Color(light)},uOpacity:{value:opacity}},
      vertexShader:`varying vec3 vLocal;varying float vEdge;
        void main(){vLocal=position;vec4 mv=modelViewMatrix*vec4(position,1.);vEdge=abs(dot(normalize(normalMatrix*normal),normalize(-mv.xyz)));gl_Position=projectionMatrix*mv;}`,
      fragmentShader:`
        uniform float uTime;uniform float uFlash;uniform float uOpacity;uniform vec3 uDark;uniform vec3 uLight;
        varying vec3 vLocal;varying float vEdge;
        ${tornadoNoise}
        void main(){
          float churn=noise(vLocal.xz*.3+vec2(uTime*.9,-uTime*.6))*.6+noise(vLocal.xy*.7-uTime*.5)*.4;
          gl_FragColor=vec4(mix(uDark,uLight,churn)+vec3(.3,.34,.4)*uFlash*churn,smoothstep(.08,.85,vEdge)*(.45+.55*churn)*uOpacity);
        }`
    })
  );
  cloud.scale.y=flatten;tornado.add(cloud);
  return cloud;
}
const tornadoSpray=stormCloud(14,.5,0x1a2022,0x566062,.8);tornadoSpray.position.y=3;
const wallCloud=stormCloud(62,.2,0x040607,0x161c1e,.95);wallCloud.position.set(14,TORNADO_HEIGHT+3,0);
// Debris: specks that spiral up out of the spray and are thrown clear.
const debrisCount=compactDevice?90:240;
const debrisSeeds=new Float32Array(debrisCount*4);
for(let i=0;i<debrisCount;i++)debrisSeeds.set([Math.random()*TAU,Math.random(),Math.random(),Math.random()],i*4);
const debrisGeometry=new THREE.BufferGeometry();
debrisGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(debrisCount*3),3));
debrisGeometry.setAttribute('aSeed',new THREE.BufferAttribute(debrisSeeds,4));
const debris=new THREE.Points(debrisGeometry,new THREE.ShaderMaterial({
  transparent:true,depthWrite:false,fog:false,uniforms:tornadoUniforms,
  vertexShader:`
    attribute vec4 aSeed;uniform float uTime;varying float vFade;
    void main(){
      float life=fract(aSeed.w+uTime*(.05+aSeed.z*.09));
      float y=life*life*30.;
      float a=aSeed.x+uTime*(1.5+aSeed.z*1.4)*(1.5-life*.7);
      float r=(2.5+aSeed.y*9.)*(1.+life*1.8);
      vec4 mv=modelViewMatrix*vec4(cos(a)*r,y+.5,sin(a)*r,1.);
      vFade=smoothstep(0.,.08,life)*(1.-life);
      gl_PointSize=min((1.6+aSeed.y*3.2)*320./-mv.z,9.);
      gl_Position=projectionMatrix*mv;
    }`,
  fragmentShader:`varying float vFade;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;gl_FragColor=vec4(.035,.04,.04,vFade*.85);}`
}));
debris.frustumCulled=false;tornado.add(debris);

// ── Shooting Stars ─────────────────────────────────────────────────────
const ssSegments=24;
const ssPositions=new Float32Array(ssSegments*2*3);
const ssUvs=new Float32Array(ssSegments*2*2);
const ssIndices=[];
for(let i=0;i<ssSegments;i++){
  const t=i/(ssSegments-1);
  ssUvs[i*4]=t;ssUvs[i*4+1]=0;ssUvs[i*4+2]=t;ssUvs[i*4+3]=1;
  if(i<ssSegments-1){const b=i*2;ssIndices.push(b,b+1,b+2,b+1,b+3,b+2);}
}
const ssGeo=new THREE.BufferGeometry();
ssGeo.setAttribute('position',new THREE.BufferAttribute(ssPositions,3).setUsage(THREE.DynamicDrawUsage));
ssGeo.setAttribute('uv',new THREE.Float32BufferAttribute(ssUvs,2));
ssGeo.setIndex(ssIndices);
const ssMaterial=new THREE.ShaderMaterial({
  transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
  uniforms:{uProgress:{value:-1}},
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`
    uniform float uProgress;varying vec2 vUv;
    void main(){
      if(uProgress<0.)discard;
      float along=vUv.x,across=abs(vUv.y-.5)*2.;
      float headDist=abs(along-uProgress);
      float head=exp(-headDist*headDist*900.);
      float behind=smoothstep(uProgress+.01,uProgress-.02,along);
      float fade=exp(-(uProgress-along)*3.5);
      float trail=behind*fade;
      float hw=exp(-across*across*28.);
      float tw=exp(-across*across*9.);
      float brightness=head*hw*3.+trail*tw*.6;
      if(brightness<.005)discard;
      vec3 hc=vec3(.93,.96,1.);vec3 tc=vec3(.80,.72,.50);
      vec3 col=mix(tc,hc,clamp(head/max(head+trail*.5,.001),0.,1.));
      gl_FragColor=vec4(col*brightness,brightness);
    }`
});
const shootingStar=new THREE.Mesh(ssGeo,ssMaterial);
shootingStar.frustumCulled=false;shootingStar.visible=false;scene.add(shootingStar);
const ssState={active:false,nextAt:range(8,15),progress:0,duration:0};
function activateShootingStar(){
  const a=range(0,TAU),elev=range(.3,.78),rad=210;
  const h=Math.sqrt(1-elev*elev);
  const start=new THREE.Vector3(Math.cos(a)*h*rad+camera.position.x,elev*rad,Math.sin(a)*h*rad+camera.position.z);
  const dir=new THREE.Vector3(range(-.8,.8),range(-.7,-.2),range(-.8,.8)).normalize();
  const len=range(16,32);
  const toCamera=new THREE.Vector3().subVectors(camera.position,start).normalize();
  const widthDir=new THREE.Vector3().crossVectors(dir,toCamera);
  if(widthDir.lengthSq()<.001)widthDir.crossVectors(dir,new THREE.Vector3(0,1,0));
  widthDir.normalize();
  const hw=.14;
  const pos=ssGeo.attributes.position;
  for(let i=0;i<ssSegments;i++){
    const t=i/(ssSegments-1);
    const px=start.x+dir.x*t*len,py=start.y+dir.y*t*len,pz=start.z+dir.z*t*len;
    const w=hw*(1-t*.7);
    pos.setXYZ(i*2,px-widthDir.x*w,py-widthDir.y*w,pz-widthDir.z*w);
    pos.setXYZ(i*2+1,px+widthDir.x*w,py+widthDir.y*w,pz+widthDir.z*w);
  }
  pos.needsUpdate=true;
  ssState.active=true;ssState.progress=-.1;ssState.duration=range(.35,.7);
  shootingStar.visible=true;ssMaterial.uniforms.uProgress.value=-.1;
}

const rainCount=compactDevice?520:900;
const rainPositions=new Float32Array(rainCount*6);
const rainSeeds=Array.from({length:rainCount},()=>({x:range(-45,45),z:range(-55,34),y:range(0,34),length:range(.3,.85),speed:range(11,17)}));
const rainGeometry=new THREE.BufferGeometry();
rainGeometry.setAttribute('position',new THREE.BufferAttribute(rainPositions,3).setUsage(THREE.DynamicDrawUsage));
const rain=new THREE.LineSegments(rainGeometry,new THREE.LineBasicMaterial({color:0xaec0c3,transparent:true,opacity:.24,depthWrite:false,fog:true}));
rain.frustumCulled=false;rain.visible=false;scene.add(rain);

const waterUniforms = {
  uTime: { value: 0 },
  uCamera: { value: camera.position.clone() },
  uMoon: { value: moonPosition.clone() },
  uWeather: { value: 0 },
  uReflection: { value: null },
  uTextureMatrix: { value: new THREE.Matrix4() },
  uBoatPosition: { value: new THREE.Vector2() },
  uBoatDirection: { value: new THREE.Vector2(0,-1) },
  uBoatSpeed: { value: 0 },
  uSurge: { value: 0 },
  uVortex: { value: new THREE.Vector3() },
  uWakePoints: { value: Array.from({length:16},()=>new THREE.Vector4(0,0,0,-1)) }
};
const waterWaves = `
  uniform float uTime;
  uniform float uWeather;
  uniform float uSurge;
  float waveHeight(vec2 p) {
    float t = uTime*(1.+.9*step(2.5,uWeather));
    return (1.+.24*step(1.5,uWeather)+.9*step(2.5,uWeather)+uSurge)*(.072 * sin(dot(p, vec2(.28, .96)) * .54 + t * .55)
         + .04 * sin(dot(p, vec2(-.61, .79)) * 1.13 - t * .91)
         + .018 * sin(dot(p, vec2(.86, .51)) * 2.27 + t * 1.38));
  }
  vec2 waveSlope(vec2 p, float detail) {
    float t = uTime*(1.+.9*step(2.5,uWeather));
    vec2 slope = .072 * .54 * vec2(.28, .96) * cos(dot(p, vec2(.28, .96)) * .54 + t * .55)
               + .04 * 1.13 * vec2(-.61, .79) * cos(dot(p, vec2(-.61, .79)) * 1.13 - t * .91)
               + .018 * 2.27 * vec2(.86, .51) * cos(dot(p, vec2(.86, .51)) * 2.27 + t * 1.38);
    vec2 warped = p + .31 * vec2(sin(p.y * .71 + t * .37), sin(p.x * .63 - t * .31));
    slope += detail * .021 * 3.8 * vec2(-.32, .95) * cos(dot(warped, vec2(-.32, .95)) * 3.8 - t * 1.68);
    slope += detail * .009 * 7.3 * vec2(.15, .99) * cos(dot(warped, vec2(.15, .99)) * 7.3 + t * 2.24);
    return slope*(1.+.24*step(1.5,uWeather)+.9*step(2.5,uWeather)+uSurge);
  }
`;
function waterHeight(x,z,time){
  if(weatherMode===3)time*=1.9;
  return (1+(weatherMode>=2?.24:0)+(weatherMode===3?.9:0)+waterUniforms.uSurge.value)*(.072*Math.sin((x*.28+z*.96)*.54+time*.55)
       + .04*Math.sin((x*-.61+z*.79)*1.13-time*.91)
       + .018*Math.sin((x*.86+z*.51)*2.27+time*1.38));
}
const waterSegments=compactDevice?144:220,waterCell=600/waterSegments;
const water = new THREE.Mesh(
  new THREE.PlaneGeometry(600, 600, waterSegments, waterSegments),
  new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    side: THREE.DoubleSide,
    vertexShader: `
      ${waterWaves}
      uniform mat4 uTextureMatrix;
      varying vec3 vWorld; varying vec4 vMirrorCoord;
      void main(){
        vec4 world=modelMatrix*vec4(position,1.);
        world.y += waveHeight(world.xz);
        vWorld=world.xyz;
        vMirrorCoord=uTextureMatrix*vec4(position,1.);
        gl_Position=projectionMatrix*viewMatrix*world;
      }`,
    fragmentShader: `
      #define REFLECTION_TAPS ${compactDevice?2:4}
      ${waterWaves}
      ${channelGLSL}
      uniform vec3 uCamera; uniform vec3 uMoon;
      uniform sampler2D uReflection;
      uniform vec2 uBoatPosition; uniform vec2 uBoatDirection; uniform float uBoatSpeed; uniform vec3 uVortex;
      uniform vec4 uWakePoints[16];
      varying vec3 vWorld; varying vec4 vMirrorCoord;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
      vec3 rainRipple(vec2 p){
        vec2 cell=floor(p/1.45);
        vec2 jitter=vec2(hash(cell+vec2(12.7,4.3)),hash(cell+vec2(6.2,19.1)));
        vec2 center=(cell+.28+jitter*.44)*1.45;
        float age=mod(uTime+hash(cell+vec2(31.4,8.6))*2.65,2.65);
        float distanceFromDrop=length(p-center);
        float radius=.035+age*.43;
        float width=.035+age*.018;
        float life=1.-smoothstep(.65,1.16,age);
        float primary=exp(-pow((distanceFromDrop-radius)/width,2.));
        float secondary=exp(-pow((distanceFromDrop-radius*.58)/(width*1.18),2.))*.27*smoothstep(.16,.42,age);
        float ring=(primary+secondary)*life;
        float dimple=exp(-pow(distanceFromDrop/.075,2.))*exp(-age*9.);
        vec2 radial=(p-center)/max(distanceFromDrop,.001);
        float slope=primary*clamp((distanceFromDrop-radius)/width,-1.,1.)*life;
        return vec3(radial*(slope*.21+dimple*.05),ring);
      }
      vec3 wakeDisturbance(vec2 p){
        vec2 disturbedSlope=vec2(0.);
        float churn=0.;
        for(int i=0;i<16;i++){
          vec4 point=uWakePoints[i];
          if(point.w<0.||point.w>5.)continue;
          vec2 travel=vec2(-sin(point.z),-cos(point.z));
          vec2 across=vec2(-travel.y,travel.x);
          vec2 delta=p-point.xy;
          float along=dot(delta,-travel);
          float side=dot(delta,across);
          float spread=.58+point.w*.22+max(along,0.)*.08;
          float ridge=abs(side)-spread;
          float band=exp(-pow(along/(.69+point.w*.24),2.)-pow(ridge/(.18+point.w*.055),2.));
          float life=1.-smoothstep(1.1,5.,point.w);
          float texture=.42+.58*noise(p*4.2+vec2(uTime*.46,-uTime*.31)+float(i)*.71);
          float phase=sin(ridge*20.-uTime*5.1+point.w*2.3);
          disturbedSlope+=across*sign(side)*band*phase*life*.024;
          churn+=band*texture*life;
        }
        return vec3(disturbedSlope,min(churn,1.));
      }
      void main(){
        vec2 p=vWorld.xz;
        vec2 relativeToBoat=p-uBoatPosition;
        float distanceToCamera=distance(p,uCamera.xz);
        float detail=1.-smoothstep(36.,125.,distanceToCamera);
        vec2 slope=waveSlope(p,detail);
        float rainDetail=step(1.5,uWeather)*(1.-smoothstep(19.,48.,distanceToCamera));
        vec3 drops=vec3(0.);
        if(rainDetail>0.){
          drops=rainRipple(p);
          slope+=drops.xy*rainDetail;
        }
        vec3 wake=vec3(0.);
        if(distance(p,uBoatPosition)<24.){
          wake=wakeDisturbance(p);
          slope+=wake.xy;
        }
        vec3 normal=normalize(vec3(-slope.x,1.,-slope.y));
        vec3 viewDirection=normalize(uCamera-vWorld);
        vec3 reflection=reflect(-viewDirection,normal);
        float ndotv=max(dot(normal,viewDirection),0.);
        float fresnel=pow(1.-ndotv,3.);

        float cloud=noise(reflection.xz*8.+p*.017+uTime*.014);
        float dawn=1.-step(.5,abs(uWeather-1.));
        float rain=step(1.5,uWeather);
        vec3 deep=mix(vec3(.011,.033,.030),vec3(.10,.064,.066),dawn);
        deep=mix(deep,vec3(.021,.039,.046),rain);
        vec3 reflectedSky=mix(vec3(.031,.080,.100),vec3(.076,.126,.139),smoothstep(.34,.72,cloud));
        reflectedSky=mix(reflectedSky,vec3(.28,.16,.17),dawn);
        reflectedSky=mix(reflectedSky,vec3(.075,.098,.105),rain);
        vec3 color=mix(deep,reflectedSky,.32+.55*fresnel);
        color+=vec3(.010,.025,.028)*max(dot(normal,normalize(vec3(-.2,1.,-.35))),0.);

        // Ripples smear a mirror image along the line of sight far more than across it,
        // and still water mirrors best at a grazing angle.
        vec2 towardViewer=normalize(uCamera.xz-p+vec2(.0001));
        float tilt=dot(slope,towardViewer),skew=dot(slope,vec2(-towardViewer.y,towardViewer.x));
        float grazing=1.-clamp(viewDirection.y,0.,1.);
        float boatProximity=1.-smoothstep(1.4,6.5,length(relativeToBoat));
        vec2 smear=vec2(skew*(.04+.08*ndotv),tilt*(.1+.42*grazing*grazing))*(1.+boatProximity*.6);
        vec2 mirrorUv=vMirrorCoord.xy/vMirrorCoord.w;
        vec3 reflectedScene=vec3(0.);
        for(int i=0;i<REFLECTION_TAPS;i++){
          reflectedScene+=texture2D(uReflection,mirrorUv+smear*mix(.55,1.45,(float(i)+.5)/float(REFLECTION_TAPS))).rgb;
        }
        reflectedScene/=float(REFLECTION_TAPS);
        reflectedScene*=mix(vec3(.80,.93,.86),vec3(1.),dawn*.5);
        color=mix(color,reflectedScene,(.42+.58*fresnel)*(1.-boatProximity*.45)*(1.-rain*.28));

        // Duckweed gathers in the slack water along the banks.
        float shoreDistance=min(p.x-shoreX(-1.,p.y),shoreX(1.,p.y)-p.x);
        float scumField=noise(p*.3)*.6+noise(p*1.1+7.3)*.4;
        float scum=smoothstep(.5,.66,scumField+.3*(1.-clamp(shoreDistance/9.,0.,1.)))*smoothstep(10.,3.,shoreDistance)*(.72+.28*noise(p*7.));
        vec3 scumColor=mix(vec3(.030,.062,.024),vec3(.13,.12,.05),dawn);
        scumColor=mix(scumColor,vec3(.035,.055,.035),rain);
        scumColor*=.75+.5*max(dot(normal,normalize(vec3(-.2,1.,-.35))),0.);
        color=mix(color,scumColor,scum*.82);

        vec3 moonDirection=normalize(uMoon-uCamera);
        float alignment=max(dot(reflection,moonDirection),0.);
        float softGlare=pow(alignment,24.)*.13;
        float brokenReflection=pow(alignment,92.)*.42;
        float sharpGlint=pow(alignment,360.)*1.65;
        float facets=.63+.37*sin(p.y*9.4+uTime*2.0+sin(p.x*1.3))
                             *sin(p.x*4.7-p.y*1.6-uTime*1.3);
        vec2 moonPath=normalize(uMoon.xz-uCamera.xz);
        float along=dot(p-uCamera.xz,moonPath);
        float sideways=dot(p-uCamera.xz,vec2(-moonPath.y,moonPath.x));
        float pathWidth=1.15+max(along,0.)*.043;
        float path=exp(-pow(sideways/pathWidth,2.))*smoothstep(1.,10.,along);
        float pathGlow=path*(.023+.024*noise(p*.24+uTime*.08));
        vec3 lightColor=mix(vec3(.91,.86,.70),vec3(1.,.55,.30),dawn);
        color+=lightColor*(softGlare+brokenReflection+sharpGlint*facets+pathGlow)*(1.-rain*.97)*(1.-scum*.9);
        // Gale: pale streaks torn off the crests.
        float crest=smoothstep(.07,.2,waveHeight(p))*smoothstep(.45,.75,noise(p*vec2(.9,2.6)+vec2(uTime*1.7,0.)));
        color+=vec3(.06,.072,.076)*crest*step(2.5,uWeather)*(1.-scum);
        // Waterspout: a boiling ring of spray where the funnel meets the water.
        vec2 fromVortex=p-uVortex.xy;float vortexDistance=length(fromVortex);
        if(uVortex.z>0.&&vortexDistance<60.){
          vec2 spin=fromVortex/max(vortexDistance,.01);
          float angle=uTime*1.7-vortexDistance*.22;
          vec2 swirled=vec2(spin.x*cos(angle)-spin.y*sin(angle),spin.x*sin(angle)+spin.y*cos(angle));
          float froth=noise(swirled*9.+vec2(vortexDistance*.9-uTime*2.5,0.))*.55+noise(p*4.3-uTime*1.6)*.45;
          float ring=exp(-pow((vortexDistance-8.)/5.,2.))+.3*smoothstep(34.,6.,vortexDistance);
          color+=vec3(.13,.155,.16)*ring*smoothstep(.45,.8,froth)*uVortex.z;
        }
        float dropGlint=drops.z*rainDetail*(.25+.75*max(dot(normal,normalize(vec3(.3,1.,-.4))),0.));
        color+=vec3(.023,.032,.035)*dropGlint;

        color+=vec3(.045,.076,.08)*wake.z*(.58+.42*max(dot(normal,viewDirection),0.));

        color=mix(color,vec3(.042,.079,.092),smoothstep(115.,290.,distanceToCamera)*.48);
        gl_FragColor=vec4(color,1.);
      }`
  })
);
water.rotation.x = -Math.PI / 2;
water.position.y = -.38;
scene.add(water);
const reflector=new Reflector(new THREE.PlaneGeometry(600,600),{
  textureWidth:Math.max(192,Math.floor(innerWidth*reflectionPixelRatio*reflectionScale)),
  textureHeight:Math.max(192,Math.floor(innerHeight*reflectionPixelRatio*reflectionScale)),
  clipBias:.003,
  multisample:0
});
reflector.rotation.x=-Math.PI/2;
reflector.position.y=-.38;
reflector.renderOrder=-10;
reflector.material.colorWrite=false;
reflector.material.depthWrite=false;
const renderReflection=reflector.onBeforeRender;
reflector.onBeforeRender=function(...args){
  const rainWasVisible=rain.visible;
  water.visible=false;
  rain.visible=false;
  try { renderReflection.apply(this,args); }
  finally { water.visible=true;rain.visible=rainWasVisible; }
};
waterUniforms.uReflection.value=reflector.getRenderTarget().texture;
waterUniforms.uTextureMatrix.value=reflector.material.uniforms.textureMatrix.value;
scene.add(reflector);

// ── Mist Patches ───────────────────────────────────────────────────────
const mistCount=compactDevice?22:56;
const mistPatches=[];
const mistMaterial=new THREE.ShaderMaterial({
  transparent:true,depthWrite:false,side:THREE.DoubleSide,fog:false,
  uniforms:{uTime:{value:0},uWeather:{value:0}},
  vertexShader:`varying vec2 vUv;varying vec2 vWorld;
    void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xz;gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:`
    uniform float uTime;uniform float uWeather;varying vec2 vUv;varying vec2 vWorld;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
    void main(){
      vec2 p=vWorld*.14+vec2(uTime*.012,uTime*.007);
      float n=noise(p)*.55+noise(p*2.15+3.7)*.28+noise(p*4.4-1.2)*.14;
      float edge=smoothstep(0.,.22,vUv.x)*smoothstep(1.,.78,vUv.x)*smoothstep(0.,.22,vUv.y)*smoothstep(1.,.78,vUv.y);
      float density=1.+step(1.5,uWeather)*.6;
      float dawn=1.-step(.5,abs(uWeather-1.));
      float alpha=smoothstep(.3,.58,n)*edge*.24*density;
      vec3 col=mix(vec3(.10,.17,.20),vec3(.22,.16,.15),dawn);
      gl_FragColor=vec4(col,alpha);
    }`
});
for(let i=0;i<mistCount;i++){
  const size=range(12,22);
  const mist=new THREE.Mesh(new THREE.PlaneGeometry(size,size),mistMaterial);
  mist.rotation.x=-Math.PI/2;mist.position.z=range(RIDE_END-30,62);mist.position.x=channelCenter(mist.position.z)+range(-17,17);mist.position.y=range(-.12,.5);
  mist.userData.driftPhase=range(0,TAU);mist.userData.homeX=mist.position.x;mist.userData.homeZ=mist.position.z;
  mistPatches.push(mist);scene.add(mist);
}

// ── Fish Ripple Events ─────────────────────────────────────────────────
const maxSplashes=5;
const splashUniforms={uTime:{value:0},uSplashes:{value:Array.from({length:maxSplashes},()=>new THREE.Vector4(0,0,-10,0))}};
const fishRippleOverlay=new THREE.Mesh(
  new THREE.PlaneGeometry(90,280),
  new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
    polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
    uniforms:splashUniforms,
    vertexShader:`varying vec2 vWorld;void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader:`
      uniform float uTime;uniform vec4 uSplashes[${maxSplashes}];varying vec2 vWorld;
      void main(){
        float total=0.;
        for(int i=0;i<${maxSplashes};i++){
          float age=uTime-uSplashes[i].z;
          if(age<0.||age>4.)continue;
          float dist=length(vWorld-uSplashes[i].xy);
          float radius=age*1.4;float rw=.06+age*.025;
          float r1=exp(-pow((dist-radius)/rw,2.));
          float r2=exp(-pow((dist-radius*.6)/(rw*1.3),2.))*.45;
          float r3=exp(-pow((dist-radius*.3)/(rw*1.6),2.))*.2;
          float life=1.-smoothstep(1.8,4.,age);
          total+=(r1+r2+r3)*life;
        }
        total=min(total,1.);
        gl_FragColor=vec4(vec3(.055,.11,.13)*total*1.5,total*.13);
      }`
  })
);
fishRippleOverlay.rotation.x=-Math.PI/2;fishRippleOverlay.position.set(0,-.37,-40);
fishRippleOverlay.frustumCulled=false;scene.add(fishRippleOverlay);
let splashCursor=0,nextSplashAt=range(3,7);

const soil = new THREE.MeshBasicMaterial({ color: 0x061315, side: THREE.DoubleSide, fog: true });
const swayingTrees = [];

function leafTexture() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d');
  for(let i=0;i<330;i++){
    const a=range(0,TAU),r=Math.sqrt(random())*112;
    const x=128+Math.cos(a)*r,y=128+Math.sin(a)*r*.82;
    const length=range(6,14),width=range(2.2,5.6);
    ctx.save();ctx.translate(x,y);ctx.rotate(range(0,TAU));
    ctx.fillStyle=['#102b1b','#163922','#1c4027','#254b2d','#143322'][Math.floor(random()*5)];
    ctx.beginPath();ctx.moveTo(-length*.5,0);
    ctx.quadraticCurveTo(0,-width,length*.5,0);
    ctx.quadraticCurveTo(0,width,-length*.5,0);ctx.fill();
    if(random()>.78){ctx.strokeStyle='rgba(105,136,107,.28)';ctx.lineWidth=.65;ctx.beginPath();ctx.moveTo(-length*.4,0);ctx.lineTo(length*.4,0);ctx.stroke();}
    ctx.restore();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);
  return texture;
}
function barkTexture() {
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=256;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#25342f';ctx.fillRect(0,0,128,256);
  for(let i=0;i<100;i++){
    const x=range(0,128),y=range(0,256),length=range(12,70);
    ctx.strokeStyle=random()>.5?'rgba(10,25,23,.42)':'rgba(91,113,95,.22)';
    ctx.lineWidth=range(.5,2.2);ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x+range(-4,4),y+length*.3,x+range(-4,4),y+length*.7,x+range(-3,3),y+length);ctx.stroke();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}
const foliageMaterial=windSway(new THREE.MeshLambertMaterial({map:leafTexture(),color:0xb6cdb0,side:THREE.DoubleSide,transparent:true,alphaTest:.25,depthWrite:true}),1.7,.02);
const barkMaterial=new THREE.MeshStandardMaterial({map:barkTexture(),color:0x87958c,roughness:1});
const branchGeometry=new THREE.CylinderGeometry(.65,1,1,7,4);
function branchBetween(start,end,radius) {
  const direction=new THREE.Vector3().subVectors(end,start);
  const mesh=new THREE.Mesh(branchGeometry,barkMaterial);
  mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.scale.set(radius,direction.length(),radius);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
  return mesh;
}
function addFoliageQuad(vertices,uvs,indices,center,width,height,angle) {
  const x=Math.cos(angle)*width*.5,z=Math.sin(angle)*width*.5;
  const base=vertices.length/3;
  vertices.push(center.x-x,center.y-height*.5,center.z-z,
                center.x+x,center.y-height*.5,center.z+z,
                center.x+x,center.y+height*.5,center.z+z,
                center.x-x,center.y+height*.5,center.z-z);
  uvs.push(0,0,1,0,1,1,0,1);
  indices.push(base,base+1,base+2,base,base+2,base+3);
}
function createDetailedTree(x,z,scale) {
  const group=new THREE.Group();
  const lean=new THREE.Vector3(range(-.23,.23)*scale,3.7*scale,range(-.19,.19)*scale);
  group.add(branchBetween(new THREE.Vector3(),lean,.24*scale));
  const vertices=[],uvs=[],indices=[];
  for(let i=0;i<8;i++){
    const a=i*2.399+range(-.28,.28);
    const spread=range(.87,1.82)*scale;
    const tip=new THREE.Vector3(lean.x+Math.cos(a)*spread,range(3.05,5.6)*scale,lean.z+Math.sin(a)*spread*.83);
    const origin=new THREE.Vector3(lean.x*.52,range(2.15,3.15)*scale,lean.z*.52);
    group.add(branchBetween(origin,tip,range(.055,.11)*scale));
    for(let layer=0;layer<2;layer++){
      const center=tip.clone().add(new THREE.Vector3(range(-.37,.37)*scale,range(-.29,.31)*scale,range(-.37,.37)*scale));
      const size=range(1.45,2.15)*scale;
      addFoliageQuad(vertices,uvs,indices,center,size,size*.88,a+layer*Math.PI*.5);
    }
  }
  for(let i=0;i<5;i++){
    const a=range(0,TAU),radius=range(0,.9)*scale;
    const center=new THREE.Vector3(lean.x+Math.cos(a)*radius,range(4.5,6.0)*scale,lean.z+Math.sin(a)*radius);
    const size=range(1.25,1.9)*scale;
    addFoliageQuad(vertices,uvs,indices,center,size,size*.95,a);
    addFoliageQuad(vertices,uvs,indices,center,size,size*.95,a+Math.PI*.5);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  group.add(new THREE.Mesh(geometry,foliageMaterial));
  group.position.set(x,.52,z);group.rotation.y=range(0,TAU);scene.add(group);
  swayingTrees.push({group,phase:range(0,TAU),strength:range(.003,.01)});
}

const bushVertices=[],bushUvs=[],bushIndices=[];
for(let i=0;i<4;i++)addFoliageQuad(bushVertices,bushUvs,bushIndices,new THREE.Vector3(0,.8,0),2.2,1.65,i*Math.PI/4);
const bushGeometry=new THREE.BufferGeometry();
bushGeometry.setAttribute('position',new THREE.Float32BufferAttribute(bushVertices,3));
bushGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(bushUvs,2));
bushGeometry.setIndex(bushIndices);bushGeometry.computeVertexNormals();

function makeBank(side) {
  const vertices=[]; const indices=[]; const steps=Math.ceil((RIDE_START+12-(RIDE_END-95))/3.8);
  for (let i=0;i<=steps;i++) {
    const z=RIDE_END-95+i*3.8, edge=shoreX(side,z);
    vertices.push(edge,-.33,z, edge+side*8,.62+Math.sin(z*.16)*.27,z, edge+side*24,1.7+Math.sin(z*.055)*.5,z, edge+side*80,2.6,z);
    if(i<steps){const a=i*4; indices.push(a,a+1,a+4,a+1,a+5,a+4,a+1,a+2,a+5,a+2,a+6,a+5,a+2,a+3,a+6,a+3,a+7,a+6);}
  }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)); g.setIndex(indices); g.computeVertexNormals();
  const mesh=new THREE.Mesh(g,soil); scene.add(mesh);
}
makeBank(-1); makeBank(1);

// The forest is instanced per stretch of bank, so stretches lost in the haze can be skipped.
const FOREST_CHUNK=70,FOREST_RANGE=compactDevice?215:300;
const forestChunks=[];
const groundHeight=inset=>inset<8?lerp(-.33,.62,inset/8):inset<24?lerp(.62,1.7,(inset-8)/16):lerp(1.7,2.6,Math.min((inset-24)/56,1));
async function loadShorelineTrees() {
  try {
    const loader=new GLTFLoader();
    // [model, scale that brings it to the shared base height]
    const species=[['oak',1],['willow',1],['slim',1],['palm',.8],['banyan',1],['kapok',.85],['cypress',.6],['mangrove',1.15],['snag',.9]];
    const models=await Promise.all(species.map(([name])=>loader.loadAsync(`/models/${name}.glb`)));
    for(const model of models)model.scene.traverse(object=>{
      if(object.isMesh){
        object.castShadow=false;
        object.receiveShadow=false;
        for(const material of Array.isArray(object.material)?object.material:[object.material]){
          material.side=THREE.DoubleSide;
          if(material.name.includes('deep leaves')){material.color.setHex(0x143b24);windSway(material,6.5,.012);}
          else if(material.name.includes('moonlit leaves')){material.color.setHex(0x285534);windSway(material,6.5,.012);}
          else if(material.name.includes('moss')){material.color.setHex(0x3f5546);windSway(material,6.5,.03);}
          else if(material.name.includes('bark')){material.color.setHex(0x19291e);windSway(material,6.5,0);}
        }
      }
    });
    const pools={
      water:[6,6,6,7,7,8],
      front:[0,1,1,2,4,4,5,6,7],
      middle:[0,2,3,4,4,5,5,6],
      back:[3,4,5,5,6,6],
      giants:[4,5,5,6,6,6]
    };
    const placements=[];
    const turn=new THREE.Quaternion(),upright=new THREE.Vector3(0,1,0);
    function plantTree(side,z,inset,scale,pool){
      const choice=pool[Math.floor(random()*pool.length)],size=scale*species[choice][1];
      const position=new THREE.Vector3(shoreX(side,z)+side*inset,inset<0?water.position.y:groundHeight(inset)-.12*size,z);
      const stretch=new THREE.Vector3(size*range(.87,1.14),size*range(.92,1.17),size*range(.87,1.14));
      const chunk=Math.floor((RIDE_START+30-z)/FOREST_CHUNK);
      (placements[chunk]??=models.map(()=>[]))[choice].push(new THREE.Matrix4().compose(position,turn.setFromAxisAngle(upright,range(0,TAU)),stretch));
    }
    const spacing=compactDevice?1.8:1;
    const bushes=[];
    for(const side of [-1,1]){
      for(let z=RIDE_END-90;z<RIDE_START+12;z+=range(4.6,6.4)*spacing){
        plantTree(side,z,range(1,4),range(1.3,2),pools.front);
        if(random()<.55)plantTree(side,z+range(-2,2),range(-3,-.4),range(1.3,2.2),pools.water);
        if(random()<.75)plantTree(side,z+range(-3,3),range(5,12),range(2,3),pools.middle);
        if(random()<.6)plantTree(side,z+range(-4,4),range(12,24),range(2.8,4),pools.back);
        if(random()<.42)plantTree(side,z+range(-5,5),range(22,48),range(4,5.6),pools.giants);
      }
      for(let z=RIDE_END-60;z<RIDE_START+10;z+=range(3.8,5.8)*spacing){
        const size=range(.43,.88);
        bushes.push(new THREE.Matrix4().compose(new THREE.Vector3(shoreX(side,z)+side*range(.5,3.4),.2,z+range(-1.8,1.8)),turn.setFromAxisAngle(upright,range(0,TAU)),new THREE.Vector3(size,size,size)));
      }
    }
    const bushInstances=new THREE.InstancedMesh(bushGeometry,foliageMaterial,bushes.length);
    bushes.forEach((matrix,i)=>bushInstances.setMatrixAt(i,matrix));
    bushInstances.frustumCulled=false;scene.add(bushInstances);
    const composed=new THREE.Matrix4();
    for(const model of models)model.scene.updateMatrixWorld(true);
    placements.forEach((bySpecies,index)=>{
      const chunk=new THREE.Group();
      chunk.userData.z=RIDE_START+30-(index+.5)*FOREST_CHUNK;
      bySpecies.forEach((matrices,choice)=>{
        if(!matrices.length)return;
        models[choice].scene.traverse(source=>{
          if(!source.isMesh)return;
          const instances=new THREE.InstancedMesh(source.geometry,source.material,matrices.length);
          instances.instanceMatrix.setUsage(THREE.StaticDrawUsage);
          matrices.forEach((matrix,i)=>instances.setMatrixAt(i,composed.multiplyMatrices(matrix,source.matrixWorld)));
          instances.instanceMatrix.needsUpdate=true;
          instances.computeBoundingSphere();
          chunk.add(instances);
        });
      });
      scene.add(chunk);forestChunks.push(chunk);
    });
  } catch (cause) {
    console.error('Blender trees could not load; using procedural shoreline:',cause);
    for(const side of [-1,1])for(let z=RIDE_END-40;z<RIDE_START+11;z+=range(4.5,6.5)){
      createDetailedTree(shoreX(side,z)+side*range(2,14),z,range(1.4,3.2));
    }
  } finally {
    loading.classList.add('is-hidden');
    setTimeout(()=>loading.hidden=true,850);
  }
}
loadShorelineTrees();
const ridgeShape=new THREE.Shape(); ridgeShape.moveTo(-250,-.35);
for(let x=-250;x<=250;x+=6)ridgeShape.lineTo(x,1.8+Math.sin(x*.019)*1.1+Math.sin(x*.063)*.45+range(-.2,.2));
ridgeShape.lineTo(250,-2); ridgeShape.lineTo(-250,-2);
const ridge=new THREE.Mesh(new THREE.ShapeGeometry(ridgeShape),new THREE.MeshBasicMaterial({color:0x0b1c20,side:THREE.DoubleSide,fog:true}));
ridge.position.z=-178; ridge.frustumCulled=false; scene.add(ridge);

const stoneMaterial=new THREE.MeshStandardMaterial({color:0x172724,roughness:1});
for(let i=0;i<(compactDevice?110:240);i++){
  const side=random()>.5?1:-1, z=range(RIDE_END-20,82), edge=shoreX(side,z), x=edge+side*range(-.6,8);
  const stone=new THREE.Mesh(new THREE.IcosahedronGeometry(1,2),stoneMaterial);
  stone.position.set(x,range(-.18,.22),z); stone.scale.set(range(.3,1.4),range(.2,.7),range(.4,1.3)); stone.rotation.y=range(0,TAU); scene.add(stone);
}

const boat=new THREE.Group();
const hull=new THREE.Group(); boat.add(hull);
function woodTexture(){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#79513a';ctx.fillRect(0,0,512,256);
  for(let i=0;i<320;i++){
    const y=range(0,256),bend=range(-8,8);
    ctx.strokeStyle=random()>.48?`rgba(27,16,11,${range(.035,.18)})`:`rgba(239,192,142,${range(.025,.12)})`;
    ctx.lineWidth=range(.3,2.2);ctx.beginPath();ctx.moveTo(-5,y);
    ctx.bezierCurveTo(130,y+bend,285,y-bend,518,y+range(-5,5));ctx.stroke();
  }
  for(let i=0;i<12;i++){
    const x=range(25,488),y=range(20,236),r=range(3,11);
    ctx.strokeStyle='rgba(40,22,14,.24)';ctx.lineWidth=range(1,2.5);
    ctx.beginPath();ctx.ellipse(x,y,r*2,r*.5,range(-.13,.13),0,TAU);ctx.stroke();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=THREE.RepeatWrapping;texture.repeat.set(1.6,1);
  texture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);
  return texture;
}
const grain=woodTexture();
const wood=new THREE.MeshStandardMaterial({map:grain,color:0xc4a78e,roughness:.9,side:THREE.DoubleSide});
const woodLit=new THREE.MeshStandardMaterial({map:grain,color:0xe1c3a1,roughness:.82,side:THREE.DoubleSide});
const woodDark=new THREE.MeshStandardMaterial({map:grain,color:0x87634c,roughness:.96,side:THREE.DoubleSide});
const rimMaterial=new THREE.MeshStandardMaterial({map:grain,color:0xd9b48b,roughness:.77});
const iron=new THREE.MeshStandardMaterial({color:0x3a3e37,metalness:.55,roughness:.68});
// Wasen-style river boat: flat bottom, hard chine, long raked bow, lifted stern.
const BOAT_BOW=-3.6,BOAT_LENGTH=7,HULL_SEGMENTS=32;
const boatT=z=>(z-BOAT_BOW)/BOAT_LENGTH;
function boatProfile(t){
  const fore=Math.pow(Math.sin(Math.PI*.5*clamp(t/.58,0,1)),.85);
  const aft=clamp((t-.58)/.42,0,1);
  const lift=THREE.MathUtils.smoothstep(t,.7,1);
  const keel=-.34+.95*Math.pow(Math.max(0,1-t/.34),2)+.3*Math.pow(lift,1.5);
  const rail=.33+.63*Math.pow(Math.max(0,1-t/.4),2.2)+.2*lift*lift;
  return {z:BOAT_BOW+t*BOAT_LENGTH,w:.03+.75*fore*(1-.36*aft*aft),rail,keel,knuckle:keel+(rail-keel)*.44};
}
const boatSections=Array.from({length:HULL_SEGMENTS+1},(_,i)=>boatProfile(i/HULL_SEGMENTS));
const insideLevels=p=>[[p.w*.93,p.rail-.03],[p.w*.8,p.knuckle+.01],[p.w*.56,p.keel+.065],[0,p.keel+.06]];
function insideHalfWidth(p,y){
  const [[topX,topY],[midX,midY],[lowX,lowY]]=insideLevels(p);
  return y>midY?lerp(midX,topX,clamp((y-midY)/(topY-midY),0,1)):lerp(lowX,midX,clamp((y-lowY)/(midY-lowY),0,1));
}
function surface(vertices,uvs,indices,material){
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,material);hull.add(mesh);
  return mesh;
}
function hullSurface(side,levels,material){
  const vertices=[],uvs=[],indices=[];
  boatSections.forEach((p,i)=>levels(p).forEach(([x,y],j)=>{
    vertices.push(side*x,y,p.z);uvs.push(i/HULL_SEGMENTS*5,j/(levels(p).length-1));
  }));
  const rows=levels(boatSections[0]).length;
  for(let i=0;i<HULL_SEGMENTS;i++)for(let j=0;j<rows-1;j++){
    const a=i*rows+j,b=(i+1)*rows+j;
    indices.push(a,b,a+1,b,b+1,a+1);
  }
  return surface(vertices,uvs,indices,material);
}
function deckSurface(from,to,height,material,halfWidth=insideHalfWidth){
  const vertices=[],uvs=[],indices=[];
  for(let i=from;i<=to;i++){
    const p=boatSections[i],y=height(p),w=halfWidth(p,y);
    vertices.push(-w,y,p.z,w,y,p.z);uvs.push(p.z*.6,.5-w*.5,p.z*.6,.5+w*.5);
    if(i<to){const a=(i-from)*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
  }
  return surface(vertices,uvs,indices,material);
}
function bulkhead(p,top,material){
  const [,[midX,midY],[lowX,lowY]]=insideLevels(p),topX=insideHalfWidth(p,top);
  return surface(
    [-topX,top,p.z,topX,top,p.z,-midX,midY,p.z,midX,midY,p.z,-lowX,lowY,p.z,lowX,lowY,p.z],
    [0,1,1,1,.04,.5,.96,.5,.18,0,.82,0],[0,2,1,1,2,3,2,4,3,3,4,5],material
  );
}
function tube(points,radius,material){
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
  return new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(28,points.length*2),radius,8,false),material);
}
for(const side of [-1,1]){
  hullSurface(side,p=>[[p.w,p.rail],[p.w*.86,p.knuckle],[p.w*.6,p.keel+.02],[0,p.keel]],wood);
  hullSurface(side,insideLevels,woodDark);
  hull.add(tube(boatSections.map(p=>[side*p.w,p.rail,p.z]),.045,rimMaterial));
  hull.add(tube(boatSections.map(p=>[side*p.w*.92,p.rail-.04,p.z]),.02,woodLit));
  hull.add(tube(boatSections.slice(1).map(p=>[side*(p.w*.86+.006),p.knuckle,p.z]),.013,woodDark));
  hull.add(tube(boatSections.slice(2,-1).map(p=>[side*p.w*.8,p.knuckle+.012,p.z]),.009,woodLit));
}
const bowSection=boatSections[0],stern=boatSections[HULL_SEGMENTS];
hull.add(tube([
  [0,boatProfile(.07).keel-.02,BOAT_BOW+.49],[0,bowSection.keel-.03,BOAT_BOW-.01],
  [0,bowSection.rail+.03,BOAT_BOW-.05],[0,bowSection.rail+.18,BOAT_BOW-.11]
],.042,rimMaterial));
surface([
  -stern.w,stern.rail,stern.z,stern.w,stern.rail,stern.z,
  -stern.w*.86,stern.knuckle,stern.z,stern.w*.86,stern.knuckle,stern.z,
  -stern.w*.6,stern.keel+.02,stern.z,stern.w*.6,stern.keel+.02,stern.z,
  0,stern.keel,stern.z
],[0,1,1,1,.07,.45,.93,.45,.2,.04,.8,.04,.5,0],[0,2,1,1,2,3,2,4,3,3,4,5,4,6,5],wood);
for(const x of [-stern.w*.42,0,stern.w*.42]){
  hull.add(tube([[x,stern.rail-.05,stern.z+.008],[x*.9,stern.keel+.05,stern.z+.008]],.008,woodDark));
}
// Cross beams run past the planking, as on a wasen.
const sternBeam=new THREE.Mesh(new THREE.BoxGeometry(stern.w*2+.2,.07,.11),rimMaterial);
sternBeam.position.set(0,stern.rail+.005,stern.z-.05);hull.add(sternBeam);
const bowBeamProfile=boatProfile(.2);
const bowBeam=new THREE.Mesh(new THREE.BoxGeometry(bowBeamProfile.w*2+.18,.065,.11),rimMaterial);
bowBeam.position.set(0,bowBeamProfile.rail-.01,bowBeamProfile.z);hull.add(bowBeam);
for(const z of [-1.55,-.1,1.25]){
  const p=boatProfile(boatT(z)),y=p.rail-.07;
  const beam=new THREE.Mesh(new THREE.BoxGeometry(insideHalfWidth(p,y)*2,.07,.13),rimMaterial);
  beam.position.set(0,y,z);hull.add(beam);
}
const bowDeckEnd=6,sternDeckStart=26,sternDeckY=.3;
const bowDeckHeight=p=>p.rail-.06;
deckSurface(0,bowDeckEnd,bowDeckHeight,woodLit);
bulkhead(boatSections[bowDeckEnd],bowDeckHeight(boatSections[bowDeckEnd]),wood);
deckSurface(sternDeckStart,HULL_SEGMENTS,()=>sternDeckY,woodLit);
bulkhead(boatSections[sternDeckStart],sternDeckY,wood);
for(const index of [sternDeckStart,sternDeckStart+2,sternDeckStart+4]){
  const p=boatSections[index],w=insideHalfWidth(p,sternDeckY);
  hull.add(tube([[-w,sternDeckY+.004,p.z],[w,sternDeckY+.004,p.z]],.008,woodDark));
}
for(let z=-1.7,i=0;z<2.02;z+=.21,i++){
  const p=boatProfile(boatT(z));
  const slat=new THREE.Mesh(new THREE.BoxGeometry(p.w*1.12-.03,.025,.19),i%3===0?woodLit:wood);
  slat.position.set(0,p.keel+.085,z);hull.add(slat);
}
const feltMat=new THREE.Mesh(new THREE.BoxGeometry(.64,.03,.92),new THREE.MeshStandardMaterial({color:0x7d2f28,roughness:1}));
feltMat.position.set(0,-.227,.56);hull.add(feltMat);
const ropeMaterial=new THREE.MeshStandardMaterial({color:0xb9a27a,roughness:1});
for(const [radius,y] of [[.115,.535],[.1,.575]]){
  const coil=new THREE.Mesh(new THREE.TorusGeometry(radius,.024,6,18),ropeMaterial);
  coil.rotation.x=Math.PI/2;coil.position.set(0,y,-2.6);hull.add(coil);
}
// Depth-only lid across the gunwales, drawn before the water so waves never show inside the hull.
const hullLid=deckSurface(0,HULL_SEGMENTS,p=>p.rail,new THREE.MeshBasicMaterial({colorWrite:false}),p=>p.w);
hullLid.renderOrder=1;water.renderOrder=2;

// ── Bow Lantern ────────────────────────────────────────────────────────
const lanternTip=new THREE.Vector3(0,1.7,BOAT_BOW-.32);
hull.add(tube([[0,.6,-2.95],[0,1.2,-3.05],[0,1.6,-3.42],lanternTip.toArray()],.017,woodDark));
function paperTexture(){
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff6e2';ctx.fillRect(0,0,64,128);
  ctx.strokeStyle='rgba(96,52,24,.42)';ctx.lineWidth=1.5;
  for(let y=10;y<128;y+=12){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(64,y);ctx.stroke();}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}
const lanternPaper=paperTexture();
const lanternPaperMat=new THREE.MeshStandardMaterial({map:lanternPaper,color:0xffe9c4,emissive:0xffa54d,emissiveMap:lanternPaper,emissiveIntensity:1.5,roughness:.9});
const lanternCapMat=new THREE.MeshStandardMaterial({color:0x1d1814,roughness:.8});
const bowLantern=new THREE.Group();bowLantern.position.copy(lanternTip);hull.add(bowLantern);
const lanternCord=new THREE.Mesh(new THREE.CylinderGeometry(.004,.004,.1,4),lanternCapMat);
lanternCord.position.y=-.05;bowLantern.add(lanternCord);
const lanternBody=new THREE.Mesh(new THREE.SphereGeometry(.14,18,12),lanternPaperMat);
lanternBody.scale.y=1.2;lanternBody.position.y=-.28;bowLantern.add(lanternBody);
for(const y of [-.125,-.435]){
  const cap=new THREE.Mesh(new THREE.CylinderGeometry(.066,.066,.034,12),lanternCapMat);
  cap.position.y=y;bowLantern.add(cap);
}
const lanternTassel=new THREE.Mesh(new THREE.CylinderGeometry(.006,.016,.12,5),new THREE.MeshStandardMaterial({color:0x8f2c22,roughness:1}));
lanternTassel.position.y=-.51;bowLantern.add(lanternTassel);
const lanternGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:halo.material.map,color:0xffb469,transparent:true,opacity:.6,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));
lanternGlow.scale.setScalar(1.25);lanternGlow.position.y=-.28;bowLantern.add(lanternGlow);
const lanternLight=new THREE.PointLight(0xffb86a,3.1,14,1.8);
lanternLight.position.y=-.28;bowLantern.add(lanternLight);

// ── Boatman ────────────────────────────────────────────────────────────
function strawTexture(){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#c8a566';ctx.fillRect(0,0,256,64);
  for(let i=0;i<110;i++){
    const x=i/110*256;
    ctx.strokeStyle=i%2?`rgba(70,44,18,${.1+(i%5)*.045})`:`rgba(255,236,186,${.07+(i%4)*.045})`;
    ctx.lineWidth=.6+(i%3)*.45;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+(i%7)-3,64);ctx.stroke();
  }
  ctx.strokeStyle='rgba(74,46,20,.38)';ctx.lineWidth=1.4;
  for(let y=7;y<64;y+=9){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(256,y);ctx.stroke();}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}
const indigo=new THREE.MeshStandardMaterial({color:0x2a3f6b,roughness:.96,side:THREE.DoubleSide});
const indigoDark=new THREE.MeshStandardMaterial({color:0x182238,roughness:.98});
const cream=new THREE.MeshStandardMaterial({color:0xe6d9bd,roughness:.92});
const skin=new THREE.MeshStandardMaterial({color:0xc4946f,roughness:.85});
const straw=new THREE.MeshStandardMaterial({map:strawTexture(),color:0xe9d6a4,roughness:.9,side:THREE.DoubleSide});
const limbAxis=new THREE.Vector3(0,1,0),limbDelta=new THREE.Vector3();
function limb(radiusFrom,radiusTo,material,parent){
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radiusTo,radiusFrom,1,8),material);
  parent.add(mesh);return mesh;
}
function placeLimb(mesh,from,to){
  limbDelta.subVectors(to,from);
  mesh.position.copy(from).addScaledVector(limbDelta,.5);
  mesh.scale.y=limbDelta.length();
  mesh.quaternion.setFromUnitVectors(limbAxis,limbDelta.normalize());
}
// Seated on a low stool at the stern, turned toward the oar.
const seatHeight=.26;
const rider=new THREE.Group();rider.position.set(.04,sternDeckY,2.62);rider.rotation.y=.8;hull.add(rider);
const stool=new THREE.Mesh(new THREE.BoxGeometry(.46,seatHeight,.3),woodDark);
stool.position.set(0,seatHeight/2,.03);rider.add(stool);
for(const side of [-1,1]){
  const hip=new THREE.Vector3(side*.09,seatHeight+.085,0),knee=new THREE.Vector3(side*.14,seatHeight+.14,-.42);
  const ankle=new THREE.Vector3(side*.15+.02,.07,-.47+side*.05);
  placeLimb(limb(.088,.066,indigoDark,rider),hip,knee);
  placeLimb(limb(.063,.046,indigoDark,rider),knee,ankle);
  const foot=new THREE.Mesh(new THREE.BoxGeometry(.085,.05,.23),cream);
  foot.position.set(ankle.x,.03,ankle.z-.05);rider.add(foot);
}
const hipHeight=seatHeight+.07;
const upper=new THREE.Group();upper.position.y=hipHeight;rider.add(upper);
const coat=new THREE.Mesh(new THREE.LatheGeometry([
  [.215,-.24],[.2,-.06],[.176,.1],[.19,.3],[.2,.43],[.165,.52],[.06,.575],[0,.58]
].map(([r,y])=>new THREE.Vector2(r,y)),16),indigo);
coat.scale.z=.66;upper.add(coat);
const obi=new THREE.Mesh(new THREE.CylinderGeometry(.184,.181,.075,16,1,true),cream);
obi.scale.z=.67;obi.position.y=.1;upper.add(obi);
const crest=new THREE.Mesh(new THREE.CircleGeometry(.062,20),cream);
crest.position.set(0,.33,.131);upper.add(crest);
for(const side of [-1,1]){
  const lapel=new THREE.Mesh(new THREE.BoxGeometry(.036,.36,.012),cream);
  lapel.position.set(side*.045,.37,-.128);lapel.rotation.z=side*.3;upper.add(lapel);
}
const neck=new THREE.Mesh(new THREE.CylinderGeometry(.045,.05,.1,8),skin);
neck.position.y=.61;upper.add(neck);
const head=new THREE.Group();head.position.y=.73;upper.add(head);
const face=new THREE.Mesh(new THREE.SphereGeometry(.1,14,10),skin);
face.scale.set(.93,1.06,1);head.add(face);
const hair=new THREE.Mesh(new THREE.SphereGeometry(.105,14,8,0,TAU,0,Math.PI*.55),new THREE.MeshStandardMaterial({color:0x15120f,roughness:.9}));
hair.rotation.x=.5;head.add(hair);
const kasa=new THREE.Mesh(new THREE.ConeGeometry(.37,.15,24,1,true),straw);
kasa.position.y=.145;head.add(kasa);
const arms=[-1,1].map(side=>{
  const fist=new THREE.Mesh(new THREE.SphereGeometry(.042,8,6),skin);hull.add(fist);
  return {side,fist,sleeve:limb(.062,.08,indigo,hull),forearm:limb(.04,.032,skin,hull),shoulder:new THREE.Vector3(),elbow:new THREE.Vector3(),hand:new THREE.Vector3()};
});
// Ro: a single sculling oar pivoting on a pin at the port quarter, its handle arm kinked down to a seated grip.
const oar=new THREE.Group();oar.rotation.order='YXZ';
oar.position.set(-.26,stern.rail+.075,stern.z-.05);hull.add(oar);
const oarShaft=new THREE.Mesh(new THREE.CylinderGeometry(.024,.022,1.4,8),woodLit);
oarShaft.rotation.x=Math.PI/2;oarShaft.position.z=.6;oar.add(oarShaft);
const oarBlade=new THREE.Mesh(new THREE.BoxGeometry(.14,.024,1.45),wood);
oarBlade.position.z=1.9;oar.add(oarBlade);
const oarArm=new THREE.Group();oarArm.rotation.x=-.27;oar.add(oarArm);
const oarHandle=new THREE.Mesh(new THREE.CylinderGeometry(.022,.019,1.5,8),woodLit);
oarHandle.rotation.x=Math.PI/2;oarHandle.position.z=-.7;oarArm.add(oarHandle);
const oarGrip=new THREE.Mesh(new THREE.CylinderGeometry(.015,.015,.17,6),woodDark);
oarGrip.rotation.z=Math.PI/2;oarGrip.position.z=-1.42;oarArm.add(oarGrip);
oarArm.updateMatrix();
const oarPin=new THREE.Mesh(new THREE.CylinderGeometry(.016,.022,.09,6),iron);
oarPin.position.copy(oar.position);oarPin.position.y-=.04;hull.add(oarPin);
const upperArm=.29,foreArm=.27;
const riderPose=new THREE.Matrix4(),gripPoint=new THREE.Vector3(),armReach=new THREE.Vector3(),armPole=new THREE.Vector3();
let strokePhase=0,effort=0,steer=0,stormLevel=0,gust=0,breeze=1;
function updateBoatman(dt,throttle,turn){
  effort=lerp(effort,throttle?1:clamp(Math.abs(speed)/4.1,0,1)*.3,1-Math.exp(-2.2*dt));
  steer=lerp(steer,turn,1-Math.exp(-3*dt));
  strokePhase+=dt*(1+effort*2.1);
  const sweep=Math.sin(strokePhase)*(.025+.1*effort);
  oar.rotation.set(.52+Math.cos(strokePhase*2)*.014*effort,sweep-steer*.09,Math.cos(strokePhase)*(.05+.25*effort));
  upper.rotation.set(-.2-.07*effort+Math.sin(elapsed*.9)*.008-stormLevel*.1,sweep*1.3+steer*.05,sweep*.7-stormLevel*gust*.09);
  head.rotation.set(.14,-.7+steer*.3-upper.rotation.y,0);
  oar.updateMatrix();rider.updateMatrix();upper.updateMatrix();
  riderPose.multiplyMatrices(rider.matrix,upper.matrix);
  for(const arm of arms){
    arm.shoulder.set(arm.side*.2,.47,0).applyMatrix4(riderPose);
    gripPoint.set(0,0,arm.side<0?-.85:-1.2).applyMatrix4(oarArm.matrix).applyMatrix4(oar.matrix);
    armReach.subVectors(gripPoint,arm.shoulder);
    const distance=Math.min(armReach.length(),upperArm+foreArm-.015);armReach.normalize();
    const along=(upperArm*upperArm-foreArm*foreArm+distance*distance)/(2*distance);
    const bend=Math.sqrt(Math.max(upperArm*upperArm-along*along,0));
    armPole.set(arm.side*.4,-1,.3).addScaledVector(armReach,-armPole.dot(armReach)).normalize();
    arm.elbow.copy(arm.shoulder).addScaledVector(armReach,along).addScaledVector(armPole,bend);
    arm.hand.copy(arm.shoulder).addScaledVector(armReach,distance);
    placeLimb(arm.sleeve,arm.shoulder,arm.elbow);placeLimb(arm.forearm,arm.elbow,arm.hand);
    arm.fist.position.copy(arm.hand);
  }
}
const boatFloatY=-.23;
boat.position.set(0,boatFloatY,7); scene.add(boat);

// ── Set Dressing: torii, stone lanterns, lotus, reeds, drifting lanterns ──
// Own seed, so the shoreline trees keep their layout.
let dressingSeed=58213;
const scatter=(a,b)=>a+(b-a)*((dressingSeed=(dressingSeed*1664525+1013904223)>>>0)/4294967296);
const waterLevel=water.position.y;
function floatOnWater(material){
  material.onBeforeCompile=shader=>{
    shader.uniforms.uTime=waterUniforms.uTime;shader.uniforms.uWeather=waterUniforms.uWeather;shader.uniforms.uSurge=waterUniforms.uSurge;
    shader.vertexShader=waterWaves+shader.vertexShader.replace('#include <project_vertex>',`
      vec4 mvPosition=vec4(transformed,1.);
      #ifdef USE_INSTANCING
        mvPosition=instanceMatrix*mvPosition;
      #endif
      mvPosition=modelMatrix*mvPosition;
      mvPosition.y+=waveHeight(mvPosition.xz);
      mvPosition=viewMatrix*mvPosition;
      gl_Position=projectionMatrix*mvPosition;`);
  };
  return material;
}
function addGlow(parent,y,size,opacity=.6){
  const glow=new THREE.Sprite(lanternGlow.material.clone());
  glow.material.opacity=opacity;glow.scale.setScalar(size);glow.position.y=y;parent.add(glow);
  return glow;
}
const dressingMatrix=new THREE.Matrix4(),dressingPosition=new THREE.Vector3(),dressingScale=new THREE.Vector3(),dressingTurn=new THREE.Quaternion(),dressingEuler=new THREE.Euler();
function setInstance(mesh,index,x,y,z,sx,sy,sz,turn=0,tiltX=0,tiltZ=0){
  dressingMatrix.compose(dressingPosition.set(x,y,z),dressingTurn.setFromEuler(dressingEuler.set(tiltX,turn,tiltZ)),dressingScale.set(sx,sy,sz));
  mesh.setMatrixAt(index,dressingMatrix);
}

// Two gates: the great torii near the start, and a weathered one before the lost pagoda.
const TORII_Z=-70,SHRINE_Z=RIDE_END+48,TORII_HALF_SPAN=5.5;
const lacquer=new THREE.MeshStandardMaterial({color:0x1b1412,roughness:.7});
function curvedBeam(halfLength,thickness,rise,depth,material){
  const shape=new THREE.Shape();
  shape.moveTo(-halfLength,rise);shape.quadraticCurveTo(0,-rise,halfLength,rise);
  shape.lineTo(halfLength+.22,rise+thickness);shape.quadraticCurveTo(0,thickness-rise,-halfLength-.22,rise+thickness);
  shape.closePath();
  const geometry=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:24});
  geometry.translate(0,0,-depth/2);
  return new THREE.Mesh(geometry,material);
}
const toriiPillars=[];
function buildTorii(z,scale,paint,light){
  const torii=new THREE.Group();torii.position.set(channelCenter(z),0,z);torii.scale.setScalar(scale);scene.add(torii);
  for(const side of [-1,1]){
    const pillar=new THREE.Mesh(new THREE.CylinderGeometry(.42,.5,13.1,16),paint);
    pillar.position.set(side*TORII_HALF_SPAN,5.05,0);torii.add(pillar);
    const footing=new THREE.Mesh(new THREE.CylinderGeometry(.57,.6,1.5,16),lacquer);
    footing.position.set(side*TORII_HALF_SPAN,.1,0);torii.add(footing);
    const cap=new THREE.Mesh(new THREE.BoxGeometry(1.25,.26,1.25),lacquer);
    cap.position.set(side*TORII_HALF_SPAN,11.42,0);torii.add(cap);
    const hanging=new THREE.Group();hanging.position.set(side*2.9,9.2,0);torii.add(hanging);
    const cord=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,.5,4),lanternCapMat);
    cord.position.y=-.25;hanging.add(cord);
    const paper=new THREE.Mesh(new THREE.SphereGeometry(.36,18,12),lanternPaperMat);
    paper.scale.y=1.25;paper.position.y=-.95;hanging.add(paper);
    for(const y of [-.52,-1.38]){
      const rim=new THREE.Mesh(new THREE.CylinderGeometry(.17,.17,.08,12),lanternCapMat);
      rim.position.y=y;hanging.add(rim);
    }
    addGlow(hanging,-.95,3.4,.5);
    toriiPillars.push({x:torii.position.x+side*TORII_HALF_SPAN*scale,z,radius:.9+.6*scale});
  }
  const nuki=new THREE.Mesh(new THREE.BoxGeometry(14.8,.7,.5),paint);nuki.position.y=9.55;torii.add(nuki);
  const gakuzuka=new THREE.Mesh(new THREE.BoxGeometry(.62,1.45,.42),paint);gakuzuka.position.y=10.6;torii.add(gakuzuka);
  const shimaki=curvedBeam(8.3,.55,.55,.72,paint);shimaki.position.y=11.3;torii.add(shimaki);
  const kasagi=curvedBeam(8.9,.62,.6,1.05,lacquer);kasagi.position.y=11.85;torii.add(kasagi);
  if(light){const glow=new THREE.PointLight(0xff9c52,14,34,1.7);glow.position.y=8.1;torii.add(glow);}
}
buildTorii(TORII_Z,1,new THREE.MeshStandardMaterial({color:0xc23b26,roughness:.78}),true);
buildTorii(SHRINE_Z,.82,new THREE.MeshStandardMaterial({color:0x7c3a2c,roughness:.95}),false);

const stone=new THREE.MeshStandardMaterial({color:0x5d665f,roughness:1,flatShading:true});
const stoneWindow=new THREE.MeshStandardMaterial({color:0xf2b877,emissive:0xff8a3a,emissiveIntensity:.8,roughness:1});
const toroParts=[
  [new THREE.CylinderGeometry(.62,.7,.5,6),-.2,stone],
  [new THREE.CylinderGeometry(.36,.44,.22,6),.16,stone],
  [new THREE.CylinderGeometry(.13,.17,.95,6),.74,stone],
  [new THREE.CylinderGeometry(.38,.19,.16,6),1.29,stone],
  [new THREE.BoxGeometry(.33,.34,.33),1.54,stoneWindow],
  [new THREE.ConeGeometry(.6,.34,6),1.88,stone],
  [new THREE.SphereGeometry(.09,8,6),2.08,stone]
];
const toroSites=[[-1,TORII_Z],[1,TORII_Z],[-1,SHRINE_Z],[1,SHRINE_Z]];
for(let z=32,side=1;z>RIDE_END;z-=compactDevice?96:54,side=-side)if(Math.abs(z-TORII_Z)>14&&Math.abs(z-SHRINE_Z)>14)toroSites.push([side,z]);
const toroGlowPositions=[];
const toroMeshes=toroParts.map(([geometry,y,material])=>{
  geometry.translate(0,y,0);
  const mesh=new THREE.InstancedMesh(geometry,material,toroSites.length);
  mesh.frustumCulled=false;scene.add(mesh);
  return mesh;
});
toroSites.forEach(([side,z],i)=>{
  const x=shoreX(side,z)-side*1.3,turn=scatter(0,TAU);
  for(const mesh of toroMeshes)setInstance(mesh,i,x,waterLevel+.08,z,1.5,1.5,1.5,turn);
  toroGlowPositions.push(x,waterLevel+.08+1.54*1.5,z);
});
const toroGlowGeometry=new THREE.BufferGeometry();
toroGlowGeometry.setAttribute('position',new THREE.Float32BufferAttribute(toroGlowPositions,3));
const toroGlow=new THREE.Points(toroGlowGeometry,new THREE.PointsMaterial({map:halo.material.map,color:0xffa45a,size:3,sizeAttenuation:true,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));
toroGlow.frustumCulled=false;scene.add(toroGlow);

const padGeometry=new THREE.CircleGeometry(.42,14,.25,TAU-.5);padGeometry.rotateX(-Math.PI/2);
const padMaterial=floatOnWater(new THREE.MeshStandardMaterial({color:0x2f6b45,roughness:.85,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
const bloomGeometry=new THREE.ConeGeometry(.2,.24,8,1,true);bloomGeometry.rotateX(Math.PI);bloomGeometry.translate(0,.15,0);
const bloomMaterial=floatOnWater(new THREE.MeshStandardMaterial({color:0xf2b6c6,emissive:0x5a2234,emissiveIntensity:.6,roughness:.8,side:THREE.DoubleSide}));
const padClusters=compactDevice?28:76,padsPerCluster=11;
const pads=new THREE.InstancedMesh(padGeometry,padMaterial,padClusters*padsPerCluster);
const blooms=new THREE.InstancedMesh(bloomGeometry,bloomMaterial,padClusters*2);
const reedGeometry=new THREE.ConeGeometry(.035,1,4,1,true);reedGeometry.translate(0,.5,0);
const reedClumps=compactDevice?60:150,reedsPerClump=13;
const reeds=new THREE.InstancedMesh(reedGeometry,windSway(new THREE.MeshStandardMaterial({color:0x35563a,roughness:1,side:THREE.DoubleSide}),1,0),reedClumps*reedsPerClump);
for(let cluster=0;cluster<padClusters;cluster++){
  const side=cluster%2?1:-1,z=scatter(RIDE_END-10,70),centre=scatter(1.8,5);
  for(let i=0;i<padsPerCluster;i++){
    const padZ=z+scatter(-3,3),inset=clamp(centre+scatter(-2,2),.5,6.4),size=scatter(.6,1.5);
    const x=shoreX(side,padZ)-side*inset;
    setInstance(pads,cluster*padsPerCluster+i,x,waterLevel+.02,padZ,size,1,size,scatter(0,TAU));
    if(i<2)setInstance(blooms,cluster*2+i,x+scatter(-.2,.2),waterLevel+.02,padZ+scatter(-.2,.2),size*.75,size*.75,size*.75,scatter(0,TAU));
  }
}
for(let clump=0;clump<reedClumps;clump++){
  const side=clump%2?1:-1,z=scatter(RIDE_END-20,78),inset=scatter(-.2,1.5);
  for(let i=0;i<reedsPerClump;i++){
    const reedZ=z+scatter(-.6,.6);
    setInstance(reeds,clump*reedsPerClump+i,shoreX(side,reedZ)-side*(inset+scatter(-.5,.5)),waterLevel-.25,reedZ,1,scatter(1.5,3),1,scatter(0,TAU),scatter(-.13,.13),scatter(-.13,.13));
  }
}
for(const mesh of [pads,blooms,reeds]){mesh.instanceMatrix.needsUpdate=true;mesh.frustumCulled=false;scene.add(mesh);}

// Tōrō nagashi: paper lanterns set adrift, thickest around the gate.
const driftCount=compactDevice?26:66;
const driftPaperGeometry=new THREE.BoxGeometry(.26,.3,.26);driftPaperGeometry.translate(0,.2,0);
const driftBaseGeometry=new THREE.BoxGeometry(.4,.05,.4);driftBaseGeometry.translate(0,.025,0);
const driftPaperMat=floatOnWater(new THREE.MeshStandardMaterial({color:0xf2b877,emissive:0xff8a3a,emissiveIntensity:.8,roughness:1}));
const driftPapers=new THREE.InstancedMesh(driftPaperGeometry,driftPaperMat,driftCount);
const driftBases=new THREE.InstancedMesh(driftBaseGeometry,floatOnWater(woodDark.clone()),driftCount);
const driftGlowPositions=new Float32Array(driftCount*3);
for(let i=0;i<driftCount;i++){
  const nearGate=i%3===0,side=i%2?1:-1;
  const z=nearGate?(i%6?TORII_Z:SHRINE_Z)+scatter(-16,16):scatter(RIDE_END,58);
  const x=channelCenter(z)+side*(nearGate?scatter(1.6,11):scatter(3,Math.abs(shoreX(side,z)-channelCenter(z))-5));
  const turn=scatter(0,TAU);
  setInstance(driftPapers,i,x,waterLevel,z,1,1,1,turn);setInstance(driftBases,i,x,waterLevel,z,1,1,1,turn);
  driftGlowPositions.set([x,waterLevel+.2,z],i*3);
}
const driftGlowGeometry=new THREE.BufferGeometry();
driftGlowGeometry.setAttribute('position',new THREE.BufferAttribute(driftGlowPositions,3));
const driftGlow=new THREE.Points(driftGlowGeometry,floatOnWater(new THREE.PointsMaterial({map:halo.material.map,color:0xffa45a,size:2,sizeAttenuation:true,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false,fog:false})));
for(const mesh of [driftPapers,driftBases,driftGlow]){mesh.frustumCulled=false;scene.add(mesh);}

// Five-storey pagoda, a flat silhouette rising behind the trees where the water ends.
const pagodaShape=new THREE.Shape();
const pagodaOutline=[];
let pagodaY=0;
for(let tier=0;tier<5;tier++){
  const body=2.2-tier*.28,eave=4.5-tier*.56,wall=2-tier*.12;
  pagodaOutline.push([body,pagodaY],[body,pagodaY+wall],[eave,pagodaY+wall+.22],[body-.03,pagodaY+wall+1.15]);
  pagodaY+=wall+1.15;
}
pagodaOutline.push([.16,pagodaY+.5],[.07,pagodaY+4]);
pagodaShape.moveTo(-pagodaOutline[0][0],0);
for(const [x,y] of pagodaOutline)pagodaShape.lineTo(x,y);
for(const [x,y] of pagodaOutline.slice().reverse())pagodaShape.lineTo(-x,y);
const pagoda=new THREE.Mesh(new THREE.ShapeGeometry(pagodaShape),ridge.material);
pagoda.position.set(channelCenter(RIDE_END-74),1.4,RIDE_END-74);pagoda.scale.setScalar(2.3);scene.add(pagoda);

const keys={forward:false,reverse:false,left:false,right:false};
const keyMap={KeyW:'forward',ArrowUp:'forward',KeyS:'reverse',ArrowDown:'reverse',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right'};
let speed=0, heading=0, elapsed=0, riding=false;
const wakeBorn=new Float32Array(16).fill(-1);
let wakeCursor=0,lastWakeAt=-1;
function clearWake(){wakeBorn.fill(-1);for(const point of waterUniforms.uWakePoints.value)point.w=-1;lastWakeAt=-1;}
function setRiding(){if(!riding){riding=true;root.classList.add('is-riding');status.textContent='The water is yours to explore';}}
addEventListener('keydown',e=>{const control=keyMap[e.code];if(control){e.preventDefault();keys[control]=true;setRiding();}});
addEventListener('keyup',e=>{const control=keyMap[e.code];if(control){e.preventDefault();keys[control]=false;}});
addEventListener('blur',()=>{for(const key in keys)keys[key]=false;});
document.querySelectorAll('[data-control]').forEach(button=>{
  const control=button.dataset.control;
  button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);keys[control]=true;setRiding();});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>keys[control]=false);
});
resetButton.addEventListener('click',()=>{
  speed=0; heading=0; boat.position.set(0,boatFloatY,7); boat.rotation.set(0,0,0);
  camera.position.set(0,3.4,17.4); status.textContent='Back at the beginning';clearWake();placeTornado();
});

let audioContext, audioSource, audioGain, weatherBedGain, lapBuffer, nextLapAt=0, nextJungleAt=0;
function setupAudio(){
  audioContext=new AudioContext();
  const length=audioContext.sampleRate*3,buffer=audioContext.createBuffer(1,length,audioContext.sampleRate),data=buffer.getChannelData(0);
  let previous=0;for(let i=0;i<length;i++){previous=(previous+(Math.random()*2-1)*.045)/1.045;data[i]=previous*.8;}
  audioSource=audioContext.createBufferSource();audioSource.buffer=buffer;audioSource.loop=true;
  const filter=audioContext.createBiquadFilter();filter.type='lowpass';filter.frequency.value=380;
  const bedGain=audioContext.createGain();bedGain.gain.value=.42;
  audioGain=audioContext.createGain();audioGain.gain.value=0;
  audioSource.connect(filter).connect(bedGain).connect(audioGain).connect(audioContext.destination);audioSource.start();
  const rustleBuffer=audioContext.createBuffer(1,audioContext.sampleRate*4,audioContext.sampleRate);
  const rustleData=rustleBuffer.getChannelData(0);
  let rustle=0;
  for(let i=0;i<rustleData.length;i++){
    rustle=rustle*.82+(Math.random()*2-1)*.18;
    rustleData[i]=rustle*(.72+.28*Math.sin(i/audioContext.sampleRate*1.7));
  }
  const rustleSource=audioContext.createBufferSource();rustleSource.buffer=rustleBuffer;rustleSource.loop=true;
  const rustleFilter=audioContext.createBiquadFilter();rustleFilter.type='bandpass';rustleFilter.frequency.value=1450;rustleFilter.Q.value=.34;
  const rustleGain=audioContext.createGain();rustleGain.gain.value=.075;
  rustleSource.connect(rustleFilter).connect(rustleGain).connect(audioGain);rustleSource.start();
  const rainFilter=audioContext.createBiquadFilter();rainFilter.type='bandpass';rainFilter.frequency.value=1100;rainFilter.Q.value=.24;
  weatherBedGain=audioContext.createGain();weatherBedGain.gain.value=weatherMode===3?.46:weatherMode===2?.26:0;
  rustleSource.connect(rainFilter).connect(weatherBedGain).connect(audioGain);
  lapBuffer=audioContext.createBuffer(1,Math.floor(audioContext.sampleRate*.62),audioContext.sampleRate);
  const lapData=lapBuffer.getChannelData(0);
  let wash=0;
  for(let i=0;i<lapData.length;i++){
    wash=(wash+(Math.random()*2-1)*.12)/1.12;
    lapData[i]=wash;
  }
}
function playWaterLap(){
  if(!audioContext||soundButton.getAttribute('aria-pressed')!=='true')return;
  const now=audioContext.currentTime;
  const source=audioContext.createBufferSource();source.buffer=lapBuffer;
  source.playbackRate.value=range(.76,1.16);
  const filter=audioContext.createBiquadFilter();filter.type='bandpass';filter.frequency.value=range(420,890);filter.Q.value=.55;
  const gain=audioContext.createGain();
  const strength=.075+Math.min(Math.abs(speed),4)*.025;
  gain.gain.setValueAtTime(.0001,now);
  gain.gain.linearRampToValueAtTime(strength,now+.055);
  gain.gain.exponentialRampToValueAtTime(.0001,now+.54);
  const pan=audioContext.createStereoPanner();pan.pan.value=range(-.55,.55);
  source.connect(filter).connect(gain).connect(pan).connect(audioGain);
  source.start(now);source.stop(now+.6);
}
function playFishSplash(){
  if(!audioContext||soundButton.getAttribute('aria-pressed')!=='true')return;
  const now=audioContext.currentTime;
  const source=audioContext.createBufferSource();source.buffer=lapBuffer;source.playbackRate.value=range(1.2,1.8);
  const filter=audioContext.createBiquadFilter();filter.type='bandpass';filter.frequency.value=range(600,1200);filter.Q.value=.9;
  const gain=audioContext.createGain();
  gain.gain.setValueAtTime(.0001,now);gain.gain.linearRampToValueAtTime(.04,now+.02);gain.gain.exponentialRampToValueAtTime(.0001,now+.3);
  const pan=audioContext.createStereoPanner();pan.pan.value=range(-.7,.7);
  source.connect(filter).connect(gain).connect(pan).connect(audioGain);source.start(now);source.stop(now+.35);
}
function playThunder(){
  if(!audioContext||soundButton.getAttribute('aria-pressed')!=='true')return;
  const now=audioContext.currentTime+range(.3,1.1);
  const source=audioContext.createBufferSource();source.buffer=lapBuffer;source.playbackRate.value=range(.2,.28);
  const filter=audioContext.createBiquadFilter();filter.type='lowpass';filter.frequency.value=range(150,230);
  const gain=audioContext.createGain();
  gain.gain.setValueAtTime(.0001,now);gain.gain.linearRampToValueAtTime(1.5,now+.09);gain.gain.exponentialRampToValueAtTime(.0001,now+2.3);
  source.connect(filter).connect(gain).connect(audioGain);source.start(now);source.stop(now+2.4);
}
function playJungleCall(){
  if(!audioContext||soundButton.getAttribute('aria-pressed')!=='true')return;
  const now=audioContext.currentTime;
  const frog=random()>.77;
  const count=frog?2:3+Math.floor(random()*2);
  const pan=audioContext.createStereoPanner();pan.pan.value=range(-.8,.8);
  pan.connect(audioGain);
  for(let i=0;i<count;i++){
    const start=now+i*(frog?.22:.13);
    const duration=frog?.19:.085;
    const source=audioContext.createOscillator();source.type=frog?'triangle':'sine';
    const frequency=frog?range(250,340):range(2600,3400);
    source.frequency.setValueAtTime(frequency,start);
    source.frequency.exponentialRampToValueAtTime(frequency*(frog?.72:1.18),start+duration);
    const gain=audioContext.createGain();
    gain.gain.setValueAtTime(.0001,start);
    gain.gain.exponentialRampToValueAtTime(frog?.018:.012,start+duration*.28);
    gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
    source.connect(gain).connect(pan);
    source.start(start);source.stop(start+duration+.015);
  }
}
// The waterspout stands in the channel well ahead of the boat (or behind, near the end of the ride).
let tornadoHome=0,vortex=0,vortexCore=0;
function placeTornado(){
  const ahead=boat.position.z-260;
  tornadoHome=ahead>=RIDE_END+20?ahead:Math.min(boat.position.z+260,RIDE_START-10);
}
const weatherNames=['Moonlit night','Dawn','Rain','Storm'];
let hemiBase=2.15,flash=0,nextFlashAt=0,echoFlashAt=0;
function applyWeather(){
  const dawn=weatherMode===1,raining=weatherMode>=2,storm=weatherMode===3;
  root.dataset.weather=weatherMode===0?'night':dawn?'dawn':storm?'storm':'rain';
  weatherLabel.textContent=weatherMode===0?'Moonlit':weatherNames[weatherMode];
  weatherButton.setAttribute('aria-label',`Change weather, current: ${weatherNames[weatherMode]}`);
  sceneHeading.innerHTML=weatherMode===0?'A quieter way<br>through the night.':dawn?'A quieter way<br>into the dawn.':storm?'Hold steady<br>through the storm.':'A quieter way<br>through the rain.';
  scenePrompt.textContent=weatherMode===0?'Set out. Follow the light.':dawn?'Set out. Meet the morning.':storm?'Set out. Keep clear of the funnel.':'Set out. Listen to the rain.';
  sky.material.uniforms.uWeather.value=weatherMode;
  waterUniforms.uWeather.value=weatherMode;
  waterUniforms.uMoon.value.copy(dawn?sunPosition:moonPosition);
  moon.visible=halo.visible=weatherMode===0;
  sun.visible=sunHalo.visible=dawn;
  stars.visible=weatherMode===0;
  rain.visible=raining;rain.material.opacity=storm?.36:.24;
  tornado.visible=storm;nextFlashAt=elapsed+range(1.5,4);
  if(storm)placeTornado();
  scene.background.setHex(dawn?0x2c2631:storm?0x0e161a:raining?0x17232a:0x07131b);
  scene.fog.color.setHex(dawn?0x624b54:storm?0x1a2529:raining?0x203039:0x0a1f1c);
  scene.fog.density=dawn?.0048:storm?.0086:raining?.0074:.0056;
  hemiLight.color.setHex(dawn?0xffc6a9:storm?0x7f959b:raining?0x91a7ad:0x9ebbd0);
  hemiLight.groundColor.setHex(dawn?0x352b2d:storm?0x0b1418:raining?0x101c23:0x071315);
  hemiBase=hemiLight.intensity=dawn?2.55:storm?1.6:raining?2.0:2.15;
  moonLight.color.setHex(dawn?0xffaa76:storm?0x9fb3b8:raining?0xb5c9cc:0xffe8bd);
  moonLight.intensity=dawn?3.05:storm?.65:raining?1.0:2.7;
  moonLight.position.copy(dawn?sunPosition:new THREE.Vector3(-5,24,-80));
  renderer.toneMappingExposure=dawn?1.32:raining?1.32:1.42;
  if(weatherBedGain)weatherBedGain.gain.setTargetAtTime(storm?.46:raining?.26:0,audioContext.currentTime,.6);
}
weatherButton.addEventListener('click',()=>{weatherMode=(weatherMode+1)%weatherNames.length;applyWeather();});
soundButton.addEventListener('click',async()=>{
  try{
    if(!audioContext)setupAudio();
    await audioContext.resume();
    const on=soundButton.getAttribute('aria-pressed')!=='true';
    soundButton.setAttribute('aria-pressed',String(on));soundButton.setAttribute('aria-label',on?'Turn ambient sound off':'Turn ambient sound on');
    soundButton.querySelector('span').textContent=on?'Sound on':'Sound off';
    audioGain.gain.setTargetAtTime(on?.25:0,audioContext.currentTime,.25);
    if(on){nextLapAt=elapsed+.45;nextJungleAt=elapsed+range(2.5,5);}
  }catch(cause){console.error('Ambient sound could not start:',cause);soundButton.querySelector('span').textContent='Sound unavailable';}
});

const desiredCamera=new THREE.Vector3(); const lookTarget=new THREE.Vector3(); const skyAnchor=new THREE.Vector3(); const clock=new THREE.Clock();
let frameTime=0;
function animate(){
  requestAnimationFrame(animate);
  frameTime+=clock.getDelta();
  if(compactDevice&&frameTime<1/32)return;
  const dt=Math.min(frameTime,.055);frameTime=0;elapsed+=dt;
  if(audioContext&&elapsed>=nextLapAt){
    playWaterLap();
    nextLapAt=elapsed+range(1.15,2.4)/(1+Math.min(Math.abs(speed),4)*.2);
  }
  if(audioContext&&elapsed>=nextJungleAt){
    playJungleCall();
    nextJungleAt=elapsed+range(4.8,9.5);
  }
  sky.material.uniforms.uTime.value=elapsed;
  waterUniforms.uTime.value=elapsed; waterUniforms.uCamera.value.copy(camera.position);

  // Storm: gusts rock the boat, shove it sideways and thrash the canopy; lightning comes in doubles.
  stormLevel=lerp(stormLevel,weatherMode===3?1:0,1-Math.exp(-1.5*dt));
  gust=Math.sin(elapsed*.7)*.5+Math.sin(elapsed*1.9+1.3)*.3+Math.sin(elapsed*4.3)*.2;
  // The waterspout roams its stretch of channel; close in, it drags the boat inward and around itself.
  const tornadoZ=tornadoHome+Math.sin(elapsed*.03)*25;
  tornado.position.set(channelCenter(tornadoZ)+Math.sin(elapsed*.08)*8,-1,tornadoZ);
  const towardX=tornado.position.x-boat.position.x,towardZ=tornadoZ-boat.position.z,tornadoDistance=Math.max(Math.hypot(towardX,towardZ),.001);
  const pull=1-THREE.MathUtils.smoothstep(tornadoDistance,12,130);
  vortex=stormLevel*pull*pull;
  vortexCore=stormLevel*(1-THREE.MathUtils.smoothstep(tornadoDistance,4,16));
  const fury=stormLevel*(1+vortex*2.5);
  waterUniforms.uSurge.value=vortex*1.3;
  waterUniforms.uVortex.value.set(tornado.position.x,tornadoZ,stormLevel);
  windUniforms.uSway.value+=dt*(1+stormLevel*2.4+vortex*2);
  breeze=lerp(breeze,weatherMode===2?1.8:1,1-Math.exp(-1.2*dt));
  windUniforms.uGust.value=breeze+stormLevel*(3.6+1.6*gust)+vortex*2.5;
  if(weatherMode===3&&elapsed>=nextFlashAt){flash=1;echoFlashAt=elapsed+range(.09,.2);nextFlashAt=elapsed+range(4,11);playThunder();}
  if(echoFlashAt&&elapsed>=echoFlashAt){flash=Math.max(flash,.7);echoFlashAt=0;}
  flash*=Math.exp(-7*dt);
  sky.material.uniforms.uFlash.value=tornadoUniforms.uFlash.value=flash;
  hemiLight.intensity=hemiBase+flash*3.5;
  if(weatherBedGain&&stormLevel>.5)weatherBedGain.gain.setTargetAtTime(.4+gust*.16+vortex*.55,audioContext.currentTime,.3);

  const throttle=(keys.forward?1:0)-(keys.reverse?1:0);
  const turn=(keys.left?1:0)-(keys.right?1:0);
  const targetSpeed=throttle>0?4.1:throttle<0?-2.2:0;
  speed=lerp(speed,targetSpeed,1-Math.exp(-(throttle?1.45:.85)*dt));
  if(Math.abs(speed)<.008)speed=0;
  heading+=turn*(.48+Math.min(Math.abs(speed),3)*.15)*dt*(speed<-.1?-1:1);
  boat.position.x-=Math.sin(heading)*speed*dt;
  boat.position.z-=Math.cos(heading)*speed*dt;
  boat.position.x+=gust*.45*stormLevel*dt;
  if(vortex>.001){
    const inX=towardX/tornadoDistance,inZ=towardZ/tornadoDistance;
    boat.position.x+=(inX*3.2-inZ*2.6)*vortex*dt;boat.position.z+=(inZ*3.2+inX*2.6)*vortex*dt;
    heading+=vortexCore*.9*dt;
    if(tornadoDistance<3.5){boat.position.x-=inX*(3.5-tornadoDistance);boat.position.z-=inZ*(3.5-tornadoDistance);}
  }
  const left=shoreX(-1,boat.position.z)+4,right=shoreX(1,boat.position.z)-4;
  const beforeX=boat.position.x;
  boat.position.x=clamp(boat.position.x,left,right);boat.position.z=clamp(boat.position.z,RIDE_END,RIDE_START);
  boat.position.y=boatFloatY+waterHeight(boat.position.x,boat.position.z,elapsed)*.85;
  for(const pillar of toriiPillars){
    const dx=boat.position.x-pillar.x,dz=boat.position.z-pillar.z,gap=Math.hypot(dx,dz);
    if(gap>0&&gap<pillar.radius){boat.position.x+=dx/gap*(pillar.radius-gap);boat.position.z+=dz/gap*(pillar.radius-gap);speed*=.9;}
  }
  if(beforeX!==boat.position.x){speed*=.8;status.textContent='Close to shore — steer toward open water';}
  else if(riding&&Math.abs(speed)>.4)status.textContent='The water is yours to explore';
  if(vortex>.3)status.textContent='The waterspout is dragging you in — row hard away';
  boat.rotation.y=heading;
  waterUniforms.uBoatPosition.value.set(boat.position.x,boat.position.z);
  waterUniforms.uBoatDirection.value.set(-Math.sin(heading),-Math.cos(heading));
  waterUniforms.uBoatSpeed.value=Math.abs(speed);
  if(Math.abs(speed)>.6&&elapsed-lastWakeAt>.24){
    const point=waterUniforms.uWakePoints.value[wakeCursor];
    point.set(boat.position.x+Math.sin(heading)*3.1,boat.position.z+Math.cos(heading)*3.1,heading,0);
    wakeBorn[wakeCursor]=elapsed;wakeCursor=(wakeCursor+1)%wakeBorn.length;lastWakeAt=elapsed;
  }
  for(let i=0;i<wakeBorn.length;i++)waterUniforms.uWakePoints.value[i].w=wakeBorn[i]<0?-1:elapsed-wakeBorn[i];
  hull.position.y=Math.sin(elapsed*1.55)*.012+Math.sin(elapsed*.74)*.008+fury*Math.sin(elapsed*3.1)*.03;
  hull.rotation.z=Math.sin(elapsed*1.1)*.013+turn*.016+fury*(gust*.085+Math.sin(elapsed*6.1)*.018);
  hull.rotation.x=Math.sin(elapsed*1.33)*.012+clamp(speed/4,-1,1)*.012+fury*(Math.sin(elapsed*2.6+.7)*.05+Math.sin(elapsed*5.3)*.014);
  hull.rotation.y=fury*Math.sin(elapsed*1.3)*.035;
  updateBoatman(dt,throttle,turn);
  for(const tree of swayingTrees)tree.group.rotation.z=Math.sin(elapsed*.75+tree.phase)*tree.strength;
  fireflyMaterial.uniforms.uTime.value=elapsed;fireflyMaterial.uniforms.uWeather.value=weatherMode;
  if(ssState.active){
    ssState.progress+=dt/ssState.duration;ssMaterial.uniforms.uProgress.value=ssState.progress;
    if(ssState.progress>1.6){ssState.active=false;shootingStar.visible=false;ssState.nextAt=elapsed+range(12,28);}
  }
  if(!ssState.active&&elapsed>=ssState.nextAt&&weatherMode===0)activateShootingStar();
  mistMaterial.uniforms.uTime.value=elapsed;mistMaterial.uniforms.uWeather.value=weatherMode;
  for(const patch of mistPatches){patch.position.x=patch.userData.homeX+Math.sin(elapsed*.03+patch.userData.driftPhase)*4.5;patch.position.z=patch.userData.homeZ+Math.cos(elapsed*.02+patch.userData.driftPhase*1.3)*3.5;}
  splashUniforms.uTime.value=elapsed;
  if(elapsed>=nextSplashAt){
    const sz=boat.position.z+range(-95,30),sx=channelCenter(sz)+range(-12,12);
    splashUniforms.uSplashes.value[splashCursor].set(sx,sz,elapsed,1);splashCursor=(splashCursor+1)%maxSplashes;
    playFishSplash();nextSplashAt=elapsed+range(4,9);
  }
  const flicker=1.+Math.sin(elapsed*7.3)*.06+Math.sin(elapsed*13.1)*.04+Math.sin(elapsed*23.7)*.02+Math.sin(elapsed*3.1)*.08;
  lanternLight.intensity=3.1*flicker;lanternPaperMat.emissiveIntensity=1.2+flicker*.3;lanternGlow.material.opacity=.48+flicker*.12;
  driftPaperMat.emissiveIntensity=.62+flicker*.18;stoneWindow.emissiveIntensity=.62+flicker*.18;
  bowLantern.rotation.x=Math.sin(elapsed*1.3)*.05+clamp(speed/4,-1,1)*.07+fury*Math.sin(elapsed*3.7)*.25;
  bowLantern.rotation.z=Math.sin(elapsed*.9+1)*.04-steer*.05+stormLevel*(.3+gust*.45);
  if(weatherMode>=2){
    const slant=.13+stormLevel*.6+vortex*.5,fall=1+stormLevel*.7;
    rain.position.set(camera.position.x,0,camera.position.z-12);
    for(let i=0;i<rainCount;i++){
      const drop=rainSeeds[i];
      const y=1+((drop.y-elapsed*drop.speed*fall)%34+34)%34;
      const offset=i*6;
      rainPositions[offset]=drop.x;rainPositions[offset+1]=y;rainPositions[offset+2]=drop.z;
      rainPositions[offset+3]=drop.x+slant;rainPositions[offset+4]=y-drop.length;rainPositions[offset+5]=drop.z+.07;
    }
    rainGeometry.attributes.position.needsUpdate=true;
  }
  const followDistance=innerWidth<700?10.2:9.6;
  desiredCamera.set(Math.sin(heading)*followDistance,3.95-boat.position.y,Math.cos(heading)*followDistance).add(boat.position);
  // Keep the camera over open water rather than inside the bank's trees.
  desiredCamera.x=clamp(desiredCamera.x,shoreX(-1,desiredCamera.z)+4.5,shoreX(1,desiredCamera.z)-4.5);
  camera.position.lerp(desiredCamera,1-Math.exp(-1.9*dt));
  lookTarget.set(boat.position.x,boat.position.y+.9,boat.position.z-3.1);
  const forward=new THREE.Vector3(-Math.sin(heading),0,-Math.cos(heading));
  lookTarget.copy(boat.position).addScaledVector(forward,5.1);lookTarget.y=1.02+fury*(Math.sin(elapsed*8.1)*.03+gust*.05);
  camera.lookAt(lookTarget);
  sky.position.copy(camera.position);
  stars.position.copy(camera.position);
  // Moon, sun and far ridge keep their bearing however far the boat travels.
  skyAnchor.set(camera.position.x,0,camera.position.z-17.4);
  moon.position.copy(moonPosition).add(skyAnchor);halo.position.copy(moon.position);halo.position.z-=.25;
  sun.position.copy(sunPosition).add(skyAnchor);sunHalo.position.copy(sun.position);sunHalo.position.z-=.25;
  waterUniforms.uMoon.value.copy(weatherMode===1?sun.position:moon.position);
  ridge.position.set(camera.position.x,0,camera.position.z-195);
  tornadoUniforms.uTime.value=elapsed;
  sky.material.uniforms.uTornado.value.set(tornado.position.x-camera.position.x,26,tornado.position.z-camera.position.z).normalize();
  moon.lookAt(camera.position);halo.lookAt(camera.position);
  sun.lookAt(camera.position);sunHalo.lookAt(camera.position);
  // The water sheet follows in whole grid cells, so its vertices never swim.
  water.position.x=reflector.position.x=Math.round(camera.position.x/waterCell)*waterCell;
  water.position.z=reflector.position.z=Math.round(camera.position.z/waterCell)*waterCell;
  fishRippleOverlay.position.set(camera.position.x,-.37,camera.position.z-60);
  for(const chunk of forestChunks)chunk.visible=Math.abs(chunk.userData.z-camera.position.z)<FOREST_RANGE;
  renderer.render(scene,camera);
}

function resize(){
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  renderer.setPixelRatio(displayPixelRatio);renderer.setSize(innerWidth,innerHeight);
  reflector.getRenderTarget().setSize(Math.max(192,Math.floor(innerWidth*reflectionPixelRatio*reflectionScale)),Math.max(192,Math.floor(innerHeight*reflectionPixelRatio*reflectionScale)));
}
addEventListener('resize',resize);
renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();error.hidden=false;error.textContent='The 3D scene paused. Reload the page to return to the lake.';});
applyWeather();
animate();
