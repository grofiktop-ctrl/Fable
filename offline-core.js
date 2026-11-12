/* Diary 1.5v12: bundled local-first data layer. No remote SDK required. */
(() => {
'use strict';
const URL='https://grofik-dnevnik-default-rtdb.europe-west1.firebasedatabase.app';
const object=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const readOld=k=>{try{return object(JSON.parse(localStorage.getItem(k)||'{}'));}catch(_){return {};}};
let state={version:1,personal:{},shared:{schedule:readOld('diaryCacheSchedule'),homework:readOld('diaryCacheHw'),archive:readOld('diaryCacheArchive')},accounts:{},outbox:[]};
let database, storageError, saveTail=Promise.resolve(), syncing=false, defaultSchedule={}, activeUser=null, pollTimer, lastSync=0;
const subscriptions=new Map();
const user=()=>window.currentUser||null;
const local=()=>user()==='__local__';
const uuid=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);
function account(u=user()){if(!u)return {friends:{},requests:{},rooms:{},drafts:{},read:{}};return state.accounts[u]||(state.accounts[u]={friends:{},requests:{},rooms:{},drafts:{},read:{}});}
const clone=v=>structuredClone(v);
function writeDB(){
 const snapshot=clone(state);
 saveTail=saveTail.catch(()=>{}).then(()=>new Promise((resolve,reject)=>{
  if(!database)return reject(storageError||new Error('Хранилище недоступно'));
  const tx=database.transaction('data','readwrite');tx.objectStore('data').put(snapshot,'main');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Запись отменена'));
 }));return saveTail;
}
const ready=new Promise((resolve)=>{
 if(!globalThis.indexedDB){storageError=new Error('IndexedDB недоступен');return resolve();}
 const req=indexedDB.open('diary-local-first-v1',1);
 req.onupgradeneeded=()=>{req.result.createObjectStore('data');};
 req.onerror=()=>{storageError=req.error;resolve();};
 req.onsuccess=()=>{database=req.result;database.onversionchange=()=>database.close();const tx=database.transaction('data');const g=tx.objectStore('data').get('main');g.onsuccess=()=>{const v=g.result;if(v&&v.version===1){state={...state,...v};state.accounts=object(state.accounts);state.outbox=Array.isArray(state.outbox)?state.outbox:[];state.shared=object(state.shared);state.personal=object(state.personal);}resolve();};g.onerror=()=>resolve();};
});
function seed(schedule){defaultSchedule=clone(schedule);for(const name of ['shared','personal']){const d=state[name];if(!Object.keys(object(d.schedule)).length)d.schedule=clone(schedule);d.homework=object(d.homework);d.archive=object(d.archive);}}
function at(root,path){return path.reduce((v,k)=>v?.[k],root);}
function put(root,path,value){let parent=root;for(const key of path.slice(0,-1))parent=parent[key]=object(parent[key]);const end=path.at(-1);if(value===null)delete parent[end];else parent[end]=clone(value);}
function dataFor(path){
 const p=path.split('/').filter(Boolean),top=p[0];
 if(['schedule','homework','archive'].includes(top))return at(state[local()?'personal':'shared'],p)??null;
 const a=account();
 if(top==='chats')return p.length===1?a.rooms:at(a.rooms,p.slice(1))??null;
 if(top==='social'){
  const u=user();if(!u)return null;const social={friends:{[u]:a.friends||{}},requests:{[u]:a.requests||{}}};return p.length===1?social:at(social,p.slice(1))??null;
 }
 return null;
}
function snap(value){return {exists:()=>value!==null&&value!==undefined,val:()=>value===undefined?null:clone(value)};}
function emit(){
 for(const [path,callbacks] of subscriptions){if(!user()&&['social','chats'].includes(path))continue;const v=dataFor(path);for(const fn of callbacks){try{fn(snap(v));}catch(e){console.error('View update failed',e);}}}
 window.DiaryMessenger?.refresh();
 const label=document.getElementById('chat-connectivity');if(label)label.textContent=navigator.onLine?'Личный чат':'Офлайн';
 document.dispatchEvent(new Event('diary-data'));
}
function apply(path,value,u=user()){
 const p=path.split('/').filter(Boolean),top=p[0];
 if(['schedule','homework','archive'].includes(top)){put(state[u==='__local__'?'personal':'shared'],p,value);return;}
 if(top==='chats'){if(p.length>1)put(account(u).rooms,p.slice(1),value);return;}
 if(top==='social'){
  if(p[1]==='friends'&&p[2]===u){if(p.length===3)account(u).friends=object(value);else put(account(u).friends,p.slice(3),value);}
  if(p[1]==='requests'&&p[2]===u){if(p.length===3)account(u).requests=object(value);else put(account(u).requests,p.slice(3),value);}
 }
}
async function remote(path,method='GET',value,options={}){
 if(!navigator.onLine)throw new Error('Нет сети');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6500);
 try{
  const url=URL+'/'+path.split('/').map(encodeURIComponent).join('/')+'.json';
  const response=await fetch(url,{method,signal:controller.signal,headers:{...(method==='GET'?{}:{'Content-Type':'application/json'}),...(options.headers||{})},keepalive:!!options.keepalive,body:method==='GET'||method==='DELETE'?undefined:JSON.stringify(value)});
  if(!response.ok){const err=new Error('Сервер: '+response.status);err.status=response.status;throw err;}
  const data=await response.json();
  return options.withEtag?{value:data,etag:response.headers.get('ETag')}:data;
 }finally{clearTimeout(timer);}
}
async function mutation(path,value){
 const u=user();if(!u)throw new Error('Нет аккаунта');
 // Account credentials and friend operations require a live server; never store passwords in local queue.
 if(path.startsWith('users/'))return remote(path,'PUT',value);
 if(path.startsWith('social/')&&u==='__local__')throw new Error('Для друзей нужен сетевой аккаунт');
 if(path.startsWith('social/')){await remote(path,value===null?'DELETE':'PUT',value);await sync();return;}
 const diary=/^(schedule|homework|archive)(\/|$)/.test(path);
 if(u==='__local__'&&!diary)throw new Error('Личный режим не использует сеть');
 if(diary&&u!=='__local__'&&!window.isAdmin)throw new Error('Редактирование доступно в личном дневнике');
 const before=clone(state);
 apply(path,value,u);
 if(u!=='__local__'){
  state.outbox.push({id:uuid(),user:u,path,value:clone(value),created:Date.now(),failed:false});
 }
 try{await writeDB();}catch(error){state=before;throw error;}
 emit();void flush();return {queued:u!=='__local__'};
}
const api={
 ref:(_,path)=>String(path).replace(/^\/+|\/+$/g,''),
 onValue:(path,fn)=>{if(!subscriptions.has(path))subscriptions.set(path,new Set());subscriptions.get(path).add(fn);queueMicrotask(()=>{if(user()||!['social','chats'].includes(path))fn(snap(dataFor(path)));});return ()=>subscriptions.get(path)?.delete(fn);},
 get:async path=>{if(path.startsWith('users/'))return snap(await remote(path));return snap(dataFor(path));},
 set:mutation,
 remove:path=>mutation(path,null),
 push:async(path,value)=>{const key='m_'+uuid().replace(/-/g,'');await mutation(path+'/'+key,value);return {key};}
};
let flushing=false;
async function flush(){
 const u=user();if(flushing||!u||u==='__local__'||!navigator.onLine)return;
 flushing=true;
 try{
  for(const item of [...state.outbox]){
   if(item.user!==u||item.failed||user()!==u)continue;
   try{await remote(item.path,item.value===null?'DELETE':'PUT',item.value);state.outbox=state.outbox.filter(x=>x.id!==item.id);await writeDB();emit();}
   catch(error){if([400,401,403].includes(error.status)){const live=state.outbox.find(x=>x.id===item.id);if(live)live.failed=true;await writeDB();emit();}break;}
  }
 }finally{flushing=false;}
}
function overlay(u){for(const q of state.outbox)if(q.user===u)apply(q.path,q.value,u);}
async function sync(){
 const u=user();if(syncing||!u||u==='__local__'||!navigator.onLine)return;
 syncing=true;
 try{
  await flush();
  const data=await Promise.all(['schedule','homework','archive','social/friends/'+u,'social/requests/'+u].map(p=>remote(p)));
  const [schedule,homework,archive,friends,requests]=data;
  if(schedule!==null&&typeof schedule==='object'&&!Array.isArray(schedule))state.shared.schedule=Object.fromEntries(Object.entries(schedule).filter(([_,v])=>Array.isArray(v)).map(([k,v])=>[k,v.filter(x=>typeof x==='string')]));
  state.shared.homework=object(homework);state.shared.archive=object(archive);
  const a=account(u);a.friends=object(friends);a.requests=object(requests);
  // Read only the current account's friend rooms, never the global chat collection.
  const names=Object.keys(a.friends).filter(n=>typeof n==='string');
  await Promise.all(names.map(async name=>{const room=[u,name].sort().join('___');const msgs=await remote('chats/'+room);a.rooms[room]=object(msgs);}));
  overlay(u);lastSync=Date.now();await writeDB();if(user()===u)emit();
 }catch(error){document.dispatchEvent(new Event('diary-connection'));}
 finally{syncing=false;}
}
async function compareSet(path,expected,next){
 const current=await remote(path,'GET',undefined,{headers:{'X-Firebase-ETag':'true'},withEtag:true});
 if(!expected.includes(current.value))return false;
 if(!current.etag)throw new Error('Сервер не поддерживает безопасное подтверждение звонка.');
 try{await remote(path,'PUT',next,{headers:{'if-match':current.etag}});return true;}catch(error){if(error.status===412)return false;throw error;}
}
function activate(){
 const u=user();if(u!==activeUser){activeUser=u;window.DiaryCalls?.sessionChanged();}
 emit();if(u&&u!=='__local__')void sync();
 if(!pollTimer)pollTimer=setInterval(()=>{if(!document.hidden){void sync();}},8000);
}
function delivery(room,id){const matches=state.outbox.filter(q=>q.user===user()&&q.path==='chats/'+room+'/'+id);return matches.some(q=>q.failed)?'Не отправлено':matches.length?'Ожидает отправки':'На сервере';}
function saveDraft(u,partner,text){if(!u||!partner)return;const a=account(u);a.drafts=object(a.drafts);a.drafts[partner]=text;writeDB().catch(()=>{});}
function getDraft(u,partner){return String(account(u).drafts?.[partner]||'');}
window.DiaryCore={ready,seed,api,activate,remote,compareSet,delivery,saveDraft,getDraft,flush,sync,
 retry:()=>{for(const q of state.outbox)if(q.user===user())q.failed=false;writeDB().then(()=>sync()).catch(()=>{});},
 onlineAccount:()=>!!user()&&!['__local__','Просмотр'].includes(user()),
 stats:()=>({pending:state.outbox.filter(q=>q.user===user()).length,lastSync,storage:!!database})};
window.addEventListener('online',()=>{window.diaryCloudReady=true;document.dispatchEvent(new Event('diary-connection'));void sync();});
window.addEventListener('offline',()=>{window.diaryCloudReady=false;document.dispatchEvent(new Event('diary-connection'));emit();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void sync();});
})();
