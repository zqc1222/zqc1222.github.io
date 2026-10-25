// storage.mjs —— 《夜班协议 1996》存储兼容层
// 设计要点：
//   1) 隐私模式 / 禁用 Cookie / 配额耗尽时，localStorage 的 setItem 会抛错。
//      本模块在首次写入失败后自动退回内存 Map，同一会话内进度与设置不丢（刷新后自然无法保留，符合浏览器限制）。
//   2) 读取永远优先 localStorage（若可用），失败或缺失时再取内存镜像，避免「写失败 → 读不到」。
//   3) 不依赖任何现代 API（Object.fromEntries / at / structuredClone 等），老浏览器可直接执行。
//   4) 只在浏览器环境使用；非浏览器环境（如 node 导入）下所有方法返回安全默认值。

const mem = new Map();
let mode = null; // null = 未探测；true = localStorage 可用；false = 内存回退

function probe() {
  if (mode !== null) return mode;
  try {
    const ls = window.localStorage;
    const k = '__nightshift_probe__';
    ls.setItem(k, '1');
    ls.removeItem(k);
    mode = true;
  } catch (e) {
    mode = false;
  }
  return mode;
}

/** 当前实际使用的存储通道：'local' 或 'memory'。 */
export function storageMode() {
  return probe() ? 'local' : 'memory';
}

/** localStorage 是否真正可写（探测一次并缓存）。 */
export function storageAvailable() {
  return probe();
}

export function getItem(key) {
  if (probe()) {
    try {
      const value = window.localStorage.getItem(key);
      if (value !== null) return value;
    } catch (e) { mode = false; }
  }
  return mem.has(key) ? mem.get(key) : null;
}

/** 写入：始终写内存镜像；localStorage 可用时再写一份。返回是否落到了持久存储。 */
export function setItem(key, value) {
  const text = String(value);
  mem.set(key, text);
  if (probe()) {
    try {
      window.localStorage.setItem(key, text);
      return true;
    } catch (e) { mode = false; }
  }
  return false;
}

export function removeItem(key) {
  mem.delete(key);
  if (probe()) {
    try {
      window.localStorage.removeItem(key);
      return true;
    } catch (e) { mode = false; }
  }
  return false;
}