import {RULESET,formatRace} from './challenge.mjs';
import {t} from '../i18n.mjs';
import {getItem,setItem,storageMode} from '../storage.mjs';
const $=id=>document.getElementById(id);
const STAGES=['library_key','library_exit','garage_power','crank_start','garage_gate','garage_exit','hospital_record','dawn'];
const deviceName=d=>t(d==='mobile'?'手机':'电脑');
const divisionOf=()=>navigator.userAgentData?.mobile||/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)?'mobile':'desktop';
const bestKey=d=>'nightshift-local-best-v1:'+RULESET+':'+d;
export function readBest(device){try{const value=JSON.parse(getItem(bestKey(device)));return value&&Number.isFinite(value.ms)&&value.ms>=150000&&typeof value.date==='string'?value:null;}catch{return null;}}
export class RaceSession{
 constructor(record={}){Object.assign(this,record);this.localStart=performance.now();this.status='active';this.next=0;this.chapter=0;this.reason='';this.lastElapsed=0;}
 elapsed(){if(this.finishMs!==undefined)return this.finishMs;this.lastElapsed=Math.max(this.lastElapsed,performance.now()-this.localStart);return this.lastElapsed;}
 mark(stage){
  if(this.status!=='active')return;
  const index=STAGES.indexOf(stage);if(index>=0&&index<this.next)return;
  if(index!==this.next){this.cancel(t('关卡顺序不符'));return;}this.next++;
  if(stage==='dawn'){
   this.finishMs=Math.floor(this.elapsed());this.status='finished';
   const previous=readBest(this.device);this.newBest=!previous||this.finishMs<previous.ms;
   if(this.newBest)this.persisted=setItem(bestKey(this.device),JSON.stringify({ms:this.finishMs,date:new Date().toISOString()}));
  }
 }
 cancel(reason){if(this.status!=='active')return;this.finishMs=Math.floor(this.elapsed());this.status='invalid';this.reason=reason;}
}
const note=()=>t(storageMode()==='local'?'成绩仅保存在当前浏览器；清理网站数据会删除记录，不会同步到其他设备。':'浏览器未允许保存，成绩仅在本次页面内保留，刷新后会丢失。');
function paragraph(text,className=''){const p=document.createElement('p');p.textContent=text;p.className=className;return p;}
export function installRace(Game){
 const bind=Game.prototype.bindInput;
 Game.prototype.bindInput=function(){bind.call(this);$('raceButton').onclick=()=>this.racePanel();$('leaderboardButton').onclick=()=>this.openLocalRecords();};
 Game.prototype.leaveRace=function(){const r=this.race;if(!r)return;r.cancel(t('已离开挑战'));this.saved=r.originalSaved;this.notes=r.originalNotes;this.race=null;$('raceClock').classList.add('hidden');};
 const menu=Game.prototype.showMenu;
 Game.prototype.showMenu=function(){this.leaveRace();return menu.call(this);};
 const pause=Game.prototype.pause;
 Game.prototype.pause=function(){const result=pause.call(this);if(this.race&&this.phase==='paused')$('panelContent').prepend(paragraph(t('场景已暂停，本局计时仍在继续。'),'timer-pause-note'));return result;};
 const save=Game.prototype.save;
 Game.prototype.save=function(){if(!this.race)return save.call(this);};
 const checkpoint=Game.prototype.tickCheckpoint;
 Game.prototype.tickCheckpoint=function(){if(!this.race)return checkpoint.call(this);};
 Game.prototype.racePanel=function(){
  this.leaveRace();const box=document.createElement('div');box.className='race-entry';
  box.append(paragraph(t('三章逃生 · 一次生命 · 150 秒手轮。暂停、阅读、切后台和突脸均计时；死亡、重开、读档或刷新结束本次挑战。普通存档不受影响。')),paragraph(t('无需昵称，无需连接计时服务。通关后生成成绩卡，可截图分享。')),paragraph(note(),'small muted'));
  const status=paragraph('');status.setAttribute('role','status');box.append(status);
  this.panel('TIME TRIAL / 1996',t('计时挑战'),box,[[t('开始计时'),()=>{
   if(this.raceStarting)return;if(this.portraitBlocked){status.textContent=t('请横屏后重新开始');return;}
   this.raceStarting=true;const originalSaved=structuredClone(this.saved),originalNotes=[...this.notes];
   try{this.sound.start();this.loadLevel(0);this.notes=[];this.clearCheckpoint(0);this.crankHazard.reset();this.saved.started=true;this.saved.checkpoint=0;
    this.race=new RaceSession({device:divisionOf(),originalSaved,originalNotes});this.resume();this.updateHUD();
   }catch(e){this.leaveRace();this.saved=originalSaved;this.notes=originalNotes;status.textContent=t('启动失败，请返回标题后重试。');console.error(e);}
   finally{this.raceStarting=false;}
  },'primary'],[t('返回标题'),()=>this.showMenu()]],'menu');
 };
 Game.prototype.openLocalRecords=function(){
  const box=document.createElement('div');box.className='local-records';const best=readBest(divisionOf());
  box.append(paragraph(t('三章完整逃生 · 150 秒手轮'),'small muted'),paragraph(best?formatRace(best.ms):t('还没有通关记录'),'local-record-time'),paragraph(t('本机最佳')+' · '+deviceName(divisionOf())),paragraph(note(),'small muted'));
  this.panel('PERSONAL FILE / 1996',t('我的记录'),box,[[t('开始挑战'),()=>this.racePanel(),'primary'],[t('返回标题'),()=>this.showMenu()]],'menu');
 };
 const start=Game.prototype.startLevel;
 Game.prototype.startLevel=function(index,intro=true,restore=false){if(this.race&&(this.race.status!=='active'||restore||index!==this.race.allowedNext))this.leaveRace();if(this.race)this.race.allowedNext=null;const result=start.call(this,index,intro,restore);if(this.race&&intro)$('panelContent').append(paragraph(t('计时仍在继续，本次挑战不保存检查点。')));return result;};
 Game.prototype.syncRaceStages=function(){const r=this.race;if(r?.status!=='active')return;if(this.index===0&&this.flags.key)r.mark('library_key');if(this.index===1){if(this.flags.power)r.mark('garage_power');if(this.crankProgress>0)r.mark('crank_start');if(this.flags.gate)r.mark('garage_gate');}if(this.index===2&&this.flags.record)r.mark('hospital_record');};
 const update=Game.prototype.update;
 Game.prototype.update=function(dt){const result=update.call(this,dt);this.syncRaceStages();const r=this.race;if(r){$('raceClock').classList.toggle('hidden',['menu','ending','death'].includes(this.phase));$('raceClock').textContent=(r.status==='invalid'?t('挑战结束'):t('本局用时'))+' · '+formatRace(r.elapsed());}return result;};
 const finish=Game.prototype.finishChapter;
 Game.prototype.finishChapter=function(){this.syncRaceStages();if(this.race?.status==='active'){this.race.mark(this.index===0?'library_exit':'garage_exit');this.race.chapter=this.index+1;this.race.allowedNext=this.index+1;}const result=finish.call(this);if(this.race){$('panelKicker').textContent=t('本章完成 / 计时继续');$('panelContent').textContent=t('本章已完成。计时仍在继续，准备好后进入下一章。');}return result;};
 const death=Game.prototype.death;
 Game.prototype.death=function(reason){const r=this.race;if(r)r.cancel(t('本次挑战死亡'));const result=death.call(this,reason);if(r)this.panel('TIME TRIAL / 1996',t('挑战结束'),t('未能逃到天亮，本次未刷新最佳成绩。')+'\n'+t('本局用时')+' · '+formatRace(r.elapsed()),[[t('重新挑战'),()=>this.racePanel(),'primary'],[t('返回标题'),()=>this.showMenu()]],'death');return result;};
 const ending=Game.prototype.ending;
 Game.prototype.ending=function(kind){const r=this.race;this.syncRaceStages();if(r){if(kind==='dawn')r.mark('dawn');else r.cancel(t('此结局不是逃生完赛'));}const result=ending.call(this,kind);if(!r)return result;
  const card=document.createElement('section');card.id='raceResult';card.className='local-score-card';card.setAttribute('aria-label',t('通关成绩卡'));
  card.append(paragraph('NIGHT SHIFT PROTOCOL / 1996','score-file'),paragraph(t(r.status==='finished'?'三章逃生完成':'夜班记录中断')),paragraph(formatRace(r.elapsed()),'local-record-time'));
  if(r.status==='finished'){const best=readBest(r.device);card.append(paragraph(t(r.newBest?'新的本机最佳':'本机最佳')+' · '+formatRace(best?.ms??r.finishMs)),paragraph(t('一次生命 · 150 秒手轮')+' · '+deviceName(r.device)),paragraph(t('截图保存这一夜的逃生记录。'),'small'));}else card.append(paragraph(r.reason));
  card.append(paragraph(note(),'small muted'));$('panelContent').append(card);$('panelActions').replaceChildren();
  for(const [label,action]of [[t('重新挑战'),()=>this.racePanel()],[t('我的记录'),()=>{this.leaveRace();this.openLocalRecords();}],[t('返回标题'),()=>this.showMenu()]]){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=action;$('panelActions').append(b);}return result;
 };
}
