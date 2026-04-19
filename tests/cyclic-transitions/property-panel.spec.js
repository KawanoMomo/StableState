// @ts-check
const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8765/stablestate.html';

async function setDsl(page, dsl) {
  await page.evaluate((d) => {
    const ta = document.querySelector('#editor');
    ta.value = d;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }, dsl);
  await page.waitForTimeout(100);
}

async function switchToTable(page) {
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.tab-btn'));
    const t = tabs.find(b => /table|テーブル/i.test(b.textContent || ''));
    if (t) t.click();
  });
  await page.waitForTimeout(100);
}

async function clickActionCell(page, actionText) {
  await page.evaluate((needle) => {
    const td = Array.from(document.querySelectorAll('#table-wrap td[data-field="action"]'))
      .find(c => (c.textContent || '').includes(needle));
    if (td) td.click();
  }, actionText);
  await page.waitForTimeout(100);
}

test.describe('@cyclic property panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.waitForFunction(() => typeof parsed !== 'undefined');
  });

  test('checkbox exists when opening a transition cell', async ({ page }) => {
    await setDsl(page, `initial i at 1,1
state a "A" at 3,3 size 8x5 do=Poll
state b "B" at 14,3 size 8x5
i -> a
a -> b : EvX [G] / Act`);
    await switchToTable(page);
    await clickActionCell(page, 'Act');
    const exists = await page.evaluate(() => !!document.getElementById('pp-table-cyclic'));
    expect(exists).toBe(true);
  });

  test('ON checkbox adds @cyclic to DSL, preserving indent (OBS-13)', async ({ page }) => {
    await setDsl(page, `initial i at 1,1
state parent "Parent" at 3,3 size 24x14 {
  state a "A" at 3,3 size 8x5 do=Poll
  state b "B" at 14,3 size 8x5
  a -> b : EvX [G] / Act
}
i -> parent`);
    await switchToTable(page);
    await clickActionCell(page, 'Act');
    await page.evaluate(() => {
      const cb = document.getElementById('pp-table-cyclic');
      cb.checked = true;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('pp-table-apply').click();
    });
    await page.waitForTimeout(100);
    const dsl = await page.evaluate(() => getDsl());
    // Line should retain 2-space indent and bare IDs, gain @cyclic suffix
    expect(dsl).toContain('  a -> b : EvX [G] / Act @cyclic');
  });

  test('OFF checkbox removes @cyclic from DSL', async ({ page }) => {
    await setDsl(page, `initial i at 1,1
state a "A" at 3,3 size 8x5 do=Poll
state b "B" at 14,3 size 8x5
i -> a
a -> b : EvX [G] / Act @cyclic`);
    await switchToTable(page);
    await clickActionCell(page, 'Act');
    await page.evaluate(() => {
      const cb = document.getElementById('pp-table-cyclic');
      cb.checked = false;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('pp-table-apply').click();
    });
    await page.waitForTimeout(100);
    const dsl = await page.evaluate(() => getDsl());
    expect(dsl).not.toContain('@cyclic');
    expect(dsl).toContain('a -> b : EvX [G] / Act');
  });
});
