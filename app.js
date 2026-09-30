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
  <section class="archive-section"><h3>01 / The moodboard</h3><p>Memories Between Destinations. Lived memory, sensory translation and a quiet domestic product language.</p><img src="moodboard.jpg" alt="Final moodboard supplied by Yi (Levy) Liu" loading="lazy"></section>
  <section class="archive-section"><h3>02 / The complete storyboard</h3><p>Keep a trace → enter a memory → discover another perspective. A proposed family scenario, not evidence of a tested recording system.</p><img src="storyboard.jpg" alt="Nine-panel storyboard showing recording in the car, returning modules to the book, selecting a page and revisiting memories together" loading="lazy"></section>
  <section class="archive-section"><h3>03 / Two modules, two directions</h3><div class="archive-grid"><figure><img src="car-forward.jpg" alt="Concept module mounted on the shoulder of a front seat, facing the road" loading="lazy"><figcaption>Forward-facing module. The observer sees the rear connector.</figcaption></figure><figure><img src="car-mirror.jpg" alt="Concept module mounted beside the rear-view mirror, with its lens facing passengers" loading="lazy"><figcaption>Cabin-facing module. Lens directed toward the rear passengers.</figcaption></figure></div><p class="small-note">AI-assisted scene edits. Mounting, visibility, crash safety and heat have not been validated. No driver interaction while moving.</p></section>
  <section class="archive-section"><h3>04 / The final home object</h3><p>Fabric-wrapped covers, two matte colour E-ink display concepts, layered light pages and two removable modules.</p><img src="home.jpg" alt="Final home scene concept render" loading="lazy"><p class="small-note">Concept visualization, not a manufactured product. Glow in the render is not a measured brightness or a validated recording/charging status.</p></section>
  <section class="archive-section"><h3>05 / The physical prototype</h3><div class="archive-grid"><figure><img src="prototype-open.jpg" alt="Earlier physical build manually positioned open" loading="lazy"><figcaption>Earlier build, manually positioned open. No claim of powered full travel.</figcaption></figure><figure><img src="prototype-closed.jpg" alt="Earlier physical build in its closed reference state" loading="lazy"><figcaption>Earlier build, closed reference state.</figcaption></figure><figure><img src="mechanism.jpg" alt="Current printed gears, motor mounting and physical book with folded pages" loading="lazy"><figcaption>Current build with folded pages. Automatic opening is excluded from the presentation.</figcaption></figure></div></section>
  <section class="archive-section"><h3>06 / Emerging technology, honestly situated</h3><div class="archive-text-grid"><div><h4>Shape-changing textiles</h4><p>FibeRobo explores temperature-responsive liquid-crystal-elastomer fibres that can be formed into textiles. It is a research reference for form-changing interfaces.</p><p><a href="https://www.media.mit.edu/projects/fiberobo/overview/" target="_blank" rel="noreferrer">MIT Media Lab · FibeRobo</a></p><h4>Proposed role in Light Pages</h4><p>A textile page changes form to make a selected memory physically noticeable. Light cues attention; the two images provide concrete context. Actuator placement, heat, power, response time and repeatability still need testing.</p></div><div><h4>What this prototype does not claim</h4><ul><li>No working shape-changing fibre or textile actuator.</li><li>No actual E-ink, trip archive or synchronized recording.</li><li>No proven improvement in recall or family connection.</li><li>No powered book opening in this demonstration.</li></ul><p>Today’s experiment uses manual opening, two physical LEDs and preloaded photos. Web-to-board integration must be checked on the real board after upload.</p></div></div></section>
  <section class="archive-section"><h3>07 / Original sketch archive</h3><p>All seven pages from the supplied scan. These are exploratory proposals; their mechanisms, safety and material behaviour have not been validated.</p><div class="archive-grid">${sketchNames.map((name,i)=>`<figure><img src="sketch-${i+1}.jpg" alt="Original sketch ${i+1}, ${name}" loading="lazy"><figcaption>${String(i+1).padStart(2,'0')} / ${name}</figcaption></figure>`).join('')}</div></section>
  <section class="archive-section"><h3>08 / Sources & submission follow-up</h3><p>Original sketches and final moodboard supplied by Yi (Levy) Liu. Concept renders, edited car scenes and storyboard are AI-assisted visualizations. Prototype photos document the physical build. The two reference photos illustrate different views; they are not asserted to be from one synchronized journey.</p><p><a href="https://developer.chrome.com/docs/capabilities/serial" target="_blank" rel="noreferrer">Chrome Web Serial documentation</a> supports the local Arduino connection. No camera, microphone, cloud archive or analytics is used by this website.</p><div class="pending-note"><strong>Before the Sep 30, 5 pm PDF submission</strong><p>Add the requested photograph of your desk with feedback Post-its after the presentation. That photograph and any actual class feedback have not been supplied yet. They are not fabricated here.</p></div></section>`;
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
