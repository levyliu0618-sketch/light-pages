'use strict';
(() => {
  const dialog=document.getElementById('record-dialog');
  const photo=document.getElementById('record-large');
  const video=document.getElementById('record-player');
  let lastTrigger=null;
  function stop(){video.pause();video.removeAttribute('src');video.load();}
  document.querySelectorAll('[data-photo],[data-video]').forEach(button=>{
    button.addEventListener('click',()=>{
      stop();lastTrigger=button;
      const isVideo=Boolean(button.dataset.video);
      const src=button.dataset.video||button.dataset.photo;
      photo.hidden=isVideo;video.hidden=!isVideo;
      document.getElementById('record-title').textContent=button.dataset.title;
      document.getElementById('record-original').href=src;
      if(isVideo){video.poster=button.querySelector('img').src;video.src=src;video.load();}
      else{photo.src=src;photo.alt=button.querySelector('img').alt;}
      dialog.showModal();document.body.classList.add('modal-open');
      if(isVideo)void video.play().catch(()=>{});
    });
  });
  document.getElementById('record-close').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{stop();document.body.classList.remove('modal-open');lastTrigger?.focus();});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)video.pause();});
  document.querySelectorAll('iframe[data-src]').forEach(frame=>{
    const slide=frame.closest('.slide');
    function syncModel(){
      if(!slide.hidden&&!frame.getAttribute('src'))frame.src=frame.dataset.src;
      if(frame.getAttribute('src'))frame.contentWindow?.postMessage({type:'light-pages-visibility',active:!slide.hidden&&!document.hidden},location.origin);
    }
    frame.addEventListener('load',syncModel);
    new MutationObserver(syncModel).observe(slide,{attributes:true,attributeFilter:['hidden']});
    document.addEventListener('visibilitychange',syncModel);
    syncModel();
  });
})();
