import * as THREE from 'three';
import { GLTFLoader } from './GLTFLoader.js';

// Local, visual-only animation. Serial control remains in the existing app.
const host=document.getElementById('demo-stage');
const toggle=document.getElementById('turn-mode');
const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
const layer=document.createElement('div');
layer.className='book-live';layer.setAttribute('aria-hidden','true');host.append(layer);
let renderer, scene, camera, book, poses, ready=false, enabled=true, post;
let frame=0, stage=host.dataset.stage||'idle', transition=null;
let currentAngles=[], levels={A:0,B:0};
const hinges=[],leaves=[],screens={};
let baseZ=0, viewWidth=0, viewHeight=0, lastTick=0, renderedFrames=0;
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const lerp=(a,b,t)=>a+(b-a)*t;
const desiredLights=s=>({A:s==='A'||s==='compare'?1:0,B:s==='B'||s==='compare'?1:0});

function clothDetail(material){
  material.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 vWeavePosition;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvWeavePosition=position;');
    shader.fragmentShader='varying vec3 vWeavePosition;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
      #include <color_fragment>
      vec2 weaveCoord=vWeavePosition.xy*2.8;
      float weaveAA=1.0-smoothstep(.55,2.0,max(fwidth(weaveCoord.x),fwidth(weaveCoord.y)));
      float weave=sin(weaveCoord.x)*sin(weaveCoord.y);
      diffuseColor.rgb*=1.0+.22*weave*weaveAA;
    `);
  };
  material.customProgramCacheKey=()=> 'light-pages-cloth-v1';
}

function screenMaterial(source){
  const uniform={value:0};
  const material=new THREE.MeshBasicMaterial({map:source.map,side:THREE.DoubleSide,toneMapped:false});
  material.onBeforeCompile=shader=>{
    shader.uniforms.uMemoryLevel=uniform;
    shader.fragmentShader='uniform float uMemoryLevel;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      #include <map_fragment>
      float grey=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
      vec3 paperPhoto=mix(vec3(grey),diffuseColor.rgb,.78)*.84+vec3(.035);
      diffuseColor.rgb=mix(vec3(.048,.053,.051),paperPhoto,uMemoryLevel);
    `);
  };
  material.customProgramCacheKey=()=> 'light-pages-memory-screen-v1';
  return {material,uniform};
}

function applyPose(now){
  if(transition){
    const elapsed=(now-transition.started)/transition.duration;
    const p=motionPreference.matches?1:smooth(elapsed);
    currentAngles=transition.fromAngles.map((a,i)=>lerp(a,transition.toAngles[i],p));
    // The image enters gently as the selected side is being revealed.
    const lightProgress=motionPreference.matches?1:smooth((elapsed-.08)/.78);
    for(const key of ['A','B'])levels[key]=lerp(transition.fromLights[key],transition.toLights[key],lightProgress);
    if(elapsed>=1||motionPreference.matches){
      currentAngles=[...transition.toAngles];levels={...transition.toLights};transition=null;
    }
  }
  hinges.forEach((hinge,i)=>hinge.rotation.set(0,-THREE.MathUtils.degToRad(currentAngles[i]),0));
  screens.A.uniform.value=levels.A;screens.B.uniform.value=levels.B;
  leaves.forEach((leaf,i)=>{
    const brightness=i===7?levels.A:i===0?levels.B:0;
    leaf.material.emissive.setRGB(1,.63,.29);
    leaf.material.emissiveIntensity=brightness*2.8;
  });
  book.position.z=baseZ+(motionPreference.matches?0:Math.sin(now*.0009)*3.2);
}

function active(){return enabled&&ready&&!document.hidden&&!host.closest('.slide').hidden;}
function tick(now){
  frame=0;
  if(!active())return;
  applyPose(now);lastTick=now;
  draw();
  if(!motionPreference.matches||transition)frame=requestAnimationFrame(tick);
}
function start(){if(active()&&!frame)frame=requestAnimationFrame(tick);}
function resize(){
  if(!renderer||!camera)return;
  const {width,height}=host.getBoundingClientRect();
  if(!width||!height)return;
  const aspect=width/height;
  const h=Math.max(viewHeight,viewWidth/aspect)/2;
  camera.left=-h*aspect;camera.right=h*aspect;camera.top=h;camera.bottom=-h;
  camera.updateProjectionMatrix();renderer.setSize(width,height,false);
  if(post){const size=renderer.getDrawingBufferSize(new THREE.Vector2());post.main.setSize(size.x,size.y);post.a.setSize(Math.ceil(size.x/2),Math.ceil(size.y/2));post.b.setSize(Math.ceil(size.x/2),Math.ceil(size.y/2));}
  start();
}

// A small local HDR bloom pass: only bright, glowing pages soften at the edges.
// Product geometry stays crisp and the canvas stays transparent over the orange gradient.
function makePost(){
  const options={type:THREE.HalfFloatType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter};
  const main=new THREE.WebGLRenderTarget(1,1,options);
  main.samples=Math.min(4,renderer.capabilities.maxSamples);
  const a=new THREE.WebGLRenderTarget(1,1,options),b=new THREE.WebGLRenderTarget(1,1,options);
  const screen=new THREE.Scene(),view=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const vertexShader='varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
  const blur=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,
    uniforms:{tInput:{value:null},uStep:{value:new THREE.Vector2()},uThreshold:{value:1}},vertexShader,
    fragmentShader:`varying vec2 vUv; uniform sampler2D tInput; uniform vec2 uStep; uniform float uThreshold;
      vec3 sampleGlow(vec2 p){vec3 c=texture2D(tInput,p).rgb;float m=max(c.r,max(c.g,c.b));return mix(c,c*smoothstep(1.7,3.1,m),uThreshold);}
      void main(){vec3 c=sampleGlow(vUv)*.227027;c+=sampleGlow(vUv+uStep*1.384615)*.316216;c+=sampleGlow(vUv-uStep*1.384615)*.316216;c+=sampleGlow(vUv+uStep*3.230769)*.07027;c+=sampleGlow(vUv-uStep*3.230769)*.07027;gl_FragColor=vec4(c,1.);}`});
  const composite=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:true,
    uniforms:{tBase:{value:main.texture},tBloom:{value:b.texture}},vertexShader,
    fragmentShader:`varying vec2 vUv;uniform sampler2D tBase;uniform sampler2D tBloom;
      void main(){vec4 base=texture2D(tBase,vUv);vec3 bloom=texture2D(tBloom,vUv).rgb;
      float halo=clamp(max(bloom.r,max(bloom.g,bloom.b))*.16,0.,.38);
      gl_FragColor=vec4(base.rgb+bloom*.26,max(base.a,halo));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`});
  const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),composite);screen.add(quad);
  return {main,a,b,screen,view,quad,blur,composite};
}
function draw(){
  renderer.info.reset();renderedFrames++;
  if(!post){renderer.render(scene,camera);return;}
  renderer.setRenderTarget(post.main);renderer.render(scene,camera);
  post.quad.material=post.blur;
  post.blur.uniforms.tInput.value=post.main.texture;post.blur.uniforms.uThreshold.value=1;
  post.blur.uniforms.uStep.value.set(2/post.a.width,0);
  renderer.setRenderTarget(post.a);renderer.render(post.screen,post.view);
  post.blur.uniforms.tInput.value=post.a.texture;post.blur.uniforms.uThreshold.value=0;
  post.blur.uniforms.uStep.value.set(0,2/post.a.height);
  renderer.setRenderTarget(post.b);renderer.render(post.screen,post.view);
  post.quad.material=post.composite;
  renderer.setRenderTarget(null);renderer.render(post.screen,post.view);
}
function setStage(next){
  if(!['idle','A','B','compare'].includes(next))return;
  stage=next;
  if(!ready)return;
  const now=performance.now();applyPose(now);
  transition={started:now,duration:1450,fromAngles:[...currentAngles],toAngles:[...poses[next]],
    fromLights:{...levels},toLights:desiredLights(next)};
  if(motionPreference.matches)applyPose(now);
  start();
}
function useLive(value){
  enabled=value;
  host.classList.toggle('webgl-ready',ready&&enabled);
  toggle.textContent=enabled?'Use still view':'Use page turn';
  toggle.setAttribute('aria-pressed',String(enabled));
  if(enabled){resize();setStage(host.dataset.stage||'idle');start();}
  else if(frame){cancelAnimationFrame(frame);frame=0;}
}
function fallback(reason){
  ready=false;enabled=false;transition=null;
  if(frame)cancelAnimationFrame(frame);frame=0;
  host.classList.remove('webgl-ready');host.dataset.turnStatus='fallback';
  toggle.disabled=true;toggle.textContent='Still view';
  toggle.title='Page-turn renderer unavailable; the original visual demo remains usable.';
  layer.style.display='none';
  console.warn('Page-turn fallback:',reason?.message||reason);
}

window.bookTurnDemo={setStage,
  readState:()=>({ready,enabled,stage,angles:[...currentAngles],lights:{...levels},moving:!!transition,
    renderCalls:renderer?.info.render.calls||0,triangles:renderer?.info.render.triangles||0,lastTick,renderedFrames,floatZ:book?.position.z}),
  useStillView:()=>useLive(false)
};
toggle.addEventListener('click',()=>useLive(!enabled));
new MutationObserver(()=>{resize();start();}).observe(host.closest('.slide'),{attributes:true,attributeFilter:['hidden']});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&frame){cancelAnimationFrame(frame);frame=0;}else start();});
motionPreference.addEventListener('change',()=>{if(ready){setStage(stage);start();}});

async function init(){
  renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,premultipliedAlpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.AgXToneMapping;
  renderer.toneMappingExposure=1.1;renderer.setClearColor(0x000000,0);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.VSMShadowMap;
  renderer.info.autoReset=false;
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();fallback('WebGL context lost');});
  layer.append(renderer.domElement);
  const [gltf,response]=await Promise.all([new GLTFLoader().loadAsync('./light-pages-turn.glb'),fetch('./turn-poses.json')]);
  if(!response.ok)throw new Error('Missing validated page poses');
  poses=(await response.json()).poses;
  scene=new THREE.Scene();scene.add(gltf.scene);
  camera=gltf.cameras[0];if(!camera?.isOrthographicCamera)throw new Error('Model camera missing');
  camera.near=.1;camera.far=4000;
  viewWidth=camera.right-camera.left;viewHeight=viewWidth*850/1440;
  gltf.scene.traverse(obj=>{
    const role=obj.userData.demo_role;
    if(role==='book')book=obj;
    if(role==='page_hinge')hinges[obj.userData.demo_index-1]=obj;
    if(!obj.isMesh)return;
    obj.castShadow=true;obj.receiveShadow=true;
    obj.material=obj.material.clone();
    if(obj.material.userData.demo_cloth)clothDetail(obj.material);
    if(role==='leaf'){
      leaves[obj.userData.leaf_index-1]=obj;
      obj.material.side=THREE.DoubleSide;
    }
    if(role==='screen_A'||role==='screen_B'){
      const key=role.slice(-1);screens[key]=screenMaterial(obj.material);obj.material=screens[key].material;
      obj.castShadow=false;obj.receiveShadow=false;
    }
  });
  if(!book||hinges.filter(Boolean).length!==8||leaves.filter(Boolean).length!==8||!screens.A||!screens.B)throw new Error('Incomplete book model');
  baseZ=book.position.z;currentAngles=[...poses.idle];
  const hemisphere=new THREE.HemisphereLight(0xf1eadf,0x4f453a,1.1);
  hemisphere.position.set(0,0,600);scene.add(hemisphere);
  const key=new THREE.DirectionalLight(0xffecd5,1.7);
  key.position.set(-300,-350,500);key.target.position.set(-90,-90,70);scene.add(key,key.target);
  key.castShadow=true;key.shadow.mapSize.set(1024,1024);
  Object.assign(key.shadow.camera,{left:-320,right:320,top:320,bottom:-320,near:1,far:1600});
  key.shadow.bias=-.0004;key.shadow.normalBias=.3;key.shadow.radius=4;key.shadow.blurSamples=8;
  const fill=new THREE.DirectionalLight(0xd9e0e4,.75);
  fill.position.set(320,-60,200);scene.add(fill);
  post=makePost();
  ready=true;host.dataset.turnStatus='ready';toggle.disabled=false;
  new ResizeObserver(resize).observe(host);
  resize();setStage(stage);applyPose(performance.now());
  await renderer.compileAsync(scene,camera);
  draw();useLive(true);start();
}
init().catch(fallback);
