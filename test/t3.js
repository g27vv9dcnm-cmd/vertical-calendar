const { chromium, ctxFor, URL } = require("./common");
const fs = require("fs");
const FS = "http://127.0.0.1:8080/v1/projects/demo-vcal/databases/(default)/documents";
const H = { Authorization: "Bearer owner" };
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
async function fsGet(path) { const r = await fetch(`${FS}/${path}`, { headers: H }); return r.ok ? r.json() : null; }
async function uidOf(email) {
  const r = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-vcal/accounts:query", { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: "{}" });
  const j = await r.json(); return (j.userInfo || []).find((u) => u.email === email)?.localId;
}
async function login(p, email) {
  // 本物のGoogleログイン画面はこの環境から開けないため、エミュレーターに直接ログインする
  await p.goto(URL);
  await p.waitForSelector("#login:not([hidden])", { timeout: 15000 });
  await p.evaluate(async (email) => {
    const fb = await import("./vendor/firebase-13.3.0.js");
    const sub = "sub-" + email.replace(/[^a-z]/g, "");
    await fb.signInWithCredential(fb.getAuth(), fb.GoogleAuthProvider.credential(JSON.stringify({ sub, email, email_verified: true, name: email.split("@")[0] })));
  }, email);
  await p.waitForSelector("#login", { state: "hidden", timeout: 15000 });
}
const day = (n) => `.day[data-day="${n}"]`;
async function quickEdit(p, n, text) {
  await p.waitForFunction(() => !!document.querySelector(".day"));
  // 最新の内容が届くまでは開かない作りなので、開くまで押し直す
  for (let i = 0; i < 50; i++) {
    await p.click(day(n));
    if (await p.isVisible("#editor")) break;
    await p.waitForTimeout(100);
  }
  await p.waitForSelector("#editor:not([hidden])", { timeout: 1000 });
  await p.fill("#edMemo", text);
  await p.click("#edSave");
  await p.waitForSelector("#editor", { state: "hidden", timeout: 5000 });
}
async function goOffline(ctx, p, off) {
  await ctx.setOffline(off);
  await p.evaluate(async (off) => { const fb = await import("./vendor/firebase-13.3.0.js"); await (off ? fb.disableNetwork : fb.enableNetwork)(fb.getFirestore()); }, off);
}
(async () => {
  await fetch("http://127.0.0.1:8080/emulator/v1/projects/demo-vcal/databases/(default)/documents", { method: "DELETE" });
  await fetch("http://127.0.0.1:9099/emulator/v1/projects/demo-vcal/accounts", { method: "DELETE" });
  const b = await chromium.launch();
  const errs = [];
  const A = await ctxFor(b); const pa = await A.newPage();
  pa.on("pageerror", (e) => errs.push("A " + e.message));
  pa.on("console", (m) => { if (m.type() === "error" && !/TUNNEL|ERR_INTERNET_DISCONNECTED|net::/.test(m.text())) errs.push("A console " + m.text()); });

  // 1. login
  await login(pa, "owner@example.com");
  await pa.waitForFunction(() => /Firebaseに保存/.test(document.getElementById("status").textContent), null, { timeout: 10000 });
  ok(true, "login + status: " + await pa.textContent("#status"));
  await pa.click("#menuBtn");
  ok((await pa.textContent("#mUser")).includes("owner@example.com"), "menu shows account");
  await pa.screenshot({ path: require("path").join(__dirname, "menu.png") });
  await pa.click("#menuBtn");
  const uid = await uidOf("owner@example.com");
  ok(!!uid, "uid " + uid);

  // 2. quick edit today
  const today = new Date().getDate(); const mk = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const dk = String(today).padStart(2, "0");
  await quickEdit(pa, today, "テスト予定A");
  ok((await pa.textContent(day(today) + " .memo")) === "テスト予定A", "row shows memo");
  await pa.waitForTimeout(800);
  let d = await fsGet(`users/${uid}/months/${mk}`);
  ok(d && d.fields.days.mapValue.fields[dk].mapValue.fields.memo.stringValue === "テスト予定A", "firestore has memo");

  // 3. reload keeps
  await pa.reload();
  await pa.waitForSelector(day(today) + " .memo:not(.empty)", { timeout: 10000 });
  ok((await pa.textContent(day(today) + " .memo")) === "テスト予定A", "after reload");

  // 4. todo
  await pa.click("#tabTodo");
  await pa.fill("#tdText", "テストのやること");
  await pa.click("#tdAddBtn");
  await pa.waitForSelector(".td-item .td-text");
  ok((await pa.textContent(".td-item .td-text")) === "テストのやること", "todo listed");
  await pa.waitForTimeout(800);
  const tl = await (await fetch(`${FS}/users/${uid}/todos`, { headers: H })).json();
  ok((tl.documents || []).length === 1, "firestore has todo");
  await pa.click("#tabCal");

  // 5. photo
  await pa.click(day(today));
  await pa.waitForSelector("#editor:not([hidden])");
  await pa.click("#edMode");
  await pa.setInputFiles("#edFile", require("path").join(__dirname, "../public/icons/icon-512.png"));
  await pa.waitForSelector("#edPhotos .ph img", { timeout: 10000 });
  await pa.waitForFunction(() => !document.querySelector("#edPhotos .busy"), null, { timeout: 15000 });
  ok(!(await pa.isVisible("#edErr")), "no photo error: " + (await pa.textContent("#edErr")));
  await pa.click("#edSave");
  await pa.waitForSelector("#editor", { state: "hidden" });
  await pa.waitForSelector(day(today) + " .thumbs img[src]", { timeout: 10000 });
  const src = await pa.getAttribute(day(today) + " .thumbs img", "src");
  ok(/127\.0\.0\.1:9199/.test(src), "thumb from storage: " + src.slice(0, 80));
  const loadedImg = await pa.evaluate(async (sel) => { const im = document.querySelector(sel); if (!im.complete) await new Promise((r) => (im.onload = im.onerror = r)); return im.naturalWidth; }, day(today) + " .thumbs img");
  ok(loadedImg > 0, "thumb loads, width " + loadedImg);

  // 6. second device sees changes live
  const B = await ctxFor(b); const pb = await B.newPage();
  pb.on("pageerror", (e) => errs.push("B " + e.message));
  await login(pb, "owner@example.com");
  await pb.waitForSelector(day(today) + " .memo:not(.empty)", { timeout: 10000 });
  ok((await pb.textContent(day(today) + " .memo")) === "テスト予定A", "device B sees memo");

  // 7. offline edit on A + concurrent edit on B (different day, same month) → both kept
  const d1 = today === 1 ? 2 : 1, d2 = today === 3 ? 4 : 3;
  await goOffline(A, pa, true);
  await quickEdit(pa, d1, "オフラインで書いた");
  ok(/オフライン/.test(await pa.textContent("#status")), "offline status: " + await pa.textContent("#status"));
  await pa.screenshot({ path: require("path").join(__dirname, "offline.png") });
  await quickEdit(pb, d2, "Bで書いた");
  await pb.waitForTimeout(800);
  await goOffline(A, pa, false);
  await pa.waitForFunction(() => /Firebaseに保存/.test(document.getElementById("status").textContent), null, { timeout: 20000 });
  ok(true, "back online status: " + await pa.textContent("#status"));
  await pa.waitForTimeout(1000);
  d = await fsGet(`users/${uid}/months/${mk}`);
  const f = d.fields.days.mapValue.fields;
  console.log(JSON.stringify(f).slice(0, 600));
  ok(f[String(d1).padStart(2, "0")]?.mapValue.fields.memo.stringValue === "オフラインで書いた" && f[String(d2).padStart(2, "0")]?.mapValue.fields.memo.stringValue === "Bで書いた" && f[dk].mapValue.fields.photos.arrayValue.values.length === 1, "both offline-A and B edits kept, photo kept");
  await pb.waitForFunction((s) => document.querySelector(s + " .memo").textContent === "オフラインで書いた", day(d1), { timeout: 10000 });
  ok(true, "B received A's offline edit");

  // 8. clearing a day deletes it
  await quickEdit(pb, d2, "");
  await pb.waitForTimeout(800);
  d = await fsGet(`users/${uid}/months/${mk}`);
  ok(!d.fields.days.mapValue.fields[String(d2).padStart(2, "0")], "emptied day removed");

  // 9. import
  const imp = { app: "vcal", version: 1, months: { "2026-10": { days: { "31": { memo: "取り込みテスト", link: "", photos: [] } } }, [mk]: { days: { "28": { memo: "取り込み28", link: "", photos: [] } } } }, todos: [{ id: "abc123", text: "取り込んだやること", done: false, due: "", created: 1, doneAt: 0 }] };
  fs.writeFileSync(require("path").join(__dirname, "import.json"), JSON.stringify(imp));
  await pa.click("#menuBtn");
  await pa.setInputFiles("#importFile", require("path").join(__dirname, "import.json"));
  await pa.waitForFunction(() => /取り込みました/.test(document.getElementById("status").textContent), null, { timeout: 15000 });
  ok(true, "import: " + await pa.textContent("#status"));
  await pa.setInputFiles("#importFile", require("path").join(__dirname, "import.json"));
  await pa.waitForFunction(() => /取り込みました/.test(document.getElementById("status").textContent), null, { timeout: 15000 });
  await pa.waitForTimeout(800);
  d = await fsGet(`users/${uid}/months/${mk}`);
  ok(d.fields.days.mapValue.fields["28"] && d.fields.days.mapValue.fields[dk].mapValue.fields.memo.stringValue === "テスト予定A", "import merged without clobbering");
  const tl2 = await (await fetch(`${FS}/users/${uid}/todos`, { headers: H })).json();
  ok(tl2.documents.length === 2, "import idempotent todos: " + tl2.documents.length);
  ok(!!(await fsGet(`users/${uid}/months/2026-10`)), "import other month");

  // 10. stranger account is refused
  const C = await ctxFor(b); const pc = await C.newPage();
  await login(pc, "stranger@example.com");
  await pc.waitForFunction(() => /このGoogleアカウントでは保存できません/.test(document.getElementById("status").textContent), null, { timeout: 10000 });
  ok(true, "stranger refused: " + await pc.textContent("#status"));
  await pc.screenshot({ path: require("path").join(__dirname, "stranger.png") });
  const sUid = await uidOf("stranger@example.com");
  const r = await fetch(`${FS}/users/${uid}/months/${mk}`, { headers: { Authorization: "Bearer " + "x" } });
  ok(r.status >= 400, "anonymous REST read denied: " + r.status);

  // 11. logout
  if (!(await pa.isVisible("#menu"))) await pa.click("#menuBtn");
  await pa.click("#mLogout");
  await pa.waitForTimeout(500);
  console.log("logout btn:", await pa.textContent("#mLogout"), "status:", await pa.textContent("#status"));
  if (await pa.isVisible("#mLogout")) await pa.click("#mLogout");
  await pa.waitForSelector("#login:not([hidden])", { timeout: 15000 });
  ok(true, "logout shows login");

  ok(errs.length === 0, "no page errors: " + errs.join(" | "));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
