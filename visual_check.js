const { chromium } = require('playwright');
const target = process.argv[2] || 'ota-update-demo.sstate';
const out = process.argv[3] || '.eval/visual.png';
const debug = process.argv[4] === 'debug';
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 3300, height: 1100 } });
  const page = await ctx.newPage();
  page.on('pageerror', err => console.log('[pageerror]', err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('[console error]', msg.text());
  });
  await page.goto('http://127.0.0.1:8765/stablestate.html', { waitUntil: 'commit', timeout: 30000 });
  await page.waitForSelector('#dsl-editor, textarea', { timeout: 15000 });
  await page.waitForTimeout(800);
  // Toggle debug FIRST so the let is true before re-render
  if (debug) {
    await page.evaluate(() => { if (typeof toggleDebug === 'function') toggleDebug(); });
    await page.waitForTimeout(200);
  }
  const r = await page.evaluate(async (file) => {
    const dsl = await fetch('/examples/' + file).then(r => r.text());
    const ta = document.querySelector('#dsl-editor') || document.querySelector('textarea');
    ta.value = dsl;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 800));
    const svg = document.querySelector('#svg-wrap svg');
    return { hasSvg: !!svg, dslLen: dsl.length };
  }, target);
  console.log('result:', JSON.stringify(r));
  await page.screenshot({ path: out, fullPage: false });
  console.log('saved', out);
  await browser.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
