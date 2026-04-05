// @ts-check
const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8765/stablestate.html';

async function setDslAndGet(page, dsl) {
  await page.evaluate((d) => {
    const ta = document.querySelector('#editor');
    ta.value = d;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }, dsl);
  await page.waitForTimeout(100);
  return await page.evaluate(() => ({
    states: parsed.states.map(s => ({ id: s.id, do: s.do })),
    errors: (parsed.errors || []).map(e => e.msg || e)
  }));
}

test.describe('do editor — parseProps quoted value support', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.waitForFunction(() => typeof parsed !== 'undefined');
  });

  test('bare do=FuncName still parses (backward compat)', async ({ page }) => {
    const r = await setDslAndGet(page, `initial i at 1,1
state idle "Idle" at 3,3 size 8x5 do=PollReady
i -> idle`);
    const s = r.states.find(x => x.id === 'idle');
    expect(s.do).toBe('PollReady');
  });

  test('quoted do with spaces', async ({ page }) => {
    const r = await setDslAndGet(page, `initial i at 1,1
state idle "Idle" at 3,3 size 8x5 do="Poll ready sensors"
i -> idle`);
    const s = r.states.find(x => x.id === 'idle');
    expect(s.do).toBe('Poll ready sensors');
  });

  test('quoted do with \\n literal (2-char escape, preserved)', async ({ page }) => {
    const r = await setDslAndGet(page, `initial i at 1,1
state idle "Idle" at 3,3 size 8x5 do="Check1\\nCheck2"
i -> idle`);
    const s = r.states.find(x => x.id === 'idle');
    // \n is preserved as the 2-char sequence; UI layer will unescape for display
    expect(s.do).toBe('Check1\\nCheck2');
  });

  test('quoted do with escaped quote \\"', async ({ page }) => {
    const r = await setDslAndGet(page, `initial i at 1,1
state idle "Idle" at 3,3 size 8x5 do="say \\"hello\\""
i -> idle`);
    const s = r.states.find(x => x.id === 'idle');
    expect(s.do).toBe('say "hello"');
  });

  test('E4: unclosed quote raises error', async ({ page }) => {
    const r = await setDslAndGet(page, `initial i at 1,1
state idle "Idle" at 3,3 size 8x5 do="unclosed
i -> idle`);
    const matched = r.errors.find(m => /unclosed quoted value/i.test(m));
    expect(matched).toBeTruthy();
  });

  test('quoted do with -> transition-like content', async ({ page }) => {
    const r = await setDslAndGet(page, `initial i at 1,1
state idle "Idle" at 3,3 size 8x5 do="if (Ready) -> active"
state active "Active" at 14,3 size 8x5
i -> idle`);
    const s = r.states.find(x => x.id === 'idle');
    expect(s.do).toBe('if (Ready) -> active');
  });
});
