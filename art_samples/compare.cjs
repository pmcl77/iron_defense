const { chromium } = require('/usr/local/share/npm-global/lib/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 1 });
  await p.goto('file://' + path.join(__dirname, process.argv[2] || 'compare.html'));
  await p.waitForLoadState('load');
  await p.screenshot({ path: path.join(__dirname, process.argv[3] || 'comparison.png'), fullPage: true });
  await b.close();
})();
