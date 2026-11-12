/* Foreground WebRTC calls, protocol 2. Each call owns all of its media/timers. */
(() => {
'use strict';
const $=id=>document.getElementById(id),panel=$('voice-panel'),status=$('voice-status'),peerLabel=$('voice-peer'),help=$('voice-help');
const acceptButton=$('voice-accept'),muteButton=$('voice-mute'),endButton=$('voice-end'),audioButton=$('voice-audio'),audio=$('voice-remote'),core=window.DiaryCore;
let active=null,sequence=0,session=null,scanBusy=false,scanTimer,seen=new Set(),previousFocus=null,soundContext=null,ringTimer=null,lastPeer=null;
const terminal=new Set(['ended','declined','failed','missed','busy','cancelled']);
const user=()=>window.currentUser,remote=(...args)=>core.remote(...args),path=c=>'voiceCallsV1/'+c.to+'/'+c.id;
const valid=c=>active===c&&!c.closed&&user()===c.localUser;
const assertLive=c=>{if(!valid(c))throw new DOMException('Вызов отменён','AbortError');};
const soundEnabled=()=>{try{return localStorage.getItem('diaryCallSound')!=='false';}catch(_){return true;}};
function unlockAudio(){try{if(!soundEnabled())return;if(!soundContext){const Type=window.AudioContext||window.webkitAudioContext;if(Type)soundContext=new Type();}if(soundContext?.state==='suspended')soundContext.resume().catch(()=>{});}catch(_){}}
function stopRing(){clearInterval(ringTimer);ringTimer=null;}
function ring(c){
 stopRing();const play=()=>{if(!valid(c)||c.phase!=='ringing'||!soundEnabled()||soundContext?.state!=='running')return;for(const offset of [0,.22]){const oscillator=soundContext.createOscillator(),gain=soundContext.createGain(),time=soundContext.currentTime+offset;oscillator.connect(gain);gain.connect(soundContext.destination);oscillator.frequency.value=c.direction==='incoming'?660:440;gain.gain.setValueAtTime(.035,time);gain.gain.exponentialRampToValueAtTime(.001,time+.16);oscillator.start(time);oscillator.stop(time+.17);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};}};
 play();ringTimer=setInterval(play,2500);
}
function show(peer,text){if(panel.hidden)previousFocus=document.activeElement;panel.hidden=false;peerLabel.textContent=peer;status.textContent=text;help.textContent='';acceptButton.hidden=true;muteButton.hidden=true;audioButton.hidden=true;endButton.textContent='Завершить';}
function cleanup(c){
 c.closed=true;for(const t of ['pollTimer','durationTimer','setupTimer','disconnectTimer','iceTimer','offlineTimer']){clearTimeout(c[t]);clearInterval(c[t]);c[t]=null;}
 if(c.pc){c.pc.onconnectionstatechange=null;c.pc.onicecandidate=null;c.pc.ontrack=null;c.pc.close();c.pc=null;}
 if(c.stream){for(const track of c.stream.getTracks())track.stop();c.stream=null;}
 if(active===c){stopRing();audio.pause();audio.srcObject=null;}
}
function finish(c,text='Звонок завершён',message='',hide=false){
 const current=active===c;cleanup(c);if(!current)return;active=null;status.textContent=text;help.textContent=message;acceptButton.hidden=true;muteButton.hidden=true;audioButton.hidden=true;endButton.textContent='Закрыть';if(hide){panel.hidden=true;previousFocus?.focus?.();}
}
function info(text,message=''){show('Звонок',text);help.textContent=message;endButton.textContent='Закрыть';}
async function signalEnd(c,state='ended',reason=''){
 if(!c.published&&c.direction!=='incoming')return;
 try{if(reason)await remote(path(c)+'/endReason','PUT',reason,{keepalive:true});await remote(path(c)+'/state','PUT',state,{keepalive:true});}catch(_){}
}
async function hangup(){const c=active;if(c){finish(c);void signalEnd(c,c.direction==='incoming'&&c.phase==='ringing'?'declined':'ended');}else{panel.hidden=true;previousFocus?.focus?.();}}
function fail(c,error){
 if(!valid(c))return;
 const denied=['NotAllowedError','PermissionDeniedError','SecurityError'].includes(error?.name),missing=error?.name==='NotFoundError';
 finish(c,denied?'Нет доступа к микрофону':missing?'Микрофон не найден':'Не удалось соединиться',denied?'Разреши микрофон в настройках сайта или Android → Приложения → Дневник · тест → Разрешения. Проверку можно повторить в настройках дневника.':missing?'Подключи микрофон и попробуй снова.':error?.message||'Проверь сеть и попробуй ещё раз.');
 void signalEnd(c,'failed');
}
function supported(){
 if(!core.onlineAccount()){info('Нужен сетевой аккаунт','В личном режиме доступны дневник и сохранённые данные, но не звонки.');return false;}
 if(!navigator.onLine){info('Нет сети','Для голосового звонка нужно подключение у обоих собеседников.');return false;}
 if(!globalThis.RTCPeerConnection||!navigator.mediaDevices?.getUserMedia){info('Звонки не поддерживаются','Обнови браузер или Android System WebView и проверь разрешение микрофона.');return false;}
 return true;
}
function newCall(record,direction){
 const c={...record,direction,localUser:user(),remoteUser:direction==='outgoing'?record.to:record.from,phase:direction==='incoming'?'ringing':'setup',closed:false,connectedAt:0,published:direction==='incoming',ice:{},iceSequence:0,receivedIce:new Set(),errors:0};
 active=c;c.setupTimer=setTimeout(()=>{if(valid(c)&&c.phase==='setup'){finish(c,'Не удалось открыть микрофон','Запрос разрешения занял слишком много времени. Повтори звонок.');void signalEnd(c,'failed');}},30000);return c;
}
async function createPeer(c){
 let captured;try{captured=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});}catch(error){if(error.name!=='OverconstrainedError')throw error;captured=await navigator.mediaDevices.getUserMedia({audio:true,video:false});}
 if(!valid(c)){captured.getTracks().forEach(t=>t.stop());throw new DOMException('Вызов отменён','AbortError');}
 c.stream=captured;
 const pc=c.pc=new RTCPeerConnection({iceServers:[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']}],iceCandidatePoolSize:0});
 for(const track of captured.getTracks()){pc.addTrack(track,captured);track.onended=()=>{if(valid(c)){finish(c,'Микрофон отключён','Проверь подключение устройства и разрешение.');void signalEnd(c,'failed');}};}
 pc.onicecandidate=event=>{if(!valid(c)||!event.candidate)return;c.ice['c_'+c.iceSequence++]=event.candidate.toJSON();if(c.published)scheduleIce(c);};
 pc.ontrack=event=>{if(!valid(c))return;audio.srcObject=event.streams[0]||new MediaStream([event.track]);audio.play().catch(()=>{if(valid(c))audioButton.hidden=false;});};
 pc.onconnectionstatechange=()=>{
  if(!valid(c))return;
  if(pc.connectionState==='connected'){
   clearTimeout(c.disconnectTimer);clearTimeout(c.offlineTimer);clearTimeout(c.setupTimer);c.disconnectTimer=null;c.offlineTimer=null;c.phase='connected';stopRing();
   if(!c.connectedAt)c.connectedAt=Date.now();muteButton.hidden=false;
   muteButton.textContent=c.stream.getAudioTracks().some(t=>t.enabled)?'Выключить микрофон':'Включить микрофон';
   const update=()=>{if(valid(c)&&c.phase==='connected'){const seconds=Math.floor((Date.now()-c.connectedAt)/1000);status.textContent='Соединено · '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');}};
   clearInterval(c.durationTimer);update();c.durationTimer=setInterval(update,1000);help.textContent='';
  }else if(pc.connectionState==='disconnected'){
   c.phase='reconnecting';status.textContent='Восстанавливаем соединение…';
   if(!c.disconnectTimer)c.disconnectTimer=setTimeout(()=>{if(valid(c)&&c.pc?.connectionState!=='connected'){finish(c,'Связь потеряна','Попробуй позвонить снова, когда сеть станет стабильной.');void signalEnd(c,'failed');}},15000);
  }else if(pc.connectionState==='failed'){
   finish(c,'Не удалось соединиться','Эта сеть может блокировать прямой звук. Для таких сетей нужен TURN-сервер — он пока не настроен.');void signalEnd(c,'failed');
  }
 };
 return pc;
}
function scheduleIce(c){clearTimeout(c.iceTimer);c.iceTimer=setTimeout(()=>{if(valid(c)&&c.published)remote(path(c)+'/ice/'+c.localUser,'PUT',c.ice).catch(()=>{});},150);}
async function gather(c){
 const pc=c.pc;if(pc.iceGatheringState==='complete')return;
 await new Promise(resolve=>{const timeout=setTimeout(done,3500);function done(){clearTimeout(timeout);pc.removeEventListener('icegatheringstatechange',change);resolve();}function change(){if(pc.iceGatheringState==='complete'||!valid(c))done();}pc.addEventListener('icegatheringstatechange',change);});assertLive(c);
}
async function applyIce(c,record){
 if(!c.pc?.remoteDescription)return;
 const candidates=record.ice?.[c.remoteUser];
 for(const [id,candidate] of Object.entries(candidates||{}).slice(0,200)){
  if(!valid(c))return;if(c.receivedIce.has(id)||typeof candidate?.candidate!=='string')continue;
  if(c.pc.remoteDescription.sdp.includes(candidate.candidate)){c.receivedIce.add(id);continue;}
  try{await c.pc.addIceCandidate(candidate);c.receivedIce.add(id);}catch(error){if(error.name!=='InvalidStateError')c.receivedIce.add(id);}
 }
}
async function poll(c){
 if(!valid(c)||c.polling)return;c.polling=true;
 try{
  if(!c.connectedAt&&Date.now()>(c.deadline||c.expiresAt)){finish(c,c.phase==='ringing'?'Нет ответа':'Не удалось соединиться');void signalEnd(c,'missed');return;}
  const record=await remote(path(c));if(!valid(c))return;c.errors=0;
  if(!record||terminal.has(record.state)){finish(c,record?.endReason==='busy'?'Абонент занят':record?.state==='declined'?'Звонок отклонён':record?.state==='missed'?'Нет ответа':'Звонок завершён');return;}
  if(record.from!==c.from||record.to!==c.to){finish(c,'Звонок прерван','Изменились данные соединения.');return;}
  if(c.direction==='outgoing'&&record.state==='answering'&&c.phase==='ringing'){c.phase='connecting';c.deadline=Date.now()+30000;status.textContent='Собеседник отвечает…';stopRing();}
  if(c.direction==='outgoing'&&record.answer&&c.pc&&!c.pc.remoteDescription){
   if(record.answer.type!=='answer'||typeof record.answer.sdp!=='string'||record.answer.sdp.length>131072)throw new Error('Неверный ответ собеседника');
   await c.pc.setRemoteDescription(record.answer);assertLive(c);if(!c.connectedAt){c.phase='connecting';c.deadline=Date.now()+30000;status.textContent='Соединение…';}stopRing();
  }
  await applyIce(c,record);
 }catch(error){
  if(valid(c)){c.errors++;if(!c.connectedAt&&c.errors>=4){finish(c,'Нет связи с сервером','Проверь подключение и повтори звонок.');void signalEnd(c,'failed');}else if(!c.connectedAt&&c.errors>=2)status.textContent='Проверяем соединение…';}
 }finally{c.polling=false;}
}
function watch(c){clearInterval(c.pollTimer);c.pollTimer=setInterval(()=>void poll(c),1000);void poll(c);}
async function start(target=window.activeChatPartner){
 if(active){panel.hidden=false;return;}unlockAudio();if(!supported())return;
 if(!target||!window.myFriends?.[target]){info('Выбери собеседника','Звонить можно пользователям из списка друзей.');return;}
 lastPeer=target;
 const c=newCall({id:crypto.randomUUID?.()||Date.now()+'_'+Math.random().toString(36).slice(2),from:user(),to:target,createdAt:Date.now(),expiresAt:Date.now()+60000},'outgoing');
 show(target,'Подключаем микрофон…');endButton.focus();
 try{
  const pc=await createPeer(c);assertLive(c);await pc.setLocalDescription(await pc.createOffer());assertLive(c);status.textContent='Подготовка соединения…';await gather(c);
  const createdAt=Date.now();c.createdAt=createdAt;c.expiresAt=createdAt+45000;c.deadline=c.expiresAt;
  const record={id:c.id,from:c.from,to:c.to,protocol:2,state:'ringing',createdAt,expiresAt:c.expiresAt,offer:{type:pc.localDescription.type,sdp:pc.localDescription.sdp}};
  await remote(path(c),'PUT',record);c.published=true;
  if(!valid(c)){void signalEnd(c);return;}
  clearTimeout(c.setupTimer);c.phase='ringing';status.textContent='Вызов…';ring(c);scheduleIce(c);watch(c);
 }catch(error){if(valid(c))fail(c,error);}
}
async function accept(){
 const c=active;if(!c||c.direction!=='incoming'||c.phase!=='ringing')return;unlockAudio();if(!supported())return;
 c.phase='answering';c.deadline=Date.now()+30000;stopRing();acceptButton.hidden=true;endButton.textContent='Завершить';status.textContent='Подключаем микрофон…';
 try{
  const claimed=await core.compareSet(path(c)+'/state',['ringing'],'answering');assertLive(c);if(!claimed){finish(c,'Звонок уже завершён или принят');return;}
  const pc=await createPeer(c);assertLive(c);await pc.setRemoteDescription(c.offer);assertLive(c);await pc.setLocalDescription(await pc.createAnswer());assertLive(c);await gather(c);
  const latest=await remote(path(c));assertLive(c);if(!latest||latest.state!=='answering'){finish(c,'Звонок уже завершён');return;}
  await remote(path(c)+'/answer','PUT',{type:pc.localDescription.type,sdp:pc.localDescription.sdp});assertLive(c);
  const confirmed=await core.compareSet(path(c)+'/state',['answering'],'answered');assertLive(c);if(!confirmed){finish(c,'Звонок уже завершён');return;}
  if(c.phase!=='connected'){c.phase='connecting';status.textContent='Соединение…';}scheduleIce(c);watch(c);
 }catch(error){if(valid(c))fail(c,error);}
}
function remember(id){seen.add(id);if(seen.size>200)seen.delete(seen.values().next().value);}
async function scan(){
 if(scanBusy||document.hidden||!core.onlineAccount()||!navigator.onLine)return;
 const u=user();scanBusy=true;
 try{
  const records=await remote('voiceCallsV1/'+u);if(user()!==u)return;
  const candidates=Object.entries(records||{}).filter(([id,r])=>r&&r.to===u&&r.state==='ringing'&&r.expiresAt>Date.now()&&r.createdAt>Date.now()-90000&&r.createdAt<Date.now()+30000&&window.myFriends?.[r.from]&&!seen.has(id));
  candidates.sort((a,b)=>a[1].createdAt-b[1].createdAt);
  for(const [id,record] of candidates.slice(0,5)){
   if(active?.id===id)continue;
   if(record.offer?.type!=='offer'||typeof record.offer.sdp!=='string'||record.offer.sdp.length>131072)continue;
   record.id=id;
   if(active){
    const simultaneous=active.direction==='outgoing'&&!active.connectedAt&&active.to===record.from;
    // Deterministic collision handling: one outgoing call survives on both devices.
    if(simultaneous&&record.from < u){const previous=active;finish(previous,'Встречный вызов');void signalEnd(previous,'declined','busy');}
    else{remember(id);void signalEnd({...record,published:true,direction:'incoming'},'declined','busy');continue;}
   }
   remember(id);const c=newCall(record,'incoming');clearTimeout(c.setupTimer);c.deadline=record.expiresAt;
   show(c.from,'Входящий звонок');acceptButton.hidden=false;endButton.textContent='Отклонить';acceptButton.focus();ring(c);watch(c);break;
  }
 }catch(_){}finally{scanBusy=false;}
}
function sessionChanged(){
 if(session!==user()){if(active)void hangup();session=user();seen=new Set();}
 if(!scanTimer)scanTimer=setInterval(()=>void scan(),1800);
}
acceptButton.onclick=()=>void accept();endButton.onclick=()=>void hangup();
muteButton.onclick=()=>{const c=active;if(!c?.stream)return;const tracks=c.stream.getAudioTracks(),enabled=!tracks.some(t=>t.enabled);for(const track of tracks)track.enabled=enabled;muteButton.textContent=enabled?'Выключить микрофон':'Включить микрофон';};
audioButton.onclick=()=>{unlockAudio();audio.play().then(()=>audioButton.hidden=true).catch(()=>{help.textContent='Браузер блокирует звук. Проверь громкость и разрешение воспроизведения.';});};
const soundToggle=$('pref-call-sound');if(soundToggle){soundToggle.checked=soundEnabled();soundToggle.onchange=()=>{try{localStorage.setItem('diaryCallSound',String(soundToggle.checked));}catch(_){}if(!soundToggle.checked)stopRing();else{unlockAudio();if(active?.phase==='ringing')ring(active);}};}
panel.addEventListener('keydown',event=>{if(event.key!=='Tab')return;const buttons=[...panel.querySelectorAll('button')].filter(b=>!b.hidden&&!b.disabled),first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}});
window.addEventListener('pointerdown',unlockAudio,{once:true});
window.addEventListener('pagehide',()=>{const c=active;if(c){void signalEnd(c);finish(c,'','',true);}stopRing();});
window.addEventListener('offline',()=>{const c=active;if(!c)return;if(c.connectedAt)c.phase='reconnecting';status.textContent='Сеть пропала. Ожидаем подключение…';stopRing();clearTimeout(c.offlineTimer);c.offlineTimer=setTimeout(()=>{if(valid(c)&&!navigator.onLine)finish(c,'Нет сети','Звонок завершён. Попробуй снова после подключения.');},10000);});
window.addEventListener('online',()=>{const c=active;if(c){clearTimeout(c.offlineTimer);if(c.connectedAt&&c.pc?.connectionState==='connected')c.phase='connected';void poll(c);}void scan();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(active)void poll(active);void scan();}});
document.addEventListener('diary-ready',sessionChanged);
window.DiaryCalls={start,hangup,accept,sessionChanged,unlockAudio,active:()=>!!active,phase:()=>active?.phase||'idle',lastPeer:()=>lastPeer};
})();
