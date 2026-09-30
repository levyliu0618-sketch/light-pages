'use strict';
const $=id=>document.getElementById(id);
const slides=[...document.querySelectorAll('.slide')];
const DEMO_SLIDE=6;
let currentSlide=0, lightMode='0', demoStage='idle', transportMode='preview', lightRequest=0;
const dots=$('slide-dots');
const bridge=new LightPagesSerial(handleConnection,(mode,message)=>{
  ++lightRequest;renderStage('idle');setStatus(message);setStageButtonsEnabled(true);
});

function setStatus(message){
  $('demo-status').textContent=message;
  $('demo-announcement').textContent=message;
}
function renderStage(stage){
  demoStage=stage;lightMode=stage==='compare'?'C':['A','B'].includes(stage)?stage:'0';
  $('demo-stage').dataset.stage=stage;
  // Keep the same geometry aligned while the selected lighting/photo state fades in.
  // No animation timers: a rapid second click smoothly redirects the transition.
  document.querySelectorAll('[data-book-state]').forEach(img=>{
    img.setAttribute('aria-hidden',String(img.dataset.bookState!==stage));
  });
  window.bookTurnDemo?.setStage(stage);
  $('book-state-description').textContent={idle:'Both displays are blank and both light pages are off.',A:'Left display: child in the mirror. Left page on; right display and page off.',B:'Right display: road and front passengers. Right page on; left display and page off.',compare:'Both displays show their perspectives; both outer pages are on.'}[stage];
  document.querySelectorAll('button[data-stage]').forEach(button=>{
    const selected=button.dataset.stage===stage;
    button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));
  });
}
function handleConnection(state,message){
  ++lightRequest;renderStage('idle');
  transportMode=state==='connected'?'hardware':state==='connecting'?'connecting':state==='disconnected'?'preview':'error';
  $('mode-label').textContent={hardware:'Connected',connecting:'Connecting…',preview:'Simulation',error:'Check connection'}[transportMode];
  $('mode-label').dataset.mode=transportMode;
  setStatus(message);
  $('connect').disabled=state==='connecting'||!navigator.serial;$('connect').hidden=state==='connected';
  $('disconnect').hidden=state!=='connected';$('rehearsal').hidden=state!=='error';
  setStageButtonsEnabled(state!=='connecting'&&state!=='error');
  if(state==='connected')$('hardware-dialog').close();
  if(state==='error')toast(message);
}
function setStageButtonsEnabled(enabled){
  document.querySelectorAll('button[data-stage]').forEach(b=>b.disabled=!enabled);
}
async function chooseStage(stage){
  if(!['A','B','idle','compare'].includes(stage))return false;
  const mode=stage==='compare'?'C':['A','B'].includes(stage)?stage:'0';
  const request=++lightRequest;
  if(transportMode==='preview'){
    renderStage(stage);
    setStatus(stage==='compare'?'Simulation: both displays and both outer pages are on. No hardware command sent.':
      stage==='idle'?'Simulation. No photo selected. No hardware command sent.':
      'Simulation: '+(stage==='B'?'the road from the rear seat.':'the child in the rear-view mirror.')+' No hardware command sent.');
    return true;
  }
  if(transportMode!=='hardware')return false;
  setStatus(mode==='0'?'Requesting both outputs off…':'Requesting Light '+mode+'…');
  setStageButtonsEnabled(false);
  $('reset-demo').disabled=false;
  try{
    await bridge.setMode(mode);
    if(request!==lightRequest)return false;
    renderStage(stage);
    setStatus(mode==='0'?'Board acknowledged both outputs off.':mode==='C'?'Board acknowledged both lights on. Check both physical LEDs.':'Board acknowledged Light '+mode+'. Check the physical LED.');
    return true;
  }catch(error){
    if(request===lightRequest)await bridge.fail(error.message);
    return false;
  }finally{
    if(request===lightRequest&&transportMode==='hardware')setStageButtonsEnabled(true);
  }
}
function chooseLight(mode){return chooseStage(mode==='0'?'idle':mode);}
function showSlide(index){
  const next=Math.max(0,Math.min(slides.length-1,index));
  if(currentSlide===DEMO_SLIDE&&next!==DEMO_SLIDE)void chooseStage('idle');
  currentSlide=next;
  document.body.classList.toggle('paper-theme',[1,5].includes(currentSlide));
  slides.forEach((slide,i)=>{slide.hidden=i!==currentSlide;slide.classList.toggle('is-active',i===currentSlide);});
  [...dots.children].forEach((b,i)=>b.setAttribute('aria-current',String(i===currentSlide)));
  $('slide-count').textContent=String(currentSlide+1).padStart(2,'0')+' / '+String(slides.length).padStart(2,'0');
  $('chapter-title').textContent=slides[currentSlide].dataset.label;
  $('prev').disabled=currentSlide===0;$('next').disabled=currentSlide===slides.length-1;
  history.replaceState(null,'','#'+(currentSlide+1));window.scrollTo(0,0);
}
slides.forEach((slide,i)=>{const b=document.createElement('button');b.setAttribute('aria-label','Slide '+(i+1)+': '+slide.dataset.label);b.onclick=()=>showSlide(i);dots.append(b);});
$('prev').onclick=()=>showSlide(currentSlide-1);$('next').onclick=()=>showSlide(currentSlide+1);
$('chapter-title').onclick=e=>{e.preventDefault();showSlide(0);};
document.querySelectorAll('button[data-stage]').forEach(b=>b.onclick=()=>void chooseStage(b.dataset.stage));
$('hardware-open').onclick=()=>{void chooseStage('idle');$('hardware-dialog').showModal();};
$('hardware-close').onclick=()=>$('hardware-dialog').close();
$('connect').onclick=()=>void bridge.connect();
$('disconnect').onclick=()=>void bridge.disconnect();
$('rehearsal').onclick=()=>{
  if(bridge.port)return;
  handleConnection('disconnected','Simulation only. No physical output is being controlled.');
  $('hardware-dialog').close();
};
function focusSketch(focused){
  $('sketch-stage').classList.toggle('is-focused',focused);
  $('focus-book').setAttribute('aria-pressed',String(focused));
  $('focus-book').setAttribute('aria-label',focused?'Return to all sketches':'Focus on Road Book Light');
  $('sketch-focus-close').hidden=!focused;
  document.querySelectorAll('[data-sketch]').forEach(b=>{b.inert=focused;});
}
$('focus-book').onclick=()=>focusSketch(!$('sketch-stage').classList.contains('is-focused'));
$('sketch-focus-close').onclick=()=>{focusSketch(false);$('focus-book').focus();};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Use your browser’s full-screen command.');}};
document.addEventListener('fullscreenchange',()=>{$('fullscreen').textContent=document.fullscreenElement?'Exit full screen ↙':'Full screen ↗';});
let toastTimer;
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5000);}

const sketchNames=['Road Book Light','Rearview Fold','Together Light','Family Grip Handle','Window Memory Shade','Backseat Horizon Organizer','Growing Rest Headrest'];
const archive=$('appendix-content');
archive.innerHTML=`
<section class="archive-section"><h3>01 / Moodboard V1</h3><img src="appendix-mood-v1-1.jpg" alt="Moodboard V1" loading="lazy"></section>
<section class="archive-section"><h3>02 / Moodboard V2</h3><img src="appendix-mood-v2-1.jpg" alt="Moodboard V2" loading="lazy"></section>
<section class="archive-section"><h3>03 / Technology Signals</h3><img src="appendix-technology-1.jpg" alt="Technology Signals" loading="lazy"></section>
<section class="archive-section"><h3>04 / Peer Feedback</h3><div class="archive-grid"><img src="appendix-6748.jpg" alt="Peer Feedback 1" loading="lazy"><img src="appendix-6749.jpg" alt="Peer Feedback 2" loading="lazy"><img src="appendix-6750.jpg" alt="Peer Feedback 3" loading="lazy"></div></section>
<section class="archive-section"><h3>05 / Prototype Explorations</h3><div class="archive-grid"><img src="appendix-7128.jpg" alt="Prototype Explorations 1" loading="lazy"><img src="appendix-7129.jpg" alt="Prototype Explorations 2" loading="lazy"><img src="appendix-7130.jpg" alt="Prototype Explorations 3" loading="lazy"><img src="appendix-7131.jpg" alt="Prototype Explorations 4" loading="lazy"><img src="appendix-7143.jpg" alt="Prototype Explorations 5" loading="lazy"></div></section>`;
function openAppendix(){void chooseLight('0');$('appendix').showModal();document.body.classList.add('modal-open');}
$('appendix-open').onclick=openAppendix;$('appendix-close').onclick=()=>$('appendix').close();
$('appendix').addEventListener('close',()=>document.body.classList.remove('modal-open'));
function zoomImage(img){$('image-large').src=img.src;$('image-large').alt=img.alt;$('image-caption').textContent=img.alt;$('image-dialog').showModal();}
document.querySelectorAll('img[data-zoom],#appendix-content img').forEach(img=>{img.tabIndex=0;img.setAttribute('role','button');img.setAttribute('aria-label',`Enlarge: ${img.alt}`);img.onclick=()=>zoomImage(img);img.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();zoomImage(img);}};});
$('image-close').onclick=()=>$('image-dialog').close();
document.querySelectorAll('[data-sketch]').forEach(b=>b.onclick=()=>zoomImage(b.querySelector('img')));
document.addEventListener('keydown',e=>{
  if(e.key==='Escape' && !document.querySelector('dialog[open]')){void chooseLight('0');focusSketch(false);return;}
  if(document.querySelector('dialog[open]')||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
  if(e.key==='0'){e.preventDefault();void chooseLight('0');}
  if(currentSlide===DEMO_SLIDE&&['1','2','3'].includes(e.key)){e.preventDefault();void chooseStage({'1':'A','2':'B','3':'compare'}[e.key]);}
  if(e.key==='ArrowRight'){e.preventDefault();showSlide(currentSlide+1);}
  if(e.key==='ArrowLeft'){e.preventDefault();showSlide(currentSlide-1);}
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){void chooseLight('0');bridge.stopHeartbeat();}
  else if(bridge.ready)bridge.startHeartbeat();
});
window.addEventListener('pagehide',()=>{bridge.stopHeartbeat();if(bridge.ready)void bridge.write('OFF').catch(()=>{});});

// Agent-accessible metadata and SCREEN-ONLY rehearsal; never expose motor/LED actuation.
if(document.modelContext?.registerTool){
  const lifecycle=new AbortController();
  const register=tool=>{try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
  register({name:'read_presentation_state',title:'Read Light Pages presentation state',description:'Read the current slide and connection mode. Does not connect to or control hardware.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute(input){if(!input||typeof input!=='object'||Object.keys(input).length)throw new Error('Expected an empty object.');return{slide:currentSlide+1,title:slides[currentSlide].dataset.label,mode:transportMode,light:lightMode,stage:demoStage};}});
  register({name:'rehearse_screen_perspective',title:'Rehearse a perspective on screen only',description:'Select A, B or off in screen rehearsal mode. Refuses when hardware is connected or pending; never sends an Arduino command.',inputSchema:{type:'object',properties:{perspective:{type:'string',enum:['A','B','0']}},required:['perspective'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},async execute(input){if(!input||Object.keys(input).length!==1||!['A','B','0'].includes(input.perspective))throw new Error('Expected perspective A, B or 0.');if(transportMode!=='preview'||bridge.port)throw new Error('Screen-only rehearsal requires no hardware connection.');showSlide(DEMO_SLIDE);await chooseLight(input.perspective);return{mode:'screen-only',perspective:lightMode};}});
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
if(!navigator.serial){$('connect').disabled=true;$('connect').textContent='Use Chrome for Arduino';}
renderStage('idle');showSlide(Number(location.hash.slice(1))-1||0);
