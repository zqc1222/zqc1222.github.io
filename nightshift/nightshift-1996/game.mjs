import * as THREE from './vendor/three.min.js';
import {LEVELS,TILE,SAVE_KEY,worldCell,pathfind,isFloor,currentObjective} from './levels.mjs';
import {buildWorld,character,firstPersonArms,cylinder,disposeModel,canProp} from './models.mjs';
import {t,initI18n,applyI18n,setLang,getLang,switchLabel} from '../i18n.mjs';
import {getItem,setItem} from '../storage.mjs';
/* 成就系统：跨作品统一存档（nightshift-achievements），只做加法，不改玩法与剧情。 */
import {loadAchievements,unlock as unlockAchv,getById as achvById,noteCollected,canCollected,nookCollected,scareSeen,endingSeen,chapterCleared,runFinished,countEvent as achvCount,checkpointDone,list as listAchievements,progress as progressAchievements,exportJSON as exportAchievements,resetAchievements,ACHV_CATEGORIES} from '../achievements.mjs';

/* ==== 多语言：模块加载即锁定语言、翻译静态界面；切换语言写入 localStorage 后整页重载 ==== */
await initI18n();
applyI18n(document);

const $=id=>document.getElementById(id),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const v3=(x,y,z)=>new THREE.Vector3(x,y,z);
function loadSave(){try{const s=JSON.parse(getItem(SAVE_KEY));if(s&&Number.isFinite(s.version)&&s.version>=1)return {checkpoint:clamp(s.checkpoint||0,0,2),unlocked:clamp(s.unlocked||1,1,3),notes:Array.isArray(s.notes)?s.notes:[],endings:Array.isArray(s.endings)?s.endings:[],started:!!s.started};}catch{}return {checkpoint:0,unlocked:1,notes:[],endings:[],started:false};}
function loadSettings(){try{return {volume:.35,quality:'high',shake:true,...JSON.parse(getItem(SAVE_KEY+'-settings')||'{}')};}catch{return {volume:.35,quality:'high',shake:true};}}
/* 精确探测渲染能力：three r180 起只支持 WebGL 2 上下文，只有 WebGL 1 的浏览器必须提前拦下，
   否则 new THREE.WebGLRenderer() 会抛出难懂的内部错误，用户看到的是误导性提示。 */
function webglSupport(){try{const c=document.createElement('canvas');if(c.getContext('webgl2'))return 'webgl2';if(c.getContext('webgl')||c.getContext('experimental-webgl'))return 'webgl1';return 'none';}catch{return 'none';}}
/* 指针锁：Safari 与旧 WebKit 用 webkit 前缀，Element 与 Document 上的方法名要一起兼容。 */
function lockElement(){return document.pointerLockElement||document.webkitPointerLockElement||document.mozPointerLockElement||null;}
function exitLock(){const fn=document.exitPointerLock||document.webkitExitPointerLock||document.mozExitPointerLock;try{if(fn)fn.call(document);}catch{}}

class Sound {
  constructor(){this.ctx=null;this.volume=.35;}
  start(){if(this.ctx){this.ctx.resume().catch(()=>{});return;}try{this.ctx=new (window.AudioContext||window.webkitAudioContext)();this.master=this.ctx.createGain();this.master.gain.value=this.volume;this.master.connect(this.ctx.destination);
    this.hum=this.ctx.createGain();this.hum.gain.value=.035;this.hum.connect(this.master);for(const hz of [50,100,151]){const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.frequency.value=hz;g.gain.value=hz===50?.65:.15;o.connect(g).connect(this.hum);o.start();}
    const b=this.ctx.createBuffer(1,this.ctx.sampleRate*2,this.ctx.sampleRate),a=b.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=Math.random()*2-1;this.noiseBuffer=b;
    this.heartT=0;this.heartLevel=0;
    this.wind=this.ctx.createGain();this.wind.gain.value=.05;this.wind.connect(this.master);const windSrc=this.ctx.createBufferSource();windSrc.buffer=b;windSrc.loop=true;const windFilter=this.ctx.createBiquadFilter();windFilter.type='lowpass';windFilter.frequency.value=430;const windBody=this.ctx.createGain();windBody.gain.value=1;const windLfo=this.ctx.createOscillator();const windLfoGain=this.ctx.createGain();windLfo.frequency.value=.085;windLfoGain.gain.value=150;windLfo.connect(windLfoGain).connect(windFilter.frequency);windSrc.connect(windFilter).connect(windBody).connect(this.wind);windSrc.start();windLfo.start();
    this.rain=this.ctx.createGain();this.rain.gain.value=0;this.rain.connect(this.master);const rainSrc=this.ctx.createBufferSource();rainSrc.buffer=b;rainSrc.loop=true;const rainFilter=this.ctx.createBiquadFilter();rainFilter.type='highpass';rainFilter.frequency.value=1500;const rainBody=this.ctx.createGain();rainBody.gain.value=.6;rainSrc.connect(rainFilter).connect(rainBody).connect(this.rain);rainSrc.start();
  }catch{this.ctx=null;}}
  setVolume(v){this.volume=clamp(v,0,1);if(this.master)this.master.gain.setTargetAtTime(this.volume,this.ctx.currentTime,.03);}
  tone(hz,duration=.16,gain=.15,type='sine',pan=0,delay=0){if(!this.ctx)return;const t=this.ctx.currentTime+delay,o=this.ctx.createOscillator(),g=this.ctx.createGain(),p=this.ctx.createStereoPanner();o.type=type;o.frequency.setValueAtTime(hz,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,hz*.55),t+duration);g.gain.setValueAtTime(.001,t);g.gain.linearRampToValueAtTime(gain,t+.008);g.gain.exponentialRampToValueAtTime(.001,t+duration);p.pan.value=clamp(pan,-1,1);o.connect(g).connect(p).connect(this.master);o.start();o.stop(t+duration+.05);}
  noise(duration=.2,gain=.15,freq=700){if(!this.ctx||!this.noiseBuffer)return;const t=this.ctx.currentTime,n=this.ctx.createBufferSource(),f=this.ctx.createBiquadFilter(),g=this.ctx.createGain();n.buffer=this.noiseBuffer;f.type='bandpass';f.frequency.value=freq;f.Q.value=.8;g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);n.connect(f).connect(g).connect(this.master);n.start();n.stop(t+duration);}
  step(running=false,pan=0,gain=1){this.tone(running?72:96,.11,.16*gain,'triangle',pan);this.noise(.07,.07*gain,400);}
  /* === T4 音效系统：敌人脚步、心跳、环境预设、交互音效 === */
  enemyStep(running=false,pan=0,gain=.8){const g=clamp(gain,.05,1);this.tone(running?52:63,.19,.2*g,'sine',pan);this.noise(.11,.1*g,190);this.noise(.045,.035*g,1500);}
  heartbeat(dt,dist=99,tense=false){const level=clamp(Math.max(1-dist/15,tense?.78:0),0,1);this.heartLevel=level;if(level<=.08){this.heartT=0;return;}this.heartT=(this.heartT||0)-dt;if(this.heartT>0)return;this.heartT=.92-.58*level;const gain=.035+.17*level;this.tone(57,.18,gain,'sine');this.tone(45,.24,gain*.75,'sine',0,.13);}
  setAmbience(kind='library'){if(!this.ctx)return;const p={library:{hum:.035,wind:.05,rain:0},garage:{hum:.018,wind:.1,rain:.11},ward:{hum:.062,wind:.028,rain:0}}[kind]||{hum:.035,wind:.05,rain:0},t=this.ctx.currentTime;if(this.hum)this.hum.gain.setTargetAtTime(p.hum,t,.8);if(this.wind)this.wind.gain.setTargetAtTime(p.wind,t,.8);if(this.rain)this.rain.gain.setTargetAtTime(p.rain,t,.8);}
  pickup(){this.tone(520,.07,.06);this.noise(.09,.07,900);this.tone(760,.05,.028,'triangle',0,.045);}
  docRead(kind='paper'){if(kind==='tape'){this.noise(.3,.12,260);this.tone(280,.16,.05,'triangle',0,.05);}else{this.noise(.12,.07,900);this.tone(620,.05,.035,'triangle',0,.02);}}
  door(open=true){this.noise(.34,.16,340);this.tone(open?126:158,.5,.12,'square');}
  throwOut(){this.noise(.11,.12,760);this.tone(330,.09,.05,'triangle');}
  canClatter(){this.noise(.3,.24,230);this.tone(180,.28,.12,'square');}
  ring(){this.tone(650,.28,.15,'sine');this.tone(880,.28,.07,'sine');}
  scare(){this.noise(.68,.65,1800);this.tone(70,.9,.6,'sawtooth');this.tone(590,.5,.19,'triangle');}
  horn(){this.tone(240,1.15,.34,'sawtooth');this.tone(300,1.15,.18,'triangle');}
}

export class NightShift {
  constructor(){
    this.settings=loadSettings();this.saved=loadSave();this.notes=[...this.saved.notes];this.phase='menu';this.index=0;this.keys=new Set();this.elapsed=0;this.frameTime=0;this.yaw=0;this.pitch=0;this.player=v3(0,0,0);this.stamina=100;this.crouch=false;this.flashOn=true;this.hiding=null;this.dragging=false;this.target=null;this.hintUntil=0;this.toastUntil=0;this.subtitleUntil=0;this.inputGrace=0;this.sound=new Sound();this.sound.setVolume(this.settings.volume);this.raycaster=new THREE.Raycaster();this.objectMeshes=new Map();this.flags={};this.events=[];this.pauseReturn='play';this.touchMode=false;this.touchRun=false;this.autoLow=false;this.cans=0;this.thrown=[];this.doorAnim=[];const _gl=webglSupport();if(_gl!=='webgl2'){const _e=new Error(_gl==='webgl1'?'浏览器仅支持 WebGL 1，而本作需要 WebGL 2 才能渲染三维场景。':'浏览器未启用 WebGL，无法渲染三维夜班。');_e.code=_gl==='webgl1'?'webgl1-only':'no-webgl';throw _e;}
    this.renderer=new THREE.WebGLRenderer({canvas:$('game'),antialias:true,powerPreference:'high-performance'});this.renderer.setClearColor(0x233125);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.12;
    /* 阴影：只由手电投射一次深度，用来把敌人和书架的轮廓从黑暗里“刻”出来。 */
    this.shadowOn=this.settings.quality!=='low';this.renderer.shadowMap.enabled=this.shadowOn;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.045,95);this.camera.rotation.order='YXZ';this.scene.add(this.camera);
/* 光照基调：环境光压到近乎全黑，顶灯只剩将熄的余光，能看清的只有手电光锥。 */
    this.ambient=new THREE.HemisphereLight(0xc3d1a5,0x303d2f,.09);this.scene.add(this.ambient);
    this.localLights=Array.from({length:4},()=>{const l=new THREE.PointLight(0xe1dfb6,.6,6.5,1.6);this.scene.add(l);return l;});
    this.flashlight=new THREE.SpotLight(0xf0e8c4,26,24,Math.PI/6.4,.5,1.15);this.camera.add(this.flashlight);this.flashlight.position.set(.22,-.16,-.1);this.flashTarget=new THREE.Object3D();this.flashTarget.position.set(0,0,-10);this.camera.add(this.flashTarget);this.flashlight.target=this.flashTarget;this.flashlight.castShadow=this.shadowOn;this.flashlight.shadow.mapSize.set(1024,1024);this.flashlight.shadow.camera.near=.35;this.flashlight.shadow.camera.far=this.flashlight.distance;this.flashlight.shadow.bias=-.0012;this.flashlight.shadow.normalBias=.024;
    this.arms=firstPersonArms();this.camera.add(this.arms);this.avatar=character({firstPerson:true});this.scene.add(this.avatar);this.arms.traverse(o=>{if(o.isMesh)o.castShadow=false;});this.avatar.traverse(o=>{if(o.isMesh)o.castShadow=true;});this.buildLightVfx();
    this.scareHead=null;this.scheduled=[];this.bindInput();this.resize();
    /* 首屏优化：标题不再等世界建完。先用关卡数据（纯数据）让菜单与相机就位，
       世界改用「空闲时渐进建场」，菜单的可见时刻只取决于渲染器与模块解析。
       startLevel() 会自己 loadLevel()，所以玩家抢先点「进入夜班」也不会漏建。 */
    this.level=LEVELS[0];this.index=0;this.showMenu();this.animate=this.animate.bind(this);requestAnimationFrame(this.animate);this.setupTouch();this.hideLoading(()=>this.buildSoon());
  }
  /* 渐进式建场：requestIdleCallback 优先，老浏览器退回宏任务；已建好则跳过。 */
  buildSoon(){const build=()=>{if(!this.world)this.loadLevel(0);};
    if(typeof window.requestIdleCallback==='function')window.requestIdleCallback(build,{timeout:900});
    else setTimeout(build,80);}
  /* 加载层由「首帧真的画出来了」驱动，而不是靠固定 400ms 定时器。
     淡出结束后才触发渐进建场，避免建场的卡顿挤进首帧。 */
  hideLoading(done){const ld=$('loading'),finish=()=>{if(typeof done==='function')done();};
    if(!ld||ld.classList.contains('hidden')){finish();return;}
    requestAnimationFrame(()=>requestAnimationFrame(()=>{ld.classList.add('fade');ld.setAttribute('aria-busy','false');
      setTimeout(()=>{ld.classList.add('hidden');ld.setAttribute('aria-hidden','true');finish();},400);}));}
  resize(){this.renderer.setSize(innerWidth,innerHeight);this.renderer.setPixelRatio(this.settings.quality==='low'?.8:Math.min(devicePixelRatio,1.5));this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();document.body.classList.toggle('reduce-motion',!this.settings.shake);const wantShadow=this.settings.quality!=='low';if(wantShadow!==this.shadowOn){this.shadowOn=wantShadow;this.renderer.shadowMap.enabled=wantShadow;if(this.flashlight)this.flashlight.castShadow=wantShadow;this.applyShadows();this.refreshMaterials();}if(this.portraitRenderer)this.resizePortrait();}
  save(){this.saved.notes=this.notes.filter(n=>n.level<this.saved.checkpoint);if(!setItem(SAVE_KEY,JSON.stringify({...this.saved,version:1})))this.warnStorage();}
  saveSettings(){setItem(SAVE_KEY+'-settings',JSON.stringify(this.settings));this.sound.setVolume(this.settings.volume);this.resize();}
  clearInput(){this.keys.clear();this.dragging=false;this.cranking=false;}
  releaseMouse(){this.clearInput();if(lockElement())exitLock();}
  captureMouse(){if(this.phase!=='play')return;const el=$('game'),fail=()=>{$('lookFallback').classList.remove('hidden');};try{const fn=el.requestPointerLock||el.webkitRequestPointerLock||el.mozRequestPointerLock;if(typeof fn!=='function'){fail();return;}const p=fn.call(el);if(p&&typeof p.catch==='function')p.catch(fail);}catch{fail();}}
  bindInput(){
    addEventListener('resize',()=>this.resize());
    const onLockChange=()=>{if(lockElement()){$('lookFallback').classList.add('hidden');}else if(this.phase==='play'){$('lookFallback').classList.remove('hidden');this.clearInput();}};
    document.addEventListener('pointerlockchange',onLockChange,false);
    document.addEventListener('webkitpointerlockchange',onLockChange,false);
    document.addEventListener('mozpointerlockchange',onLockChange,false);
    addEventListener('blur',()=>{if(this.phase==='play')this.pause();else this.clearInput();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&this.phase==='play')this.pause();});
    addEventListener('keydown',e=>{
      if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)){if(e.code==='Escape'){e.preventDefault();if(this.phase==='menu')this.showMenu();else if(this.phase==='paused'){this.phase='play';this.pause();}else if(this.phase==='dialog')this.resume();}return;}
      const _navPhase=['paused','dialog','journal','menu','death','ending','transition','intro','gallery','achievements','achvConfirm'].includes(this.phase);if(!_navPhase&&['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(e.code))e.preventDefault();
      if(e.code==='Escape'){e.preventDefault();if(this.phase==='play')this.pause();else if(['paused','dialog','journal'].includes(this.phase))this.resume();else if(this.phase==='gallery')this.closeGallery();else if(this.phase==='achievements')this.closeAchievements();else if(this.phase==='achvConfirm')this.openAchievements();return;}
      if(this.phase!=='play')return;this.keys.add(e.code);if(e.repeat)return;
      if(e.code==='KeyE')this.interact();if(e.code==='KeyF'){this.flashOn=!this.flashOn;this.sound.tone(900,.04,.04);}
      if(e.code==='KeyC'&&!this.hiding){this.crouch=!this.crouch;this.toast(this.crouch?'蹲下：脚步更轻，但移动更慢。':'站起。');}
      if(e.code==='KeyQ')this.throwCan();if(e.code==='KeyT')this.journal();if(e.code==='KeyH'){this.hintUntil=this.elapsed+14;this.updateHint();}
    });
    addEventListener('keyup',e=>this.keys.delete(e.code));
    $('game').addEventListener('pointerdown',e=>{if(this.phase==='play'&&e.button===0&&e.pointerType!=='touch'){this.dragging=true;this.captureMouse();}});
    addEventListener('pointerup',()=>this.dragging=false);
    addEventListener('mousemove',e=>{if(this.phase!=='play')return;if(lockElement()||this.dragging){this.yaw-=clamp(e.movementX,-180,180)*.0022;this.pitch=clamp(this.pitch-clamp(e.movementY,-180,180)*.0022,-1.3,1.3);if(this.hiding)this.yaw=clamp(this.yaw,this.hideYaw-.85,this.hideYaw+.85);}});
    $('newGame').onclick=()=>{this.sound.start();if(this.saved.started)this.panel('重新接起电话','回到第一章','会从图书馆重新开始。已解锁的章节和结局仍会保留。',[['开始新夜班',()=>{this.notes=[];this.clearCheckpoint(0);this.startLevel(0);},'primary'],['返回',()=>this.showMenu()]],'menu');else{this.clearCheckpoint(0);this.startLevel(0);}};
    $('continueGame').onclick=()=>{this.sound.start();this.notes=[...this.saved.notes];this.startLevel(this.saved.checkpoint,true,this.ckptHasSave(this.saved.checkpoint));};
    $('chapterButton').onclick=()=>this.chapters();$('settingsButton').onclick=()=>this.settingsPanel('menu');$('galleryButton').onclick=()=>this.openGallery();$('galleryBack').onclick=()=>this.closeGallery();
    $('achievementsButton').onclick=()=>this.openAchievements();$('achvBack').onclick=()=>this.closeAchievements();$('achvReset').onclick=()=>this.achvReset();$('achvExport').onclick=()=>this.achvExport();
  }
  loadLevel(index){
    if(this.world){this.scene.remove(this.world);disposeModel(this.world);}if(this.enemy){this.scene.remove(this.enemy.mesh);disposeModel(this.enemy.mesh);}if(this.duplicate){this.scene.remove(this.duplicate);disposeModel(this.duplicate);}this.clearScare();
    this.index=index;this.level=LEVELS[index];this.flags={};this.scheduled=[];this.enemy=null;this.duplicate=null;this.duplicateActive=false;this.hiding=null;this.stamina=100;this.crankProgress=0;this.hornCooldown=0;this.hintUntil=0;this.elapsed=0;this.stepTime=0;this.footPhase=0;this.crouch=false;this.flashOn=true;this.target=null;this.spawnGrace=4;this.yaw=this.level.yaw;this.pitch=0;this.player.set(this.level.spawn[0]*TILE,0,this.level.spawn[1]*TILE);
    const built=buildWorld(this.level);this.world=built.world;this.blockers=built.blockers;this.lampPositions=built.lamps;this.objectMeshes=built.props;this.scene.add(this.world);this.collectLod();const fogTint=new THREE.Color(this.level.palette.fog).multiplyScalar(.22);const fogRange=[[2.8,20],[3.4,25],[2.5,17.5]][index]||[2.8,20];this.scene.fog=new THREE.Fog(fogTint,fogRange[0],fogRange[1]);this.renderer.setClearColor(fogTint);
    this.propColliders=this.level.objects.filter(o=>o.visual!==false&&!o.decor&&!['curtain','can'].includes(o.kind)).map(o=>{const thin=Math.abs(Math.sin(o.rotation||0))>.5;return {id:o.id,kind:o.kind,x:o.x*TILE+(o.offsetX||0),z:o.z*TILE+(o.offsetZ||0),
      rx:['phone','paper','tape','radio'].includes(o.kind)?1.25:o.kind==='shutter'?2.65:o.kind==='door'?1.35:o.kind==='panel'?(thin?.14:1.35):o.kind==='catalog'?1.12:o.kind==='shelfNook'?1.46:.58,
      rz:['phone','paper','tape','radio'].includes(o.kind)?.55:o.kind==='panel'?(thin?1.35:.14):o.kind==='catalog'?.45:o.kind==='locker'?.55:o.kind==='shelfNook'?.5:.2};});
    /* 门只挡玩家和视线，不进敌人的寻路障碍：避免玩家关门把巡查者卡在门外走不动。 */
    this.aiBlocked=new Set(this.propColliders.filter(c=>c.kind!=='panel').map(c=>worldCell(c.x,c.z).join(',')));
    this.furnitureColliders=[];for(let z=0;z<this.level.grid.length;z++)for(let x=0;x<this.level.grid[z].length;x++){const c=this.level.grid[z][x],size={S:[1.26,.46],P:[.59,.59],B:[.75,1.25],D:[1.24,.54]}[c];if(size)this.furnitureColliders.push({x:x*TILE,z:z*TILE,rx:size[0],rz:size[1]});}for(const c of this.level.cars||[])this.furnitureColliders.push({x:c.x*TILE,z:c.z*TILE,rx:1.12,rz:2.4});
    this.furnitureColliders.push(...this.world.userData.collisionExtras);if(index===1)for(const x of [13.5,16.5])this.furnitureColliders.push({x:x*TILE,z:4.5,rx:.16,rz:.16});
    if(this.level.enemySpawn){const mesh=character({monster:true,variant:this.level.id});mesh.scale.set(1.08,1.14,1.08);this.scene.add(mesh);const [x,z]=this.level.enemySpawn;mesh.position.set(x*TILE,0,z*TILE);
      /* 巡查视野红光：只作视觉提示，视线判定沿用原数值。锥尖在头部、开口朝前，随巡逻朝向实时转动。 */
      const rig=new THREE.Group();rig.visible=false;mesh.add(rig);
      const beam=new THREE.SpotLight(0xff2a1a,20,16,.36,.5,1.15);beam.position.set(0,1.7,.12);beam.castShadow=this.shadowOn;beam.shadow.mapSize.set(512,512);beam.shadow.camera.near=.5;beam.shadow.camera.far=beam.distance;beam.shadow.bias=-.0018;beam.shadow.normalBias=.03;rig.add(beam);const beamTarget=new THREE.Object3D();beamTarget.position.set(0,1.35,5);rig.add(beamTarget);beam.target=beamTarget;
      const cone=new THREE.Mesh(new THREE.ConeGeometry(3.2,8.6,26,1,true),new THREE.MeshBasicMaterial({color:0xff2a1a,transparent:true,opacity:.11,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));cone.rotation.x=-Math.PI/2;cone.position.set(0,1.66,4.3);rig.add(cone);
      const glow=new THREE.PointLight(0xff3a26,1.4,3.6,1.4);glow.position.set(0,1.72,0);rig.add(glow);
      this.enemy={mesh,rig,beam,cone,glow,active:index===1,state:'patrol',patrol:0,next:null,target:null,lost:0,search:0,grace:5,step:0,witness:0,seen:false,lastNoise:0,wait:0,waitTotal:0,baseYaw:0,searchQueue:[],lastSeen:null,halfDeg:this.level.visionHalfDeg||65,dot:1,alert:false};}
    if(index===2){this.duplicate=character();this.duplicate.position.set(this.level.duplicateSpawn[0]*TILE,0,this.level.duplicateSpawn[1]*TILE);this.duplicate.rotation.y=-Math.PI/2;this.duplicate.visible=false;this.scene.add(this.duplicate);}
    this.notes=this.notes.filter(n=>n.level<index);this.events=[];
    this.cans=0;this.canPool=this.canPool||[];for(const p of this.thrown){this.scene.remove(p.g);p.g.visible=false;if(this.canPool.length<8)this.canPool.push(p.g);}this.thrown=[];this.doorAnim=[];this.lastLightUpdate=0;this.lastHintUpdate=0;this.sound.setAmbience(['library','garage','ward'][index]||'library');this.applyShadows();this.resetDust();
    $('place').textContent=t(this.level.place);$('chapterTag').textContent=`CHAPTER ${this.level.chapter} / ${t(this.level.title)}`;$('clock').textContent=this.level.date.split(' · ')[1];
    for(const id of ['hideOverlay','danger','interact','hold','subtitle','toast','hint'])$(id).classList.add('hidden');
    this.subtitleUntil=this.toastUntil=0;this.updateCamera(0);this.updateLights();this.updateHUD();
  }
  showMenu(){this.phase='menu';this.releaseMouse();$('menu').classList.remove('hidden');$('panel').classList.add('hidden');$('hud').classList.add('hidden');$('gallery').classList.add('hidden');$('continueGame').classList.toggle('hidden',!this.saved.started);this.arms.visible=false;this.avatar.visible=false;this.player.set(this.level.spawn[0]*TILE,0,this.level.spawn[1]*TILE);this.yaw=-.25;this.pitch=-.01;this.updateCamera(0);}
  startLevel(index,intro=true){
    this.sound.start();this.loadLevel(index);this.saved.started=true;this.saved.checkpoint=index;this.saved.unlocked=Math.max(this.saved.unlocked,index+1);this.save();$('menu').classList.add('hidden');$('hud').classList.remove('hidden');
    if(intro)this.panel(t('第 {n} 章 / {d}',{n:this.level.chapter,d:t(this.level.date)}),t(this.level.title),this.level.intro.map(s=>t(s)).join('\n\n')+'\n\n'+(index===0?t('WASD 移动；鼠标或方向键转动视角。\nE 互动，Shift 奔跑，C 蹲下，T 查看手记。\nQ 扔出手里的空罐。H 可以暂时显示去往当前目标的方向。'):t('本章进度已保存，死亡后会从最近的检查点继续。')),[['进入夜班',()=>this.resume(),'primary']],'intro');else this.resume();
    this.events.push({at:this.elapsed,type:'start',chapter:index});
  }
  resume(capture=true){if(this.portraitBlocked)return;this.phase='play';$('panel').classList.add('hidden');$('menu').classList.add('hidden');$('hud').classList.remove('hidden');this.clearInput();this.inputGrace=.2;this.arms.visible=!this.hiding;this.avatar.visible=!this.hiding;if(capture)this.captureMouse();}
  panel(kicker,title,content,actions,phase='dialog'){
    this.phase=phase;$('panel').dataset.phase=phase;this.releaseMouse();$('panel').classList.remove('hidden');$('panelKicker').textContent=t(kicker);$('panelTitle').textContent=t(title);$('panelContent').replaceChildren();if(typeof content==='string')$('panelContent').textContent=t(content);else if(content){$('panelContent').append(content);applyI18n(content);}$('panelActions').replaceChildren();
    for(const [label,fn,kind] of actions){const b=document.createElement('button');b.textContent=t(label);if(kind)b.className=kind;b.onclick=fn;$('panelActions').append(b);}setTimeout(()=>$('panelActions').querySelector('button')?.focus(),0);
  }
  pause(){if(this.phase!=='play')return;this.panel('夜间暂停 / 世界已停止','先听一会儿呼吸','柜外的脚步和时间都已暂停。\n\nWASD 移动 · 方向键也能转动视角\nE 互动 / 躲藏 / 按住摇门 · F 手电\nShift 奔跑 · C 蹲下 · T 手记 · H 引路 · Q 扔罐',[['继续',()=>this.resume(),'primary'],['声音与画面',()=>this.settingsPanel('paused')],['返回标题',()=>this.showMenu()]],'paused');}
  toast(text,duration=3.6,kind=''){$('toast').textContent=t(text);$('toast').classList.toggle('ckpt',kind==='ckpt');$('toast').classList.remove('hidden');this.toastUntil=this.elapsed+duration;}
  subtitle(text,duration=8){$('subtitle').querySelector('p').textContent=t(text);$('subtitle').classList.remove('hidden');this.subtitleUntil=this.elapsed+duration;}
  addNote(id,text){if(!this.notes.some(n=>n.id===id)){this.notes.push({id,level:this.index,text});this.events.push({type:'note',id,at:this.elapsed});}}
  journal(){
    const div=document.createElement('div');
    const RAW=currentObjective(this.index,this.flags)[1];
    const objective=document.createElement('p');objective.className='rule';objective.id='journalObjective';objective.textContent=RAW;div.append(objective);
    const bar=document.createElement('div');bar.className='journal-bar';bar.setAttribute('role','search');
    const input=document.createElement('input');input.type='search';input.id='journalSearch';input.className='journal-search';input.placeholder='搜索手记 / 当前规则…';input.setAttribute('aria-label','搜索手记与当前规则内容');input.setAttribute('autocomplete','off');input.setAttribute('autocapitalize','off');input.setAttribute('spellcheck','false');
    const clr=document.createElement('button');clr.type='button';clr.className='journal-clear';clr.textContent='清除';clr.hidden=true;
    const count=document.createElement('span');count.className='journal-count';count.setAttribute('role','status');count.setAttribute('aria-live','polite');
    bar.append(input,clr,count);div.append(bar);
    const list=document.createElement('div');list.className='journal-list';
    if(!this.notes.length){const p=document.createElement('p');p.className='journal-empty';p.textContent='还没有找到记录。靠近电话、纸条和旧物，按 E 调查。';list.append(p);}
    for(const n of this.notes){const d=document.createElement('div');d.className='note-item';d.dataset.text=t(n.text);const span=document.createElement('span');span.className='note-chapter';span.textContent=`CHAPTER ${LEVELS[n.level].chapter}`;const body=document.createElement('p');body.className='note-body';body.textContent=t(n.text);d.append(span,body);list.append(d);}
    div.append(list);
    const total=this.notes.length;
    const apply=()=>{const q=input.value.trim().toLowerCase();let hits=0;list.querySelectorAll('.note-item').forEach(item=>{const raw=item.dataset.text||'';const ok=!q||raw.toLowerCase().includes(q);item.hidden=!ok;item.classList.toggle('is-hit',!!q&&ok);if(ok)hits++;const body=item.querySelector('.note-body');if(q&&ok)highlightInto(body,raw,q);else body.textContent=raw;});if(q)highlightInto(objective,RAW,q);else objective.textContent=RAW;clr.hidden=!q;count.textContent=q?(hits?t('{hits} / {total} 条匹配',{hits,total}):t('没有匹配的条目')):t('共 {total} 条记录',{total});};
    input.addEventListener('input',apply);
    input.addEventListener('keydown',e=>{if(e.key!=='Escape')return;e.preventDefault();e.stopPropagation();if(input.value){input.value='';apply();}else this.resume();});
    clr.addEventListener('click',()=>{input.value='';apply();input.focus();});
    this.panel('私人手记 / T','留下的线索',div,[['合上手记',()=>this.resume(),'primary']],'journal');
    apply();
    if(!this.touchMode)setTimeout(()=>{try{input.focus();}catch{}},60);
  }
  chapters(){const div=document.createElement('div');div.className='chapter-grid';LEVELS.forEach((l,i)=>{const b=document.createElement('button');const unlocked=i<this.saved.unlocked;b.disabled=!unlocked;const num=document.createElement('b');num.textContent=l.chapter;const s=document.createElement('small');s.textContent=unlocked?t('{place} · 从章节起点进入',{place:t(l.place)}):t('完成上一章后解锁');b.append(num,document.createTextNode(t(unlocked?l.title:'档案封存')),s);b.onclick=()=>{this.notes=this.saved.notes.filter(n=>n.level<i);this.startLevel(i);};div.append(b);});this.panel('章节档案','三次夜班',div,[['返回标题',()=>this.showMenu()]],'menu');}
  settingsPanel(back){const div=document.createElement('div');div.innerHTML='<label class="setting-row">环境与音效音量 <input aria-label="音量" type="range" min="0" max="100"></label><label class="setting-row">渲染清晰度 <select aria-label="渲染清晰度"><option value="high">标准</option><option value="low">流畅</option></select></label><label class="setting-row">镜头晃动 <input aria-label="镜头晃动" type="checkbox"></label><label class="setting-row">高对比度模式 <input aria-label="高对比度模式" type="checkbox"></label><p class="small muted">关闭镜头晃动仍会保留剧情突脸，并会同时关闭界面上多余的动效。<br>高对比度会加深底色、提高线条与文字对比，与系统的高对比度设置叠加生效。<br>如果鼠标锁定不可用，可按住鼠标拖动，或用方向键转动视角。</p>';
    const range=div.querySelector('input[type=range]'),quality=div.querySelector('select'),shake=div.querySelector('input[type=checkbox]'),contrast=div.querySelectorAll('input[type=checkbox]')[1];range.value=this.settings.volume*100;quality.value=this.settings.quality;shake.checked=this.settings.shake;range.oninput=()=>{this.settings.volume=Number(range.value)/100;this.saveSettings();};quality.onchange=()=>{this.settings.quality=quality.value;this.saveSettings();};shake.onchange=()=>{this.settings.shake=shake.checked;this.saveSettings();};if(contrast){contrast.checked=document.documentElement.getAttribute('data-contrast')==='high';contrast.onchange=()=>{setContrastMode(contrast.checked);};}this.panel('声音与画面','夜间设置',div,[[back==='menu'?'返回标题':'返回暂停',()=>{if(back==='menu')this.showMenu();else {this.phase='play';this.pause();}},'primary']],back==='menu'?'menu':'paused');}
  openGallery(){this.phase='gallery';this.releaseMouse();$('menu').classList.add('hidden');$('gallery').classList.remove('hidden');if(!this.portraitRenderer){this.portraitRenderer=new THREE.WebGLRenderer({canvas:$('portrait'),antialias:true,alpha:true});this.portraitRenderer.outputColorSpace=THREE.SRGBColorSpace;this.portraitRenderer.toneMapping=THREE.ACESFilmicToneMapping;this.portraitRenderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.portraitScene=new THREE.Scene();this.portraitScene.add(new THREE.HemisphereLight(0xe0e5ca,0x39473c,2.5));const key=new THREE.DirectionalLight(0xffe3b1,3);key.position.set(3,4,3);this.portraitScene.add(key);const rim=new THREE.DirectionalLight(0x8daba9,2);rim.position.set(-3,3,-2);this.portraitScene.add(rim);this.portraitModel=character();this.portraitScene.add(this.portraitModel);cylinder(this.portraitScene,.7,.74,.07,'#334b3c',0,-.05,0,24);this.portraitCamera=new THREE.PerspectiveCamera(34,1,.1,20);this.portraitCamera.position.set(0,1.1,4);this.portraitCamera.lookAt(0,1.02,0);}this.resizePortrait();}
  resizePortrait(){const rect=$('portrait').getBoundingClientRect();this.portraitRenderer.setSize(rect.width,rect.height,false);this.portraitCamera.aspect=rect.width/rect.height;this.portraitCamera.updateProjectionMatrix();}
  closeGallery(){this.showMenu();}

  schedule(delay,fn){this.scheduled.push({at:this.elapsed+delay,fn});}
  /* ==== 3D 性能：LOD 细节层次 ====
     远景小件（书脊 / 标签 / 接地阴影）在雾距之外本来就看不清，直接不渲染，
     省下 draw call 与填充率；碰撞、视线与交互所用网格不受影响。 */
  collectLod(){
    this.lodNodes=[];this.lastLodUpdate=0;if(!this.world)return;
    const v=new THREE.Vector3();
    this.world.traverse(o=>{
      if(!o.isMesh||o.userData.hidden)return;
      const d=o.userData.lod;if(!d)return;
      let n=o,dyn=false;while(n&&n!==this.world){if(n.userData&&n.userData.dyn===true){dyn=true;break;}n=n.parent;}
      if(dyn)return;
      const geo=o.geometry;if(!geo)return;
      let bs=o.boundingSphere;if(!bs){if(!geo.boundingSphere)geo.computeBoundingSphere();bs=geo.boundingSphere;}
      if(!bs)return;
      /* 判定条件是"整个包围球都超出阈值"，避免体量大的合批体（整层书脊/接地阴影）按中心距离被误隐藏。 */
      v.copy(bs.center).applyMatrix4(o.matrixWorld);
      const reach=d+bs.radius;
      this.lodNodes.push({o,x:v.x,z:v.z,d2:reach*reach});
    });
  }
  updateLod(){
    const list=this.lodNodes;if(!list||!list.length)return;
    if(this.lastLodUpdate&&this.elapsed-this.lastLodUpdate<.25)return;
    this.lastLodUpdate=this.elapsed;
    const px=this.player.x,pz=this.player.z;
    for(const n of list){const o=n.o;if(!o.parent)continue;const dx=n.x-px,dz=n.z-pz;o.visible=(dx*dx+dz*dz)<=n.d2;}
  }
  /* ==== 3D 性能：空罐对象池 ====
     投掷物反复创建/销毁会带来 GC 抖动，这里复用同一组罐体网格，关卡切换时回收。 */
  acquireCan(){
    this.canPool=this.canPool||[];
    let g=this.canPool.pop();
    if(!g){g=new THREE.Group();canProp(g);}
    if(!g.parent)this.scene.add(g);
    g.visible=true;g.rotation.set(0,0,0);
    return g;
  }
  lineOfSight(from,to,includeCurtain=true,propCover=true){const dir=to.clone().sub(from),distance=dir.length();if(distance<.01)return true;this.raycaster.set(from,dir.normalize());this.raycaster.far=distance-.08;const occluders=[...this.blockers];if(includeCurtain&&this.flags.curtainClosed)occluders.push(this.objectMeshes.get('curtain').userData.cloth);if(propCover)for(const o of this.level.objects){if(['locker','catalog','door','shutter','shelfNook'].includes(o.kind))occluders.push(this.objectMeshes.get(o.id));else if(o.kind==='panel'&&!this.flags[o.id])occluders.push(this.objectMeshes.get(o.id));}this.world.updateMatrixWorld();return this.raycaster.intersectObjects(occluders,true).length===0;}
  canWalk(x,z,radius=.27){for(const [dx,dz] of [[radius,radius],[radius,-radius],[-radius,radius],[-radius,-radius],[radius,0],[-radius,0],[0,radius],[0,-radius]]){const [cx,cz]=worldCell(x+dx,z+dz);if(!this.level.grid[cz]?.[cx]||this.level.grid[cz][cx]==='#')return false;}
    for(const c of this.propColliders){if(c.kind==='panel'&&this.flags[c.id])continue;if(c.id==='exit'&&this.flags.gate)continue;if(Math.abs(x-c.x)<c.rx+radius&&Math.abs(z-c.z)<c.rz+radius)return false;}
    for(const c of this.furnitureColliders)if(Math.abs(x-c.x)<c.rx+radius&&Math.abs(z-c.z)<c.rz+radius)return false;
    if(this.flags.curtainClosed&&Math.abs(x-33)<.15+radius&&Math.abs(z-18)<1.5+radius)return false;return true;
  }
  updatePlayer(dt){
    if(this.keys.has('ArrowLeft'))this.yaw+=dt*1.65;if(this.keys.has('ArrowRight'))this.yaw-=dt*1.65;if(this.keys.has('ArrowUp'))this.pitch=clamp(this.pitch+dt, -1.3,1.3);if(this.keys.has('ArrowDown'))this.pitch=clamp(this.pitch-dt,-1.3,1.3);
    if(this.hiding){this.yaw=clamp(this.yaw,this.hideYaw-.85,this.hideYaw+.85);return;}
    const f=Number(this.keys.has('KeyW'))-Number(this.keys.has('KeyS')),s=Number(this.keys.has('KeyD'))-Number(this.keys.has('KeyA'));const moving=!!(f||s),running=moving&&(this.keys.has('ShiftLeft')||this.keys.has('ShiftRight'))&&this.stamina>2&&!this.crouch;
    let speed=this.crouch?1.65:running?5.15:3.15;const scale=Math.hypot(f,s)||1;const dx=(-Math.sin(this.yaw)*f+Math.cos(this.yaw)*s)/scale*speed*dt,dz=(-Math.cos(this.yaw)*f-Math.sin(this.yaw)*s)/scale*speed*dt;
    const oldX=this.player.x,oldZ=this.player.z;if(this.canWalk(this.player.x+dx,this.player.z))this.player.x+=dx;if(this.canWalk(this.player.x,this.player.z+dz))this.player.z+=dz;
    const actual=Math.hypot(this.player.x-oldX,this.player.z-oldZ)>.0005;this.stamina=clamp(this.stamina+(running&&actual?-21:14)*dt,0,100);this.moving=actual;this.running=running&&actual;
    if(actual){this.footPhase+=dt*(running?12:8);this.stepTime+=dt;if(this.stepTime>(running?.32:this.crouch?.72:.5)){this.stepTime=0;this.sound.step(running,0,this.crouch?.4:1);this.makeNoise(this.crouch?1.8:running?13:4.5);}}
    else this.footPhase*=Math.max(0,1-dt*6);
  }
updateCamera(dt){const bob=this.settings.shake&&this.phase==='play'&&this.moving&&!this.hiding?Math.sin(this.footPhase)*.025:0;const height=this.hiding?1.47:this.crouch?1.04:1.68;this.camera.position.set(this.player.x,height+bob,this.player.z);this.camera.rotation.set(this.pitch,this.yaw,0,'YXZ');this.camera.updateMatrixWorld(true);this.avatar.position.copy(this.player);this.avatar.position.x+=Math.sin(this.yaw)*.28;this.avatar.position.z+=Math.cos(this.yaw)*.28;this.avatar.rotation.y=this.yaw+Math.PI;this.avatar.scale.y=this.crouch?.69:1;this.avatar.userData.legs.forEach((leg,i)=>leg.rotation.x=this.moving?Math.sin(this.footPhase+i*Math.PI)*.28:0);this.arms.position.y=-.18+bob*.7;this.arms.visible=this.phase==='play'&&!this.hiding;this.avatar.visible=this.phase==='play'&&!this.hiding;const flashOn=this.flashOn&&!this.hiding&&this.phase!=='scare';this.flashlight.visible=flashOn;const flashBase=this.index===2&&this.flags.hospitalPower?22:26;this.flashlight.intensity=flashBase*(1+Math.sin(this.elapsed*9.3)*.035+Math.sin(this.elapsed*23.7)*.018);if(this.flashGlow)this.flashGlow.visible=flashOn;if(this.flashBeam)this.flashBeam.visible=flashOn;this.updateDust(dt);}
  updateLights(){const nearest=[...this.lampPositions].sort((a,b)=>a.distanceToSquared(this.player)-b.distanceToSquared(this.player)).slice(0,4);this.localLights.forEach((light,i)=>{light.visible=!!nearest[i];if(nearest[i])light.position.copy(nearest[i]);light.intensity=this.index===2&&!this.flags.hospitalPower?.35:.6;});this.ambient.intensity=this.index===2&&!this.flags.hospitalPower?.015:.03;}
  /* === T5 视觉与氛围：阴影标记 / 手电光晕与光柱 / 空气浮尘 === */
  applyShadows(){
    const on=this.shadowOn;
    const mark=(root,cast)=>{if(!root)return;root.traverse(o=>{if(!o.isMesh&&!o.isInstancedMesh)return;const list=o.material?(Array.isArray(o.material)?o.material:[o.material]):[];const opaque=list.length>0&&list.every(m=>m.isMeshStandardMaterial&&!m.transparent);o.castShadow=on&&!!cast&&opaque;o.receiveShadow=on;});};
    mark(this.world,true);mark(this.enemy&&this.enemy.mesh,true);mark(this.duplicate,true);
    if(this.avatar)this.avatar.traverse(o=>{if(o.isMesh)o.castShadow=on;});
    if(this.arms)this.arms.traverse(o=>{if(o.isMesh)o.castShadow=false;});
    if(this.scareHead)this.scareHead.traverse(o=>{if(o.isMesh)o.castShadow=false;});
    if(this.enemy&&this.enemy.cone)this.enemy.cone.castShadow=false;
    if(this.enemy&&this.enemy.beam)this.enemy.beam.castShadow=on;
    if(this.flashGlow)this.flashGlow.castShadow=false;if(this.flashBeam){this.flashBeam.castShadow=false;this.flashBeam.receiveShadow=false;}if(this.dust){this.dust.castShadow=false;this.dust.receiveShadow=false;}
  }
  refreshMaterials(){const bump=r=>{if(!r)return;r.traverse(o=>{if(!o.material)return;for(const m of (Array.isArray(o.material)?o.material:[o.material]))m.needsUpdate=true;});};bump(this.scene);bump(this.world);bump(this.enemy&&this.enemy.mesh);bump(this.duplicate);bump(this.avatar);}
  buildLightVfx(){
    const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');const grad=ctx.createRadialGradient(64,64,0,64,64,62);grad.addColorStop(0,'rgba(255,248,222,.5)');grad.addColorStop(.32,'rgba(238,230,192,.17)');grad.addColorStop(.68,'rgba(216,208,170,.045)');grad.addColorStop(1,'rgba(216,208,170,0)');ctx.fillStyle=grad;ctx.fillRect(0,0,128,128);
    this.glowTexture=new THREE.CanvasTexture(c);this.glowTexture.colorSpace=THREE.SRGBColorSpace;
    this.flashGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glowTexture,color:0xfff4d6,transparent:true,opacity:.85,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,fog:false}));this.flashGlow.position.set(0,0,-.32);this.flashGlow.scale.set(.5,.5,1);this.camera.add(this.flashGlow);
    const cone=new THREE.Mesh(new THREE.ConeGeometry(5.4,10.5,30,1,true),new THREE.MeshBasicMaterial({color:0xf1e9c6,transparent:true,opacity:.05,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));cone.rotation.x=Math.PI/2;cone.position.set(0,0,-5.36);this.camera.add(cone);this.flashBeam=cone;
    const n=700,pos=new Float32Array(n*3);this.dustDrift=new Float32Array(n*3);
    for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,r=Math.random()*9;pos[i*3]=Math.cos(a)*r;pos[i*3+1]=.06+Math.random()*3.2;pos[i*3+2]=Math.sin(a)*r;this.dustDrift[i*3]=(Math.random()-.5)*.34;this.dustDrift[i*3+1]=.05+Math.random()*.1;this.dustDrift[i*3+2]=(Math.random()-.5)*.34;}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    this.dust=new THREE.Points(geo,new THREE.PointsMaterial({map:this.glowTexture,color:0xcfcbaa,size:.075,sizeAttenuation:true,transparent:true,opacity:.34,depthWrite:false,blending:THREE.AdditiveBlending,fog:true}));this.dust.frustumCulled=false;this.scene.add(this.dust);
  }
  resetDust(){if(!this.dust)return;const a=this.dust.geometry.attributes.position,p=this.player,half=9;for(let i=0;i<a.count;i++)a.setXYZ(i,p.x+(Math.random()*2-1)*half,.06+Math.random()*3.2,p.z+(Math.random()*2-1)*half);a.needsUpdate=true;}
  updateDust(dt){if(!this.dust||dt<=0)return;const a=this.dust.geometry.attributes.position,p=this.player,half=9,top=3.3,span=half*2;for(let i=0;i<a.count;i++){let x=a.getX(i)+this.dustDrift[i*3]*dt,y=a.getY(i)+this.dustDrift[i*3+1]*dt,z=a.getZ(i)+this.dustDrift[i*3+2]*dt;if(x<p.x-half)x+=span;else if(x>p.x+half)x-=span;if(z<p.z-half)z+=span;else if(z>p.z+half)z-=span;if(y>top)y=.06;else if(y<.02)y=top;a.setXYZ(i,x,y,z);}a.needsUpdate=true;}
  nearestObject(){let best=null,bestScore=Infinity;const eye=this.camera.position.clone(),dir=this.camera.getWorldDirection(new THREE.Vector3());for(const o of this.level.objects){if(o.decor||(o.kind==='can'&&this.flags[o.id]))continue;const pos=v3(o.x*TILE+(o.offsetX||0),o.kind==='can'?.28:1.3,o.z*TILE+(o.offsetZ||0)),distance=Math.hypot(pos.x-this.player.x,pos.z-this.player.z);const facing=pos.clone().sub(eye).normalize().dot(dir);if(distance>3.15||facing<-.15||!this.lineOfSight(eye,pos,false,false))continue;const score=distance-facing*.65;if(score<bestScore){best=o;bestScore=score;}}return best;}
  updateHUD(){const [target,text]=currentObjective(this.index,this.flags);const ot=$('objectiveText');if(ot.textContent!==text){ot.textContent=text;const box=$('objective');if(box){box.classList.remove('is-new');void box.offsetWidth;box.classList.add('is-new');clearTimeout(this.objTimer);this.objTimer=setTimeout(()=>box.classList.remove('is-new'),2600);}}$('stamina').style.width=this.stamina+'%';$('posture').textContent=t(this.hiding?'躲藏':this.crouch?'蹲伏':'站立');$('flashState').textContent=t('手电 {state}',{state:this.flashOn&&!this.hiding?'ON':'OFF'});const canEl=$('cans');if(canEl){canEl.textContent=t('空罐 ×{n}',{n:this.cans||0});canEl.classList.toggle('none',!this.cans);}
    this.target=this.hiding?null:this.nearestObject();$('interact').classList.toggle('hidden',!this.target||this.hiding||this.phase!=='play');if(this.target){let title=this.target.title;if(this.target.id==='curtain')title=this.flags.curtainClosed?'拉开右侧隔帘':'拉上右侧隔帘';if(this.target.id==='crank')title=this.flags.gate?'卷帘门已开启':'按住 E 转动手轮';if(this.target.id==='fuse'&&this.flags.fuse)title='保险芯已取走';if(this.target.kind==='panel')title=this.flags[this.target.id]?'关上门（门轴声会吸引它）':'推开门（门轴声会吸引它）';$('interact').querySelector('span').textContent=t(title);}
    $('hold').classList.toggle('hidden',this.target?.id!=='crank'||!this.flags.power||this.flags.gate);$('hold').querySelector('i').style.width=(this.crankProgress/5*100)+'%';
    const dangerOn=!!this.enemy?.active&&['chase','search','searchHide'].includes(this.enemy.state);$('danger').classList.toggle('hidden',!dangerOn);if(dangerOn)$('danger').dataset.state=this.enemy.state;else delete $('danger').dataset.state;
    if(this.toastUntil&&this.elapsed>this.toastUntil)$('toast').classList.add('hidden');if(this.subtitleUntil&&this.elapsed>this.subtitleUntil)$('subtitle').classList.add('hidden');
  }
  updateHint(){if(this.elapsed>this.hintUntil){$('hint').classList.add('hidden');return;}const id=currentObjective(this.index,this.flags)[0],o=this.level.objects.find(d=>d.id===id);if(!o)return;const start=worldCell(this.player.x,this.player.z);let route=[];for(const [dx,dz] of [[0,1],[-1,0],[1,0],[0,-1],[0,0]]){const path=pathfind(this.level,start,[o.x+dx,o.z+dz],this.aiBlocked);if(path.length&&(!route.length||path.length<route.length))route=path;}
    const next=route[1]||route[0],near=Math.hypot(o.x*TILE-this.player.x,o.z*TILE-this.player.z)<3.5;let label='目标在附近，转动视角寻找互动提示。';if(next&&!near){let a=Math.atan2(-(next[0]*TILE-this.player.x),-(next[1]*TILE-this.player.z))-this.yaw;a=Math.atan2(Math.sin(a),Math.cos(a));const arrow=Math.abs(a)<.55?'↑ 前方':Math.abs(a)>2.4?'↓ 身后':a>0?'← 左侧':'→ 右侧';label=t('{arrow} · 沿通道前往目标（约 {n} 米）',{arrow:t(arrow),n:Math.max(3,(route.length-1)*3)});}else if(!next&&!near)label='目标在隔壁区域，请寻找通道。';$('hint').textContent=t(label);$('hint').classList.remove('hidden');}

  interact(){
    if(this.phase!=='play'||this.inputGrace>0)return;
    if(this.hiding){this.leaveHide();return;}
    const o=this.nearestObject();if(!o)return;this.events.push({type:'interact',id:o.id,at:this.elapsed});
    if(o.kind==='can'){this.flags[o.id]=true;this.cans++;const prop=this.objectMeshes.get(o.id);if(prop)prop.visible=false;this.sound.pickup();this.toast(t('拾起一个空罐子（{n}）。按 Q 把它丢出去：落地声会把巡查者引开。',{n:this.cans}),4.6);return;}
    if(o.kind==='panel'){this.toggleDoor(o);return;}
    if(o.hide){this.enterHide(o);return;}
    if(o.kind==='phone'){this.flags[o.id]=true;this.sound.ring();this.subtitle(o.text,12);this.addNote(o.id,o.text);return;}
    if(o.id==='chart'){this.flags.chart=true;this.addNote('chart',o.clue||o.text);this.panel('病历 / 已抄入手记',o.title,o.text,[['合上病历',()=>this.resume(),'primary']]);this.sound.docRead('paper');return;}
    /* 可读取的文档：纸类与磁带统一走这里，抄进手记并展开原文。 */
    if((o.kind==='paper'||o.kind==='tape')&&o.id!=='record'){
      this.flags[o.id]=true;this.addNote(o.id,o.clue||o.text);
      const doc=document.createElement('div');doc.className='doc-paper';
      const src=document.createElement('p');src.className='doc-source';src.textContent=o.kind==='tape'?'录音转写 · 已按下播放键':'纸质记录 · 已抄入手记';
      const body=document.createElement('p');body.className='doc-body';body.textContent=o.text;doc.append(src,body);
      if(o.clue){const clue=document.createElement('p');clue.className='doc-clue';clue.textContent=t('手记：{clue}',{clue:t(o.clue)});doc.append(clue);}
      this.panel(o.kind==='tape'?'夜间录音 / 已转写':'现场记录 / 已抄入手记',o.title,doc,[['收好记录',()=>this.resume(),'primary']]);
      this.sound.docRead(o.kind);return;
    }
    if(o.id==='catalog'){if(this.flags.key){this.toast('消防钥匙已经在你身上。');return;}this.catalogPuzzle();return;}
    if(o.id==='fuse'){
      if(this.flags.fuse){this.toast('驾驶座是空的。保险芯在你手里。');return;}this.flags.fuse=true;this.addNote('fuse','从临 A·0619 白色轿车取到备用保险芯。');this.makeNoise(15);this.triggerScare('car',false,'挡风玻璃里的那张脸，不在后座。');this.afterScare=()=>this.subtitle('“别回头。拿着保险芯去西北角配电箱。记住交接记录上的三个开关。”',9);return;
    }
    if(o.id==='power'){if(this.flags.power){this.toast('线路稳定。排风开，监控关，卷帘门开。');return;}if(!this.flags.fuse){this.toast('保险芯烧断了。保安台的交接记录可能有线索。');return;}this.powerPuzzle();return;}
    if(o.id==='horn'){if(this.hornCooldown>0){this.toast('喇叭的接触不良，等几秒再试。');return;}this.sound.horn();this.makeNoise(70,v3(o.x*TILE,0,o.z*TILE),true);this.hornCooldown=9;this.toast('蓝车喇叭响了。巡逻者会去声音的位置查看。');return;}
    if(o.id==='crank'){if(!this.flags.power)this.toast('手轮卡死了。先恢复卷帘门电路。');else if(!this.flags.gate)this.toast('按住 E 持续转动。松手后进度会保留。',2);return;}
    if(o.id==='curtain'){if(!this.flags.curtainClosed&&Math.abs(this.player.x-33)<.48&&Math.abs(this.player.z-18)<1.8){this.toast('你站在隔帘轨道下。往走廊退一步，再把帘子拉上。');return;}this.flags.curtainClosed=!this.flags.curtainClosed;const cloth=this.objectMeshes.get('curtain').userData.cloth;cloth.scale.x=this.flags.curtainClosed?1:.08;cloth.position.x=this.flags.curtainClosed?0:1.35;this.sound.noise(.35,.18,400);this.toast(this.flags.curtainClosed?'隔帘已关闭。布料能挡住直接目视。':'隔帘已拉开。右侧病房的视线现在是通的。');return;}
    if(o.id==='hospitalPower'){
      if(!this.flags.chart){this.toast('电箱贴着纸条：先看左侧 017 号病历。');return;}if(this.flags.hospitalPower){this.toast('电力已经恢复。右侧病房里有人。');return;}
      if(!this.flags.curtainClosed){this.panel('值班员的最后一次提醒','你还没拉上隔帘','通电后，右侧病房里会出现另一个实体的你。\n直接看见他就会发生时间冲突。你可以先去走廊东侧拉上隔帘。',[['先去拉隔帘',()=>this.resume(),'primary'],['仍然接通电力',()=>{this.restoreHospitalPower();this.resume();},'danger']]);}else this.restoreHospitalPower();return;
    }
    if(o.id==='record'){
      if(!this.flags.hospitalPower){this.toast('磁带被电磁锁锁在抽屉里。恢复住院部电力后才能取出。');return;}
      if(this.flags.record){this.toast('交接磁带已经在你身上。');return;}
      this.flags.record=true;this.addNote('record','交接磁带：第一句就是图书馆电话里的那句话。录音标签上的字迹属于我。');this.triggerScare('ward',false,'床下有东西猛地抓了一下你的鞋。');this.afterScare=()=>this.subtitle('“现在你明白了。是我在救你。拿着磁带去走廊尽头，把这些话留给还在图书馆的你。”',13);return;
    }
    if(o.id==='radio'){this.finalRadio();return;}
    if(o.id==='exit'){
      if(this.index===0){if(!this.flags.key)this.toast('消防门锁着。钥匙在东侧借阅档案卡片柜。');else this.finishChapter();}
      else if(this.index===1){if(!this.flags.gate)this.toast('卷帘门还没打开。接通电路，再持续转动旁边的手轮。');else this.finishChapter();}
      else if(!this.flags.broadcast)this.toast('内线指示灯还亮着。先处理走廊尽头的交接磁带。');else this.ending('dawn');
    }
  }
  catalogPuzzle(){
    const div=document.createElement('div');div.innerHTML='<p>铜制号码轮下面有一行刻字：<br>“按找书的顺序，归还你自己。”</p><input class="code-input" aria-label="三位柜号" inputmode="numeric" maxlength="3" placeholder="— — —" autocomplete="off"><div class="error-text" role="status"></div><p class="small muted">线索在西侧阅览室的借阅条上。按 T 可在关闭柜子后查看手记。</p>';
    const submit=()=>{const value=div.querySelector('input').value.trim();if(value!=='271'){div.querySelector('.error-text').textContent=t('号码轮没有松动。按借阅条的顺序再试一次。');this.sound.tone(120,.16,.12,'square');return;}
      this.flags.key=true;this.addNote('key','拿到了消防钥匙。取走钥匙之后，巡夜人开始在图书馆里寻找声音。');this.enemy.active=true;this.enemy.grace=5;this.enemy.state='patrol';$('panel').classList.add('hidden');this.triggerScare('drawer',false,'柜缝里伸出了一张没有借阅证的脸。');this.afterScare=()=>this.subtitle('“拿到了？听着，巡夜人醒了。绕开书架，去南侧消防门。躲柜子之前，别让它看见。”',12);
    };
    this.panel('借阅档案 / 黄铜号码轮','三位柜号',div,[['拉开抽屉',submit,'primary'],['暂时离开',()=>this.resume()]]);div.querySelector('input').addEventListener('keydown',e=>{if(e.key==='Enter')submit();});setTimeout(()=>div.querySelector('input').focus(),0);
  }
  powerPuzzle(){const switches=[false,true,false],labels=['排风系统','监控系统','卷帘门'];const div=document.createElement('div');const intro=document.createElement('p');intro.textContent='保险芯已插入。把三个开关拨到交接记录要求的位置，再合闸。';div.append(intro);labels.forEach((label,i)=>{const row=document.createElement('div');row.className='switch-row';const text=document.createElement('span');text.textContent=label;const button=document.createElement('button');const update=()=>{button.textContent=t(switches[i]?'开启 / ON':'关闭 / OFF');button.classList.toggle('on',switches[i]);button.setAttribute('aria-pressed',String(switches[i]));};update();button.onclick=()=>{switches[i]=!switches[i];this.sound.tone(600,.05,.06);update();};row.append(text,button);div.append(row);});const error=document.createElement('div');error.className='error-text';div.append(error);
    this.panel('西北配电箱 / 保险芯就位','重新分配电力',div,[['合上总闸',()=>{if(switches[0]&&!switches[1]&&switches[2]){this.flags.power=true;this.addNote('power','停车场电路已恢复。卷帘门需要手动摇开。');this.resume();this.sound.tone(90,.6,.18);this.subtitle('“喇叭只能把它引去声音的位置。等它走远，再去摇门。别一口气硬撑。”',9);}else{error.textContent=t('线路过载，保护器跳闸。检查保安台交接记录中的三个要求。');this.sound.noise(.2,.2,1500);}},'primary'],['离开电箱',()=>this.resume()]]);
  }
  restoreHospitalPower(){this.flags.hospitalPower=true;this.addNote('hospitalPower','住院部恢复供电。右侧隔帘后，出现了另一个穿着同样工装的人。');this.sound.tone(80,.7,.2);this.toast('走廊的灯重新亮了。病房里传来和你一样的咳嗽。',6);this.schedule(2,()=>{this.duplicateActive=true;this.duplicate.visible=true;this.subtitle('“是我。别看过来。只要布帘还在，我们就都能继续说话。”',11);this.sound.noise(.4,.12,300);});}
  finalRadio(){
    if(!this.flags.record){this.toast('双卡录音机缺一盒磁带。护士站东侧的抽屉里有交接记录。');return;}
    this.panel('内线 2317 / 过去正在响铃','原来一直是你的声音',this.flags.broadcast?'录音带已经开始循环。\n\n你可以沿着出院通道离开，把这个夜晚留在身后；也可以留在值班台，亲自接起下一通求救电话。':'你按下播放键。\n“别问我怎么知道你的名字，周临……”\n\n第一章的那通电话，原来从这里拨出。隔帘后的你把最后一段路留给了你。\n\n把引路信息录给过去的自己，出院门就会解锁。你也可以留下，成为下一次夜班的值班员。',[
      [this.flags.broadcast?'走向出院通道':'录下引路信息',()=>{this.flags.broadcast=true;this.addNote('broadcast','我把正确路线录给了过去的自己。出院门已经解锁。隔帘后的那个人守住了我们没有相见的约定。');this.resume();this.subtitle('“门开了。别回头道谢。我知道你会这么做。走吧，周临。”',12);this.toast('出院通道已解锁。沿走廊向北。',5);},'primary'],
      ['留下来接班',()=>{this.flags.broadcast=true;this.ending('operator');}],
      ['先离开值班台',()=>this.resume()],
    ]);
  }
  /* 可开关的门：门扇绕门轴旋转，开合都会带动门轴声并把噪声传出去。 */
  toggleDoor(o){
    const g=this.objectMeshes.get(o.id),leaf=g?.userData?.leaf;if(!leaf)return;
    const open=!this.flags[o.id];this.flags[o.id]=open;
    this.doorAnim.push({leaf,to:open?g.userData.openAngle:0});
    this.sound.door(open);
    this.makeNoise(16,v3(o.x*TILE+(o.offsetX||0),0,o.z*TILE+(o.offsetZ||0)));
    this.toast(open?'门推开了。门轴的声音已经传出去。':'门关上了。关着的门能挡住视线。',3.4);
  }
  updateDoors(dt){if(!this.doorAnim.length)return;for(const d of this.doorAnim)d.leaf.rotation.y+=(d.to-d.leaf.rotation.y)*Math.min(1,dt*8);this.doorAnim=this.doorAnim.filter(d=>Math.abs(d.to-d.leaf.rotation.y)>.008);}
  /* 敌人接近时的心跳：越近越快、越响；被追击/被发现时直接给到高强度。 */
  updateHeartbeat(dt){const e=this.enemy,active=!!(e&&e.active),dist=active?e.mesh.position.distanceTo(this.player):99,tense=!!(active&&(e.state==='chase'||e.state==='searchHide'));this.sound.heartbeat(dt,dist,tense);const lvl=this.sound.heartLevel||0,hunted=!!(e&&e.active)&&(lvl>.28||tense);document.body.classList.toggle('hunted',hunted);document.body.classList.toggle('hunted-fast',hunted&&(lvl>.7||e.state==='chase'||e.state==='searchHide'));}
  /* 可投掷的空罐：按 Q 丢出去，落地声把巡查者引到落点。 */
  throwCan(){
    if(this.phase!=='play'||this.inputGrace>0)return;
    if(this.hiding){this.toast('夹缝里伸不开手。先出来，再扔东西。');return;}
    if(!this.cans){this.toast('手里没有能扔的东西。走廊里散着几个空罐子。',3.2);return;}
    this.cans--;const dir=this.camera.getWorldDirection(new THREE.Vector3());
    const lump=this.acquireCan();lump.position.copy(this.camera.position).addScaledVector(dir,.55);lump.position.y=Math.max(.3,lump.position.y-.12);
    this.thrown.push({g:lump,v:dir.clone().multiplyScalar(12).add(v3(0,2.1,0)),rest:false});
    this.sound.throwOut();
    this.events.push({type:'throw',at:this.elapsed,cans:this.cans});
    this.toast('空罐扔出去了。它砸在地上的声音会把巡夜者引过去。',3.6);
  }
  updateThrown(dt){
    for(const p of this.thrown){if(p.rest)continue;const v=p.v;v.y-=17*dt;const next=p.g.position.clone().addScaledVector(v,dt);
      if(next.y<=.1){next.y=.1;p.g.position.copy(next);p.rest=true;const at=p.g.position.clone();this.makeNoise(30,at,true);this.sound.canClatter();this.events.push({type:'canLand',at:this.elapsed});}
      else{p.g.position.copy(next);p.g.rotation.x+=dt*7;p.g.rotation.z+=dt*5;}
    }
  }
  updateCrank(dt){const near=this.nearestObject();this.cranking=!!(this.keys.has('KeyE')&&near?.id==='crank'&&this.flags.power&&!this.flags.gate&&!this.hiding);if(this.cranking){this.crankProgress=Math.min(5,this.crankProgress+dt);this.objectMeshes.get('crank').userData.wheel.rotation.z-=dt*3;this.crankNoise=(this.crankNoise||0)-dt;if(this.crankNoise<=0){this.crankNoise=.65;this.makeNoise(22);this.sound.noise(.17,.15,240);}const shutter=this.objectMeshes.get('exit').userData.shutter;shutter.position.y=this.crankProgress/5*3.1;if(this.crankProgress>=5){this.flags.gate=true;this.addNote('gate','急救通道卷帘门已打开。');this.toast('门开了！从急救通道进入电梯。',5);this.sound.tone(440,.3,.12);}}}
  enterHide(o){
    const e=this.enemy,eye=this.player.clone().setY(1.5);const witnessed=e?.active&&e.grace<=0&&e.mesh.position.distanceTo(this.player)<14&&this.lineOfSight(e.mesh.position.clone().setY(1.65),eye)&&(['chase'].includes(e.state)||e.seen);
    this.hideReturn=this.player.clone();this.hideYaw=Math.PI;this.yaw=Math.PI;this.pitch=0;this.hiding=o;this.player.set(o.x*TILE,0,o.z*TILE+.08);this.hideFlash=this.flashOn;this.flashOn=false;this.clearInput();this.sound.noise(.25,.14,600);$('hideOverlay').classList.remove('hidden');
    if(witnessed){e.state='searchHide';e.witness=0;e.hideGoal=worldCell(this.hideReturn.x,this.hideReturn.z);e.target=e.hideGoal;$('hideState').textContent=t('它看见你进来了。脚步正在靠近，快找机会离开。');}else{$('hideState').textContent=t('它没有看见你进来。保持安静，等脚步远去。');}
    this.events.push({type:'hide',id:o.id,witnessed:!!witnessed,at:this.elapsed});
  }
  leaveHide(){const o=this.hiding;if(!o)return;let exit=this.hideReturn.clone();if(!this.canWalk(exit.x,exit.z)){const candidates=[[0,1.1],[1.1,0],[-1.1,0],[0,-1.1]];const safe=candidates.find(([x,z])=>this.canWalk(o.x*TILE+x,o.z*TILE+z));if(!safe){this.toast('柜门外被挡住了，稍等一下。');return;}exit.set(o.x*TILE+safe[0],0,o.z*TILE+safe[1]);}this.player.copy(exit);this.hiding=null;this.flashOn=this.hideFlash;this.clearInput();$('hideOverlay').classList.add('hidden');this.makeNoise(3);if(this.enemy?.state==='searchHide'){this.enemy.state='investigate';this.enemy.target=worldCell(o.x*TILE,o.z*TILE+TILE);this.enemy.search=5;}this.inputGrace=.25;}
  makeNoise(radius,position=this.player,force=false){const e=this.enemy;if(!e?.active||e.grace>0)return;const distance=e.mesh.position.distanceTo(position);if(distance>radius)return;if(e.state==='searchHide')return;if(e.state==='chase'&&e.seen&&!force)return;if(e.state==='chase'&&e.seen&&force){this.toast('它还看得见你。先绕过障碍，再用声音引开它。');return;}e.state='investigate';e.searchQueue.length=0;e.target=worldCell(position.x,position.z);const route=pathfind(this.level,worldCell(e.mesh.position.x,e.mesh.position.z),this.nearestFree(e.target),this.aiBlocked);e.search=force?Math.max(16,(route.length-1)*TILE/1.95+7):8;e.lastNoise=this.elapsed;/* Finish the current segment before choosing a new grid path. */}
  nearestFree(cell){if(isFloor(this.level,...cell)&&!this.aiBlocked.has(cell.join(',')))return cell;for(let r=1;r<=3;r++)for(const [dx,dz] of [[0,r],[r,0],[-r,0],[0,-r]]){const p=[cell[0]+dx,cell[1]+dz];if(isFloor(this.level,...p)&&!this.aiBlocked.has(p.join(',')))return p;}return cell;}
  /* 追丢后的搜索行为：以最后看到/听到的位置为中心，取附近按距离排序的 2~4 个可达点，逐个走过去查看。 */
  beginSearch(e,quiet=false){
    e.state='search';e.search=12;e.target=null;e.next=null;e.lost=0;
    const base=e.lastSeen||worldCell(e.mesh.position.x,e.mesh.position.z),start=worldCell(e.mesh.position.x,e.mesh.position.z),ring=[[0,0],[1,0],[0,1],[-1,0],[0,-1],[2,0],[0,2],[-2,0],[0,-2],[1,1],[-1,1],[1,-1],[-1,-1]],points=[];
    for(const [dx,dz] of ring){const c=[base[0]+dx,base[1]+dz];if(!isFloor(this.level,...c)||this.aiBlocked.has(c.join(',')))continue;points.push({c,d:Math.abs(c[0]-start[0])+Math.abs(c[1]-start[1])});}
    points.sort((a,b)=>a.d-b.d);e.searchQueue=points.slice(0,4).map(p=>p.c);
    this.events.push({type:'search',at:this.elapsed,points:e.searchQueue.length});
    if(quiet||!e.searchQueue.length)return;
    this.sound.noise(.5,.1,520);this.sound.tone(74,.55,.15,'sawtooth');
    this.toast('它跟丢了你，正在附近来回搜索。先在掩体后面等它走远。',3.6);
  }
updateEnemy(dt){const e=this.enemy;if(!e)return;if(e.rig)e.rig.visible=!!e.active;if(!e.active)return;e.grace=Math.max(0,e.grace-dt);const pos=e.mesh.position,dist=pos.distanceTo(this.player),eye=pos.clone().setY(1.7),playerEye=this.player.clone().setY(this.crouch?1:1.6);
    /* 视线锥体检测：以敌人正面为轴，半角取自关卡（默认 65°）。警觉时视角放宽 12%，贴身 2.4 米内不受角度限制。 */
    const facing=v3(Math.sin(e.mesh.rotation.y),0,Math.cos(e.mesh.rotation.y));const direction=this.player.clone().sub(pos).setY(0).normalize();const alert=e.seen||(e.state!=='patrol'&&e.state!=='wait');const half=(this.level.visionHalfDeg||65)*Math.PI/180*(alert?1.12:1);e.dot=facing.dot(direction);e.halfDeg=half*180/Math.PI;e.alert=!!alert;const inCone=e.dot>Math.cos(half)||dist<2.4;
    e.seen=e.grace<=0&&!this.hiding&&dist<(this.flashOn?13:9)&&inCone&&this.lineOfSight(eye,playerEye);
    if(e.beam){e.beam.intensity=alert?34:20;e.glow.intensity=alert?2.4:1.4;e.cone.material.opacity=(alert?.17:.11)*(1+.24*Math.sin(this.elapsed*6.4));}
    if(e.seen){if(e.state!=='chase'){this.sound.tone(58,.7,.22,'sawtooth');this.toast('它看见你了。转过拐角，再找地方躲。',2.8);}e.state='chase';e.lost=0;e.target=worldCell(this.player.x,this.player.z);}
    else if(e.state==='chase'){e.lost+=dt;if(e.lost>2.6)this.beginSearch(e);}
    if(e.state==='searchHide'){
      if(!this.hiding){e.state='investigate';e.search=5;}
      else if(dist<3.1){e.witness+=dt;if(e.witness>1&&e.witness<1.1)this.sound.noise(.5,.18,450);$('hideState').textContent=t('柜门被拉住了。它知道你在这里，立刻离开！');if(e.witness>3.4){this.triggerScare('caught',true,'它看见了你躲进柜子的全过程。先甩开视线，再藏身。');return;}}
    }
    if(e.grace<=0&&!this.hiding&&dist<1.1&&this.lineOfSight(eye,playerEye)){this.triggerScare('caught',true,this.index===0?'巡夜人追上了你。转角和书架能切断视线；不要在它眼前躲进柜子。':'引车员堵住了去路。绕到车舱另一侧切断视线；按喇叭后，走外侧通道避开它前往蓝车的路线。');return;}
    if(e.state==='investigate'){e.search-=dt;if(e.search<=0){e.lastSeen=e.target||worldCell(pos.x,pos.z);this.beginSearch(e,true);}}
    if(e.state==='search'){e.search-=dt;if(e.search<=0){e.state='patrol';e.searchQueue.length=0;e.target=null;e.next=null;}}
    /* 巡逻路径系统：走完一段后在路点原地停留扫视，再前往下一个路点。 */
    if(e.state==='wait'){e.wait-=dt;e.mesh.rotation.y=e.baseYaw+Math.sin((e.waitTotal-e.wait)*1.9)*.8;if(e.wait<=0){e.state='patrol';e.patrol++;e.mesh.rotation.y=e.baseYaw;}}
    if(!e.next&&e.state!=='wait'){let destination=e.state==='patrol'?this.level.patrol[e.patrol%this.level.patrol.length]:e.state==='search'?(e.searchQueue.length?e.searchQueue.shift():null):e.target;if(!destination&&e.state!=='search')destination=this.level.patrol[e.patrol%this.level.patrol.length];if(!destination){e.state='patrol';e.target=null;}else{destination=this.nearestFree(destination);const start=worldCell(pos.x,pos.z),path=pathfind(this.level,start,destination,this.aiBlocked);if(path.length>1)e.next=v3(path[1][0]*TILE,0,path[1][1]*TILE);else if(e.state==='patrol')e.patrol++;}}
    const speed=e.state==='chase'?2.95:e.state==='searchHide'?2.35:e.state==='search'?2.2:e.state==='investigate'?1.95:1.35;
    if(e.next){const delta=e.next.clone().sub(pos),length=delta.length();if(length<.025){pos.copy(e.next);e.next=null;if(e.state==='patrol'){e.state='wait';e.wait=this.level.patrolWait||1.6;e.waitTotal=e.wait;e.baseYaw=e.mesh.rotation.y;}}else{const step=Math.min(length,speed*dt);pos.addScaledVector(delta,step/length);e.mesh.rotation.y=Math.atan2(delta.x,delta.z);e.step+=dt;e.mesh.userData.legs.forEach((leg,i)=>leg.rotation.x=Math.sin(this.elapsed*speed*4+i*Math.PI)*.36);e.mesh.userData.arms.forEach((arm,i)=>arm.rotation.x=Math.sin(this.elapsed*speed*4+i*Math.PI)*.16);if(e.step>(e.state==='chase'?.4:.58)){e.step=0;if(dist<18){let a=Math.atan2(-(pos.x-this.player.x),-(pos.z-this.player.z))-this.yaw;this.sound.enemyStep(e.state==='chase'||e.state==='searchHide',-Math.sin(a),clamp((18-dist)/18,0,.9));}}}}
    e.mesh.userData.head.rotation.z=Math.sin(this.elapsed*1.6)*.08;
  }
  duplicateInView(){if(!this.duplicateActive||!this.duplicate?.visible||this.hiding)return false;this.camera.updateMatrixWorld(true);const face=this.duplicate.position.clone().add(v3(0,1.82,0)),distance=face.distanceTo(this.camera.position);if(distance>27)return false;const dir=face.clone().sub(this.camera.position).normalize(),forward=this.camera.getWorldDirection(new THREE.Vector3());if(dir.dot(forward)<=0)return false;const screen=face.clone().project(this.camera);return Math.abs(screen.x)<.88&&Math.abs(screen.y)<.9&&screen.z<1&&screen.z>-1&&this.lineOfSight(this.camera.position,face);}
  updateDuplicate(dt){if(!this.duplicateActive)return;this.duplicate.userData.head.rotation.z=Math.sin(this.elapsed)*.025;if(this.duplicateInView())this.triggerScare('duplicate',true,'你看见了另一个实体的自己。同一时间线的两个人发生目视，后到者被抹除了。先关闭右侧隔帘，再通电。');}
  triggerScare(type,fatal,reason){if(this.phase==='scare'||this.phase==='death'||this.phase==='ending')return;this.phase='scare';this.clearInput();document.body.classList.add('scaring');this.flashlight.visible=false;this.arms.visible=false;$('panel').classList.add('hidden');$('interact').classList.add('hidden');$('hold').classList.add('hidden');this.scare={type,fatal,reason,time:0,duration:fatal?1.35:.78};this.events.push({type:'scare',kind:type,fatal,at:this.elapsed});this.sound.scare();
    const model=character({monster:type!=='duplicate',variant:this.level.id});this.scareHead=model.userData.head;this.scareHead.removeFromParent();disposeModel(model);this.scareHead.position.set(0,-.05,-.84);this.scareHead.rotation.set(0,0,0);this.scareHead.scale.setScalar(1.8);this.camera.add(this.scareHead);this.scareLight=new THREE.PointLight(type==='duplicate'?0xd4dfb7:0xdd9d76,3.2,3,1);this.scareLight.position.set(.1,.15,-.3);this.camera.add(this.scareLight);$('scareFlash').style.opacity='1';
  }
  clearScare(){if(this.scareHead){this.camera.remove(this.scareHead);this.scareHead=null;}if(this.scareLight){this.camera.remove(this.scareLight);this.scareLight=null;}$('scareFlash').style.opacity='0';document.body.classList.remove('scaring');this.scare=null;this.afterScare=null;}
  updateScare(dt){const s=this.scare;if(!s)return;s.time+=dt;if(this.settings.shake){this.camera.rotation.z=Math.sin(s.time*73)*.04;this.scareHead.rotation.z=Math.sin(s.time*39)*.09;this.scareHead.position.x=Math.sin(s.time*91)*.018;}$('scareFlash').style.opacity=String(this.settings.shake?.55+Math.sin(s.time*25)*.18:.6);if(s.time>s.duration){const {fatal,reason}=s,after=this.afterScare;this.clearScare();this.camera.rotation.z=0;if(fatal)this.death(reason);else {this.resume(false);this.toast(reason,4);after?.();}}}
  death(reason){this.phase='death';this.releaseMouse();$('hideOverlay').classList.add('hidden');$('danger').classList.add('hidden');this.panel('夜间记录中断 / 本章起点已保存','交接失败',t(reason)+t('\n\n重试会回到本章起点。已解锁章节仍会保留。'),[['从本章重新开始',()=>this.startLevel(this.index,false),'primary'],['返回标题',()=>this.showMenu()]],'death');}
  finishChapter(){const next=this.index+1;this.saved.checkpoint=next;this.saved.unlocked=Math.max(this.saved.unlocked,next+1);this.save();const text=this.index===0?'你推开消防门，钥匙在锁孔里自己转了一圈。\n楼梯下面，电话又响了。\n\n第二章起点已保存。':'急救电梯的门缓缓合上。\n电话里的人说：“你快要见到我了。答应我，别看。”\n\n第三章起点已保存。';this.panel('本章完成 / 自动保存',this.index===0?'书已归还':'末班车已离站',text,[['进入下一章',()=>this.startLevel(next),'primary']],'transition');this.events.push({type:'chapterComplete',chapter:this.index,at:this.elapsed});}
  ending(kind){this.phase='ending';this.saved.unlocked=3;if(!this.saved.endings.includes(kind))this.saved.endings.push(kind);this.save();const div=document.createElement('div');const mark=document.createElement('div');mark.className='ending-mark';mark.textContent=kind==='dawn'?'ENDING 01 / DAWN · 05:43':'ENDING 02 / THE OPERATOR · 02:17';const prose=document.createElement('p');prose.className='ending-description';prose.textContent=kind==='dawn'?'你从住院部的侧门走进清晨。\n早点摊的蒸汽是真的，手上的伤也是真的。\n隔帘后的人没有跟出来。\n\n这一次，你活着离开了。\n口袋里的磁带，只剩下一句：\n“有人能出去，就不算白值这个夜班。”':'你坐进值班椅，把工牌翻到背面。\n内线 2317 响了。电话那头，是你在图书馆里的呼吸声。\n\n“别问我怎么知道你的名字，周临。”\n你把正确的路重新说了一遍。\n这一次，你决定让另一个自己走到天亮。';div.append(mark,prose);this.panel('夜班协议 / 1996',kind==='dawn'?'天亮之前':'值班员',div,[['重玩第三章',()=>this.startLevel(2),'primary'],['返回章节档案',()=>{this.showMenu();this.chapters();}]],'ending');this.events.push({type:'ending',kind,at:this.elapsed});}
  update(dt){
    if(this.phase==='play'){
      this.elapsed+=dt;this.inputGrace=Math.max(0,this.inputGrace-dt);this.hornCooldown=Math.max(0,this.hornCooldown-dt);
      const due=this.scheduled.filter(e=>e.at<=this.elapsed);this.scheduled=this.scheduled.filter(e=>e.at>this.elapsed);for(const e of due)e.fn();
      this.updatePlayer(dt);this.updateCamera(dt);this.updateDoors(dt);this.updateThrown(dt);this.updateLod();this.updateEnemy(dt);this.updateHeartbeat(dt);if(this.phase==='play')this.updateDuplicate(dt);if(this.phase==='play'){this.updateCrank(dt);this.updateHUD();if(this.elapsed-this.lastHintUpdate>.3||!this.lastHintUpdate){this.lastHintUpdate=this.elapsed;this.updateHint();}if(this.elapsed-this.lastLightUpdate>.25||!this.lastLightUpdate){this.lastLightUpdate=this.elapsed;this.updateLights();}}
    }else if(this.phase==='scare'){this.updateCamera(dt);this.updateScare(dt);}
  }
  animate(now){const dt=Math.min(.05,(now-(this.frameTime||now))/1000);this.frameTime=now;if(this.contextLost){requestAnimationFrame(this.animate);return;}this.update(dt);if(this.phase==='gallery'&&this.portraitRenderer){this.portraitModel.rotation.y+=dt*.35;this.portraitRenderer.render(this.portraitScene,this.portraitCamera);}this.renderer.render(this.scene,this.camera);requestAnimationFrame(this.animate);}
}

/* ==== 触摸操作层 / 自适应画质 / 动态按钮类型：不改动原键盘与鼠标玩法 ==== */
NightShift.prototype.setupTouch=function(){
  const touch=$('touch');if(!touch)return;
  const coarse=matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>1;
  if(!(coarse&&Math.min(innerWidth,innerHeight)<=820))return;
  this.touchResets=[];
  this.touchMode=true;document.body.classList.add('touch-ui');touch.classList.add('active');
  const stick=$('stick'),knob=stick?stick.firstElementChild:null,look=$('lookPad'),held=['KeyW','KeyS','KeyA','KeyD','ShiftLeft'];
  if(stick){
    let id=null,cx=0,cy=0;
    const apply=(dx,dy)=>{const r=Math.max(28,stick.clientWidth*.34),len=Math.hypot(dx,dy)||1,k=Math.min(1,len/r),ux=dx/len*k,uy=dy/len*k;if(knob)knob.style.transform='translate('+(ux*r).toFixed(1)+'px,'+(uy*r).toFixed(1)+'px)';const set=(c,on)=>{on?this.keys.add(c):this.keys.delete(c);};set('KeyW',uy<-.28);set('KeyS',uy>.28);set('KeyA',ux<-.28);set('KeyD',ux>.28);this.touchRun=k>.85;set('ShiftLeft',this.touchRun);};
    const stop=()=>{id=null;if(knob)knob.style.transform='';held.forEach(c=>this.keys.delete(c));};
    this.touchResets.push(stop);
    stick.addEventListener('pointerdown',e=>{if(id!==null)return;id=e.pointerId;const b=stick.getBoundingClientRect();cx=b.left+b.width/2;cy=b.top+b.height/2;if(stick.setPointerCapture)stick.setPointerCapture(id);e.preventDefault();apply(e.clientX-cx,e.clientY-cy);});
    stick.addEventListener('pointermove',e=>{if(e.pointerId!==id)return;apply(e.clientX-cx,e.clientY-cy);e.preventDefault();});
    stick.addEventListener('pointerup',e=>{if(e.pointerId===id)stop();});
    stick.addEventListener('pointercancel',e=>{if(e.pointerId===id)stop();});
  }
  if(look){
    let id=null,lx=0,ly=0;
    this.touchResets.push(()=>{id=null;});
    look.addEventListener('pointerdown',e=>{if(id!==null)return;id=e.pointerId;lx=e.clientX;ly=e.clientY;if(look.setPointerCapture)look.setPointerCapture(id);});
    look.addEventListener('pointermove',e=>{if(e.pointerId!==id)return;const k=.0032;this.yaw-=(e.clientX-lx)*k;this.pitch=clamp(this.pitch-(e.clientY-ly)*k,-1.35,1.35);lx=e.clientX;ly=e.clientY;});
    look.addEventListener('pointerup',e=>{if(e.pointerId===id)id=null;});
    look.addEventListener('pointercancel',e=>{if(e.pointerId===id)id=null;});
  }
  const zone=$('gestureZone');
  if(zone){
    let sy=0,sx=0,st=0,tapAt=0;
    this.touchResets.push(()=>{st=0;tapAt=0;});
    zone.addEventListener('pointerdown',e=>{e.preventDefault();sy=e.clientY;sx=e.clientX;st=performance.now();try{if(zone.setPointerCapture)zone.setPointerCapture(e.pointerId);}catch(_){}});
    zone.addEventListener('pointermove',e=>{e.preventDefault();});
    zone.addEventListener('pointerup',e=>{
      if(this.phase!=='play')return;
      const dy=e.clientY-sy,dx=e.clientX-sx,dt=performance.now()-st;
      if(dt<700&&Math.abs(dx)<52&&dy>46){this.journal();return;}
      if(dt<700&&Math.abs(dx)<52&&dy<-46){this.hintUntil=this.elapsed+14;this.updateHint();return;}
      if(dt<280&&Math.abs(dx)<14&&Math.abs(dy)<14){const now=performance.now();if(now-tapAt<340){tapAt=0;this.pause();}else tapAt=now;}
    });
  }
  const fire=(type,code)=>dispatchEvent(new KeyboardEvent(type,{code}));
  const momentary=(el,code)=>{if(!el)return;const down=e=>{e.preventDefault();fire('keydown',code);el.setAttribute('aria-pressed','true');};const up=e=>{if(e)e.preventDefault();fire('keyup',code);el.setAttribute('aria-pressed','false');};el.addEventListener('pointerdown',down);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);el.addEventListener('pointerleave',up);};
  momentary($('tUse'),'KeyE');momentary($('tRun'),'ShiftLeft');momentary($('tNote'),'KeyT');momentary($('tHint'),'KeyH');momentary($('tThrow'),'KeyQ');
  const toggle=(el,code,read)=>{if(!el)return;el.addEventListener('pointerdown',e=>{e.preventDefault();fire('keydown',code);setTimeout(()=>el.setAttribute('aria-pressed',String(!!read())),0);});el.setAttribute('aria-pressed',String(!!read()));};
  toggle($('tCrouch'),'KeyC',()=>this.crouch);toggle($('tFlash'),'KeyF',()=>this.flashOn);
  const pause=$('tPause');if(pause)pause.addEventListener('click',e=>{e.preventDefault();if(this.phase==='play')this.pause();else if(this.phase==='paused')this.resume();});
  // Rotation is a pause boundary: discard held touches and never auto-resume.
  const portrait=matchMedia('(orientation:portrait)');
  const notice=$('rotateNotice');
  const surfaces=['menu','hud','panel','gallery','achievements','touch','game'];
  let previousFocus=null;
  const orient=()=>{
    const blocked=portrait.matches;
    if(blocked===this.portraitBlocked)return;
    this.portraitBlocked=blocked;
    this.clearInput();this.touchRun=false;
    this.touchResets.forEach(reset=>reset());
    for(const id of ['tUse','tRun','tNote','tHint','tThrow'])$(id).setAttribute('aria-pressed','false');
    if(blocked){
      previousFocus=document.activeElement;
      if(this.phase==='play')this.pause();
    }
    for(const id of surfaces)$(id).inert=blocked;
    notice.classList.toggle('hidden',!blocked);
    document.body.classList.toggle('portrait-blocked',blocked);
    if(blocked)notice.focus({preventScroll:true});
    else {
      const target=this.phase==='paused'?$('panelActions').querySelector('button'):previousFocus;
      if(target&&target.isConnected)target.focus({preventScroll:true});
    }
    this.resize();
  };
  if(portrait.addEventListener)portrait.addEventListener('change',orient);
  else portrait.addListener(orient);
  addEventListener('resize',orient);
  orient();
};
const _baseCaptureMouse=NightShift.prototype.captureMouse;
NightShift.prototype.captureMouse=function(){if(this.touchMode)return;return _baseCaptureMouse.call(this);};
const _baseUpdate=NightShift.prototype.update;
NightShift.prototype.update=function(dt){if(this.portraitBlocked)return;this.perf=(this.perf||0)*.9+dt*.1;if(!this.autoLow&&this.settings.quality==='high'&&this.phase==='play'&&this.perf>0.042){this.autoLow=true;this.settings.quality='low';this.resize();this.toast('画面已自动切换为流畅模式。',4);}return _baseUpdate.call(this,dt);};
for(const _m of ['panel','chapters','powerPuzzle']){const _f=NightShift.prototype[_m];NightShift.prototype[_m]=function(){const _r=_f.apply(this,arguments);document.querySelectorAll('.panel-card button:not([type])').forEach(_b=>{_b.type='button';});return _r;};}

/* ==== T6 存档 / 检查点 / 章节选择：localStorage 增量保存；不改动原玩法与剧情文本 ==== */
const CKPT=[
  {list:[{tag:'slip',label:'找到借阅条'},{tag:'key',label:'取走消防钥匙'}]},
  {list:[{tag:'fuse',label:'取到备用保险芯'},{tag:'power',label:'停车场电路已恢复'},{tag:'gate',label:'卷帘门已摇开'}]},
  {list:[{tag:'chart',label:'看过 017 号病历'},{tag:'curtainClosed',label:'右侧隔帘已拉上'},{tag:'hospitalPower',label:'住院部已恢复供电'},{tag:'record',label:'取走交接磁带'}]},
];
const CKPT_FLAGS=['slip','key','fuse','power','gate','chart','curtainClosed','hospitalPower','record','broadcast'];
function ckptFlagsOf(flags){const out={};for(const k of CKPT_FLAGS)if(flags&&flags[k])out[k]=true;return out;}
function ckptLabelOf(index,sub){const c=CKPT[index];const item=c&&c.list[(sub|0)-1];return item?item.label:'';}
function highlightInto(node,text,q){node.textContent='';const lower=text.toLowerCase();let i=0;while(i<=text.length){const k=lower.indexOf(q,i);if(k<0){node.append(document.createTextNode(text.slice(i)));break;}if(k>i)node.append(document.createTextNode(text.slice(i,k)));const m=document.createElement('span');m.className='hit';m.textContent=text.slice(k,k+q.length);node.append(m);i=k+q.length;}}
function ckptNotesOf(notes,index){return notes.filter(n=>n&&n.level===index).map(n=>({id:n.id,level:n.level,text:n.text}));}
const _loadSave=loadSave;
loadSave=function(){
  const s=_loadSave();let r={};
  try{const raw=JSON.parse(getItem(SAVE_KEY)||'null');if(raw&&typeof raw==='object')r=raw;}catch{}
  s.ckptChapter=Number.isFinite(r.ckptChapter)?clamp(r.ckptChapter|0,0,LEVELS.length-1):s.checkpoint;
  s.sub=Number.isFinite(r.sub)?clamp(r.sub|0,0,9):0;
  s.flags=ckptFlagsOf(r.flags);
  s.at=(Array.isArray(r.at)&&r.at.length===2&&r.at.every(Number.isFinite))?[+r.at[0],+r.at[1]]:null;
  s.ckptNotes=(Array.isArray(r.ckptNotes)?r.ckptNotes:[]).filter(n=>n&&typeof n.id==='string'&&Number.isFinite(n.level)&&typeof n.text==='string');
  return s;
};
/* WebGL 上下文丢失/恢复：显卡驱动重置、切换独显或标签页长时间后台时，浏览器会回收上下文。
   丢失时阻止默认行为并暂停游戏，恢复时重建材质与阴影，避免黑屏或画面停住却没有解释。 */
NightShift.prototype.watchContext=function(){
  const canvas=this.renderer.domElement;
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.contextLost=true;this.clearInput();if(this.phase==='play')this.pause();this.toast('显卡上下文已丢失，正在等待浏览器恢复……',8);},false);
  canvas.addEventListener('webglcontextrestored',()=>{this.contextLost=false;try{this.refreshMaterials();this.applyShadows();}catch(e){}this.toast('渲染已恢复，可以继续夜班。',6);},false);
};
/* 存储不可用时只提示一次，避免隐私模式下每次自动保存都刷屏。 */
NightShift.prototype.warnStorage=function(){if(this._warnedStorage)return;this._warnedStorage=true;this.toast('浏览器不允许持久保存，本次夜班的进度只保留在内存中，刷新后会丢失。',8);};
NightShift.prototype.ckptHasSave=function(index){return this.saved.ckptChapter===index&&(this.saved.sub|0)>0;};
NightShift.prototype.clearCheckpoint=function(index=this.index){this.saved.ckptChapter=index;this.saved.sub=0;this.saved.flags={};this.saved.at=null;this.saved.ckptNotes=[];};
const _save=NightShift.prototype.save;
NightShift.prototype.save=function(){
  this.saved.notes=this.notes.filter(n=>n.level<this.saved.checkpoint);
  if(!setItem(SAVE_KEY,JSON.stringify({...this.saved,version:2})))this.warnStorage();
};
NightShift.prototype.tickCheckpoint=function(){
  const c=CKPT[this.index];if(!c||!c.list.length)return;
  let idx=0;for(let i=0;i<c.list.length;i++)if(this.flags[c.list[i].tag])idx=i+1;
  if(idx<=0)return;
  if(this.saved.ckptChapter===this.index&&idx<=(this.saved.sub|0))return;
  this.saved.ckptChapter=this.index;this.saved.sub=idx;
  this.saved.flags=ckptFlagsOf(this.flags);
  this.saved.at=[Math.round(this.player.x*100)/100,Math.round(this.player.z*100)/100];
  this.saved.ckptNotes=ckptNotesOf(this.notes,this.index);
  this.save();
  this.toast(t('检查点已保存：{label}',{label:t(ckptLabelOf(this.index,idx)||'本章进度')}),3.4,'ckpt');
};
NightShift.prototype.applyCheckpoint=function(){
  const s=this.saved,f=s.flags||{};
  for(const k of CKPT_FLAGS)if(f[k])this.flags[k]=true;
  if(this.index===0&&this.flags.key&&this.enemy){this.enemy.active=true;this.enemy.grace=Math.max(this.enemy.grace,4);this.enemy.state='patrol';}
  if(this.index===1&&this.flags.gate){const g=this.objectMeshes.get('exit'),sh=g&&g.userData&&g.userData.shutter;if(sh){sh.position.y=3.1;this.crankProgress=5;}}
  if(this.index===2){
    if(this.flags.curtainClosed){const c=this.objectMeshes.get('curtain'),cloth=c&&c.userData&&c.userData.cloth;if(cloth){cloth.scale.x=1;cloth.position.x=0;}}
    if(this.flags.hospitalPower&&this.duplicate){this.duplicateActive=true;this.duplicate.visible=true;}
  }
  const at=s.at;
  if(at&&this.canWalk(at[0],at[1]))this.player.set(at[0],0,at[1]);else this.player.set(this.level.spawn[0]*TILE,0,this.level.spawn[1]*TILE);
  for(const n of (s.ckptNotes||[]))if(!this.notes.some(x=>x.id===n.id))this.notes.push({id:n.id,level:n.level,text:n.text});
  this.spawnGrace=Math.max(this.spawnGrace||0,3);
  this.updateLights();this.resetDust();this.updateCamera(0);this.updateHUD();
};
const _startLevel=NightShift.prototype.startLevel;
NightShift.prototype.startLevel=function(index,intro=true,restore=false){
  _startLevel.call(this,index,intro);
  if(restore&&this.ckptHasSave(index)){
    this.applyCheckpoint();this.save();
    const label=ckptLabelOf(index,this.saved.sub);
    this.schedule(.12,()=>this.toast(t('已从检查点继续：{label}',{label:t(label||'本章进度')}),4.6));
  }
};
const _death=NightShift.prototype.death;
NightShift.prototype.death=function(reason){
  if(!this.ckptHasSave(this.index))return _death.call(this,reason);
  const label=ckptLabelOf(this.index,this.saved.sub);
  this.phase='death';this.releaseMouse();$('hideOverlay').classList.add('hidden');$('danger').classList.add('hidden');
  this.panel('夜间记录中断 / 检查点已保存','交接失败',t(reason)+t('\n\n可以从最近的检查点继续（{label}），或从本章开头重来。已解锁的章节仍会保留。',{label:t(label||'本章进度')}),[['从检查点继续',()=>this.startLevel(this.index,false,true),'primary'],['从本章开头重来',()=>this.startLevel(this.index,false,false)],['返回标题',()=>this.showMenu()]],'death');
};
const _showMenu=NightShift.prototype.showMenu;
NightShift.prototype.showMenu=function(){
  _showMenu.call(this);
  const _achvScreen=$('achievements');if(_achvScreen)_achvScreen.classList.add('hidden');
  try{const b=$('continueGame');if(b){const ck=this.saved.checkpoint,has=this.ckptHasSave(ck);b.textContent=has?t('继续上次的夜班 · 第 {n} 章 · {label}',{n:LEVELS[ck].chapter,label:t(ckptLabelOf(ck,this.saved.sub))}):t('继续上次的夜班 · 第 {n} 章',{n:LEVELS[ck].chapter});}}catch{}
};
const _chapters=NightShift.prototype.chapters;
NightShift.prototype.chapters=function(){
  _chapters.call(this);
  try{
    const grid=document.querySelector('.chapter-grid');if(!grid)return;
    grid.querySelectorAll('button').forEach((b,i)=>{
      const l=LEVELS[i];if(!l||i>=this.saved.unlocked)return;
      const s=b.querySelector('small');if(!s)return;
      if(this.ckptHasSave(i)){s.textContent=t('{place} · 从检查点继续（{label}）',{place:t(l.place),label:t(ckptLabelOf(i,this.saved.sub))});b.onclick=()=>{this.notes=this.saved.notes.filter(n=>n.level<i);this.startLevel(i,true,true);};}
    });
  }catch{}
};
const _updateT6=NightShift.prototype.update;
NightShift.prototype.update=function(dt){const r=_updateT6.call(this,dt);if(this.phase==='play')this.tickCheckpoint();return r;};

/* ==== T9 移动端手势 / 无障碍播报 / 高对比度 / 规则更新警告：只做加法，不改玩法与剧情文本 ==== */
const CONTRAST_KEY='nightshift-contrast';
function contrastStored(){return getItem(CONTRAST_KEY)==='high';}
function setContrastClass(on){const r=document.documentElement;if(r)r.setAttribute('data-contrast',on?'high':'normal');}
function setContrastMode(on){setContrastClass(on);setItem(CONTRAST_KEY,on?'high':'normal');}
setContrastClass(contrastStored());
NightShift.prototype.announceHUD=function(){
  const live=$('srLive'),alertBox=$('srAlert');
  const obj=$('objectiveText')?$('objectiveText').textContent:'';
  if(obj!==this._lastObj){
    if(this._lastObj!==undefined&&obj&&this.phase==='play'&&this.elapsed>1.5){
      const box=$('ruleAlert'),txt=$('ruleAlertText');
      if(box&&txt){txt.textContent=obj;box.classList.remove('hidden');box.classList.remove('is-out');clearTimeout(this.ruleTimer);this.ruleTimer=setTimeout(()=>{box.classList.add('is-out');this.ruleTimer=setTimeout(()=>box.classList.add('hidden'),460);},3400);}
      if(live)live.textContent=t('规则已更新。')+obj;
    }
    this._lastObj=obj;
  }
  const posture=$('posture')?$('posture').textContent:'';
  if(posture&&posture!==this._lastPosture){if(this._lastPosture!==undefined&&live)live.textContent=t('当前姿态：')+posture;this._lastPosture=posture;}
  const flash=$('flashState')?$('flashState').textContent:'';
  if(flash&&flash!==this._lastFlash){if(this._lastFlash!==undefined&&live)live.textContent=t('手电 {state}',{state:this.flashOn?'ON':'OFF'});this._lastFlash=flash;}
  const st=this.enemy&&this.enemy.active?this.enemy.state:'off';
  if(st!==this._lastEnemyState){
    if(alertBox&&this._lastEnemyState!==undefined){
      const map={chase:t('它发现你了。快跑，别直线跑。'),search:t('它在附近搜索。保持安静。'),searchHide:t('它看见你躲进去了。找机会离开。')};
      alertBox.textContent=map[st]||(st==='patrol'?t('它暂时离开了。'):'');
    }
    this._lastEnemyState=st;
  }
};
const _updateHUD9=NightShift.prototype.updateHUD;
NightShift.prototype.updateHUD=function(){const r=_updateHUD9.call(this);try{this.announceHUD();}catch{}return r;};
/* ==== 多语言：标题菜单里的语言切换按钮（切换后整页重载，保证关卡文本与字体一致） ==== */
function mountLanguageButton(){
  const menu=$('menu')||document.body;
  const host=menu.querySelector('.secondary-actions')||menu;
  let b=document.getElementById('langButton');
  if(!b){b=document.createElement('button');b.id='langButton';b.type='button';b.className='lang-button';host.append(b);}
  const sync=()=>{const name=switchLabel();b.textContent=t('界面语言')+' · '+name;b.setAttribute('aria-label',t('界面语言')+': '+name);b.setAttribute('lang',getLang()==='zh-CN'?'en-US':'zh-CN');};
  b.addEventListener('click',()=>{setLang(getLang()==='zh-CN'?'en-US':'zh-CN');window.location.reload();});
  sync();
}
mountLanguageButton();

/* ==== 兼容降级：三维初始化失败时给出准确原因，并为没有 WebGL 2 的浏览器保留可读的文字版档案 ==== */
function renderTextArchive(host){
  let box=document.getElementById('fatalExtra');
  if(!box){box=document.createElement('section');box.id='fatalExtra';box.className='fatal-extra';host.append(box);}
  box.textContent='';
  const title=document.createElement('h3');title.textContent=t('文字版档案 · 三章夜班');box.append(title);
  const note=document.createElement('p');note.className='muted';note.textContent=t('下面保留了三章的标题、地点、规则全文与事项清单，无需三维渲染也能阅读。');box.append(note);
  LEVELS.forEach(lv=>{
    const card=document.createElement('article');card.className='fatal-chapter';
    const h=document.createElement('h4');h.textContent=lv.chapter+' · '+t(lv.title);card.append(h);
    const meta=document.createElement('p');meta.className='muted';meta.textContent=t(lv.place)+' · '+t(lv.date);card.append(meta);
    const tag=document.createElement('p');tag.textContent=t(lv.tagline);card.append(tag);
    lv.intro.forEach(line=>{const p=document.createElement('p');p.textContent=t(line);card.append(p);});
    const ul=document.createElement('ul');
    lv.tasks.forEach(task=>{const li=document.createElement('li');li.textContent=t(task);ul.append(li);});
    card.append(ul);box.append(card);
  });
}
/* ==== 成就系统接入：只做加法，不改玩法与剧情文本 ==== */
loadAchievements();
function achvRunStats(g){ if(!g.runStats) g.runStats={deaths:0,hintUsed:false}; return g.runStats; }

NightShift.prototype.notifyAchievements=function(ids){
  if(!ids||!ids.length)return;
  const names=ids.map(id=>{const def=achvById(id);return t(def?def.name:id);});
  const label=t('成就解锁 · {name}',{name:names.join(', ')});
  this.toast(label,5,'achv');
  const live=$('srLive');if(live)live.textContent=label;
};

/* 提示条：给成就解锁一个独立样式类（不影响既有 ckpt 提示）。 */
const _toastAchv=NightShift.prototype.toast;
NightShift.prototype.toast=function(text,duration,kind){
  const r=_toastAchv.call(this,text,duration,kind);
  const el=$('toast');if(el)el.classList.toggle('achv',kind==='achv');
  return r;
};

/* 一章的开局（intro!==false）重置本轮统计；死亡重开与检查点续玩沿用，保住"零失败"语义。 */
const _startLevelAchv=NightShift.prototype.startLevel;
NightShift.prototype.startLevel=function(index,intro=true,restore=false){
  if(intro!==false||!this.runStats)this.runStats={deaths:0,hintUsed:false};
  return _startLevelAchv.call(this,index,intro,restore);
};

/* 引路提示真正显示出来即视为用过 H。 */
const _updateHintAchv=NightShift.prototype.updateHint;
NightShift.prototype.updateHint=function(){
  const r=_updateHintAchv.call(this);
  if(this.phase==='play'&&this.hintUntil>this.elapsed)achvRunStats(this).hintUsed=true;
  return r;
};

/* 抄进手记。 */
const _addNoteAchv=NightShift.prototype.addNote;
NightShift.prototype.addNote=function(id,text){
  const had=this.notes.some(n=>n.id===id);
  const r=_addNoteAchv.call(this,id,text);
  if(!had){try{const n=noteCollected(id);if(n.length)this.notifyAchievements(n);}catch{}}
  return r;
};

/* 拾起空罐（对比交互前后的空罐标记）。 */
const _interactAchv=NightShift.prototype.interact;
NightShift.prototype.interact=function(){
  if(this.phase!=='play'||this.hiding)return _interactAchv.call(this);
  const seen=new Set();
  for(const o of this.level.objects)if(o.kind==='can'&&this.flags[o.id])seen.add(o.id);
  const r=_interactAchv.call(this);
  for(const o of this.level.objects)if(o.kind==='can'&&this.flags[o.id]&&!seen.has(o.id)){
    try{const n=canCollected(o.id);if(n.length)this.notifyAchievements(n);}catch{}
  }
  return r;
};

/* 躲进柜子/夹缝：累计藏身次数；夹缝另记收集标记。 */
const _enterHideAchv=NightShift.prototype.enterHide;
NightShift.prototype.enterHide=function(o){
  const r=_enterHideAchv.call(this,o);
  try{
    const n=achvCount('hide',1);if(n.length)this.notifyAchievements(n);
    if(o&&o.kind==='shelfNook'){const m=nookCollected(o.id);if(m.length)this.notifyAchievements(m);}
  }catch{}
  return r;
};

/* 扔出空罐：以投掷列表长度变化为准。 */
const _throwCanAchv=NightShift.prototype.throwCan;
NightShift.prototype.throwCan=function(){
  const before=this.thrown.length;
  const r=_throwCanAchv.call(this);
  if(this.thrown.length>before){try{const n=achvCount('throw',1);if(n.length)this.notifyAchievements(n);}catch{}}
  return r;
};

/* 死亡：本轮失败数 +1。 */
const _deathAchv=NightShift.prototype.death;
NightShift.prototype.death=function(reason){
  try{achvRunStats(this).deaths+=1;achvCount('deaths',1);}catch{}
  return _deathAchv.call(this,reason);
};

/* 非致命惊扰（"caught" 属致命抓捕，不计入）。 */
const _triggerScareAchv=NightShift.prototype.triggerScare;
NightShift.prototype.triggerScare=function(type,fatal,reason){
  const r=_triggerScareAchv.call(this,type,fatal,reason);
  try{if(this.phase==='scare'&&type&&type!=='caught'){const n=scareSeen(type);if(n.length)this.notifyAchievements(n);}}catch{}
  return r;
};

/* 一章完成：记章节清除 + 结算零失败/不用引路/完美救援。 */
const _finishChapterAchv=NightShift.prototype.finishChapter;
NightShift.prototype.finishChapter=function(){
  const r=_finishChapterAchv.call(this);
  try{
    const a=chapterCleared(this.index);if(a.length)this.notifyAchievements(a);
    const b=runFinished(achvRunStats(this));if(b.length)this.notifyAchievements(b);
  }catch{}
  return r;
};

/* 结局：第三章以结局收尾，同样记章节完成并结算本轮。 */
const _endingAchv=NightShift.prototype.ending;
NightShift.prototype.ending=function(kind){
  const r=_endingAchv.call(this,kind);
  try{
    const a=chapterCleared(this.index);if(a.length)this.notifyAchievements(a);
    const b=runFinished(achvRunStats(this));if(b.length)this.notifyAchievements(b);
    const c=endingSeen(kind);if(c.length)this.notifyAchievements(c);
  }catch{}
  return r;
};

/* 章节检查点全部达成。 */
const _tickCheckpointAchv=NightShift.prototype.tickCheckpoint;
NightShift.prototype.tickCheckpoint=function(){
  const r=_tickCheckpointAchv.call(this);
  try{
    const c=CKPT[this.index];if(!c||!c.list.length)return r;
    let idx=0;for(let i=0;i<c.list.length;i++)if(this.flags[c.list[i].tag])idx=i+1;
    if(idx>=c.list.length){const n=checkpointDone();if(n.length)this.notifyAchievements(n);}
  }catch{}
  return r;
};


/* ==== 成就面板：与 #gallery 同构的独立 screen（不改玩法与剧情文本） ==== */
NightShift.prototype.achvRender=function(){
  const host=$('achvBody');if(!host)return;
  host.replaceChildren();
  const data=listAchievements(),prog=progressAchievements();
  const sum=$('achvSummary');if(sum)sum.textContent=t('已解锁 {n} / {total} 项成就',{n:prog.unlocked,total:prog.total});
  for(const cat of ACHV_CATEGORIES){
    const items=data.filter(a=>a.category===cat);if(!items.length)continue;
    const group=document.createElement('section');group.className='achv-group';
    const h=document.createElement('h3');h.className='achv-group-title';h.textContent=t(cat);
    const count=document.createElement('span');count.className='achv-group-count';count.textContent=items.filter(a=>a.unlocked).length+' / '+items.length;
    h.append(count);group.append(h);
    const ul=document.createElement('ul');ul.className='achv-list';
    for(const a of items){
      const li=document.createElement('li');li.className='achv-item'+(a.unlocked?' is-unlocked':'');
      const icon=document.createElement('span');icon.className='achv-icon';icon.setAttribute('aria-hidden','true');icon.textContent=a.icon;
      const box=document.createElement('div');
      const name=document.createElement('p');name.className='achv-name';name.textContent=t(a.name);
      const desc=document.createElement('p');desc.className='achv-desc';desc.textContent=t(a.desc);
      box.append(name,desc);
      if(a.progress){const pr=document.createElement('p');pr.className='achv-prog';pr.textContent=t('进度 {current} / {goal}',{current:a.progress.current,goal:a.progress.goal});box.append(pr);}
      const state=document.createElement('span');state.className='achv-state';state.textContent=a.unlocked?t('已解锁'):t('未解锁');box.append(state);
      li.append(icon,box);ul.append(li);
    }
    group.append(ul);host.append(group);
  }
  applyI18n(host);
};
NightShift.prototype.openAchievements=function(){
  this.phase='achievements';this.releaseMouse();
  for(const id of ['menu','hud','panel','gallery'])$(id).classList.add('hidden');
  const el=$('achievements');if(el)el.classList.remove('hidden');
  const st=$('achvStatus');if(st)st.textContent='';
  this.achvRender();
  const back=$('achvBack');if(back)setTimeout(()=>{try{back.focus();}catch(e){}},0);
};
NightShift.prototype.closeAchievements=function(){const el=$('achievements');if(el)el.classList.add('hidden');this.showMenu();};
NightShift.prototype.achvExport=function(){
  const st=$('achvStatus');
  try{
    const blob=new Blob([exportAchievements()],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='nightshift-achievements.json';document.body.append(a);a.click();a.remove();
    setTimeout(()=>{try{URL.revokeObjectURL(url);}catch(e){}},1500);
    if(st)st.textContent=t('成就存档已导出。');
  }catch(e){if(st)st.textContent=t('导出失败，请稍后再试。');}
};
NightShift.prototype.achvReset=function(){
  this.panel('统一成就记录','确认重置成就？','这会清空已解锁的成就与全部进度统计，且无法撤销。该操作只影响成就记录，不影响游戏存档。',[
    ['确认重置',()=>{try{resetAchievements();}catch(e){}this.openAchievements();const st=$('achvStatus');if(st)st.textContent=t('成就进度已重置。');},'primary'],
    ['取消',()=>this.openAchievements()],
  ],'achvConfirm');
};

export let game;
try{game=new NightShift();}catch(error){
  const loadingEl=$('loading');if(loadingEl){loadingEl.classList.add('hidden');loadingEl.setAttribute('aria-busy','false');}
  const fatalEl=$('fatal');
  if(fatalEl){
    fatalEl.classList.remove('hidden');
    const code=error&&error.code;
    const head=code==='webgl1-only'?t('本作的三维场景需要 WebGL 2，而你的浏览器只支持 WebGL 1。更新或更换浏览器（开启硬件加速的 Edge / Chrome）即可进入完整夜班。')
      :code==='no-webgl'?t('浏览器未启用 WebGL，无法渲染三维夜班。开启浏览器硬件加速后即可进入完整夜班。')
      :t('三维渲染初始化失败。请使用开启硬件加速的 Edge 或 Chrome 后重试。');
    fatalEl.querySelector('p').textContent=head+(!code&&error&&error.message?' ('+error.message+')':'');
    renderTextArchive(fatalEl);
  }
  console.error(error);
}
if(game)try{game.watchContext();}catch(e){}
