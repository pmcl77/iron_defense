// Renders icons/icon.svg to the PNG sizes the manifest needs. Usage: node tools/make_icons.cjs
const { chromium } = require('/usr/local/share/npm-global/lib/node_modules/playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '../icons/icon.svg'), 'utf8');
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  for (const s of [192, 512]) {
    const p = await b.newPage({ viewport: { width: s, height: s } });
    await p.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${s}" height="${s}" `)}</body></html>`);
    await p.screenshot({ path: path.join(__dirname, `../icons/icon-${s}.png`), omitBackground: true });
  }
  await b.close();
})();
