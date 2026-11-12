(() => {
'use strict';
const panel=document.getElementById('permissions-panel'),allow=document.getElementById('permissions-allow'),later=document.getElementById('permissions-later'),status=document.getElementById('permissions-state'),help=document.getElementById('permissions-help');
let state='prompt',busy=false,epoch=0,previousFocus=null,started=false;
const supported=()=>!!navigator.mediaDevices?.getUserMedia;
async function inspect(){
 if(!supported())return state='unsupported';
 try{const permission=await navigator.permissions.query({name:'microphone'});state=permission.state;permission.onchange=()=>{state=permission.state;if(!panel.hidden)render();};}catch(_){try{state=localStorage.getItem('diaryMicGranted')==='yes'?'granted':'prompt';}catch(_){state='prompt';}}
 return state;
}
function render(){
 status.textContent=busy?'Запрашиваем…':({granted:'Разрешён',denied:'Нет доступа',prompt:'Нужен доступ',unsupported:'Не поддерживается'})[state];
 allow.disabled=busy||state==='unsupported';
 allow.textContent=busy?'Ждём разрешения…':state==='granted'?'Проверить микрофон':'Разрешить микрофон';
 later.textContent=state==='granted'?'Готово':'Позже';
 help.textContent=state==='denied'?'Доступ заблокирован. Разреши микрофон в настройках сайта или Android → Приложения → Дневник · тест → Разрешения. Затем повтори проверку.':state==='unsupported'?'Эта оболочка не предоставляет доступ к микрофону. Дневником и перепиской можно пользоваться без него.':'Звук передаётся только во время звонка. Для дневника разрешение не нужно.';
}
async function open(force=false){await inspect();if(!force&&state==='granted')return;previousFocus=document.activeElement;panel.hidden=false;render();(allow.disabled?later:allow).focus();}
function close(){epoch++;busy=false;panel.hidden=true;previousFocus?.focus?.();}
async function request(){
 if(busy||!supported())return false;
 const token=++epoch;busy=true;render();window.DiaryCalls?.unlockAudio();
 let media;
 try{
  media=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
  media.getTracks().forEach(t=>t.stop()); // Permission check is never a background recording.
  if(token!==epoch)return false;
  state='granted';try{localStorage.setItem('diaryMicGranted','yes');}catch(_){}
  status.textContent='Разрешён';help.textContent='Готово. Микрофон выключен; он включится только во время звонка.';
  document.dispatchEvent(new Event('diary-mic-granted'));return true;
 }catch(error){
  if(token!==epoch)return false;
  state=['NotAllowedError','SecurityError','PermissionDeniedError'].includes(error.name)?'denied':'prompt';
  try{localStorage.removeItem('diaryMicGranted');}catch(_){}
  render();if(state!=='denied')help.textContent=error.name==='NotFoundError'?'Микрофон не найден. Подключи его и повтори проверку.':'Не удалось открыть микрофон. Закрой другое приложение, использующее звук, и попробуй ещё раз.';
  return false;
 }finally{media?.getTracks().forEach(t=>t.stop());if(token===epoch){busy=false;render();if(state==='granted')help.textContent='Готово. Микрофон выключен; он включится только во время звонка.';}}
}
allow.onclick=request;later.onclick=()=>{try{localStorage.setItem('diaryMicLater','1');}catch(_){}close();};
panel.addEventListener('keydown',event=>{
 if(event.key==='Escape'){event.preventDefault();close();}
 if(event.key==='Tab'){const items=[allow,later].filter(e=>!e.disabled),first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
});
// После «Позже» окно само больше не появляется; проверка остаётся в настройках и при звонке.
async function startup(){if(started)return;started=true;try{if(localStorage.getItem('diaryMicLater')==='1')return;}catch(_){}await open(false);}
window.DiaryPermissions={open,request,startup,inspect,close,state:()=>state};
})();
