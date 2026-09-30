'use strict';
// Visual light study only: never accesses hardware, cameras or recordings.
window.LightPagesGlow={create({root,render,isOn,getAngle}){
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let value=.70,bias=0,phase=0,boost=0,raf=0,last=0,active=true,lastDraw=0;
  const output={get value(){return value},get bias(){return bias},wake};
  function paint(){
    root.style.setProperty('--glow-opacity',String(value*.68));
    root.style.setProperty('--glow-position',`${50+bias*19}%`);
    root.dataset.lightLevel=value.toFixed(3);
    root.dataset.lightBias=bias.toFixed(3);
    render();
  }
  function tick(now){
    raf=0;
    if(!active||document.hidden)return;
    const dt=last?Math.min((now-last)/1000,.08):.016;last=now;
    phase+=dt*(2*Math.PI/8.5);
    boost*=Math.exp(-dt/2.4);
    const target=isOn()?(reduced.matches ? .80 : .67+.37*Math.sin(phase)+.24*boost):0;
    value+=(target-value)*(reduced.matches?1:1-Math.exp(-dt/1.1));
    bias+=(Math.max(-1,Math.min(1,getAngle()/65))-bias)*(1-Math.exp(-dt/1.35));
    if(now-lastDraw>32){paint();lastDraw=now;}
    const settled=Math.abs(value-target)<.002;
    if((isOn()&&!reduced.matches)||!settled)raf=requestAnimationFrame(tick);
    else paint();
  }
  function wake(){if(!active||document.hidden)return;if(!raf){last=0;raf=requestAnimationFrame(tick);}}
  function engage(){boost=1;wake();}
  root.addEventListener('pointerdown',engage);
  root.addEventListener('pointermove',event=>{if(event.buttons)engage();});
  root.addEventListener('keydown',engage);
  root.addEventListener('click',engage);
  root.addEventListener('input',engage);
  reduced.addEventListener('change',wake);
  document.addEventListener('visibilitychange',()=>{cancelAnimationFrame(raf);raf=0;last=0;wake();});
  window.addEventListener('message',event=>{
    if(event.source!==parent||event.origin!==location.origin||event.data?.type!=='light-pages-visibility')return;
    active=Boolean(event.data.active);root.dataset.lightActive=String(active);
    cancelAnimationFrame(raf);raf=0;last=0;wake();
  });
  window.addEventListener('pagehide',()=>{active=false;cancelAnimationFrame(raf);});
  wake();return output;
}};
