import {initI18n,applyI18n,t} from '../i18n.mjs';

// Acknowledgement is per page visit, never saved. No game, sound or flashing
// scene is initialized until the player chooses to continue.
// Health wording: https://www.epilepsy.com/what-is-epilepsy/seizure-triggers/photosensitivity
const notice=document.getElementById('startupNotice');
const button=document.getElementById('noticeContinue');
const status=document.getElementById('noticeStatus');
const recovery=document.getElementById('noticeRecovery');
window.nightshiftStartupLoaded?.();
button.disabled=false;
notice.removeAttribute('open');
if(typeof notice.showModal==='function')notice.showModal();
else notice.setAttribute('open','');
document.getElementById('noticeTitle').focus({preventScroll:true});
notice.addEventListener('cancel',event=>event.preventDefault());
notice.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();return;}
  if(event.key!=='Tab')return;
  const controls=[...notice.querySelectorAll('a[href],button:not([disabled])')];
  const visible=controls.filter(el=>el.getClientRects().length);
  const first=visible[0],last=visible[visible.length-1];
  if(event.shiftKey&&(document.activeElement===first||!controls.includes(document.activeElement))){event.preventDefault();last?.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
});
const languageReady=initI18n().then(()=>applyI18n(notice));
// CSS is intentionally non-blocking so the self-contained warning can paint.
// Do not enter the game until its full layout is ready.
function waitForStyles(){
  const link=document.getElementById('gameStyles');
  return new Promise((resolve,reject)=>{
    const done=(ok)=>{clearTimeout(timer);link.removeEventListener('load',loaded);link.removeEventListener('error',failed);ok?resolve():reject(new Error('STYLE_LOAD_FAILED'));};
    const loaded=()=>done(true),failed=()=>done(false);
    const timer=setTimeout(failed,12000);
    link.addEventListener('load',loaded);link.addEventListener('error',failed);
    if(link.dataset.state==='ready')loaded();
    else if(link.dataset.state==='failed')failed();
  });
}
let starting=false;
button.addEventListener('click',async()=>{
  if(starting)return;
  starting=true;button.disabled=true;
  recovery.hidden=true;
  status.textContent=t('正在接通夜班…');
  const stalled=setTimeout(()=>{
    status.textContent='游戏资源加载较慢（B1），可继续等待或重新加载。';
    recovery.hidden=false;
  },15000);
  try{
    await Promise.all([languageReady,waitForStyles()]);
    // Start the heavy dependencies together, only after acknowledgement.
    for(const href of ['./vendor/three.min.js','./models.mjs','./levels.mjs']){
      const preload=document.createElement('link');preload.rel='modulepreload';preload.href=href;document.head.append(preload);
    }
    const {game}=await import('./game.mjs');
    clearTimeout(stalled);
    notice.classList.add('notice-leaving');
    // Keep the modal focus boundary during the fade, including on rotation.
    await new Promise(resolve=>setTimeout(resolve,matchMedia('(prefers-reduced-motion: reduce)').matches?0:480));
    if(typeof notice.close==='function')notice.close();
    notice.remove();document.body.classList.remove('awaiting-notice');
    const mode=new URLSearchParams(location.search).get('mode');
    if(game&&mode==='race')game.racePanel();
    else if(game&&mode==='board')game.openLeaderboard();
    const target=document.querySelector('#rotateNotice:not(.hidden), #fatal:not(.hidden) button, #panel:not(.hidden) button, #newGame');
    target?.focus({preventScroll:true});
  }catch(error){
    clearTimeout(stalled);
    status.textContent=error.message==='STYLE_LOAD_FAILED'?'页面样式加载失败或超时（B2），请重新加载。':t('加载失败，请刷新页面后重试。');
    recovery.hidden=false;
    button.textContent=t('重新加载');button.disabled=false;
    button.onclick=()=>location.reload();
    console.error('Game startup failed',error);
  }
});
