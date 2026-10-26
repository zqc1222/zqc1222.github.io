import {initI18n,applyI18n,t} from '../i18n.mjs';

// Acknowledgement is per page visit, never saved. No game, sound or flashing
// scene is initialized until the player chooses to continue.
// Health wording: https://www.epilepsy.com/what-is-epilepsy/seizure-triggers/photosensitivity
const notice=document.getElementById('startupNotice');
const button=document.getElementById('noticeContinue');
const status=document.getElementById('noticeStatus');
notice.removeAttribute('open');
if(typeof notice.showModal==='function')notice.showModal();
else notice.setAttribute('open','');
document.getElementById('noticeTitle').focus({preventScroll:true});
notice.addEventListener('cancel',event=>event.preventDefault());
notice.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();return;}
  if(event.key!=='Tab')return;
  const controls=[...notice.querySelectorAll('a[href],button:not([disabled])')];
  const first=controls[0],last=controls.at(-1);
  if(event.shiftKey&&(document.activeElement===first||!controls.includes(document.activeElement))){event.preventDefault();last?.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
});
const languageReady=initI18n().then(()=>applyI18n(notice));
let starting=false;
button.addEventListener('click',async()=>{
  if(starting)return;
  starting=true;button.disabled=true;
  status.textContent=t('正在接通夜班…');
  try{
    await languageReady;
    await import('./game.mjs');
    notice.classList.add('notice-leaving');
    // Keep the modal focus boundary during the fade, including on rotation.
    await new Promise(resolve=>setTimeout(resolve,matchMedia('(prefers-reduced-motion: reduce)').matches?0:480));
    if(typeof notice.close==='function')notice.close();
    notice.remove();document.body.classList.remove('awaiting-notice');
    const target=document.querySelector('#rotateNotice:not(.hidden), #fatal:not(.hidden) button, #newGame');
    target?.focus({preventScroll:true});
  }catch(error){
    status.textContent=t('加载失败，请刷新页面后重试。');
    button.textContent=t('重新加载');button.disabled=false;
    button.onclick=()=>location.reload();
    console.error('Game startup failed',error);
  }
});
