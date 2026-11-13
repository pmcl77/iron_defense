// Renders each style headless and saves PNGs. Usage: node shoot.cjs [styles...]
const { chromium } = require('/usr/local/share/npm-global/lib/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = __dirname;
const srv = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]));
  if (!f.startsWith(root) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'text/html' });
  fs.createReadStream(f).pipe(r);
}).listen(0, async () => {
  const port = srv.address().port, styles = process.argv.slice(2).length ? process.argv.slice(2) : ['1', '2', '3', '4'];
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 540, height: 1170 }, deviceScaleFactor: 2 });
  page.on('console', (m) => console.log('[page]', m.text()));
  for (const s of styles) {
    const t = Date.now();
    await page.goto(`http://localhost:${port}/sample.html?style=${s}`);
    await page.waitForFunction(() => document.title === 'done' || document.title === 'error', null, { timeout: 120000 });
    const err = await page.evaluate(() => window.__err);
    if (err) { console.log(`style ${s} ERROR`, err); continue; }
    await page.locator('#c').screenshot({ path: path.join(root, `style-${s}.png`) });
    console.log(`style ${s} ok in ${Date.now() - t} ms`);
  }
  await browser.close(); srv.close();
});
