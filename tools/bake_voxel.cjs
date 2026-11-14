// Bakes the voxel sprite sheets and ground tiles into assets/voxel/ (headless Chromium).
// Usage: node tools/bake_voxel.cjs [part …]   parts: mech types, turret types, constructor, base, ground (default: all)
const { chromium } = require('/usr/local/share/npm-global/lib/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = path.join(root, 'assets', 'voxel');
const only = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const TYPES = { '.js': 'text/javascript', '.html': 'text/html' };
const srv = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(q.url === '/' ? 200 : 404, { 'Content-Type': 'text/html' }); return r.end('<!doctype html><title>bake</title>'); }
  r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
}).listen(0, async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', (m) => console.log(m.text()));
  page.on('pageerror', (e) => console.log('ERROR', e.message));
  await page.goto(`http://localhost:${srv.address().port}/`);
  const t0 = Date.now();
  const res = await page.evaluate(async (only) => {
    const m = await import('/tools/voxel/bake.js');
    const t = performance.now();
    return m.bakeAll((s) => console.log(`  ${s}  ${((performance.now() - t) / 1000).toFixed(1)} s`), only.length ? only : null);
  }, only);
  let bytes = 0;
  for (const [name, url] of Object.entries(res.files)) {
    const buf = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'); bytes += buf.length;
    fs.writeFileSync(path.join(out, name), buf);
  }
  const mf = path.join(out, 'meta.json');
  const prev = fs.existsSync(mf) && only.length ? JSON.parse(fs.readFileSync(mf, 'utf8')) : { sheets: {} };
  const meta = { ...prev, ...res.meta, sheets: { ...prev.sheets, ...res.meta.sheets } };
  if (!res.meta.ground && prev.ground) meta.ground = prev.ground;
  fs.writeFileSync(mf, JSON.stringify(meta, null, 1));
  console.log(`wrote ${Object.keys(res.files).length} files, ${(bytes / 1e6).toFixed(2)} MB, in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  await browser.close(); srv.close();
});
