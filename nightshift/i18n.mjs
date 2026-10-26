// i18n.mjs —— 《夜班协议 1996》/《夜档》中英双语运行时
// 设计要点：
//   1) 以中文原文作为 gettext 风格的 key。中文版返回 key 本身，英文版查表，缺失时回退中文原文。
//   2) 语言选择持久化在 localStorage['nightshift-lang']（经 storage.mjs 兼容层），并同步 <html lang> 与 data-lang。
//   3) 语言包放在 ./lang/*.json，相对本模块解析，入口页与游戏页共用同一套。
//   4) 全部离线运行：fetch 失败（例如 file:// 打开）时静默回退中文，不产生控制台报错。

import { getItem, setItem } from './storage.mjs';

export const LANG_KEY = 'nightshift-lang';
export const DEFAULT_LANG = 'zh-CN';
export const LANGS = {
  'zh-CN': { file: 'zh-CN.json', html: 'zh-CN', label: '中文' },
  'en-US': { file: 'en-US.json', html: 'en-US', label: 'English' },
};

const CJK = /[\u2E80-\u9FFF\u3000-\u303F\uFF00-\uFFEF]/;

/** 判断字符串是否含中日韩字符（供 canvas 标牌选择字体、以及校验脚本使用）。 */
export function hasCJK(value) {
  return CJK.test(String(value == null ? '' : value));
}

let lang = DEFAULT_LANG;
const dict = { 'zh-CN': null, 'en-US': null };
let ready = false;

function readStored() {
  try {
    const stored = getItem(LANG_KEY);
    if (stored && Object.prototype.hasOwnProperty.call(LANGS, stored)) return stored;
  } catch (e) { /* 隐私模式下 localStorage 不可用 */ }
  return DEFAULT_LANG;
}

function syncHtml() {
  try {
    const root = document.documentElement;
    root.lang = LANGS[lang].html;
    root.setAttribute('data-lang', lang);
  } catch (e) { /* 非浏览器环境 */ }
}

/**
 * 按需加载语言包：只拉当前语言这一份，首屏不再白下另一份（约省 43–46 KB）。
 * 失败（离线 / file:// / 解析失败）时静默返回 null，调用方回退中文原文。
 * 结果缓存在内存 dict 中，重复调用不会重复请求；HTTP 缓存交给浏览器（不再强制 no-store）。
 */
export async function ensureLang(code) {
  if (!Object.prototype.hasOwnProperty.call(LANGS, code)) return null;
  if (dict[code]) return dict[code];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const url = new URL('./lang/' + LANGS[code].file, import.meta.url);
    const res = await fetch(url, {signal: controller.signal});
    if (!res || !res.ok) return null;
    const data = await res.json();
    if (data && typeof data === 'object' && !Array.isArray(data)) dict[code] = data;
  } catch (e) { /* 离线、超时或解析失败：回退中文，不能卡住整个游戏。 */ }
  finally { clearTimeout(timeout); }
  return dict[code];
}

/** 读取当前语言包；失败时 dict 保持 null，t() 自动回退中文原文。 */
export async function initI18n() {
  lang = readStored();
  syncHtml();
  await ensureLang(lang);
  ready = true;
  return lang;
}

export function isReady() { return ready; }
export function getLang() { return lang; }
export function langName(code) { return LANGS[code || lang].label; }
/** 语言切换按钮上应显示的名字：中文界面显示 English，英文界面显示 中文。 */
export function switchLabel() { return lang === 'zh-CN' ? 'English' : '中文'; }

/** 切换语言：写入存储（localStorage 不可用时自动退回内存）、同步 <html>，返回新语言。不负责重排 DOM。 */
export function setLang(next) {
  lang = Object.prototype.hasOwnProperty.call(LANGS, next) ? next : DEFAULT_LANG;
  setItem(LANG_KEY, lang);
  syncHtml();
  return lang;
}

export function toggleLang() {
  return setLang(lang === 'zh-CN' ? 'en-US' : 'zh-CN');
}

function interpolate(text, vars) {
  return String(text).replace(/\{(\w+)\}/g, (m, key) =>
    vars && Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : m);
}

/**
 * 取词。key 为中文原文；vars 支持 {name} 占位。
 * 英文条目缺失时回退中文原文，保证界面永远不出现空白。
 */
export function t(key, vars) {
  if (key == null) return key;
  const source = String(key);
  const table = dict[lang];
  let out = source;
  if (table && Object.prototype.hasOwnProperty.call(table, source)) out = table[source];
  if (vars) out = interpolate(out, vars);
  return out;
}

// ---------------------------------------------------------------------------
// DOM 走查式翻译：文本节点 + 少量属性；原文第一次访问时存回，支持双向实时切换。
// （LEVELS 关卡数据保留中文键，翻译只发生在展示层 t()，因此不再需要就地深改写。）
// ---------------------------------------------------------------------------

const TEXT_ORIG = new WeakMap();
const ATTR_ORIG = new WeakMap();
const I18N_ATTRS = ['aria-label', 'aria-valuetext', 'placeholder', 'title', 'alt', 'content'];
const SKIP_TAGS = { SCRIPT: 1, STYLE: 1, CANVAS: 1, TEXTAREA: 1 };

function skipElement(node) {
  if (!node || node.nodeType !== 1) return false;
  if (node.hasAttribute && node.hasAttribute('data-i18n-skip')) return true;
  return Object.prototype.hasOwnProperty.call(SKIP_TAGS, node.tagName || '');
}

function insideSkipped(node, scope) {
  let p = node.parentNode;
  while (p && p !== scope) {
    if (skipElement(p)) return true;
    p = p.parentNode;
  }
  return false;
}

function attrDefault(raw) {
  return raw == null ? '' : String(raw);
}

function replaceOnce(raw, needle, out) {
  if (!needle || raw.indexOf(needle) === -1) return raw;
  return raw.replace(needle, () => out);
}

function translateAttrs(el) {
  if (!el.getAttribute) return;
  let store = ATTR_ORIG.get(el);
  if (!store) { store = {}; ATTR_ORIG.set(el, store); }
  for (let i = 0; i < I18N_ATTRS.length; i += 1) {
    const name = I18N_ATTRS[i];
    if (!el.hasAttribute(name)) continue;
    if (!Object.prototype.hasOwnProperty.call(store, name)) store[name] = attrDefault(el.getAttribute(name));
    const raw = attrDefault(store[name]);
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const out = replaceOnce(raw, trimmed, t(trimmed));
    if (el.getAttribute(name) !== out) el.setAttribute(name, out);
  }
}

function translateText(node) {
  let raw = TEXT_ORIG.get(node);
  if (raw === undefined) { raw = node.nodeValue; TEXT_ORIG.set(node, raw); }
  if (raw == null) return;
  const trimmed = String(raw).trim();
  if (!trimmed) return;
  const out = replaceOnce(raw, trimmed, t(trimmed));
  if (node.nodeValue !== out) node.nodeValue = out;
}

/**
 * 走查 root 子树并翻译。可重复调用：原文已缓存，中↔英双向切换都从原文重新取词。
 */
export function applyI18n(root) {
  const scope = root || (typeof document !== 'undefined' ? document.documentElement : null);
  if (!scope || !scope.nodeType) return;
  const doc = scope.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!doc) return;

  if (scope.nodeType === 1) translateAttrs(scope);
  const all = scope.querySelectorAll ? scope.querySelectorAll('*') : [];
  for (let i = 0; i < all.length; i += 1) {
    const el = all[i];
    if (skipElement(el)) continue;
    translateAttrs(el);
  }

  if (!doc.createTreeWalker) return;
  const walker = doc.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!String(node.nodeValue || '').trim()) return NodeFilter.FILTER_REJECT;
      return insideSkipped(node, scope) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  const pending = [];
  let node = walker.nextNode();
  while (node) { pending.push(node); node = walker.nextNode(); }
  for (let i = 0; i < pending.length; i += 1) translateText(pending[i]);
}
