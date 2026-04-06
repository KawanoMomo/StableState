// @ts-check
// Cross-feature regression sweep for autoRoute A* rewrite.
// Verifies Sprint 1-6 OBS fixes + cyclic features remain intact after
// the autoRoute algorithm replacement.
const { test, expect } = require('@playwright/test');
const BASE = 'http://localhost:8765/stablestate.html';

async function loadExample(page, name) {
  await page.evaluate(async (n) => {
    const res = await fetch('examples/' + n);
    const text = await res.text();
    document.querySelector('#editor').value = text;
    document.querySelector('#editor').dispatchEvent(new Event('input', { bubbles: true }));
  }, name);
  await page.waitForTimeout(200);
}

async function setDsl(page, dsl) {
  await page.evaluate((d) => {
    document.querySelector('#editor').value = d;
    document.querySelector('#editor').dispatchEvent(new Event('input', { bubbles: true }));
  }, dsl);
  await page.waitForTimeout(100);
}

test.describe('autoRoute rewrite regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.waitForFunction(() => typeof parsed !== 'undefined');
    page.on('dialog', d => d.dismiss().catch(() => {}));
  });

  test('automotive-ecu loads without errors', async ({ page }) => {
    await loadExample(page, 'automotive-ecu.sstate');
    const count = await page.evaluate(() => parsed.errors.length);
    expect(count).toBe(0);
  });

  test('tcp-connection loads without errors', async ({ page }) => {
    await loadExample(page, 'tcp-connection.sstate');
    const count = await page.evaluate(() => parsed.errors.length);
    expect(count).toBe(0);
  });

  test('autoRoute on automotive-ecu does not crash', async ({ page }) => {
    await loadExample(page, 'automotive-ecu.sstate');
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.evaluate(() => autoRoute());
    expect(errors.length).toBe(0);
  });

  test('autoRoute on tcp-connection does not crash', async ({ page }) => {
    await loadExample(page, 'tcp-connection.sstate');
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.evaluate(() => autoRoute());
    expect(errors.length).toBe(0);
  });

  test('SVG export strips data-resize after autoRoute (OBS-08)', async ({ page }) => {
    await loadExample(page, 'automotive-ecu.sstate');
    await page.evaluate(() => autoRoute());
    const svg = await page.evaluate(() => getExportSVGString());
    expect(svg).not.toContain('data-resize=');
  });

  test('@cyclic transitions render correctly after autoRoute', async ({ page }) => {
    await setDsl(page, `@canvas width=400 height=200 grid=20
initial i at 1,5
state a "A" at 3,3 size 6x4 do=Poll
state b "B" at 14,3 size 6x4
i -> a
a -> b : [Ready] @cyclic`);
    await page.evaluate(() => autoRoute());
    const texts = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#svg-wrap svg text')).map(t => t.textContent).join(' | ')
    );
    expect(texts).toContain('⟳');
  });

  test('OBS-19: @internal self-transition preserved after autoRoute', async ({ page }) => {
    await loadExample(page, 'automotive-ecu.sstate');
    await page.evaluate(() => autoRoute());
    const dsl = await page.evaluate(() => getDsl());
    expect(dsl).toContain('EvWatchdogKick @internal');
  });
});
