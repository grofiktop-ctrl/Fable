(() => {
'use strict';
const names=['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
const short=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const mon=[['09:25','10:05'],['10:20','11:00'],['11:15','11:55'],['12:10','12:50'],['12:55','13:35'],['13:40','14:20'],['14:25','15:05']];
const regular=[['08:45','09:25'],['09:35','10:15'],['10:30','11:10'],['11:25','12:05'],['12:20','13:00'],['13:05','13:45'],['13:50','14:30']];
const el=id=>document.getElementById(id),input=el('diary-date'),follow=el('calendar-follow');
const dateKey=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const parse=s=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))return null;const [y,m,d]=s.split('-').map(Number);const result=new Date(y,m-1,d,12);return dateKey(result)===s?result:null;};
const save=(k,v)=>{try{localStorage.setItem(k,String(v));}catch(_){}};
const min=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
const shift=(d,n)=>{const result=new Date(d);result.setDate(result.getDate()+n);return result;};
window.diaryBellsForDay=day=>day==='Понедельник'?mon:names.indexOf(day)>=2&&names.indexOf(day)<=5?regular:[];
try{follow.checked=localStorage.getItem('diaryFollowToday')!=='false';const last=localStorage.getItem('diaryCalendarDate');input.value=!follow.checked&&parse(last)?last:dateKey(new Date());}catch(_){input.value=dateKey(new Date());}
let monthView=new Date(parse(input.value)),allWeek=false,dayStamp=dateKey(new Date()),lastKey='';
const selected=()=>parse(input.value)||new Date();
function setDate(notify=true){
 if(!parse(input.value))input.value=dateKey(new Date());
 allWeek=false;monthView=new Date(selected());window.diaryCalendarDay=names[selected().getDay()];
 save('diaryCalendarDate',input.value);save('diaryFollowToday',follow.checked);lastKey='';render();
 if(notify)document.dispatchEvent(new Event('diary-date-change'));
}
function pick(d){input.value=dateKey(d);window.diaryPauseFollow();setDate();}
window.diaryPauseFollow=()=>{follow.checked=false;save('diaryFollowToday',false);};
window.diarySelectWeekday=day=>{const index=names.indexOf(day);if(index<0)return;const dt=selected(),monday=shift(dt,-((dt.getDay()+6)%7));input.value=dateKey(shift(monday,(index+6)%7));window.diaryPauseFollow();setDate(false);};
input.addEventListener('change',()=>{window.diaryPauseFollow();setDate();});
follow.addEventListener('change',()=>{if(follow.checked)input.value=dateKey(new Date());setDate();});
el('calendar-today').onclick=()=>{follow.checked=true;input.value=dateKey(new Date());setDate();};
el('calendar-prev-week').onclick=()=>pick(shift(selected(),-7));el('calendar-next-week').onclick=()=>pick(shift(selected(),7));

const monthPanel=el('calendar-month-panel'),monthToggle=el('calendar-month-toggle');
monthToggle.onclick=()=>{monthPanel.hidden=!monthPanel.hidden;monthToggle.setAttribute('aria-expanded',String(!monthPanel.hidden));if(!monthPanel.hidden)renderMonth();};
for(const [id,delta] of [['month-prev',-1],['month-next',1]])el(id).onclick=()=>{monthView=new Date(monthView.getFullYear(),monthView.getMonth()+delta,1,12);renderMonth();};
function buttonDate(date,month=false){
 const b=document.createElement('button'),key=dateKey(date),isSelected=key===input.value&&!allWeek,today=key===dateKey(new Date());
 b.type='button';b.className=(month?'month-day':'cal-day')+(isSelected?' is-selected':'')+(today?' is-today':'')+(month&&date.getMonth()!==monthView.getMonth()?' is-other':'');
 b.setAttribute('aria-label',date.toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long',year:'numeric'}));b.setAttribute('aria-pressed',String(isSelected));if(today)b.setAttribute('aria-current','date');
 if(month)b.textContent=String(date.getDate());else{const label=document.createElement('span');label.className='cal-day-label';label.textContent=short[(date.getDay()+6)%7];const number=document.createElement('span');number.className='cal-day-number';number.textContent=String(date.getDate());b.append(label,number);}
 b.onclick=()=>{pick(date);if(month){monthPanel.hidden=true;monthToggle.setAttribute('aria-expanded','false');monthToggle.focus();}};return b;
}
function renderMonth(){
 el('month-title').textContent=monthView.toLocaleDateString('ru-RU',{month:'long',year:'numeric'}).replace(' г.','');
 const first=new Date(monthView.getFullYear(),monthView.getMonth(),1,12),start=shift(first,-((first.getDay()+6)%7));
 const last=new Date(monthView.getFullYear(),monthView.getMonth()+1,0,12),cells=Math.ceil((((first.getDay()+6)%7)+last.getDate())/7)*7,frag=document.createDocumentFragment();
 for(let i=0;i<cells;i++)frag.appendChild(buttonDate(shift(start,i),true));el('calendar-month-grid').replaceChildren(frag);
}
function render(){
 const dt=selected(),now=new Date(),day=names[dt.getDay()],n=now.getHours()*60+now.getMinutes()+now.getSeconds()/60;
 const subjectCount=Array.isArray(window.currentSchedule?.[day])?window.currentSchedule[day].length:null;
 const key=input.value+'|'+dateKey(now)+'|'+Math.floor(n)+'|'+subjectCount+'|'+allWeek;
 if(key===lastKey)return;lastKey=key;
 el('calendar-month-label').textContent=dt.toLocaleDateString('ru-RU',{month:'long',year:'numeric'}).replace(' г.','');
 const monday=shift(dt,-((dt.getDay()+6)%7)),sunday=shift(monday,6),range=d=>d.toLocaleDateString('ru-RU',{day:'numeric',month:'short'}).replace('.','');
 el('calendar-week-range').textContent=range(monday)+' — '+range(sunday);
 const frag=document.createDocumentFragment();for(let i=0;i<7;i++)frag.appendChild(buttonDate(shift(monday,i)));el('calendar-week').replaceChildren(frag);
 const heading=dt.toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'});el('calendar-heading').textContent=allWeek?'Вся неделя':heading.charAt(0).toUpperCase()+heading.slice(1);

 const times=window.diaryBellsForDay(day),official=times.map((t,i)=>({label:(i+1)+' урок',start:t[0],end:t[1],index:i}));
 if(day==='Понедельник')official.unshift({label:'Разговоры о важном',start:'08:45',end:'09:15',index:-1});
 const actual=subjectCount===null?official:official.filter(t=>t.index<subjectCount&&(subjectCount>0));
 const isToday=input.value===dateKey(now)&&!allWeek;let status='';
 if(isToday&&actual.length){const current=actual.find(t=>n>=min(t.start)&&n<min(t.end)),next=actual.find(t=>min(t.start)>n);if(current)status=current.label+' · осталось '+Math.ceil(min(current.end)-n)+' мин';else if(next)status=(n<min(actual[0].start)?'До занятий':'Перемена')+' · '+Math.ceil(min(next.start)-n)+' мин';else status='Занятия закончились';}
 else if(!times.length)status=subjectCount>0?'Для этого дня звонки не заданы':'Выходной';
 const live=el('bell-live');live.hidden=!status;live.textContent=status;
 el('calendar-bell-range').textContent=official.length?official[0].start+' — '+official.at(-1).end:'Нет звонков';
 el('bell-table').innerHTML=official.length?official.map((t,i)=>{const current=isToday&&actual.includes(t)&&n>=min(t.start)&&n<min(t.end),lunch=(day==='Понедельник'&&t.index===2)||(day!=='Понедельник'&&t.index===3),gap=official[i+1]?min(official[i+1].start)-min(t.end):0;return '<div class="bell-line'+(current?' bell-current':'')+'"><span>'+t.label+(lunch?'<small>Питание после урока</small>':gap?'<small>Перемена '+gap+' мин</small>':'')+'</span><span>'+t.start+' — '+t.end+'</span></div>';}).join(''):'<p class="calendar-note">Для этого дня сетка звонков не задана.</p>';
 if(!monthPanel.hidden)renderMonth();
}
function tick(){const today=dateKey(new Date());if(today!==dayStamp){dayStamp=today;if(follow.checked){input.value=today;setDate();return;}}render();}
setDate(false);setInterval(tick,15000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});window.addEventListener('pageshow',tick);document.addEventListener('diary-data',render);
let offlineTimer;
function connection(){const offline=window.diaryCloudReady===false||!navigator.onLine,pill=el('connection-state');pill.textContent=offline?'Офлайн':'Подключение…';pill.hidden=!offline;el('calendar-network').textContent=!navigator.onLine?'Офлайн. Дневник доступен, сообщения ждут сети.':'Локальное хранилище готово. Переписка синхронизируется при открытом приложении.';clearTimeout(offlineTimer);if(offline)offlineTimer=setTimeout(()=>pill.hidden=true,3000);}
document.addEventListener('diary-connection',connection);window.addEventListener('online',connection);window.addEventListener('offline',connection);connection();
})();
