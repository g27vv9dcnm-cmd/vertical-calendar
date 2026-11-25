/* オフラインでも起動できるように、アプリ本体を端末に保存しておく。
   - ページ（index.html）と設定（/__/firebase/init.json）は、まずネットから取り、つながらなければ保存した分を出す
   - Firebase の部品・QR読み取り・アイコンは保存した分を使う（ファイル名に版が入っているので古くならない）
   - 写真は一度表示したものを保存しておく
   - ログイン（/__/auth/）と Firestore・ログインの通信には手を出さない */
const VERSION = "vcal-1";
const JSQR = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
const SHELL = ["./", "./vendor/firebase-13.3.0.js", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/apple-touch-icon.png"];
const PHOTOS = "vcal-photos";

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(SHELL);
    try { await c.add(new Request(JSQR, { mode: "cors" })); } catch (_) {}
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION && k !== PHOTOS) await caches.delete(k);
    await self.clients.claim();
  })());
});

// ネットから取る。4秒待っても返らないとき・失敗したときは保存した分を出す
async function networkFirst(req, key) {
  const c = await caches.open(VERSION);
  const net = fetch(req).then((res) => { if (res.ok) c.put(key, res.clone()); return res; });
  net.catch(() => {});
  const timeout = new Promise((r) => setTimeout(r, 4000));
  try {
    const res = await Promise.race([net, timeout]);
    if (res) return res;
  } catch (_) {}
  const hit = await c.match(key);
  if (hit) return hit;
  return net;
}

async function cacheFirst(req, name) {
  const c = await caches.open(name);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") c.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname.startsWith("/__/auth/")) return;
    if (url.pathname === "/__/firebase/init.json") { e.respondWith(networkFirst(req, "/__/firebase/init.json")); return; }
    if (req.mode === "navigate") { e.respondWith(networkFirst(req, "./")); return; }
    if (url.pathname === "/sw.js") return;
    e.respondWith(cacheFirst(req, VERSION));
    return;
  }
  if (url.href === JSQR) { e.respondWith(cacheFirst(new Request(JSQR, { mode: "cors" }), VERSION)); return; }
  if (url.hostname === "firebasestorage.googleapis.com" && req.destination === "image") { e.respondWith(cacheFirst(req, PHOTOS)); return; }
});
