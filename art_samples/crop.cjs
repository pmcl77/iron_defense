// node crop.cjs in.png out.png x y w h  (device-pixel crop)
const { chromium } = require('/usr/local/share/npm-global/lib/node_modules/playwright');
const path = require('path');
const [inp, out, x, y, w, h] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1080, height: 2340 } });
  await p.goto('file://' + path.resolve(inp));
  await p.screenshot({ path: out, clip: { x: +x, y: +y, width: +w, height: +h } });
  await b.close();
})();
