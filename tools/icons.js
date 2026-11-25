// アイコン（ホーム画面用）を作る：node tools/icons.js
const { chromium } = require("playwright");
const glyph = (size, pad) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect width="${size}" height="${size}" fill="#1e262b"/>
<g transform="translate(${size * pad} ${size * pad}) scale(${(size * (1 - 2 * pad)) / 24})" fill="none" stroke="#fff" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">
<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>
<path d="M8 13h.5M11.75 13h.5M15.5 13h.5M8 16.5h.5M11.75 16.5h.5" stroke-width="2"/>
</g></svg>`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ deviceScaleFactor: 1 });
  for (const [name, size, pad] of [["icon-192", 192, 0.14], ["icon-512", 512, 0.14], ["apple-touch-icon", 180, 0.14], ["icon-maskable-512", 512, 0.24]]) {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<style>body{margin:0}</style>${glyph(size, pad)}`);
    await p.screenshot({ path: `public/icons/${name}.png`, clip: { x: 0, y: 0, width: size, height: size } });
  }
  await b.close();
})();
