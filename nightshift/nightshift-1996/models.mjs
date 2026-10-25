import * as THREE from './vendor/three.min.js';
import {TILE} from './levels.mjs';
import {t,hasCJK} from '../i18n.mjs';

const materials=new Map(), geometries=new Map();
const seeded=(seed=17)=>()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
export function mat(color, options={}) {
  const key=color+JSON.stringify(options); if(!materials.has(key)) materials.set(key,new THREE.MeshStandardMaterial({color,roughness:.88,flatShading:true,...options}));return materials.get(key);
}
function geo(key,create){if(!geometries.has(key))geometries.set(key,create());return geometries.get(key);}
export function box(parent,w,h,d,color,x=0,y=0,z=0,options={}){
  const m=new THREE.Mesh(geo(`b${w},${h},${d}`,()=>new THREE.BoxGeometry(w,h,d)),color?.isMaterial?color:mat(color,options));m.position.set(x,y,z);parent.add(m);return m;
}
export function cylinder(parent,r1,r2,h,color,x=0,y=0,z=0,segments=8){
  const m=new THREE.Mesh(geo(`c${r1},${r2},${h},${segments}`,()=>new THREE.CylinderGeometry(r1,r2,h,segments)),mat(color));m.position.set(x,y,z);parent.add(m);return m;
}
function sphere(parent,r,color,x=0,y=0,z=0){const m=new THREE.Mesh(geo(`s${r}`,()=>new THREE.SphereGeometry(r,8,6)),mat(color));m.position.set(x,y,z);parent.add(m);return m;}
function prism(parent,bw,bd,tw,td,h,color,x=0,y=0,z=0){const geometry=geo(`p${bw},${bd},${tw},${td},${h}`,()=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([-bw/2,-h/2,bd/2,bw/2,-h/2,bd/2,bw/2,-h/2,-bd/2,-bw/2,-h/2,-bd/2,-tw/2,h/2,td/2,tw/2,h/2,td/2,tw/2,h/2,-td/2,-tw/2,h/2,-td/2],3));g.setIndex([0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7,4,5,6,4,6,7,3,2,1,3,1,0]);const flat=g.toNonIndexed();flat.computeVertexNormals();g.dispose();return flat;});const m=new THREE.Mesh(geometry,color?.isMaterial?color:mat(color));m.position.set(x,y,z);parent.add(m);return m;}
function group(parent,x=0,y=0,z=0){const g=new THREE.Group();g.position.set(x,y,z);parent?.add(g);return g;}
function rod(parent,a,b,r,color){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),delta=bv.clone().sub(av);const m=cylinder(parent,r,r,delta.length(),color,...av.add(bv).multiplyScalar(.5).toArray());m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return m;}

/* 纹理/材质缓存：同一块标牌（文字 + 样式 + 尺寸）只生成一次 canvas，
   重复出现的门牌、车牌、楼号直接复用同一张贴图与材质，减少纹理数量与 draw call。 */
const signCache=new Map();
export function sign(parent,text,w=1.5,h=.6,x=0,y=1.9,z=.01,style={}){
  const label=t(text),key=label+'\u0001'+w+'\u0001'+h+'\u0001'+JSON.stringify(style);
  let entry=signCache.get(key);
  if(!entry){
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=Math.max(192,Math.round(768*h/w));const c=canvas.getContext('2d');
    c.fillStyle=style.bg||'#d8d2b8';c.fillRect(0,0,canvas.width,canvas.height);
    const rand=seeded(3);for(let i=0;i<350;i++){c.fillStyle=`rgba(28,24,16,${rand()*.07})`;c.fillRect(rand()*canvas.width,rand()*canvas.height,rand()*9,rand()*4);}
    c.strokeStyle=style.ink||'#33463b';c.lineWidth=7;c.strokeRect(13,13,canvas.width-26,canvas.height-26);
    const lines=String(label).split('\n');c.fillStyle=style.ink||'#263b31';c.textAlign='center';c.textBaseline='middle';
    const size=Math.min(90,(canvas.height-48)/lines.length*.7,canvas.width/Math.max(...lines.map(s=>s.length))*.83);
    const fontStack=hasCJK(label)?'"SimSun", "Microsoft YaHei", serif':'"Georgia", "Times New Roman", serif';
    c.font=`700 ${size}px ${fontStack}`;lines.forEach((line,i)=>c.fillText(line,canvas.width/2,canvas.height/2+(i-(lines.length-1)/2)*(canvas.height-35)/lines.length));
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;
    const material=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide});
    materials.set('sign\u0001'+key,material);
    entry={material,geometry:geo('sg'+w+','+h,()=>new THREE.PlaneGeometry(w,h))};
    signCache.set(key,entry);
  }
  const m=new THREE.Mesh(entry.geometry,entry.material);m.position.set(x,y,z);parent.add(m);return m;
}

/* 纹理/材质复用：同一 (颜色 + 图案 + 重复次数) 只生成一次 canvas 与贴图。
   楼层、墙面、饰条在每关重建（loadLevel）时会重复请求同一组合，
   复用后无需重复铺像素与重传 GPU 纹理；与 sign() 同样登记进 materials，随共享资源统一管理。 */
function texture(color,kind,repeatX,repeatY){
  const key='tex\u0001'+color+'\u0001'+kind+'\u0001'+repeatX+'\u0001'+repeatY;
  if(materials.has(key))return materials.get(key);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d'),rand=seeded(72);
  c.fillStyle=color;c.fillRect(0,0,256,256);
  for(let i=0;i<7000;i++){c.fillStyle=`rgba(${rand()>.5?'235,229,205':'32,38,31'},${rand()*.15})`;c.fillRect(rand()*256,rand()*256,1+rand()*3,1+rand()*3);}
  if(kind==='wood'){for(let i=0;i<60;i++){c.strokeStyle=`rgba(26,17,8,${rand()*.2})`;c.beginPath();let y=rand()*256;c.moveTo(0,y);c.bezierCurveTo(90,y+12,180,y-10,256,y+3);c.stroke();}}
  if(kind==='tile'){c.strokeStyle='rgba(25,37,31,.4)';c.lineWidth=3;for(let i=0;i<=256;i+=64){c.beginPath();c.moveTo(i,0);c.lineTo(i,256);c.moveTo(0,i);c.lineTo(256,i);c.stroke();}}
  if(kind==='wall'){for(let i=0;i<45;i++){c.fillStyle=`rgba(34,28,19,${rand()*.06})`;c.fillRect(rand()*256,rand()*256,rand()*32,rand()*80);}}
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(repeatX,repeatY);t.anisotropy=4;
  const material=new THREE.MeshStandardMaterial({map:t,roughness:.96});materials.set(key,material);return material;
}
const wood=()=>{if(!materials.has('wood'))materials.set('wood',texture('#604631','wood',1,1));return materials.get('wood');};
function contactShadow(parent,w,d){if(!materials.has('contactShadow')){const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d'),gradient=ctx.createRadialGradient(32,32,6,32,32,32);gradient.addColorStop(0,'rgba(0,8,3,.5)');gradient.addColorStop(1,'rgba(0,8,3,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);materials.set('contactShadow',new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false}));}const mesh=new THREE.Mesh(geo(`shadow${w},${d}`,()=>new THREE.PlaneGeometry(w,d)),materials.get('contactShadow'));mesh.rotation.x=-Math.PI/2;mesh.position.y=.019;mesh.userData.lod=13;parent.add(mesh);}

export function disposeModel(root){
  if(!root)return;const sharedMaterials=new Set(materials.values()),sharedGeometry=new Set(geometries.values()),ownedMats=new Set(),ownedGeometry=new Set();
  root.traverse(node=>{if(!node.isMesh)return;if(node.isInstancedMesh)node.dispose();if(!sharedGeometry.has(node.geometry))ownedGeometry.add(node.geometry);for(const m of (Array.isArray(node.material)?node.material:[node.material]))if(!sharedMaterials.has(m))ownedMats.add(m);});
  for(const g of ownedGeometry)g.dispose();for(const m of ownedMats){m.map?.dispose();m.dispose();}
}

export function makeDesk(parent,x=0,z=0,kind='library'){
  const g=group(parent,x,0,z);const m=kind==='hospital'?mat('#a2ac9d'):wood();
  contactShadow(g,3.3,1.8);
  box(g,2.45,.16,1.05,m,0,.86,0);box(g,.65,.72,.95,m,-.77,.42,0);box(g,.16,.75,.9,m,.98,.42,0);
  for(let y=.23;y<.8;y+=.21){box(g,.59,.17,.02,'#6e5541',-.77,y,.49);box(g,.2,.025,.035,'#9d947b',-.77,y,.52);}
  box(g,1.8,.45,.05,m,0,.6,-.43);return g;
}
function chair(parent,x=0,z=0,rot=0){const g=group(parent,x,0,z);g.rotation.y=rot;g.userData.collider={rx:.32,rz:.32};box(g,.6,.09,.6,wood(),0,.48,0);box(g,.6,.49,.08,wood(),0,.84,-.25);for(const xx of [-.24,.24])for(const zz of [-.24,.24])box(g,.045,.48,.045,'#383b34',xx,.24,zz);return g;}
export function crt(parent,x=0,y=.95,z=0){const g=group(parent,x,y,z);box(g,.63,.47,.55,'#b6ad8d',0,.3,0);box(g,.51,.34,.025,'#2a3431',0,.3,.29);box(g,.43,.26,.02,'#12372d',0,.31,.308,{emissive:'#2b7050',emissiveIntensity:.5});sign(g,'临江市 / 1996\n终端等待连接',.39,.2,0,.32,.323,{bg:'#142d25',ink:'#75aa7d'});box(g,.3,.08,.25,'#aaa28d',0,.04,0);box(g,.7,.045,.24,'#c1b99e',0,.01,.5);for(let i=0;i<9;i++)for(let j=0;j<3;j++)box(g,.045,.012,.035,'#6f7065',-.28+i*.066,.042,.43+j*.058);return g;}
function phone(parent,x=0,y=.97,z=0){const g=group(parent,x,y,z);box(g,.48,.12,.38,'#202b29',0,.06,0);const dial=cylinder(g,.11,.12,.015,'#bcb593',0,.13,.045,12);for(let i=0;i<10;i++){let a=i*.628;sphere(g,.014,'#242b28',Math.sin(a)*.083,.145,.045+Math.cos(a)*.083);}
  box(g,.49,.085,.095,'#111c19',0,.24,-.11);for(const xx of [-.2,.2])box(g,.11,.13,.15,'#192320',xx,.19,-.09);
  for(let i=0;i<16;i++)sphere(g,.02,'#191d19',-.29-Math.sin(i)*.025,.15-i*.025,-.1);return g;
}
function lamp(parent,x,y,z){const g=group(parent,x,y,z);cylinder(g,.13,.17,.045,'#4c4936',0,0,0);rod(g,[0,.03,0],[0,.38,-.07],.025,'#8e8b65');const shade=cylinder(g,.18,.27,.17,'#416455',0,.43,0);shade.rotation.z=Math.PI/2;box(g,.36,.015,.17,'#e3dba8',0,.37,0,{emissive:'#e4ce8d',emissiveIntensity:.35});return g;}

export function bookshelf(parent){const g=group(parent);contactShadow(g,3.1,1.7);box(g,2.35,2.6,.12,wood(),0,1.3,-.39);for(const x of [-1.2,1.2])box(g,.12,2.6,.9,wood(),x,1.3,0);const rand=seeded(23);for(let j=0;j<5;j++){const y=.12+j*.5;box(g,2.45,.085,.9,wood(),0,y,0);let x=-1.09;while(x<1.08){const w=.08+rand()*.14,h=.28+rand()*.14,col=['#654d38','#78806a','#394c4b','#816a4a','#6e4440'][Math.floor(rand()*5)];box(g,w,h,.5,col,x+w/2,y+.07+h/2,.08).userData.lod=15;box(g,w*.8,.018,.006,'#b9ac86',x+w/2,y+.17,.337).userData.lod=15;x+=w+.025;}}return g;}

export function bed(parent){const g=group(parent);contactShadow(g,2.2,3.3);box(g,1.45,.21,2.4,'#8c9789',0,.56,0);box(g,1.4,.16,2.25,'#c7c7ab',0,.73,0);box(g,1.42,.055,1.38,'#81948b',0,.84,.37);box(g,.98,.18,.48,'#dad7bc',0,.87,-.78);
  for(const z of [-1.2,1.2]){for(const x of [-.7,.7])rod(g,[x,.12,z],[x,1.15,z],.035,'#a8b1a1');rod(g,[-.7,1.15,z],[.7,1.15,z],.035,'#a8b1a1');for(let x=-.4;x<.5;x+=.27)rod(g,[x,.8,z],[x,1.12,z],.024,'#9aa497');}
  for(const x of [-.63,.63])for(const z of [-1.05,1.05]){const wheel=cylinder(g,.09,.09,.05,'#333f37',x,.1,z);wheel.rotation.z=Math.PI/2;}
  rod(g,[1,0,-.7],[1,2.2,-.7],.02,'#9caaa0');rod(g,[.8,2.2,-.7],[1.25,2.2,-.7],.02,'#a9b6ac');box(g,.15,.25,.07,'#bbcab6',1.18,1.97,-.7,{transparent:true,opacity:.7});rod(g,[1.18,1.85,-.7],[1.1,.9,-.5],.008,'#c4c8ac');return g;
}
export function car(parent,color,plate){const g=group(parent);contactShadow(g,3.2,5.6);prism(g,2.03,4.53,2.12,4.65,.65,color,0,.63,0);box(g,2.04,.16,1.45,color,0,.97,1.55);box(g,2.0,.16,.85,color,0,.97,-1.9);box(g,1.84,.12,2.6,color,0,1.04,-.25);prism(g,1.8,2.6,1.65,1.9,.68,mat('#203738',{metalness:.3,roughness:.28,transparent:true,opacity:.88}),0,1.4,-.25);box(g,1.72,.09,1.98,color,0,1.77,-.25);
  for(const x of [-.9,.9]){rod(g,[x,1.07,1.05],[x*.92,1.74,.7],.04,color);rod(g,[x,1.07,-1.55],[x*.92,1.74,-1.2],.045,color);rod(g,[x,1.07,-.3],[x*.92,1.74,-.3],.04,color);for(const z of [-.85,.25])box(g,.035,.055,.27,'#a0a39a',x*1.15,1,z);box(g,.26,.13,.19,color,x*1.15,1.2,.7);box(g,.025,.025,3.7,'#454d42',x*1.17,.7,0);}
  for(const x of [-1.05,1.05])for(const z of [-1.45,1.45]){const tire=cylinder(g,.45,.45,.24,'#1d2420',x,.46,z,12);tire.rotation.z=Math.PI/2;const hub=cylinder(g,.25,.25,.252,'#93988a',x,.46,z,8);hub.rotation.z=Math.PI/2;}
  box(g,2.16,.13,.14,'#a0a394',0,.57,2.34);box(g,2.16,.13,.14,'#8a8f83',0,.57,-2.34);box(g,.9,.2,.04,'#292f2b',0,.87,2.35);for(let i=-3;i<=3;i++)box(g,.025,.18,.05,'#a6aa9b',i*.11,.87,2.38);
  for(const x of [-.74,.74]){box(g,.42,.21,.05,'#dbd7af',x,.93,2.35,{emissive:'#77714c',emissiveIntensity:.18});box(g,.4,.19,.04,'#79332e',x,.9,-2.36);}
  sign(g,plate,.75,.22,0,.47,2.43,{bg:'#253e61',ink:'#d6d8c5'});const rearPlate=sign(g,plate,.75,.22,0,.47,-2.43,{bg:'#253e61',ink:'#d6d8c5'});rearPlate.rotation.y=Math.PI;
  // Interior silhouettes remain visible behind the dark glass.
  box(g,.6,.6,.28,'#4a5145',-.46,1.09,-.3);box(g,.6,.6,.28,'#4a5145',.46,1.09,-.3);const steering=new THREE.Mesh(geo('steering',()=>new THREE.TorusGeometry(.19,.025,6,12)),mat('#303a31'));steering.position.set(-.45,1.22,.55);steering.rotation.x=-.65;g.add(steering);return g;
}

export function character({monster=false,firstPerson=false,variant='library'}={}){
  const g=new THREE.Group(),skin=monster?'#9a9c86':'#b79776',coat=monster?(variant==='garage'?'#364d50':'#5b6657'):'#3c5665';
  const body=group(g,0,.92,0);prism(body,.46,.28,.6,.31,.6,coat,0,.34,0);box(body,.49,.08,.3,'#2c3e42',0,.03,0);box(body,.025,.53,.016,'#a9a58a',0,.35,.165);
  for(const x of [-.14,.14]){box(body,.15,.12,.035,'#314956',x,.44,.17);box(body,.13,.013,.01,'#b6ae87',x,.5,.195);}sign(body,monster?(variant==='garage'?'停 车 管 理':'夜 间 巡 视'):'临江 / 检修',.19,.07,.13,.59,.18,{bg:'#d5cc9f',ink:'#32483f'});
  const legs=[];for(const x of [-.15,.15]){const leg=group(g,x,.93,0);box(leg,.2,.84,.23,'#3c4843',0,-.42,0);box(leg,.23,.16,.39,'#202a28',0,-.83,.07);box(leg,.24,.04,.4,'#42443a',0,-.91,.07);legs.push(leg);}
  const arms=[];for(const side of [-1,1]){const arm=group(body,side*.32,.57,0);box(arm,.2,.56,.23,coat,0,-.25,0);box(arm,.19,.09,.235,'#a6a58b',0,-.52,0);box(arm,.16,.21,.16,skin,0,-.65,.01);for(let j=0;j<4;j++)box(arm,.025,.07,.05,skin,-.05+j*.033,-.77,.05);arm.rotation.z=-side*.08;arms.push(arm);}
  const head=group(g,0,1.72,0);cylinder(head,.1,.12,.15,skin,0,-.15,0,7);
  const skull=sphere(head,.205,skin,0,.1,0);skull.scale.set(.88,1.2,.92);box(head,.265,.12,.2,skin,0,-.03,.015);box(head,.29,.08,.2,'#252a26',0,.29,-.025);box(head,.34,.17,.14,'#202722',0,.2,-.11);box(head,.21,.08,.12,'#242923',-.07,.265,.06);
  const eyeMats=[];
  for(const x of [-.09,.09]){box(head,.075,.025,.027,'#34362c',x,.14,.174);const eye=box(head,.052,.026,.015,monster?'#f1eed2':'#d3c8a9',x,.105,.186,{emissive:monster?'#a99d73':'#000000',emissiveIntensity:monster?.5:0});if(monster){eye.material=eye.material.clone();eyeMats.push(eye.material);}box(head,.018,.025,.014,'#18241e',x,.104,.197);box(head,.045,.03,.07,skin,x*2,.06,0);}
  box(head,.045,.09,.07,skin,0,.06,.18);box(head,.09,.015,.025,'#6d5145',0,-.02,.162);if(!monster){const scar=box(head,.008,.065,.008,'#755b4d',-.108,.16,.19);scar.rotation.z=-.5;}
  if(monster){box(head,.115,.08,.04,'#292a22',0,-.018,.18);for(let i=0;i<5;i++)box(head,.015,.022,.01,'#b7b39a',-.042+i*.021,.012,.209);arms[0].scale.y=arms[1].scale.y=1.2;if(variant==='garage'){box(head,.39,.1,.34,'#263b3c',0,.32,0);box(head,.32,.025,.2,'#172e2d',0,.27,.2);box(body,.53,.055,.025,'#b4c0a2',0,.31,.18);cylinder(arms[0],.035,.035,.39,'#ac442e',0,-.99,.02,6).material=mat('#ac442e',{emissive:'#7e2619',emissiveIntensity:.5});}else {box(body,.38,.57,.03,'#777660',0,.15,.18);for(let i=0;i<3;i++)box(body,.13,.025,.006,'#774a3a',.04,.31-i*.08,.2);}}
  if(firstPerson){head.visible=false;arms.forEach(a=>a.visible=false);}
  g.userData={head,body,legs,arms};if(eyeMats.length)g.userData.eyeMats=eyeMats;return g;
}

export function firstPersonArms(){const g=new THREE.Group();
  const right=group(g,.29,-.32,-.43);right.rotation.x=-.6;box(right,.13,.36,.17,'#3d5965',0,-.06,0);box(right,.135,.06,.175,'#a8aa92',0,.1,0);box(right,.12,.16,.13,'#b99c79',0,.19,0);
  const torch=cylinder(right,.065,.075,.3,'#454e43',0,.24,-.05,10);torch.rotation.x=Math.PI/2;const front=cylinder(right,.085,.07,.06,'#b7b7a2',0,.24,-.23,10);front.rotation.x=Math.PI/2;
  box(g,.14,.3,.18,'#3d5965',-.3,-.63,-.35);g.scale.setScalar(.58);g.position.set(.15,-.18,-.3);g.traverse(m=>{if(m.isMesh)m.material=new THREE.MeshBasicMaterial({color:m.material.color.clone().multiplyScalar(.82)});});return g;
}

export function canProp(parent){
  const g=group(parent);contactShadow(g,.62,.62);
  const body=cylinder(g,.075,.075,.22,'#8d9a92',0,.11,0,10);body.rotation.y=.4;
  cylinder(g,.066,.066,.014,'#b9c3b5',0,.228,0,10);
  box(g,.03,.11,.012,'#bd5540',0,.11,-.072);
  for(let i=0;i<3;i++)box(g,.072-i*.005,.012,.072-i*.005,i?'#69736a':'#b9c3b5',0,.022+i*.006,0);
  g.rotation.y=.4;return g;
}

export function makeObject(def,level){
  const g=new THREE.Group();g.position.set(def.x*TILE+(def.offsetX||0),0,def.z*TILE+(def.offsetZ||0));g.rotation.y=def.rotation||0;g.userData.id=def.id;g.userData.kind=def.kind;
  const metal='#6c7a6e';
  if(def.visual===false)return g;
  switch(def.kind){
    case 'phone':{makeDesk(g,0,0,level.id);phone(g,-.48);crt(g,.54,.96,-.07);chair(g,0,-1.1,Math.PI);break;}
    case 'paper':case 'tape':case 'radio':{makeDesk(g,0,0,level.id);lamp(g,-.75,.97,0);if(def.kind==='paper'){const p=sign(g,def.id==='slip'?'借 阅 条\n第 二 排\n第 七 格\n第 一 册':'交 接 记 录\n0619\n排风 / 监控 / 卷帘门',.5,.66,.1,.96,.1);p.rotation.x=-Math.PI/2;}
      else {box(g,.7,.2,.43,'#515951',.2,1.08,.1);for(const x of [-.02,.41]){const reel=cylinder(g,.115,.115,.025,'#a9b097',x,1.196,.1,12);}box(g,.25,.03,.13,'#393d33',.2,1.207,.1);for(let i=0;i<5;i++)box(g,.07,.05,.04,i===4?'#a54a36':'#aca990',-.03+i*.11,1.01,.34);if(def.kind==='radio'){phone(g,-.64,.97,-.13);sign(g,'内线：2317',.4,.16,.2,1.27,-.15);}}
      break;}
    case 'catalog':{box(g,2.1,2.05,.75,wood(),0,1.025,0);for(let r=0;r<6;r++)for(let c=0;c<5;c++){const x=-.83+c*.415,y=.22+r*.325;box(g,.39,.29,.08,'#796044',x,y,.415);box(g,.17,.06,.015,'#c2b797',x,y+.055,.465);box(g,.12,.022,.04,'#5a5a47',x,y-.04,.48);}sign(g,'借 阅 档 案',1.8,.24,0,2.24,.02);break;}
    case 'locker':{box(g,1.12,2.25,.08,metal,0,1.125,-.49);for(const x of [-.56,.56])box(g,.08,2.25,1.06,metal,x,1.125,0);for(const y of [.05,2.21])box(g,1.2,.08,1.06,metal,0,y,0);box(g,1.07,1.22,.045,'#56665b',0,.66,.52);box(g,1.07,.45,.045,'#56665b',0,1.99,.52);for(let i=0;i<7;i++)box(g,1.07,.035,.06,metal,0,1.32+i*.06,.53);box(g,.04,.18,.06,'#c2bca0',.4,1.08,.58);sign(g,level.id==='hospital'?'被 服':'清 洁',.55,.16,0,1.98,.55);break;}
    case 'door':{box(g,2.7,3.13,.13,'#3c5146',0,1.565,-.15);box(g,2.44,2.87,.12,'#648172',0,1.435,-.04);box(g,.035,2.8,.03,'#2a4236',0,1.44,.035);for(const x of [-.65,.65])box(g,.65,.65,.04,'#253d35',x,2,.035);for(const x of [-.18,.18])box(g,.035,.45,.07,'#b1b7a1',x,1.35,.12);sign(g,def.label,2.5,.35,0,3.01,.05,{bg:'#234b3d',ink:'#d5d5ad'});break;}
    case 'shutter':{const shutter=group(g,0,0,0);for(let i=0;i<25;i++)box(shutter,5.2,.125,.12,i%2?'#63756c':'#7c897c',0,.08+i*.125,-.18);g.userData.shutter=shutter;shutter.userData.dyn=true;for(const x of [-2.68,2.68])box(g,.14,3.4,.28,'#3d5047',x,1.7,-.17);sign(g,def.label,3.5,.38,0,3.23,.05,{bg:'#1e493b',ink:'#d7d8b1'});break;}
    case 'power':{box(g,1.05,1.3,.28,'#788579',0,1.43,0);box(g,.92,1.16,.06,'#3b4b43',0,1.43,.18);for(let i=0;i<3;i++){box(g,.12,.22,.08,'#aaa78b',-.28+i*.28,1.4,.24);box(g,.1,.08,.15,'#292e27',-.28+i*.28,1.44,.31);}sign(g,'配 电 箱\n非专业人员勿动',.82,.28,0,1.87,.22);rod(g,[0,2.1,0],[0,3.4,0],.035,'#4c5e52');break;}
    case 'crank':{box(g,.28,1.1,.35,'#4c5b50',0,1.1,0);const wheel=group(g,0,1.28,.27),ring=new THREE.Mesh(new THREE.TorusGeometry(.33,.035,6,16),mat('#a6976d'));wheel.add(ring);for(let i=0;i<3;i++){let a=i*Math.PI*2/3;rod(wheel,[0,0,0],[Math.cos(a)*.33,Math.sin(a)*.33,0],.022,'#938862');}box(wheel,.08,.08,.24,'#353c2e',.3,0,.12);g.userData.wheel=wheel;wheel.userData.dyn=true;sign(g,'手 动 升 门',1,.3,0,2,.03);break;}
    case 'chart':{rod(g,[0,0,0],[0,1.35,0],.025,metal);for(const x of [-.3,.3])rod(g,[0,.1,0],[x,.05,.2],.02,metal);const clip=box(g,.55,.73,.04,'#6c7665',0,1.63,0);sign(g,'市立医院 / 017\n周  临\n02 : 17',.47,.6,0,1.62,.027);box(g,.2,.05,.03,'#a7af9b',0,1.98,.03);break;}
    case 'curtain':{rod(g,[-1.48,2.9,0],[1.48,2.9,0],.025,'#a6b7a5');const cloth=group(g);for(let i=0;i<24;i++){const fold=box(cloth,.127,2.35,.09,'#617f6b',-1.46+i*.127,1.58,(i%2)*.065);fold.material=mat(i%2?'#77917a':'#617b69',{side:THREE.DoubleSide});}g.userData.cloth=cloth;cloth.userData.dyn=true;cloth.scale.x=.08;cloth.position.x=1.35;sign(g,'隔 帘',.65,.2,0,3.12,0);break;}
    case 'sign':sign(g,def.label,2.4,.75,0,2.4,0);break;
    case 'panel':{
      /* 可开关的走廊门：门框固定，门扇绕左侧门轴开合。 */
      for(const x of [-1.29,1.29])box(g,.18,2.62,.36,'#3a4a41',x,1.31,0);
      box(g,2.76,.2,.36,'#3a4a41',0,2.72,0);
      const leaf=group(g,-1.2,0,0);
      box(leaf,2.4,2.5,.09,'#5e7466',1.2,1.25,0);
      box(leaf,2.26,2.34,.02,'#4d6355',1.2,1.25,.06);
      box(leaf,2.2,.07,.12,'#2f4038',1.2,.17,.02);
      box(leaf,.07,.26,.07,'#c3bda2',2.06,1.14,.1);
      sign(g,def.label||'通 道 门',2.3,.32,0,2.98,.07,{bg:'#234b3d',ink:'#d5d5ad'});
      g.userData.leaf=leaf;leaf.userData.dyn=true;g.userData.openAngle=def.openAngle||1.35;break;}
    case 'shelfNook':{
      /* 可躲藏的书架夹缝：书架中段缺一格，只容一人侧身站进去。 */
      contactShadow(g,3.1,1.7);
      box(g,2.86,2.62,.12,wood(),0,1.31,-.46);
      for(const x of [-1.41,1.41])box(g,.16,2.62,1.0,wood(),x,1.31,0);
      box(g,2.86,.14,1.0,wood(),0,2.55,0);box(g,2.86,.14,1.0,wood(),0,.07,0);
      for(const side of [-1,1])for(let j=0;j<3;j++){const y=.42+j*.68;box(g,1.0,.085,.92,wood(),side*.85,y,0);}
      const nrand=seeded(41);
      for(const side of [-1,1]){let bx=.36;while(bx<1.28){const w=.07+nrand()*.09,h=.24+nrand()*.1,col=['#654d38','#78806a','#394c4b','#816a4a'][Math.floor(nrand()*4)];box(g,w,h,.44,col,side*(bx+w/2),1.85+h/2,-.06).userData.lod=15;bx+=w+.02;}}
      g.userData.nook=true;break;}
    case 'can':{canProp(g);g.userData.dyn=true;break;}
  }
  return g;
}

/* ==== 3D 性能辅助 ====
   1) 动态子树（门扇 / 卷帘门 / 手轮 / 隔帘 / 空罐）会被逐帧改写旋转与位置，
      必须保持 matrixAutoUpdate=true，其余静态部件全部冻结，省掉每帧矩阵合成。
   2) 同材质静态小件合并成单一网格，减少 draw call，包围球仍与所在分组同量级。 */
const DYNAMIC_IDS=['curtain','exit','crank','panel','can'];
/* 除了按对象 id 匹配，建模阶段已给会逐帧改写或切换可见性的子树打上 userData.dyn
   （门扇 leaf / 卷帘门 shutter / 手轮 wheel / 隔帘 cloth / 空罐），避免 id 与 DYNAMIC_IDS
   不一致时漏判——例如走廊门对象 id 为 doorL，而 kind 才是 panel。 */
function inDynamicSubtree(node,world){let n=node;while(n&&n!==world){if(n.userData&&(n.userData.dyn===true||DYNAMIC_IDS.includes(n.userData.id)))return true;n=n.parent;}return false;}
function concatGeoms(list){
  let count=0;for(const g of list)count+=g.attributes.position.count;
  const pos=new Float32Array(count*3),nor=new Float32Array(count*3),uv=new Float32Array(count*2);let o=0;
  for(const g of list){pos.set(g.attributes.position.array,o*3);nor.set(g.attributes.normal.array,o*3);uv.set(g.attributes.uv.array,o*2);o+=g.attributes.position.count;}
  const out=new THREE.BufferGeometry();out.setAttribute('position',new THREE.BufferAttribute(pos,3));out.setAttribute('normal',new THREE.BufferAttribute(nor,3));out.setAttribute('uv',new THREE.BufferAttribute(uv,2));out.computeBoundingSphere();return out;
}
function mergeStaticChildren(group,min=3){
  const byMat=new Map();
  /* 只合并"同材质且不带贴图"的静态小件：本工程里反复出现的带贴图件（墙体 / 木料 / 地板）
     都已被上面的 InstancedMesh 合批接管，实测带贴图候选数为 0，故不放开该分支，保持最小改动。 */
  for(const c of group.children){if(!c.isMesh||c.isInstancedMesh||c.visible===false||c.children.length||Array.isArray(c.material))continue;const m=c.material;if(!m||!m.isMeshStandardMaterial||m.transparent||m.map)continue;const list=byMat.get(m)||[];list.push(c);byMat.set(m,list);}
  for(const [m,list] of byMat){
    if(list.length<min)continue;
    const geos=[];let ok=true;
    for(const c of list){const src=c.geometry;const g=src.index?src.toNonIndexed():src.clone();if(!g.attributes.position||!g.attributes.normal||!g.attributes.uv){ok=false;g.dispose();break;}g.applyMatrix4(c.matrix);geos.push(g);}
    if(!ok){for(const g of geos)g.dispose();continue;}
    const merged=concatGeoms(geos);for(const g of geos)g.dispose();
    /* 只有整批成员都带同一个 LOD 距离时才把距离继承给合并体，避免误隐藏非远景件。 */
    const lod=list.every(c=>c.userData.lod===list[0].userData.lod)?list[0].userData.lod:0,cast=list[0].castShadow,recv=list[0].receiveShadow;
    for(const c of list){c.visible=false;c.userData.hidden=true;}
    const mesh=new THREE.Mesh(merged,m);mesh.castShadow=cast;mesh.receiveShadow=recv;if(lod)mesh.userData.lod=lod;
    group.add(mesh);
  }
}
function freezeStatic(world){world.matrixAutoUpdate=false;world.traverse(o=>{o.matrixAutoUpdate=false;});world.traverse(o=>{if(inDynamicSubtree(o,world))o.matrixAutoUpdate=true;});}

export function buildWorld(level){
  const world=new THREE.Group(),blockers=[],lamps=[],props=new Map(),height=3.45,w=level.grid[0].length,h=level.grid.length;
  const floorMat=texture(level.palette.floor,level.id==='garage'?'wall':'tile',w*2,h*2);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(w*TILE,h*TILE),floorMat);floor.rotation.x=-Math.PI/2;floor.position.set((w-1)*TILE/2,0,(h-1)*TILE/2);world.add(floor);
  box(world,w*TILE,.1,h*TILE,texture('#727465','wall',w,h),(w-1)*TILE/2,height,(h-1)*TILE/2);
  const wallMat=texture(level.palette.wall,'wall',1,1),trimMat=texture(level.palette.trim,'wall',1,1);
  for(let z=0;z<h;z++)for(let x=0;x<w;x++){
    const c=level.grid[z][x];if(c==='#'){
      if(![[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>level.grid[z+dz]?.[x+dx]==='.'))continue;
      const wall=box(world,TILE,height,TILE,wallMat,x*TILE,height/2,z*TILE);blockers.push(wall);box(world,TILE+.012,1.1,TILE+.012,trimMat,x*TILE,.55,z*TILE);box(world,TILE+.03,.055,TILE+.03,'#414d3f',x*TILE,1.13,z*TILE);
    } else if(c==='S'){const shelf=bookshelf(world);shelf.position.set(x*TILE,0,z*TILE);blockers.push(...shelf.children.filter(m=>m.geometry));}
    else if(c==='P'){const pillar=box(world,1.15,height,1.15,'#7f8b7e',x*TILE,height/2,z*TILE);blockers.push(pillar);box(world,1.17,.75,1.17,'#a48e4f',x*TILE,.75,z*TILE);for(let i=0;i<4;i++){const stripe=box(world,.18,.72,.01,'#303b33',x*TILE-.44+i*.27,.76,z*TILE+.592);stripe.rotation.z=-.3;}sign(world,'B1\n'+String(x).padStart(2,'0'),.64,.69,x*TILE,2.1,z*TILE+.59,{bg:'#485c52',ink:'#d9d9be'});}
    else if(c==='B'){const b=bed(world);b.position.set(x*TILE,0,z*TILE);}
    else if(c==='D'){makeDesk(world,x*TILE,z*TILE,level.id);chair(world,x*TILE,z*TILE-1.2);if(level.id==='library')lamp(world,x*TILE-.6,.97,z*TILE);}
    if(c==='.'&&x%3===0&&z%4===2){const l=group(world,x*TILE,3.25,z*TILE);box(l,.32,.08,1.4,'#485749');for(const xx of [-.09,.09])box(l,.055,.05,1.25,'#d9ddba',xx,-.06,0,{emissive:'#d9dfae',emissiveIntensity:.35});lamps.push(new THREE.Vector3(x*TILE,2.85,z*TILE));}
  }
  for(const def of level.objects){const g=makeObject(def,level);world.add(g);props.set(def.id,g);}
  if(level.cars)for(const data of level.cars){const c=car(world,data.color,data.plate);c.position.set(data.x*TILE,0,data.z*TILE);blockers.push(...c.children.filter(m=>m.isMesh));}
  if(level.id==='garage'){
    for(let z=3;z<16;z+=6)for(let x=5;x<16;x+=3){box(world,.075,.008,5.5,'#b8b7a0',(x-.5)*TILE,.012,z*TILE);box(world,2.85,.008,.075,'#b8b7a0',x*TILE,.012,(z-1)*TILE);}
    for(let x=2;x<18;x+=5)rod(world,[x*TILE,3.09,1],[x*TILE,3.09,49],.09,'#6d4740');
    for(const x of [13.5,16.5]){cylinder(world,.12,.16,1,'#b6a353',x*TILE,.5,4.5);cylinder(world,.125,.125,.23,'#313d31',x*TILE,.6,4.5);}
    sign(world,'B1   ← 出口\n限 速  5',3.5,.8,27,2.7,7);
  } else if(level.id==='library'){
    sign(world,'临江市职工图书馆\n一九九六年十月',3.4,.85,12,2.5,52.43).rotation.y=Math.PI;
    sign(world,'阅 览 室 ←',2.5,.4,26,2.8,29.8);sign(world,'借 阅 档 案 →',2.4,.4,28,2.8,23.8);
    for(const x of [7,11,15]){const win=group(world,x,2.05,52.45);box(win,2.4,1.55,.07,'#152e2b');for(let i=-1;i<=1;i++)box(win,.045,1.55,.04,'#83917d',i*.75,0,.05);box(win,2.4,.04,.04,'#83917d',0,0,.06);}
  } else {
    sign(world,'住 院 部\n夜间请保持安静',3,.8,27,2.5,52.4).rotation.y=Math.PI;sign(world,'017 病房 ←    → 018 病房',2.8,.38,27,2.85,26.9);
    for(const x of [6,11,16]){chair(world,x*2.5,51.9,Math.PI);chair(world,x*2.5+1,51.9,Math.PI);}
    box(world,9,.75,.26,wallMat,27,3.075,34.5);const clock=group(world,27,2.99,34.72);const face=cylinder(clock,.3,.3,.05,'#d2d0b2',0,0,0,20);face.rotation.x=Math.PI/2;rod(clock,[0,0,.04],[.15,.06,.04],.014,'#384838');rod(clock,[0,0,.04],[.23,-.05,.04],.009,'#384838');
  }
  // Repeated static parts share a GPU draw call. Original meshes retain their
  // world matrices for precise cover raycasts; they are simply not rendered.
  world.updateMatrixWorld(true);world.userData.collisionExtras=[];world.traverse(node=>{if(node.userData.collider){const p=node.getWorldPosition(new THREE.Vector3());world.userData.collisionExtras.push({x:p.x,z:p.z,...node.userData.collider});}});const batches=new Map();
  world.traverse(m=>{if(!m.isMesh||m.isInstancedMesh||m.visible===false)return;if(inDynamicSubtree(m,world))return;const key=m.geometry.uuid+'|'+m.material.uuid;if(!batches.has(key))batches.set(key,[]);batches.get(key).push(m);});
  for(const meshes of batches.values()){if(meshes.length<2)continue;const batch=new THREE.InstancedMesh(meshes[0].geometry,meshes[0].material,meshes.length);meshes.forEach((mesh,i)=>{batch.setMatrixAt(i,mesh.matrixWorld);mesh.visible=false;mesh.userData.hidden=true;});batch.instanceMatrix.needsUpdate=true;batch.computeBoundingSphere();const blod=meshes.every(m=>m.userData.lod===meshes[0].userData.lod)?meshes[0].userData.lod:0;if(blod)batch.userData.lod=blod;batch.userData.batched=true;world.add(batch);}
  // 同一分组内、材质相同的静态小件（书脊 / 格子 / 螺栓）再合并成单一网格，
  // 每个合并体的包围球仍与所在分组同量级，视锥剔除粒度基本不变。
  world.updateMatrixWorld(true);const groups=[];world.traverse(o=>{if(o.isGroup)groups.push(o);});for(const g of groups)mergeStaticChildren(g);
  world.updateMatrixWorld(true);freezeStatic(world);
  return {world,blockers,lamps,props};
}
