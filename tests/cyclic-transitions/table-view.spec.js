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

test.describe('@cyclic table view', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.waitForFunction(() => typeof parsed !== 'undefined');
  });

  test('cyclic transition cell has ⟳ prefix and amber color', async ({ page }) => {
    await setDsl(page, `initial i at 1,1
state idle "Idle" at 3,3 size 8x5 do=Poll
state active "Active" at 14,3 size 8x5
i -> idle
idle -> active : EvReady [Ready] / Init @cyclic`);
    await switchToTable(page);
    const cells = await page.evaluate(() => {
      const tds = Array.from(document.querySelectorAll('#table-wrap td'));
      return tds
        .filter(td => (td.textContent || '').includes('⟳'))
        .map(td => ({
          text: td.textContent || '',
          color: td.style.color || td.getAttribute('style') || ''
        }));
    });
    expect(cells.length).toBeGreaterThanOrEqual(1);
    expect(cells[0].text).toMatch(/⟳/);
    expect(cells[0].color.toLowerCase()).toMatch(/#f59e0b|rgb\(\s*245\s*,\s*158\s*,\s*11\s*\)/);
  });

  test('non-cyclic transition cell has no ⟳', async ({ page }) => {
    await setDsl(page, `initial i at 1,1
state a "A" at 3,3 size 8x5
state b "B" at 14,3 size 8x5
i -> a
a -> b : EvX`);
    await switchToTable(page);
    const hasGlyph = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#table-wrap td'))
        .some(td => (td.textContent || '').includes('⟳'));
    });
    expect(hasGlyph).toBe(false);
  });

  test('cyclic + guard + action all rendered with ⟳', async ({ page }) => {
    await setDsl(page, `initial i at 1,1
state a "A" at 3,3 size 8x5 do=Poll
state b "B" at 14,3 size 8x5
i -> a
a -> b : EvX [Ready] / Init @cyclic`);
    await switchToTable(page);
    const text = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#table-wrap td'))
        .map(td => td.textContent || '').join(' ');
    });
    expect(text).toContain('⟳');
    expect(text).toContain('Ready');
    expect(text).toContain('Init');
  });
});
