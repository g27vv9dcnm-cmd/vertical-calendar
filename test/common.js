const { chromium } = require("playwright");
const SETUP = { config: { apiKey: "fake-api-key", projectId: "demo-vcal", authDomain: "127.0.0.1", storageBucket: "demo-vcal.appspot.com" }, emulators: { host: "127.0.0.1", auth: 9099, firestore: 8080, storage: 9199 } };
async function ctxFor(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...opts });
  await ctx.addInitScript((s) => { window.VCAL_FIREBASE = s; }, SETUP);
  return ctx;
}
module.exports = { chromium, SETUP, ctxFor, URL: "http://127.0.0.1:5000/" };
