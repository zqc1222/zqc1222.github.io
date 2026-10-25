import {t} from '../i18n.mjs';

export const TILE = 3;
export const SAVE_KEY = 'nightshift-1996-v1';

function plan(w, h, rooms, solids = []) {
  const grid = Array.from({length:h}, () => Array(w).fill('#'));
  for (const [x1,z1,x2,z2] of rooms) for(let z=z1;z<=z2;z++) for(let x=x1;x<=x2;x++) grid[z][x]='.';
  for(const [x,z,type] of solids) grid[z][x]=type;
  return grid;
}
const obj=(id,kind,x,z,title,extra={})=>({id,kind,x,z,title,...extra});

export const LEVELS = [
  {
    id:'library', chapter:'01', title:'归还日', place:'临江市职工图书馆', date:'1996年10月17日 · 23:40',
    tagline:'借走的东西，天亮以前必须归还。', palette:{wall:'#b7aa86', trim:'#514c38', floor:'#696451', fog:0x262921},
    grid:plan(19,20,[[2,11,8,17],[8,2,10,17],[2,3,7,9],[6,9,9,12],[12,3,16,8],[10,6,12,6],[12,11,16,17],[10,13,13,13]],
      [[4,5,'S'],[4,6,'S'],[6,5,'S'],[6,6,'S'],[4,8,'S'],[6,8,'S'],[13,4,'S'],[13,5,'S'],[15,7,'S'],[3,12,'D'],[4,12,'D'],[14,16,'D']]),
    spawn:[4,16], yaw:0, enemySpawn:[9,3], patrolWait:1.6, visionHalfDeg:65,
    patrol:[[9,3],[9,9],[5,9],[7,11],[5,16],[9,13],[14,13]],
    objects:[
      obj('phone','phone',3,13,'接听值班电话',{text:'“别问我怎么知道你的名字，周临。先去西侧阅览室找借阅条，再去东侧卡片柜。广播说什么都别信。……还有，别试着找我的脸。”'}),
      obj('slip','paper',2,4,'查看借阅条',{text:'临江市职工图书馆 · 最后一张借阅条\n借阅人：周临　归还日期：1996.10.17\n\n找书顺序：第二排 → 第七格 → 第一册。\n管理员用相同顺序给卡片柜编号。\n\n背面的小字：拿到钥匙以后不要奔跑，巡夜人会听见。',clue:'卡片柜编号：第二排 → 第七格 → 第一册（271）。'}),
      obj('catalog','catalog',15,4,'拉开卡片柜',{code:'271'}),
      obj('libraryTape','tape',12,7,'听旧录音',{text:'磁带上只有一句话：“如果你正听到我，说明我还来得及。”\n录音的人咳了两声。和你一样，第三声没咳出来。',clue:'电话里的值班员有和你相同的咳嗽习惯。'}),
      obj('hideL1','locker',7,16,'躲进清洁柜',{hide:true}),
      obj('hideL2','locker',2,8,'躲进档案柜',{hide:true}),
      obj('exit','door',15,11,'打开消防通道',{label:'地下停车场 / B1',offsetZ:-1.35}),
      obj('poster','sign',9,2,'夜间借阅须知',{decor:true,label:'夜 间 借 阅\n保持安静  按时归还'}),
      obj('nookL1','shelfNook',7,10,'钻进书架夹缝',{hide:true}),
      obj('doorL','panel',13,13,'开关走廊门',{rotation:Math.PI/2,label:'阅览室 → 走廊'}),
      obj('noticeL','paper',10,14,'查看闭馆通知',{text:'临江市职工图书馆 · 闭馆通知\n\n……夜班期间，禁止在书库内奔跑。\n脚步声会被“巡夜人”听见。\n若听见它的脚步停在门口，请屏住呼吸。\n\n（下面有一行铅笔字）它看不见你的时候，会走来走去地找。',clue:'巡夜人靠声音和视线找人；跟丢后会在附近来回搜索。'}),
      obj('ledgerL','tape',16,13,'听夜班记录',{text:'磁带转到一半才有人声：“……十月十七号，第三十七个夜班。书库的书自己在挪位置。”\n“我把它关在架子后面过。别跑，跑起来它一定能听见。”',clue:'奔跑会明显惊动巡夜人。'}),
      obj('canL1','can',5,13,'拾起易拉罐'),
      obj('canL2','can',5,15,'拾起易拉罐'),
    ],
    intro:['你不是值班员。你只是来取回一本忘在图书馆的书。','门在身后锁上。电话响了。有人准确地叫出了你的名字。'],
    tasks:['接听借阅台电话','去西侧阅览室找借阅条','打开东侧卡片柜','带着钥匙穿过消防通道'],
  },
  {
    id:'garage', chapter:'02', title:'末班车', place:'市立医院 · 地下停车场', date:'1996年10月18日 · 00:56',
    tagline:'有些车停在这里，从来不是为了等人。', palette:{wall:'#8d9392',trim:'#3e5554',floor:'#555a58',fog:0x202a2b},
    grid:plan(19,18,[[1,1,17,16]],[[4,4,'P'],[10,4,'P'],[16,4,'P'],[4,9,'P'],[10,9,'P'],[16,9,'P'],[4,14,'P'],[10,14,'P'],[6,4,'C'],[6,5,'C'],[12,4,'C'],[12,5,'C'],[6,10,'C'],[6,11,'C'],[14,11,'C'],[14,12,'C'],[9,12,'C'],[9,13,'C'],[2,13,'D']]),
    spawn:[3,15],yaw:0,enemySpawn:[14,3],patrolWait:1.4,visionHalfDeg:68,
    patrol:[[14,3],[14,8],[11,11],[11,15],[3,10],[3,3]],
    cars:[{x:6,z:4.5,color:'#e0d4b2',plate:'临 A·0291'},{x:12,z:4.5,color:'#4e5a50',plate:'临 A·3117'},{x:6,z:10.5,color:'#633b36',plate:'临 A·0882'},{x:14,z:11.5,color:'#c0c5b8',plate:'临 A·0619',target:true},{x:9,z:12.5,color:'#303d4b',plate:'临 A·1710'}],
    objects:[
      obj('garageNote','paper',2,12,'查看交接记录',{text:'1996.10.17　停车场交接\n白色轿车，车牌尾号 0619。备用保险芯放在驾驶座。\n\n供电顺序：排风必须开；监控已经损坏，务必关闭；最后给卷帘门供电。\n\n值班员留话：摇门的声音会引来它。蓝车喇叭还能用，先把它引远。',clue:'白车 0619 有保险芯。配电：排风开 / 监控关 / 卷帘门开。蓝车喇叭可以引开巡逻者。'}),
      obj('fuse','carDoor',13,12,'打开 0619 驾驶座',{visual:false}),
      obj('horn','horn',8,13,'按响蓝车喇叭',{visual:false}),
      obj('power','power',2,2,'操作配电箱'),
      obj('crank','crank',15,3,'转动卷帘门手轮'),
      obj('hideG1','locker',2,6,'躲进维修柜',{hide:true}),
      obj('hideG2','locker',17,12,'躲进消防柜',{hide:true}),
      obj('exit','shutter',15,1,'穿过急救通道',{label:'急 救 电 梯',offsetZ:-1.35}),
      obj('garagePhone','phone',3,12,'接听保安台电话',{text:'“保险芯在 0619。不要打开别的车门。听我说，门摇到一半停下也没关系。找个地方躲好，它走了再继续。”'}),
      obj('nookG1','shelfNook',1,8,'钻进维修架夹缝',{hide:true}),
      obj('doorG','panel',12,7,'开关行车道门',{label:'坡道 → 值班室'}),
      obj('oilNote','paper',16,14,'查看加油记录',{text:'1996.10.17　油料与值班记录\n02:40　给值班室皮卡加油，顺手把剩下的机油桶摞在维修架后面。\n\n（空白处潦草的铅笔字）它会被响声引开。铁罐砸在远处的地上，它就往那边走。',clue:'可以把易拉罐扔到远处，把巡查者引走。'}),
      obj('shiftTape','tape',3,3,'听交班录音',{text:'磁带里只有排风机的风声，和一句被剪断的话：“……别在它面前开门，门轴的声音会把它叫回来。”',clue:'开关门的声音也会吸引巡查者。'}),
      obj('canG1','can',7,7,'拾起易拉罐'),
      obj('canG2','can',11,7,'拾起易拉罐'),
    ],
    intro:['楼梯的尽头是一座地下停车场。所有车牌都停留在同一年。','电梯里传来呼吸声。值班员说，那只是排风机。'],
    tasks:['阅读保安台交接记录','在白色 0619 轿车里取保险芯','接通排风和卷帘门电路','用手轮摇开卷帘门，然后离开'],
  },
  {
    id:'hospital', chapter:'03', title:'交接班', place:'市立医院 · 停用住院部', date:'1996年10月18日 · 02:17',
    tagline:'如果值班员的声音是你的，千万别去确认他的脸。',palette:{wall:'#c9c9ad',trim:'#668f81',floor:'#82998e',fog:0x243630},
    grid:plan(19,20,[[2,12,16,17],[8,2,10,17],[2,3,6,9],[7,6,11,6],[12,3,16,9]],[[3,4,'B'],[3,7,'B'],[6,4,'B'],[6,7,'B'],[13,4,'B'],[16,4,'B'],[13,8,'B'],[16,8,'B'],[3,14,'D'],[4,14,'D'],[13,16,'B']]),
    spawn:[9,17],yaw:0,duplicateSpawn:[14,6],
    objects:[
      obj('hospitalPhone','phone',5,14,'接听护士站电话',{text:'“先去左侧病房看你的病历。右侧病房的隔帘，可以从走廊拉上。恢复照明之后，不管听到什么，都不要看进去。”'}),
      obj('chart','chart',2,5,'查看 017 号病历',{text:'市立医院 · 留观记录\n姓名：周临　年龄：24　职业：设备检修\n特征：左眉旧伤，蓝色工装。\n入院时间：1996.10.18　02:17\n\n医生附记：同一条时间线上出现了两个实体。两者一旦发生直接目视，后到者将被抹除。照片和录音不受影响。\n\n纸张背面是你自己的字：先拉上右侧隔帘，再恢复电力。别让帮助你的人看见你。',clue:'病历上的人是我。活体的另一个我：直视会死。墙和关闭的隔帘能遮挡；照片、录音安全。'}),
      obj('curtain','curtain',11,6,'拉上右侧病房隔帘',{rotation:-Math.PI/2}),
      obj('hospitalPower','power',9,11,'恢复住院部电力'),
      obj('record','tape',15,14,'取走交接磁带'),
      obj('radio','radio',9,3,'接通过去的内线'),
      obj('hideH','locker',6,16,'躲进被服柜',{hide:true}),
      obj('exit','door',9,2,'离开住院部',{label:'出 院 通 道',offsetZ:-1.35}),
      obj('nookH1','shelfNook',2,16,'钻进器械架夹缝',{hide:true}),
      obj('doorH','panel',8,12,'开关病房门',{label:'走廊 → 病房'}),
      obj('wardNote','paper',16,16,'查看值班留言',{text:'护士站 · 夜班留言\n\n02:10　左边病房的病人又醒了，一直问“另一个我”在哪。\n02:15　右侧病房的隔帘拉上了。走廊的灯还是坏的。\n\n（背面一行）如果有两个脚步声，其中一个是你的回音。',clue:'住院部里可能存在两个“你”：直视会死。'}),
      obj('logH','tape',13,3,'听夜间值班录音',{text:'录音里有翻纸声和自己的呼吸。倒数第二句是：“……如果值班员的声音是你的，千万别去确认他的脸。”',clue:'不要确认值班员的脸。'}),
      obj('canH1','can',12,13,'拾起易拉罐'),
      obj('canH2','can',4,16,'拾起易拉罐'),
    ],
    intro:['电梯停在没有按钮的一层。墙上的钟坏在 02:17。','电话里的人喘着气：“最后一次，照我说的做。别回头找我。”'],
    tasks:['去左侧病房查看 017 号病历','拉上右侧隔帘，再恢复照明','返回护士站取交接磁带','把声音送回过去，然后作出选择'],
  },
];

export function isFloor(level,x,z) { return level.grid[z]?.[x] === '.'; }
export function worldCell(x,z) { return [Math.floor(x/TILE+.5),Math.floor(z/TILE+.5)]; }
export function pathfind(level,start,end,extraBlocked=new Set()) {
  const key=(x,z)=>`${x},${z}`, queue=[start], parents=new Map([[key(...start),null]]);
  if(!isFloor(level,...end)||extraBlocked.has(key(...end)))return [];
  for(let i=0;i<queue.length;i++) {
    const [x,z]=queue[i]; if(x===end[0]&&z===end[1]) {
      const out=[];let p=[x,z];while(p){out.push(p);p=parents.get(key(...p));}return out.reverse();
    }
    for(const [dx,dz] of [[0,-1],[1,0],[0,1],[-1,0]]) {
      const nx=x+dx,nz=z+dz,k=key(nx,nz);
      if(isFloor(level,nx,nz)&&!parents.has(k)&&!extraBlocked.has(k)){parents.set(k,[x,z]);queue.push([nx,nz]);}
    }
  }
  return [];
}

export function currentObjective(index, flags) {
  if(index===0) return flags.key ? ['exit',t('南侧消防通道 · 离开图书馆')] : flags.slip ? ['catalog',t('东侧卡片柜 · 找到消防钥匙')] : !flags.phone ? ['phone',t('接听借阅台电话')] : ['slip',t('西侧阅览室 · 寻找借阅条')];
  if(index===1) return flags.gate ? ['exit',t('卷帘门已经开启 · 进入急救电梯')] : flags.power ? ['crank',t('急救通道 · 按住 E 摇开卷帘门')] : flags.fuse ? ['power',t('西北角配电箱 · 恢复线路')] : flags.garageNote ? ['fuse',t('白色轿车 0619 · 取保险芯')] : ['garageNote',t('保安台 · 阅读交接记录')];
  return flags.broadcast ? ['exit',t('出院通道已开 · 作出你的选择')] : flags.record ? ['radio',t('走廊尽头 · 接通过去的内线')] : flags.hospitalPower ? ['record',t('护士站东侧 · 取交接磁带')] : flags.chart ? [flags.curtainClosed?'hospitalPower':'curtain',t(flags.curtainClosed?'走廊电箱 · 恢复住院部照明':'右侧病房 · 先拉上隔帘')] : ['chart',t('左侧病房 · 查看 017 号病历')];
}