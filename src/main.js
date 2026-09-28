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
scene.fog = new THREE.FogExp2(0x081b1c, 0.0042);
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
    uniforms: { uTime: { value: 0 }, uWeather: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vDir; uniform float uTime; uniform float uWeather;
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
  uWakePoints: { value: Array.from({length:16},()=>new THREE.Vector4(0,0,0,-1)) }
};
const waterWaves = `
  uniform float uTime;
  uniform float uWeather;
  float waveHeight(vec2 p) {
    float t = uTime;
    return (1.+.24*step(1.5,uWeather))*(.13 * sin(dot(p, vec2(.28, .96)) * .54 + t * .55)
         + .072 * sin(dot(p, vec2(-.61, .79)) * 1.13 - t * .91)
         + .031 * sin(dot(p, vec2(.86, .51)) * 2.27 + t * 1.38));
  }
  vec2 waveSlope(vec2 p, float detail) {
    float t = uTime;
    vec2 slope = .13 * .54 * vec2(.28, .96) * cos(dot(p, vec2(.28, .96)) * .54 + t * .55)
               + .072 * 1.13 * vec2(-.61, .79) * cos(dot(p, vec2(-.61, .79)) * 1.13 - t * .91)
               + .031 * 2.27 * vec2(.86, .51) * cos(dot(p, vec2(.86, .51)) * 2.27 + t * 1.38);
    vec2 warped = p + .31 * vec2(sin(p.y * .71 + t * .37), sin(p.x * .63 - t * .31));
    slope += detail * .021 * 3.8 * vec2(-.32, .95) * cos(dot(warped, vec2(-.32, .95)) * 3.8 - t * 1.68);
    slope += detail * .009 * 7.3 * vec2(.15, .99) * cos(dot(warped, vec2(.15, .99)) * 7.3 + t * 2.24);
    return slope*(1.+.24*step(1.5,uWeather));
  }
`;
function waterHeight(x,z,time){
  return (1+(weatherMode===2?.24:0))*(.13*Math.sin((x*.28+z*.96)*.54+time*.55)
       + .072*Math.sin((x*-.61+z*.79)*1.13-time*.91)
       + .031*Math.sin((x*.86+z*.51)*2.27+time*1.38));
}
const water = new THREE.Mesh(
  new THREE.PlaneGeometry(600, 600, compactDevice?144:220, compactDevice?144:220),
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
      ${waterWaves}
      uniform vec3 uCamera; uniform vec3 uMoon;
      uniform sampler2D uReflection;
      uniform vec2 uBoatPosition; uniform vec2 uBoatDirection; uniform float uBoatSpeed;
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
        float boatZ=-dot(relativeToBoat,uBoatDirection);
        float boatT=(boatZ+2.42)/4.76;
        if(boatT>.12&&boatT<.83){
          float halfBeam=.035+.94*pow(max(sin(3.14159265*.79*boatT),0.),.94);
          float acrossBoat=abs(dot(relativeToBoat,vec2(-uBoatDirection.y,uBoatDirection.x)));
          if(acrossBoat<halfBeam*.58)discard;
        }
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
        float fresnel=pow(1.-max(dot(normal,viewDirection),0.),3.);

        float cloud=noise(reflection.xz*8.+p*.017+uTime*.014);
        float dawn=1.-step(.5,abs(uWeather-1.));
        float rain=step(1.5,uWeather);
        vec3 deep=mix(vec3(.009,.036,.047),vec3(.10,.064,.066),dawn);
        deep=mix(deep,vec3(.021,.039,.046),rain);
        vec3 reflectedSky=mix(vec3(.031,.080,.100),vec3(.076,.126,.139),smoothstep(.34,.72,cloud));
        reflectedSky=mix(reflectedSky,vec3(.28,.16,.17),dawn);
        reflectedSky=mix(reflectedSky,vec3(.075,.098,.105),rain);
        vec3 color=mix(deep,reflectedSky,.32+.55*fresnel);
        color+=vec3(.010,.025,.028)*max(dot(normal,normalize(vec3(-.2,1.,-.35))),0.);

        vec4 projected=vMirrorCoord;
        float boatProximity=1.-smoothstep(1.4,6.5,length(relativeToBoat));
        projected.xy+=normal.xz*(.018+.000035*distanceToCamera+boatProximity*.045)*projected.w;
        vec3 reflectedScene=texture2DProj(uReflection,projected).rgb;
        color=mix(color,reflectedScene,(.53+.27*fresnel)*(1.-boatProximity*.58)*(1.-rain*.28));

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
        color+=lightColor*(softGlare+brokenReflection+sharpGlint*facets+pathGlow)*(1.-rain*.97);
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
const foliageMaterial=new THREE.MeshLambertMaterial({map:leafTexture(),color:0xb6cdb0,side:THREE.DoubleSide,transparent:true,alphaTest:.25,depthWrite:true});
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

function shoreX(side, z) { return side * (20.5 + Math.sin(z*.035+side)*3.2 + Math.sin(z*.078)*1.35); }
function makeBank(side) {
  const vertices=[]; const indices=[]; const steps=70;
  for (let i=0;i<=steps;i++) {
    const z=-178+i*3.8, edge=shoreX(side,z);
    vertices.push(edge,-.33,z, edge+side*8,.62+Math.sin(z*.16)*.27,z, edge+side*24,1.7+Math.sin(z*.055)*.5,z);
    if(i<steps){const a=i*3; indices.push(a,a+1,a+3,a+1,a+4,a+3,a+1,a+2,a+4,a+2,a+5,a+4);}
  }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)); g.setIndex(indices); g.computeVertexNormals();
  const mesh=new THREE.Mesh(g,soil); scene.add(mesh);
}
makeBank(-1); makeBank(1);

async function loadShorelineTrees() {
  try {
    const loader=new GLTFLoader();
    const models=await Promise.all(['oak','willow','slim','palm','banyan','kapok'].map(name=>loader.loadAsync(`/models/${name}.glb`)));
    for(const model of models)model.scene.traverse(object=>{
      if(object.isMesh){
        object.castShadow=false;
        object.receiveShadow=false;
        for(const material of Array.isArray(object.material)?object.material:[object.material]){
          material.side=THREE.DoubleSide;
          if(material.name.includes('deep leaves'))material.color.setHex(0x143b24);
          else if(material.name.includes('moonlit leaves'))material.color.setHex(0x285534);
          else if(material.name.includes('bark'))material.color.setHex(0x19291e);
        }
      }
    });
    const speciesByLayer=[
      [0,0,1,1,2,3,4,4,4,5],
      [0,1,2,3,3,4,4,5,5,5],
      [0,1,2,3,4,4,5,5,5,5]
    ];
    const instanceTransforms=models.map(()=>[]);
    function plantTree(side,z,inset,scale,layer){
      const species=speciesByLayer[layer];
      const choice=species[Math.floor(random()*species.length)];
      const position=new THREE.Vector3(shoreX(side,z)+side*inset,.52,z);
      const rotation=range(0,TAU);
      const size=new THREE.Vector3(scale*range(.87,1.14),scale*range(.92,1.17),scale*range(.87,1.14));
      if(compactDevice){
        instanceTransforms[choice].push(new THREE.Matrix4().compose(position,new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),rotation),size));
      }else{
        const model=models[choice].scene.clone(true);
        model.position.copy(position);model.rotation.y=rotation;model.scale.copy(size);
        scene.add(model);
        swayingTrees.push({group:model,phase:range(0,TAU),strength:range(.002,.008)});
      }
    }
    for(const side of [-1,1]){
      for(let z=-167;z<89;z+=compactDevice?range(5.5,6.8):range(4.0,5.2)){
        plantTree(side,z,range(1.0,3.8),range(.82,1.32),0);
        if(random()>(compactDevice?.31:.10))plantTree(side,z+range(-3.5,3.5),range(5,11),range(1.25,1.95),1);
        if(random()>(compactDevice?.57:.35))plantTree(side,z+range(-4.5,4.5),range(11,20),range(1.3,2.02),2);
      }
      for(let z=-160;z<87;z+=compactDevice?range(6.5,8.5):range(3.8,5.8)){
        const bush=new THREE.Mesh(bushGeometry,foliageMaterial);
        bush.position.set(shoreX(side,z)+side*range(.5,3.4),.38,z+range(-1.8,1.8));
        bush.rotation.y=range(0,TAU);bush.scale.setScalar(range(.43,.88));
        scene.add(bush);
      }
    }
    if(compactDevice){
      const composed=new THREE.Matrix4();
      models.forEach((model,index)=>{
        const placements=instanceTransforms[index];
        if(!placements.length)return;
        model.scene.updateMatrixWorld(true);
        model.scene.traverse(source=>{
          if(!source.isMesh)return;
          const instances=new THREE.InstancedMesh(source.geometry,source.material,placements.length);
          instances.instanceMatrix.setUsage(THREE.StaticDrawUsage);
          placements.forEach((matrix,i)=>instances.setMatrixAt(i,composed.multiplyMatrices(matrix,source.matrixWorld)));
          instances.instanceMatrix.needsUpdate=true;
          instances.computeBoundingSphere();
          scene.add(instances);
        });
      });
    }
  } catch (cause) {
    console.error('Blender trees could not load; using procedural shoreline:',cause);
    for(const side of [-1,1])for(let z=-160;z<91;z+=range(4.5,6.5)){
      createDetailedTree(shoreX(side,z)+side*range(2,14),z,range(1.0,2.1));
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
ridge.position.z=-178; scene.add(ridge);

const stoneMaterial=new THREE.MeshStandardMaterial({color:0x172724,roughness:1});
for(let i=0;i<(compactDevice?48:86);i++){
  const side=random()>.5?1:-1, z=range(-160,82), edge=shoreX(side,z), x=edge+side*range(-.6,8);
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
function boatProfile(t){
  const end=Math.abs(t*2-1);
  const stern=THREE.MathUtils.smoothstep(t,.75,1);
  const bow=Math.max(0,1-t*2);
  return {z:-2.42+t*4.76,w:.035+.94*Math.pow(Math.sin(Math.PI*.79*t),.94),rail:.36+.17*end*end,chine:-.13+.10*end*end,keel:-.35+.28*bow*bow+.10*stern*stern};
}
const boatSections=Array.from({length:33},(_,i)=>boatProfile(i/32));
function hullSurface(side,levels,material){
  const vertices=[],uvs=[],indices=[];
  boatSections.forEach((p,i)=>levels(p).forEach(([x,y],j)=>{
    vertices.push(side*x,y,p.z);uvs.push(i/32*3.5,j/(levels(p).length-1));
  }));
  const rows=levels(boatSections[0]).length;
  for(let i=0;i<32;i++)for(let j=0;j<rows-1;j++){
    const a=i*rows+j,b=(i+1)*rows+j;
    indices.push(a,b,a+1,b,b+1,a+1);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  hull.add(new THREE.Mesh(geometry,material));
}
function tube(points,radius,material){
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
  return new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(28,points.length*2),radius,8,false),material);
}
for(const side of [-1,1]){
  hullSurface(side,p=>[[p.w,p.rail],[p.w*.91,.10],[p.w*.69,p.chine],[0,p.keel]],wood);
  hullSurface(side,p=>[[p.w*.91,p.rail-.035],[p.w*.76,.11],[p.w*.56,-.17],[p.w*.08,p.keel+.085]],woodDark);
  hull.add(tube(boatSections.map(p=>[side*p.w,p.rail,p.z]),.052,rimMaterial));
  hull.add(tube(boatSections.map(p=>[side*p.w*.90,p.rail-.045,p.z]),.021,woodLit));
  for(const depth of [.34,.67]){
    hull.add(tube(boatSections.slice(3,-3).map(p=>[
      side*p.w*(.91-.35*depth),
      (p.rail-.035)*(1-depth)-.17*depth,
      p.z
    ]),.009,woodLit));
  }
  for(const fraction of [.36,.68]){
    hull.add(tube(boatSections.slice(2,-2).map(p=>[side*p.w*(1-fraction*.25),p.rail+(p.chine-p.rail)*fraction,p.z]),.008,woodDark));
  }
}
const stern=boatSections[boatSections.length-1];
const transomGeometry=new THREE.BufferGeometry();
transomGeometry.setAttribute('position',new THREE.Float32BufferAttribute([
  -stern.w,stern.rail,stern.z,stern.w,stern.rail,stern.z,
  -stern.w*.72,stern.chine,stern.z,stern.w*.72,stern.chine,stern.z,
  0,stern.keel,stern.z
],3));
transomGeometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,1,1,1,.16,.24,.84,.24,.5,0],2));
transomGeometry.setIndex([0,2,1,1,2,3,2,4,3]);
transomGeometry.computeVertexNormals();
hull.add(new THREE.Mesh(transomGeometry,wood));
hull.add(tube([[-stern.w,stern.rail,stern.z],[0,stern.rail+.016,stern.z],[stern.w,stern.rail,stern.z]],.048,rimMaterial));
for(const y of [.18,-.035]){
  const width=stern.w*(y>.1?.88:.72);
  hull.add(tube([[-width,y,stern.z+.006],[0,y-.012,stern.z+.008],[width,y,stern.z+.006]],.009,woodDark));
}
for(const x of [-stern.w*.38,0,stern.w*.38]){
  hull.add(tube([[x,stern.rail-.06,stern.z+.008],[x*.88,stern.chine+.025,stern.z+.008]],.007,woodDark));
}
const bowDeckProfile=boatProfile((-1.7+2.42)/4.76);
const bowDeckGeometry=new THREE.BufferGeometry();
bowDeckGeometry.setAttribute('position',new THREE.Float32BufferAttribute([
  0,.48,-2.38,
  -bowDeckProfile.w*.82,.245,-1.7,
  bowDeckProfile.w*.82,.245,-1.7
],3));
bowDeckGeometry.setAttribute('uv',new THREE.Float32BufferAttribute([.5,1,0,0,1,0],2));
bowDeckGeometry.setIndex([0,1,2]);bowDeckGeometry.computeVertexNormals();
hull.add(new THREE.Mesh(bowDeckGeometry,woodLit));
for(const z of [-1.72,-1.03,-.34,.36,1.04,1.68]){
  const p=boatProfile((z+2.42)/4.76),w=p.w*.83;
  hull.add(tube([[-w,p.rail-.11,z],[-w*.76,-.02,z],[-w*.45,-.24,z],[0,-.265,z],[w*.45,-.24,z],[w*.76,-.02,z],[w,p.rail-.11,z]],.025,woodLit));
}
const floorUnderlay=new THREE.Mesh(new THREE.BoxGeometry(1.04,.018,3.52),woodDark);
floorUnderlay.position.set(0,-.287,.015);hull.add(floorUnderlay);
const floorBoardGeometry=new THREE.BoxGeometry(.165,.028,.398);
for(let i=-2;i<=2;i++)for(let j=0;j<8;j++){
  const plank=new THREE.Mesh(floorBoardGeometry,(i+j)%4===0?woodLit:wood);
  plank.position.set(i*.18,-.255,-1.5+j*.43+(i%2)*.016);hull.add(plank);
}
for(const z of [-.96,.73,1.73]){
  const p=boatProfile((z+2.42)/4.76);
  const seat=new THREE.Mesh(new THREE.BoxGeometry(p.w*1.72,.085,z>1.5?.27:.34),woodLit);
  seat.position.set(0,z>1.5?.22:.105,z);hull.add(seat);
  for(const side of [-1,1]){
    const support=new THREE.Mesh(new THREE.BoxGeometry(.065,.31,.11),woodDark);
    support.position.set(side*p.w*.68,z>1.5?.032:-.083,z);hull.add(support);
    const rivet=new THREE.Mesh(new THREE.SphereGeometry(.016,8,5),iron);
    rivet.position.set(side*p.w*.75,z>1.5?.269:.154,z);hull.add(rivet);
  }
}
for(const z of [-1.99,1.92]){
  const p=boatProfile((z+2.42)/4.76);
  const beam=new THREE.Mesh(new THREE.BoxGeometry(p.w*1.35,.055,.12),rimMaterial);
  beam.position.set(0,p.rail-.045,z);hull.add(beam);
}
const bowTip=new THREE.Mesh(new THREE.SphereGeometry(.067,12,8),rimMaterial);
bowTip.position.set(0,.535,-2.42);hull.add(bowTip);
const boatFloatY=-.23;
boat.position.set(0,boatFloatY,7); scene.add(boat);

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
  camera.position.set(0,3.4,17.4); status.textContent='Back at the beginning';clearWake();
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
  weatherBedGain=audioContext.createGain();weatherBedGain.gain.value=weatherMode===2?.26:0;
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
const weatherNames=['Moonlit night','Dawn','Rain'];
function applyWeather(){
  const dawn=weatherMode===1,raining=weatherMode===2;
  root.dataset.weather=weatherMode===0?'night':dawn?'dawn':'rain';
  weatherLabel.textContent=weatherMode===0?'Moonlit':weatherNames[weatherMode];
  weatherButton.setAttribute('aria-label',`Change weather, current: ${weatherNames[weatherMode]}`);
  sceneHeading.innerHTML=weatherMode===0?'A quieter way<br>through the night.':dawn?'A quieter way<br>into the dawn.':'A quieter way<br>through the rain.';
  scenePrompt.textContent=weatherMode===0?'Set out. Follow the light.':dawn?'Set out. Meet the morning.':'Set out. Listen to the rain.';
  sky.material.uniforms.uWeather.value=weatherMode;
  waterUniforms.uWeather.value=weatherMode;
  waterUniforms.uMoon.value.copy(dawn?sunPosition:moonPosition);
  moon.visible=halo.visible=weatherMode===0;
  sun.visible=sunHalo.visible=dawn;
  stars.visible=weatherMode===0;
  rain.visible=raining;
  scene.background.setHex(dawn?0x2c2631:raining?0x17232a:0x07131b);
  scene.fog.color.setHex(dawn?0x624b54:raining?0x203039:0x081b1c);
  scene.fog.density=dawn?.0037:raining?.006:.0042;
  hemiLight.color.setHex(dawn?0xffc6a9:raining?0x91a7ad:0x9ebbd0);
  hemiLight.groundColor.setHex(dawn?0x352b2d:raining?0x101c23:0x071315);
  hemiLight.intensity=dawn?2.55:raining?2.0:2.15;
  moonLight.color.setHex(dawn?0xffaa76:raining?0xb5c9cc:0xffe8bd);
  moonLight.intensity=dawn?3.05:raining?1.0:2.7;
  moonLight.position.copy(dawn?sunPosition:new THREE.Vector3(-5,24,-80));
  renderer.toneMappingExposure=dawn?1.32:raining?1.32:1.42;
  if(weatherBedGain)weatherBedGain.gain.setTargetAtTime(raining?.26:0,audioContext.currentTime,.6);
}
weatherButton.addEventListener('click',()=>{weatherMode=(weatherMode+1)%3;applyWeather();});
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

const desiredCamera=new THREE.Vector3(); const lookTarget=new THREE.Vector3(); const clock=new THREE.Clock();
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

  const throttle=(keys.forward?1:0)-(keys.reverse?1:0);
  const turn=(keys.left?1:0)-(keys.right?1:0);
  const targetSpeed=throttle>0?4.1:throttle<0?-2.2:0;
  speed=lerp(speed,targetSpeed,1-Math.exp(-(throttle?1.45:.85)*dt));
  if(Math.abs(speed)<.008)speed=0;
  heading+=turn*(.48+Math.min(Math.abs(speed),3)*.15)*dt*(speed<-.1?-1:1);
  boat.position.x-=Math.sin(heading)*speed*dt;
  boat.position.z-=Math.cos(heading)*speed*dt;
  const left=shoreX(-1,boat.position.z)+4,right=shoreX(1,boat.position.z)-4;
  const beforeX=boat.position.x;
  boat.position.x=clamp(boat.position.x,left,right);boat.position.z=clamp(boat.position.z,-160,80);
  boat.position.y=boatFloatY+waterHeight(boat.position.x,boat.position.z,elapsed)*.85;
  if(beforeX!==boat.position.x){speed*=.8;status.textContent='Close to shore — steer toward open water';}
  else if(riding&&Math.abs(speed)>.4)status.textContent='The water is yours to explore';
  boat.rotation.y=heading;
  waterUniforms.uBoatPosition.value.set(boat.position.x,boat.position.z);
  waterUniforms.uBoatDirection.value.set(-Math.sin(heading),-Math.cos(heading));
  waterUniforms.uBoatSpeed.value=Math.abs(speed);
  if(Math.abs(speed)>.6&&elapsed-lastWakeAt>.24){
    const point=waterUniforms.uWakePoints.value[wakeCursor];
    point.set(boat.position.x+Math.sin(heading)*1.35,boat.position.z+Math.cos(heading)*1.35,heading,0);
    wakeBorn[wakeCursor]=elapsed;wakeCursor=(wakeCursor+1)%wakeBorn.length;lastWakeAt=elapsed;
  }
  for(let i=0;i<wakeBorn.length;i++)waterUniforms.uWakePoints.value[i].w=wakeBorn[i]<0?-1:elapsed-wakeBorn[i];
  hull.position.y=Math.sin(elapsed*1.55)*.012+Math.sin(elapsed*.74)*.008;
  hull.rotation.z=Math.sin(elapsed*1.1)*.013+turn*.016;
  hull.rotation.x=Math.sin(elapsed*1.33)*.012+clamp(speed/4,-1,1)*.012;
  for(const tree of swayingTrees)tree.group.rotation.z=Math.sin(elapsed*.75+tree.phase)*tree.strength;
  if(weatherMode===2){
    rain.position.set(camera.position.x,0,camera.position.z-12);
    for(let i=0;i<rainCount;i++){
      const drop=rainSeeds[i];
      const y=1+((drop.y-elapsed*drop.speed)%34+34)%34;
      const offset=i*6;
      rainPositions[offset]=drop.x;rainPositions[offset+1]=y;rainPositions[offset+2]=drop.z;
      rainPositions[offset+3]=drop.x+.13;rainPositions[offset+4]=y-drop.length;rainPositions[offset+5]=drop.z+.07;
    }
    rainGeometry.attributes.position.needsUpdate=true;
  }
  const followDistance=innerWidth<700?8.0:7.6;
  desiredCamera.set(Math.sin(heading)*followDistance,3.38-boat.position.y,Math.cos(heading)*followDistance).add(boat.position);
  camera.position.lerp(desiredCamera,1-Math.exp(-1.9*dt));
  lookTarget.set(boat.position.x,boat.position.y+.9,boat.position.z-3.1);
  const forward=new THREE.Vector3(-Math.sin(heading),0,-Math.cos(heading));
  lookTarget.copy(boat.position).addScaledVector(forward,5.1);lookTarget.y=1.02;
  camera.lookAt(lookTarget);
  sky.position.copy(camera.position);
  stars.position.copy(camera.position);
  moon.lookAt(camera.position);halo.lookAt(camera.position);
  sun.lookAt(camera.position);sunHalo.lookAt(camera.position);
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
