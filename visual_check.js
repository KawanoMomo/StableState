const { chromium } = require('playwright');
const out = process.argv[2] || '.eval/visual.png';
const debug = process.argv[3] === 'debug';
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 3300, height: 1100 } });
  const page = await ctx.newPage();
  page.on('pageerror', err => console.log('[pageerror]', err.message));
  await page.goto('http://127.0.0.1:8765/stablestate.html', { waitUntil: 'commit', timeout: 30000 });
  await page.waitForSelector('#dsl-editor, textarea', { timeout: 15000 });
  await page.waitForTimeout(800);
  if (debug) {
    await page.evaluate(() => { if (typeof toggleDebug === 'function') toggleDebug(); });
    await page.waitForTimeout(400);
  }
  // Just use the initial template (no DSL load)
  const r = await page.evaluate(() => {
    const svg = document.querySelector('#svg-wrap svg');
    return { hasSvg: !!svg };
  });
  console.log('result:', JSON.stringify(r));
  await page.screenshot({ path: out, fullPage: false });
  console.log('saved', out);
  await browser.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
