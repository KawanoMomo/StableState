const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 3300, height: 1100 } });
  const page = await ctx.newPage();
  page.on('console', msg => console.log('[' + msg.type() + ']', msg.text()));
  page.on('pageerror', err => console.log('[pageerror]', err.message));
  page.on('crash', () => console.log('[crash]'));
  await page.goto('http://127.0.0.1:8765/stablestate.html', { waitUntil: 'commit', timeout: 30000 });
  await page.waitForSelector('#dsl-editor, textarea', { timeout: 15000 }).catch(e => console.log('selector wait failed:', e.message));
  await page.waitForTimeout(2000);
  console.log('--- ready ---');
  try {
    const r = await page.evaluate(async () => {
      const dsl = await fetch('/examples/ota-update-demo.sstate').then(r => r.text());
      const ta = document.querySelector('#dsl-editor') || document.querySelector('textarea');
      ta.value = dsl;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 1500));
      const svg = document.querySelector('#svg-wrap svg');
      return { hasSvg: !!svg, dslLen: dsl.length };
    });
    console.log('eval result:', JSON.stringify(r));
    await page.screenshot({ path: '.eval/sprint1-back-edge-bus.png', fullPage: false });
    console.log('screenshot saved');
  } catch (e) {
    console.log('eval failed:', e.message);
  }
  await browser.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
