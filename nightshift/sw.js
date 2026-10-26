/* sw.js —— 《夜班协议 1996》离线缓存
 * 目标：第二次进入（含离线）不再下载 500KB 的 three 与语言包，直接命中缓存。
 *
 * 策略：
 *  - 导航请求（HTML）：network-first —— 保证发版时立刻拿到新页面，离线才回缓存。
 *  - vendor/three.min.js 与 lang/*.json：cache-first —— 体积最大、内容最稳，命中即秒开。
 *  - 其余同源静态资源（应用 JS/CSS）：network-first —— 修 bug 后不会被缓存卡住。
 *
 * 重要：改动上述「cache-first」文件（three 版本、语言包内容）后必须把 VERSION 加一，
 * 否则老用户会一直用到旧副本。
 */
const ROOT = new URL('./', self.location).pathname;
const CACHE_PREFIX = 'nightshift-1996-scope-' + encodeURIComponent(ROOT) + '-';
const VERSION = CACHE_PREFIX + 'v14';

const PRECACHE = [
  './',
  './index.html',
  './i18n.mjs',
  './storage.mjs',
  './achievements.mjs',
  './achievements.html',
  './lang/zh-CN.json',
  './lang/en-US.json',
  './nightshift-1996/',
  './nightshift-1996/index.html',
  './nightshift-1996/style.css',
  './nightshift-1996/game.mjs',
  './nightshift-1996/startup.mjs',
  './nightshift-1996/challenge.mjs',
  './nightshift-1996/race.mjs',
  './nightshift-1996/levels.mjs',
  './nightshift-1996/models.mjs',
  './nightshift-1996/vendor/three.min.js',
];

const CACHE_FIRST = [ROOT + 'lang/', ROOT + 'nightshift-1996/vendor/'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // 逐个 add：单个资源 404 不会让整次安装失败
    await Promise.all(PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith(CACHE_PREFIX) && n !== VERSION).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

function isCacheFirst(url) {
  return CACHE_FIRST.some((prefix) => url.pathname.startsWith(prefix));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;
  // A controlled game can also fetch /api/race on this origin. Cache only
  // static resources inside this game's scope, never live ranking responses.
  if (!url.pathname.startsWith(ROOT)) return;

  // 导航：network-first
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(VERSION);
        if (res.ok) cache.put(req, res.clone()).catch(() => {});
        return res;
      } catch (e) {
        const cache = await caches.open(VERSION);
        return (await cache.match(req)) || Response.error();
      }
    })());
    return;
  }

  // 大体积静态资源：cache-first，命中后后台顺带更新
  if (isCacheFirst(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const hit = await cache.match(req);
      if (hit) {
        event.waitUntil(fetch(req).then((res) => { if (res && res.ok) return cache.put(req, res.clone()); }).catch(() => {}));
        return hit;
      }
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
        return res;
      } catch (e) {
        return Response.error();
      }
    })());
    return;
  }

  // 其余同源资源：network-first，离线回缓存
  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.ok) {
        const cache = await caches.open(VERSION);
        cache.put(req, res.clone()).catch(() => {});
      }
      return res;
    } catch (e) {
      const cache = await caches.open(VERSION);
      return (await cache.match(req)) || Response.error();
    }
  })());
});
