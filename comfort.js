(() => {
  const ids={'theme-mode':'manual',surface:'neutral',font:'system',motion:false,shadows:false,contrast:false,countdown:true,'lesson-times':true};
  const key=n=>'diaryComfort:'+n;
  function read(n){try{const s=localStorage.getItem(key(n));return s===null?ids[n]:typeof ids[n]==='boolean'?s==='true':s;}catch(_){return ids[n];}}
  function write(n,v){try{localStorage.setItem(key(n),String(v));}catch(_){}}
  const media=matchMedia('(prefers-color-scheme: dark)');
  function apply(){
    for(const n of Object.keys(ids)){const el=document.getElementById('pref-'+n);if(el){if(typeof ids[n]==='boolean')el.checked=read(n);else el.value=read(n);}}
    const body=document.body;
    body.dataset.comfortSurface=read('surface');body.dataset.comfortFont=read('font');
    for(const [name,cls] of [['motion','less-motion'],['shadows','no-shadows'],['contrast','clear-text']])body.classList.toggle(cls,read(name));
    body.classList.toggle('hide-countdown',!read('countdown'));body.classList.toggle('hide-lesson-times',!read('lesson-times'));
    if(read('theme-mode')==='system'){body.classList.toggle('dark-theme',media.matches);const t=document.getElementById('toggle-dark-theme');if(t)t.checked=media.matches;}
  }
  for(const n of Object.keys(ids))document.getElementById('pref-'+n)?.addEventListener('change',e=>{write(n,typeof ids[n]==='boolean'?e.target.checked:e.target.value);apply();});
  media.addEventListener('change',apply);window.diaryApplyComfort=apply;
  window.diaryManualTheme=()=>{write('theme-mode','manual');apply();};
  document.addEventListener('diary-connection',apply);window.addEventListener('pageshow',apply);apply();
})();
