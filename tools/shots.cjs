// Headless smoke test + screenshots. Usage: node tools/shots.cjs <outdir>
const { chromium } = require('/usr/local/share/npm-global/lib/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = process.argv[2] || path.join(root, 'shots');
fs.mkdirSync(out, { recursive: true });
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  let f = path.join(root, decodeURIComponent(q.url.split('?')[0]));
  if (f.endsWith('/')) f += 'index.html';
  if (!f.startsWith(root) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
}).listen(0, async () => {
  const url = `http://localhost:${srv.address().port}/`;
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const errors = [];
  async function session(name, viewport, dpr, fn) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: dpr, hasTouch: name === 'phone' });
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
    await page.goto(url);
    await page.waitForTimeout(500);
    await fn(page);
    await page.close();
  }
  const shot = (page, n) => page.screenshot({ path: path.join(out, n + '.png') });
  await session('phone', { width: 412, height: 915 }, 2.625, async (page) => {
    await shot(page, '1-menu');
    await page.evaluate(() => { localStorage.setItem('iron-defense-save-v1', JSON.stringify({ cleared: 6 })); });
    await page.reload(); await page.waitForTimeout(400);
    await page.click('[data-a=play]'); await page.waitForTimeout(200);
    await shot(page, '2-stages');
    await page.click('[data-a=go][data-i="4"]'); await page.waitForTimeout(200);
    await shot(page, '3-loadout');
    await page.click('[data-a=go]'); await page.waitForTimeout(300);
    await page.evaluate(() => {
      const g = window.__game, w = g.world;
      w.energy = 3000; w.maxEnergy = 3000;
      w.order(1, 2, 'sentry'); w.order(2, 2, 'sentry'); w.order(3, 2, 'howitzer'); w.order(2, 4, 'arc');
      for (const [t, l] of [['gunner', 2], ['seeker', 3], ['lancer', 1], ['aegis', 2], ['scout', 4]]) { w.setLane(l); w.deployCd = {}; w.deploy(t); }
      window.__step(9);
    });
    await shot(page, '4-battle-early');
    await page.evaluate(() => { const w = window.__game.world; w.setMode('advance'); for (const [t, l] of [['gunner', 0], ['gunner', 4], ['scout', 2]]) { w.setLane(l); w.deployCd = {}; w.deploy(t); } window.__step(22); });
    await shot(page, '5-battle-advance');
    await page.evaluate(() => { const r = window.__game; r.world; });
    await page.mouse.move(200, 300);
    await page.evaluate(() => { const w = window.__game.world; const rd = w; void rd; });
    await page.evaluate(() => { document.querySelector('#minimap').dispatchEvent(new PointerEvent('pointerdown', { clientY: document.querySelector('#minimap').getBoundingClientRect().top + 20, bubbles: true })); });
    await page.waitForTimeout(100);
    await shot(page, '6-battle-front');
    await page.evaluate(() => { const w = window.__game.world; w.bases[1].hp = 1; w.damage(w.bases[1], 10, null, 0); window.__step(3); });
    await page.waitForTimeout(200);
    await shot(page, '7-result');
  });
  await session('desktop', { width: 1440, height: 900 }, 1, async (page) => {
    await page.click('[data-a=play]'); await page.waitForTimeout(300);
    await page.evaluate(() => { const w = window.__game.world; for (let i = 0; i < 4; i++) { w.deployCd = {}; w.setLane(i); w.deploy('scout'); } window.__step(12); });
    await shot(page, '8-desktop');
  });
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
  await browser.close(); srv.close();
});
