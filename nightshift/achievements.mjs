// achievements.mjs —— 《夜档》统一成就系统（跨作品共用一份存档）
// 设计要点：
//   1) 一份统一的成就存档（键 nightshift-achievements），站点内所有作品共用；条目按 category 归类、
//      用 game 标注归属作品，以后新增作品只需在本文件追加条目，不必再动存档结构。
//   2) 持久化经 storage.mjs 兼容层：localStorage 不可用时自动退回内存镜像，不抛错、不丢当前会话进度。
//   3) 条目文案一律使用源文键（中文原文），展示层交给 i18n 的 t()；本模块不触碰 DOM，可在任意环境导入。
//   4) 可重置（resetAchievements）、可导出（exportJSON）与导入（importJSON），便于迁移与排查。
//   5) "全收集"类的目标集合由 LEVELS 现算（NOTE_IDS / CAN_IDS / NOOK_IDS），避免与关卡改动脱节。
//
// 重要事实（决定了条目口径）：工程精简后，《夜班协议》文字版与《遗言回廊》已删除，
// 现存作品只有《夜班协议 1996》三章版与入口页。因此原设计要求里依赖已删除作品的条目
// （写下 100 字遗言、连玩 3 局《遗言回廊》、文字版完美救援等）无法落地，已在下方注释中说明替代口径。

import { getItem, setItem, removeItem } from './storage.mjs';
import { LEVELS } from './nightshift-1996/levels.mjs';

export const ACHV_KEY = 'nightshift-achievements';
export const ACHV_VERSION = 1;
export const ACHV_GAME = 'nightshift-1996';
export const ACHV_CATEGORIES = ['探索', '技巧', '收集', '特殊'];

/* -------------------------------------------------------------------------
 * 从关卡数据推导"全收集"目标集合
 * ---------------------------------------------------------------------- */

function idsOfKind(kind) {
  const out = [];
  for (const lv of LEVELS) for (const o of lv.objects) if (o.kind === kind && !o.decor) out.push(o.id);
  return out;
}

/* 抄进手记的记录 id：与 game.mjs 里 addNote 的调用点一一对应。
   - 电话 / 病历：各自分支直接 addNote(o.id)
   - 纸类与磁带：除交接磁带（record）外走通用分支 addNote(o.id)
   - 谜题与终局：key / fuse / power / gate / record / hospitalPower / broadcast 由具体流程 addNote */
function noteIdsOf() {
  const out = [];
  for (const lv of LEVELS) for (const o of lv.objects) {
    if (o.decor) continue;
    if (o.kind === 'phone' || o.kind === 'chart') out.push(o.id);
    else if ((o.kind === 'paper' || o.kind === 'tape') && o.id !== 'record' && o.text) out.push(o.id);
  }
  out.push('key', 'fuse', 'power', 'gate', 'record', 'hospitalPower', 'broadcast');
  return out;
}

export const NOTE_IDS = noteIdsOf();
export const CAN_IDS = idsOfKind('can');
export const NOOK_IDS = idsOfKind('shelfNook');
/* 非致命惊扰的四种：抽屉(第一章)、车库(第二章)、病房(第三章)、镜像(第三章) */
export const SCARE_KINDS = ['drawer', 'car', 'ward', 'duplicate'];
/* 现有两个结局：天亮之前 / 值班员 */
export const ENDING_KINDS = ['dawn', 'operator'];
export const HIDE_GOAL = 5;
export const THROW_GOAL = 10;

/* -------------------------------------------------------------------------
 * 成就条目：四个类别 × 三个条目
 * ---------------------------------------------------------------------- */

export const ACHIEVEMENTS = [
  /* —— 探索类 —— */
  {
    id: 'exp_first_night', category: '探索', game: ACHV_GAME, icon: '🌙',
    name: '首次夜班',
    desc: '完成任意一章夜班，把这一夜写进档案。',
  },
  {
    id: 'exp_all_endings', category: '探索', game: ACHV_GAME, icon: '🌅',
    name: '两条出路',
    desc: '看完《夜班协议》的全部两个结局：天亮之前，与留下来当值班员。',
  },
  {
    id: 'exp_hidden', category: '探索', game: ACHV_GAME, icon: '📚',
    name: '夹缝求生',
    desc: '在全部三章里，各钻进一次书架或器械架的夹缝藏身。',
  },
  /* —— 技巧类 —— */
  {
    id: 'skl_no_hint', category: '技巧', game: ACHV_GAME, icon: '🧭',
    name: '不问路',
    desc: '不使用引路提示，完成任意一章夜班。',
  },
  {
    id: 'skl_no_death', category: '技巧', game: ACHV_GAME, icon: '🩹',
    name: '毫发无伤',
    desc: '在一次都没有失败的情况下，完成任意一章夜班。',
  },
  {
    id: 'skl_perfect', category: '技巧', game: ACHV_GAME, icon: '🛡️',
    name: '完美救援',
    desc: '零失败、也没有用过引路提示，完成一整章夜班。',
  },
  /* —— 收集类 —— */
  {
    id: 'col_notes', category: '收集', game: ACHV_GAME, icon: '📁',
    name: '档案全收',
    desc: '把三章里能抄进手记的记录全部收齐。',
  },
  {
    id: 'col_cans', category: '收集', game: ACHV_GAME, icon: '🥫',
    name: '罐子收容',
    desc: '拾起夜班三章里散落的全部六个空罐。',
  },
  {
    id: 'col_ckpt', category: '收集', game: ACHV_GAME, icon: '🔖',
    name: '不放过线索',
    desc: '在一章之内达成全部检查点。',
  },
  /* —— 特殊类 —— */
  {
    id: 'sp_hide5', category: '特殊', game: ACHV_GAME, icon: '🚪',
    name: '五度藏身',
    desc: '累计躲进柜子或夹缝五次。',
  },
  {
    id: 'sp_throw10', category: '特殊', game: ACHV_GAME, icon: '🎯',
    name: '十次抛掷',
    desc: '累计扔出十个空罐，把巡查者引开。',
  },
  {
    id: 'sp_scares', category: '特殊', game: ACHV_GAME, icon: '👁️',
    name: '夜班全貌',
    desc: '亲历夜班里的全部四种惊扰：抽屉、车库、病房与镜像。',
  },
];

const BY_ID = {};
for (const a of ACHIEVEMENTS) BY_ID[a.id] = a;

export function getById(id) { return BY_ID[id] || null; }

/* -------------------------------------------------------------------------
 * 存档状态与读写
 * ---------------------------------------------------------------------- */

const state = {
  version: ACHV_VERSION,
  updated: 0,
  unlocked: {},   // id -> { at }
  counters: {},   // hide / throw / deaths / chapters
  notes: {},      // 已抄进手记的记录 id
  cans: {},       // 已拾起的空罐 id
  nooks: {},      // 已用过的夹缝 id
  scares: {},     // 亲历过的惊扰类型
  endings: {},    // 已看过的结局
  cleared: {},    // 已完成的章节下标
};

let loaded = false;

function isPlainObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

function numMap(raw) {
  const out = {};
  if (!isPlainObject(raw)) return out;
  for (const k in raw) {
    if (!Object.prototype.hasOwnProperty.call(raw, k)) continue;
    const n = Number(raw[k]);
    if (Number.isFinite(n) && n > 0) out[k] = n;
  }
  return out;
}

function flagMap(raw) {
  const out = {};
  if (!isPlainObject(raw)) return out;
  for (const k in raw) {
    if (!Object.prototype.hasOwnProperty.call(raw, k)) continue;
    if (raw[k]) out[k] = 1;
  }
  return out;
}

function hydrate(raw) {
  const r = isPlainObject(raw) ? raw : {};
  state.version = ACHV_VERSION;
  state.unlocked = {};
  if (isPlainObject(r.unlocked)) {
    for (const id in r.unlocked) {
      if (!Object.prototype.hasOwnProperty.call(r.unlocked, id)) continue;
      if (!BY_ID[id]) continue; // 丢弃已经不存在（被删掉）的条目
      const at = r.unlocked[id] && Number(r.unlocked[id].at);
      state.unlocked[id] = { at: Number.isFinite(at) ? at : 0 };
    }
  }
  state.counters = numMap(r.counters);
  state.notes = flagMap(r.notes);
  state.cans = flagMap(r.cans);
  state.nooks = flagMap(r.nooks);
  state.scares = flagMap(r.scares);
  state.endings = flagMap(r.endings);
  state.cleared = flagMap(r.cleared);
  const u = Number(r.updated);
  state.updated = Number.isFinite(u) ? u : 0;
}

/** 读取成就存档；首次调用时从存储载入，之后返回内存中的同一份状态。 */
export function loadAchievements(force) {
  if (loaded && !force) return state;
  let raw = null;
  try { raw = JSON.parse(getItem(ACHV_KEY) || 'null'); } catch (e) { raw = null; }
  hydrate(raw);
  loaded = true;
  return state;
}

/** 写入成就存档。localStorage 不可用时由 storage.mjs 退回内存镜像，不影响本次会话。 */
export function saveAchievements() {
  state.updated = Date.now();
  try { return setItem(ACHV_KEY, JSON.stringify(snapshot())); } catch (e) { return false; }
}

/** 纯数据快照（导出、克隆都走它，避免外部直接改到内部状态）。 */
export function snapshot() {
  return {
    version: ACHV_VERSION,
    updated: state.updated,
    unlocked: JSON.parse(JSON.stringify(state.unlocked)),
    counters: Object.assign({}, state.counters),
    notes: Object.assign({}, state.notes),
    cans: Object.assign({}, state.cans),
    nooks: Object.assign({}, state.nooks),
    scares: Object.assign({}, state.scares),
    endings: Object.assign({}, state.endings),
    cleared: Object.assign({}, state.cleared),
  };
}

/* -------------------------------------------------------------------------
 * 解锁
 * ---------------------------------------------------------------------- */

/** 解锁一条成就；已解锁则返回 false。 */
export function unlock(id) {
  const def = BY_ID[id];
  if (!def || state.unlocked[id]) return false;
  loadAchievements();
  state.unlocked[id] = { at: Date.now() };
  saveAchievements();
  return true;
}

export function isUnlocked(id) { loadAchievements(); return !!state.unlocked[id]; }
export function unlockedAt(id) { loadAchievements(); return state.unlocked[id] ? state.unlocked[id].at : 0; }
export function isAnyUnlocked() { loadAchievements(); return Object.keys(state.unlocked).length > 0; }

function allOf(ids, bag) {
  for (let i = 0; i < ids.length; i += 1) if (!bag[ids[i]]) return false;
  return ids.length > 0;
}
function countOf(ids, bag) {
  let n = 0;
  for (let i = 0; i < ids.length; i += 1) if (bag[ids[i]]) n += 1;
  return n;
}

/* -------------------------------------------------------------------------
 * 触发接口：每个函数返回"本次新解锁的条目 id 数组"，供调用方提示
 * ---------------------------------------------------------------------- */

/** 记数类事件（hide / throw / deaths）。返回新解锁的条目。 */
export function countEvent(key, n) {
  loadAchievements();
  const step = Number.isFinite(Number(n)) && Number(n) > 0 ? Number(n) : 1;
  state.counters[key] = (state.counters[key] || 0) + step;
  const out = [];
  if (key === 'hide' && state.counters.hide >= HIDE_GOAL && unlock('sp_hide5')) out.push('sp_hide5');
  if (key === 'throw' && state.counters.throw >= THROW_GOAL && unlock('sp_throw10')) out.push('sp_throw10');
  saveAchievements();
  return out;
}

/** 抄进一条手记记录。 */
export function noteCollected(id) {
  loadAchievements();
  if (!id || state.notes[id]) return [];
  state.notes[id] = 1;
  const out = [];
  if (allOf(NOTE_IDS, state.notes) && unlock('col_notes')) out.push('col_notes');
  saveAchievements();
  return out;
}

/** 拾起一个空罐。 */
export function canCollected(id) {
  loadAchievements();
  if (!id || state.cans[id]) return [];
  state.cans[id] = 1;
  const out = [];
  if (allOf(CAN_IDS, state.cans) && unlock('col_cans')) out.push('col_cans');
  saveAchievements();
  return out;
}

/** 用过一处"夹缝"藏身点。 */
export function nookCollected(id) {
  loadAchievements();
  if (!id || state.nooks[id]) return [];
  state.nooks[id] = 1;
  const out = [];
  if (allOf(NOOK_IDS, state.nooks) && unlock('exp_hidden')) out.push('exp_hidden');
  saveAchievements();
  return out;
}

/** 亲历一次非致命惊扰。 */
export function scareSeen(kind) {
  loadAchievements();
  if (!kind || state.scares[kind]) return [];
  state.scares[kind] = 1;
  const out = [];
  if (allOf(SCARE_KINDS, state.scares) && unlock('sp_scares')) out.push('sp_scares');
  saveAchievements();
  return out;
}

/** 看过一个结局。 */
export function endingSeen(kind) {
  loadAchievements();
  if (!kind || state.endings[kind]) return [];
  state.endings[kind] = 1;
  const out = [];
  if (allOf(ENDING_KINDS, state.endings) && unlock('exp_all_endings')) out.push('exp_all_endings');
  saveAchievements();
  return out;
}

/** 完成一章。 */
export function chapterCleared(index) {
  loadAchievements();
  const key = String(index | 0);
  const out = [];
  state.cleared[key] = 1;
  if (Object.keys(state.cleared).length > 0 && unlock('exp_first_night')) out.push('exp_first_night');
  saveAchievements();
  return out;
}

/** 一章结束时结算"零失败 / 不使用引路 / 完美救援"。run = {deaths, hintUsed} */
export function runFinished(run) {
  loadAchievements();
  const deaths = run && Number(run.deaths) ? Number(run.deaths) : 0;
  const hint = !!(run && run.hintUsed);
  const out = [];
  if (deaths === 0 && unlock('skl_no_death')) out.push('skl_no_death');
  if (!hint && unlock('skl_no_hint')) out.push('skl_no_hint');
  if (deaths === 0 && !hint && unlock('skl_perfect')) out.push('skl_perfect');
  saveAchievements();
  return out;
}

/** 一章内达成全部检查点。 */
export function checkpointDone() {
  loadAchievements();
  const out = [];
  if (unlock('col_ckpt')) out.push('col_ckpt');
  saveAchievements();
  return out;
}

/* -------------------------------------------------------------------------
 * 进度 / 重置 / 导出
 * ---------------------------------------------------------------------- */

const GOALS = {
  col_notes: [NOTE_IDS, 'notes'],
  col_cans: [CAN_IDS, 'cans'],
  exp_hidden: [NOOK_IDS, 'nooks'],
  sp_scares: [SCARE_KINDS, 'scares'],
  exp_all_endings: [ENDING_KINDS, 'endings'],
};

/** 某条成就的收集进度（没有可量化进度的条目返回 null）。 */
export function progressOf(id) {
  loadAchievements();
  if (id === 'sp_hide5') return { current: Math.min(state.counters.hide || 0, HIDE_GOAL), goal: HIDE_GOAL };
  if (id === 'sp_throw10') return { current: Math.min(state.counters.throw || 0, THROW_GOAL), goal: THROW_GOAL };
  const g = GOALS[id];
  if (!g) return null;
  const ids = g[0], bag = state[g[1]];
  return { current: countOf(ids, bag), goal: ids.length };
}

export function isUnlockedSafe(id) { return isUnlocked(id); }

/** 条目清单（含解锁状态与进度），供成就面板与展示页直接渲染。 */
export function list() {
  loadAchievements();
  const out = [];
  for (const a of ACHIEVEMENTS) {
    out.push({
      id: a.id, category: a.category, game: a.game, icon: a.icon,
      name: a.name, desc: a.desc,
      unlocked: !!state.unlocked[a.id],
      at: state.unlocked[a.id] ? state.unlocked[a.id].at : 0,
      progress: progressOf(a.id),
    });
  }
  return out;
}

/** 汇总进度：总数、已解锁数、按类别细分。 */
export function progress() {
  loadAchievements();
  let total = 0;
  const byCategory = {};
  for (const c of ACHV_CATEGORIES) byCategory[c] = { unlocked: 0, total: 0 };
  for (const a of ACHIEVEMENTS) {
    total += 1;
    if (!byCategory[a.category]) byCategory[a.category] = { unlocked: 0, total: 0 };
    byCategory[a.category].total += 1;
    if (state.unlocked[a.id]) byCategory[a.category].unlocked += 1;
  }
  return { unlocked: Object.keys(state.unlocked).length, total, byCategory };
}

/** 统计信息（用于导出与排查）。 */
export function stats() {
  loadAchievements();
  return Object.assign({}, state.counters);
}

/** 清空全部成就进度（解锁、计数、收集标记），返回重置后的快照。 */
export function resetAchievements() {
  loadAchievements();
  state.unlocked = {};
  state.counters = {};
  state.notes = {};
  state.cans = {};
  state.nooks = {};
  state.scares = {};
  state.endings = {};
  state.cleared = {};
  try { removeItem(ACHV_KEY); } catch (e) { /* storage.mjs 已兜底 */ }
  saveAchievements();
  return snapshot();
}

/** 导出为可读 JSON 文本。 */
export function exportJSON() {
  loadAchievements();
  return JSON.stringify(snapshot(), null, 2);
}

/** 从 JSON 文本导入（合并式恢复）；成功返回 true。 */
export function importJSON(text) {
  let raw = null;
  try { raw = JSON.parse(String(text)); } catch (e) { return false; }
  if (!isPlainObject(raw)) return false;
  hydrate(raw);
  loaded = true;
  saveAchievements();
  return true;
}

/** 供展示页读取的存储键说明（不参与逻辑）。 */
export const STORAGE_NOTE = '成就进度保存在 localStorage["' + ACHV_KEY + '"]，可随时重置或导出。';