// オフラインで開き直しても、ログインしたまま・保存した予定が見え、書けて、つながったら送られる
const { chromium, ctxFor, URL } = require("./common");
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const A = await ctxFor(b); const p = await A.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(URL);
  await p.waitForSelector("#login:not([hidden])");
  await p.evaluate(async () => {
    const fb = await import("./vendor/firebase-13.3.0.js");
    await fb.signInWithCredential(fb.getAuth(), fb.GoogleAuthProvider.credential(JSON.stringify({ sub: "sub-ownerexamplecom", email: "owner@example.com", email_verified: true })));
  });
  await p.waitForSelector("#login", { state: "hidden" });
  await p.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true), null, { timeout: 10000 });
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.waitForTimeout(1500);
  const today = new Date().getDate();
  await p.waitForSelector(`.day[data-day="${today}"] .memo:not(.empty)`, { timeout: 10000 });
  await p.screenshot({ path: require("path").join(__dirname, "online.png") });
  await p.click("#menuBtn"); await p.waitForTimeout(300); await p.screenshot({ path: require("path").join(__dirname, "menu2.png") }); await p.click("#menuBtn");
  // offline relaunch
  await A.setOffline(true);
  await p.reload();
  await p.waitForSelector(`.day[data-day="${today}"] .memo:not(.empty)`, { timeout: 15000 });
  ok(true, "offline relaunch shows saved memo: " + await p.textContent(`.day[data-day="${today}"] .memo`));
  ok(await p.isHidden("#login"), "still logged in offline");
  ok(/オフライン/.test(await p.textContent("#status")), "status: " + await p.textContent("#status"));
  const d = today === 5 ? 6 : 5;
  for (let i = 0; i < 50 && !(await p.isVisible("#editor")); i++) { await p.click(`.day[data-day="${d}"]`); await p.waitForTimeout(100); }
  await p.fill("#edMemo", "オフライン起動中に書いた");
  await p.click("#edSave");
  await p.waitForSelector("#editor", { state: "hidden" });
  ok((await p.textContent(`.day[data-day="${d}"] .memo`)) === "オフライン起動中に書いた", "offline edit shown");
  ok(/つながったら自動で送ります/.test(await p.textContent("#status")), "pending status: " + await p.textContent("#status"));
  await p.screenshot({ path: require("path").join(__dirname, "offline2.png"), fullPage: false });
  await A.setOffline(false);
  await p.waitForFunction(() => /Firebaseに保存/.test(document.getElementById("status").textContent), null, { timeout: 30000 });
  // check on a second device
  const B = await ctxFor(b); const q = await B.newPage();
  await q.goto(URL); await q.waitForSelector("#login:not([hidden])");
  await q.evaluate(async () => {
    const fb = await import("./vendor/firebase-13.3.0.js");
    await fb.signInWithCredential(fb.getAuth(), fb.GoogleAuthProvider.credential(JSON.stringify({ sub: "sub-ownerexamplecom", email: "owner@example.com", email_verified: true })));
  });
  await q.waitForFunction((d) => document.querySelector(`.day[data-day="${d}"] .memo`).textContent === "オフライン起動中に書いた", d, { timeout: 15000 });
  ok(true, "synced to other device after reconnect");
  ok(!errs.length, "no page errors " + errs.join("|"));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
