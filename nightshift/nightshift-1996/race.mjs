import {RULESET,formatRace} from './challenge.mjs';
import {t} from '../i18n.mjs';
import {getItem,setItem} from '../storage.mjs';
const RANKING_SITE='https://rank.lovequnce.top';
const API=(location.origin===RANKING_SITE?'':RANKING_SITE)+'/api/race';
const STAGES=['library_key','library_exit','garage_power','crank_start','garage_gate','garage_exit','hospital_record','dawn'];
const $=id=>document.getElementById(id);
const deviceName=d=>t(d==='mobile'?'手机榜':'电脑榜');
// A touch-screen Windows laptop still belongs to the computer division.
const divisionOf=()=>navigator.userAgentData?.mobile||/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)?'mobile':'desktop';
async function api(action,data,token){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const r=await fetch(`${API}/${action}`,{method:data?'POST':'GET',cache:'no-store',credentials:'same-origin',headers:data?{'Content-Type':'application/json',...(token?{'Authorization':`Bearer ${token}`}:{})}:{},body:data?JSON.stringify(data):undefined,signal:controller.signal});
  if(!r.headers.get('content-type')?.includes('application/json'))throw new Error(t('排行榜接口未返回有效数据')+' (HTTP '+r.status+')');
  const body=await r.json();if(!r.ok){const error=new Error(body.error||t('排行榜暂时不可用')+' (HTTP '+r.status+')');if(body.code==='CRANK_TIME_PENDING'&&Number.isFinite(body.retryAfterMs))error.retryAfterMs=Math.min(150000,Math.max(0,body.retryAfterMs));throw error;}return body;
 }catch(e){
  if(e.name==='AbortError')throw new Error(t('连接超时，请切换 Wi-Fi 或移动网络重试'));
  if(e instanceof TypeError)throw new Error(t('浏览器未能连接排行榜服务，请尝试独立排行榜页面'));
  throw e;
 }finally{clearTimeout(timeout);}
}
export class RaceSession{
 constructor(record){Object.assign(this,record);this.localStart=performance.now();this.status='active';this.next=0;this.queue=Promise.resolve();this.chapter=0;this.reason='';}
 elapsed(){return this.finishMs??performance.now()-this.localStart;}
 mark(stage){
  if(this.status!=='active')return this.queue;
  const index=STAGES.indexOf(stage);
  if(index<this.next)return this.queue;
  if(index!==this.next){this.cancel(t('关卡顺序不符'));return this.queue;}
  this.next++;
  this.queue=this.queue.then(async()=>{
   if(this.status!=='active')return;
   let result;
   try{result=await api('mark',{stage},this.token)}catch(first){
    if(this.status!=='active')return;
    // Idempotent stage acknowledgements make a lost response safe to retry once.
    // The start marker may arrive late on mobile networks. Keep the server's
    // full 150-second requirement, and wait out its remaining interval.
    await new Promise(r=>setTimeout(r,Math.max(700,(first.retryAfterMs||0)+100)));
    if(this.status!=='active')return;
    result=await api('mark',{stage},this.token);
   }
   if(result.finished){this.finishMs=result.finishMs;this.status='finished';}
  }).catch(e=>this.cancel(e.message||t('网络中断，本次不计榜')));
  return this.queue;
 }
 cancel(reason){if(this.status==='finished'||this.status==='invalid')return;this.status='invalid';this.reason=reason;api('cancel',{},this.token).catch(()=>{});}
}
export function installRace(Game){
 const bind=Game.prototype.bindInput;
 Game.prototype.bindInput=function(){bind.call(this);$('raceButton').onclick=()=>this.racePanel();$('leaderboardButton').onclick=()=>this.openLeaderboard();};
 Game.prototype.leaveRace=function(){
  const race=this.race;if(!race)return;
  if(race.next<STAGES.length)race.cancel(t('已离开竞速'));
  this.saved=race.originalSaved;this.notes=race.originalNotes;this.race=null;$('raceClock').classList.add('hidden');
 };
 const menu=Game.prototype.showMenu;
 Game.prototype.showMenu=function(){this.leaveRace();return menu.call(this);};
 const save=Game.prototype.save;
 Game.prototype.save=function(){if(!this.race)return save.call(this);};
 Game.prototype.racePanel=function(){
  this.leaveRace();
  const box=document.createElement('div');box.className='race-entry';
  const rules=document.createElement('p');rules.textContent=t('三章逃生 · 一次生命 · 150 秒手轮。暂停、阅读和突脸均计时。死亡、重开、读档或刷新将结束本次竞速，普通存档不受影响。');
  const label=document.createElement('label');label.textContent=t('上榜昵称');const input=document.createElement('input');input.id='raceNickname';input.maxLength=16;input.autocomplete='nickname';input.value=getItem('nightshift-race-nickname')||'';label.append(input);
  const division=divisionOf();const group=document.createElement('p');group.textContent=t('本机分组：')+deviceName(division);
  const status=document.createElement('p');status.id='raceEntryStatus';status.setAttribute('role','status');
  box.append(rules,label,group,status);
  this.panel('RACE / 1996',t('竞速挑战'),box,[[t('开始计时'),async()=>{
   if(this.raceStarting)return;
   if(!/^[\p{L}\p{N}_ ·-]{1,16}$/u.test(input.value.normalize('NFKC').trim())){status.textContent=t('昵称请用 1–16 个中英文字、数字、空格或短横线');return;}
   this.raceStarting=true;const buttons=[...$('panelActions').querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);status.textContent=t('正在连接计时服务…');
   this.sound.start();
   // Prepare the first scene before the server starts the clock.
   const originalSaved=structuredClone(this.saved),originalNotes=[...this.notes];
   this.loadLevel(0);this.notes=originalNotes;
   try{
    const record=await api('start',{nickname:input.value.trim(),device:division,ruleset:RULESET});
    setItem('nightshift-race-nickname',input.value.trim());
    if(this.portraitBlocked){api('cancel',{},record.token).catch(()=>{});throw new Error(t('请横屏后重新开始'));}
    const race=new RaceSession(record);race.originalSaved=originalSaved;race.originalNotes=originalNotes;this.race=race;
    this.notes=[];this.clearCheckpoint(0);this.crankHazard.reset();this.saved.started=true;this.saved.checkpoint=0;
    this.resume();this.updateHUD();
   }catch(e){status.textContent=t('无法开始竞速：')+(e.message||t('请稍后重试'));}
   finally{this.raceStarting=false;buttons.forEach(b=>b.disabled=false);}
  },'primary'],[t('返回标题'),()=>this.showMenu()]],'menu');
 };
 Game.prototype.openLeaderboard=function(division=divisionOf()){
  const box=document.createElement('div');box.className='leaderboard';
  const rules=document.createElement('p');rules.className='small muted';rules.textContent=t('150 秒手轮 · 三章天亮结局 · 总用时含暂停与阅读。休闲竞速，基础时间与流程校验。');
  const tabs=document.createElement('div');tabs.className='rank-tabs';
  for(const d of ['mobile','desktop']){const b=document.createElement('button');b.type='button';b.textContent=deviceName(d);b.setAttribute('aria-pressed',String(d===division));b.onclick=()=>this.openLeaderboard(d);tabs.append(b);}
  const result=document.createElement('div');result.setAttribute('role','status');result.textContent=t('正在读取排行榜…');box.append(rules,tabs,result);
  this.panel('RANKING / 1996',t('逃生排行榜'),box,[[t('开始竞速'),()=>this.racePanel(),'primary'],[t('返回标题'),()=>this.showMenu()]],'menu');
  api(`board?device=${division}`).then(data=>{
   if(!result.isConnected)return;result.replaceChildren();
   if(!data.entries.length){result.textContent=t('还没有完赛记录，来留下第一个名字。');return;}
   const table=document.createElement('table');const head=table.createTHead().insertRow();
   for(const text of ['名次','玩家','总用时']){const th=document.createElement('th');th.textContent=t(text);head.append(th);}
   const body=table.createTBody();data.entries.forEach((entry,i)=>{const row=body.insertRow();for(const value of [String(i+1),entry.nickname,formatRace(entry.finish_ms)])row.insertCell().textContent=value;});result.append(table);
  }).catch(e=>{if(result.isConnected){result.textContent=t('排行榜连接失败：')+e.message;const retry=document.createElement('button');retry.type='button';retry.textContent=t('重试');retry.onclick=()=>this.openLeaderboard(division);const link=document.createElement('a');link.href=RANKING_SITE;link.target='_blank';link.rel='noopener';link.textContent=t('打开独立排行榜');link.style.cssText='display:block;margin-top:12px;color:inherit';result.append(retry,link);}});
 };
 const start=Game.prototype.startLevel;
 Game.prototype.startLevel=function(index,intro=true,restore=false){if(this.race&&(restore||index!==this.race.chapter))this.race.cancel(t('读档或重开不计榜'));return start.call(this,index,intro,restore);};
 const update=Game.prototype.update;
 Game.prototype.update=function(dt){
  const result=update.call(this,dt),race=this.race;
  if(race){
   $('raceClock').classList.toggle('hidden',this.phase==='menu');$('raceClock').textContent=race.status==='invalid'?t('本次不计榜：')+race.reason:deviceName(race.device)+' · '+formatRace(race.elapsed());
   if(race.status==='active'){
    if(this.index===0&&this.flags.key)race.mark('library_key');
    if(this.index===1){if(this.flags.power)race.mark('garage_power');if(this.crankProgress>0)race.mark('crank_start');if(this.flags.gate)race.mark('garage_gate');}
    if(this.index===2&&this.flags.record)race.mark('hospital_record');
   }
  }
  return result;
 };
 const finish=Game.prototype.finishChapter;
 Game.prototype.finishChapter=function(){if(this.race?.status==='active'){this.race.mark(this.index===0?'library_exit':'garage_exit');this.race.chapter=this.index+1;}return finish.call(this);};
 const death=Game.prototype.death;
 Game.prototype.death=function(reason){const result=death.call(this,reason);if(this.race){this.race.cancel(t('本次挑战死亡'));this.panel('RACE / 1996',t('竞速结束'),t('本次未能逃到天亮，不计入排行榜。普通存档已保留。'),[[t('重新挑战'),()=>this.racePanel(),'primary'],[t('返回标题'),()=>this.showMenu()]],'death');}return result;};
 const ending=Game.prototype.ending;
 Game.prototype.ending=function(kind){const result=ending.call(this,kind),race=this.race;if(!race)return result;
  const status=document.createElement('p');status.id='raceResult';status.setAttribute('role','status');$('panelContent').append(status);
  if(kind!=='dawn')race.cancel(t('此结局不是逃生完赛'));
  if(race.status==='active'){status.textContent=t('正在提交完赛记录…');race.mark('dawn').then(()=>{status.textContent=race.status==='finished'?t('完赛已上榜：')+deviceName(race.device)+' · '+formatRace(race.finishMs):t('本次不计榜：')+race.reason;});}
  else status.textContent=t('本次不计榜：')+race.reason;
  const button=document.createElement('button');button.type='button';button.textContent=t('查看排行榜');button.onclick=()=>this.openLeaderboard(race.device);$('panelActions').prepend(button);return result;
 };
}
