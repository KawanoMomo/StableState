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

test.describe('do editor — UI textarea', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.waitForFunction(() => typeof parsed !== 'undefined');
  });

  async function setDslAndOpenIdle(page, dsl) {
    await page.evaluate((d) => {
      const ta = document.querySelector('#editor');
      ta.value = d;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }, dsl);
    await page.waitForTimeout(100);
    // Select idle state by assigning sel directly (mirrors mouse-click path).
    await page.evaluate(() => {
      // eslint-disable-next-line no-eval
      eval('sel = [{type: "state", id: "idle"}]');
      // eslint-disable-next-line no-eval
      eval('renderProps()');
    });
    await page.waitForTimeout(50);
  }

  test('pp-do is a textarea element', async ({ page }) => {
    await setDslAndOpenIdle(page, `initial i at 1,1
state idle "Idle" at 3,3 size 8x5 do=Poll
i -> idle`);
    const tag = await page.evaluate(() => {
      const el = document.getElementById('pp-do');
      return el ? el.tagName : null;
    });
    expect(tag).toBe('TEXTAREA');
  });

  test('pp-do shows multiline content as real newlines', async ({ page }) => {
    await setDslAndOpenIdle(page, `initial i at 1,1
state idle "Idle" at 3,3 size 8x5 do="Check1\\nCheck2"
i -> idle`);
    const val = await page.evaluate(() => document.getElementById('pp-do').value);
    expect(val).toBe('Check1\nCheck2');
  });

  test('Tab key inserts 2 spaces when autocomplete not showing', async ({ page }) => {
    await setDslAndOpenIdle(page, `initial i at 1,1
state idle "Idle" at 3,3 size 8x5 do=Poll
i -> idle`);
    await page.evaluate(() => {
      const el = document.getElementById('pp-do');
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
    await page.keyboard.press('Tab');
    const val = await page.evaluate(() => document.getElementById('pp-do').value);
    expect(val).toBe('Poll  ');
  });

  test('-> prefix triggers state autocomplete dropdown', async ({ page }) => {
    await setDslAndOpenIdle(page, `initial i at 1,1
state idle "Idle" at 3,3 size 8x5 do=Poll
state active "Active" at 14,3 size 8x5
state area "Area" at 25,3 size 8x5
i -> idle`);
    await page.evaluate(() => {
      const el = document.getElementById('pp-do');
      el.focus();
      el.value = 'Poll\n-> a';
      el.setSelectionRange(el.value.length, el.value.length);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(100);
    const items = await page.evaluate(() => {
      const list = document.querySelector('.ac-list');
      if (!list) return [];
      return Array.from(list.querySelectorAll('.ac-item')).map(el => el.textContent);
    });
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.some(i => /active/i.test(i))).toBe(true);
    expect(items.some(i => /area/i.test(i))).toBe(true);
  });

  test('Enter in autocomplete confirms selection', async ({ page }) => {
    await setDslAndOpenIdle(page, `initial i at 1,1
state idle "Idle" at 3,3 size 8x5 do=Poll
state active "Active" at 14,3 size 8x5
i -> idle`);
    await page.evaluate(() => {
      const el = document.getElementById('pp-do');
      el.focus();
      el.value = 'Poll\n-> a';
      el.setSelectionRange(el.value.length, el.value.length);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    const val = await page.evaluate(() => document.getElementById('pp-do').value);
    expect(val).toContain('active');
  });

  test('editing pp-do writes back to DSL with \\n escape', async ({ page }) => {
    await setDslAndOpenIdle(page, `initial i at 1,1
state idle "Idle" at 3,3 size 8x5 do=Poll
state active "Active" at 14,3 size 8x5
i -> idle`);
    await page.evaluate(() => {
      const el = document.getElementById('pp-do');
      el.value = 'CheckReady\n-> active';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    });
    await page.waitForTimeout(150);
    const dsl = await page.evaluate(() => getDsl());
    // Should contain do="CheckReady\n-> active" (quoted + \n escape)
    expect(dsl).toMatch(/do="CheckReady\\n-> active"/);
  });
});

test.describe('do editor — state box rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.waitForFunction(() => typeof parsed !== 'undefined');
    // Enable showActions so do text is rendered inside the state box
    await page.evaluate(() => {
      if (typeof showActions !== 'undefined' && !showActions) {
        document.getElementById('btn-actions').click();
      }
    });
  });

  async function setDsl(page, dsl) {
    await page.evaluate((d) => {
      const ta = document.querySelector('#editor');
      ta.value = d;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }, dsl);
    await page.waitForTimeout(100);
  }

  test('single-line do shows as-is (no ellipsis)', async ({ page }) => {
    await setDsl(page, `initial i at 1,1
state idle "Idle" at 3,3 size 8x5 do=Poll
i -> idle`);
    const texts = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#svg-wrap svg text'))
        .map(t => t.textContent).join(' | ');
    });
    expect(texts).toContain('do / Poll');
    expect(texts).not.toContain('…');
  });

  test('multiline do shows first line + ellipsis', async ({ page }) => {
    await setDsl(page, `initial i at 1,1
state idle "Idle" at 3,3 size 8x5 do="Check1\\nCheck2\\nDispatch"
i -> idle`);
    const texts = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#svg-wrap svg text'))
        .map(t => t.textContent).join(' | ');
    });
    expect(texts).toMatch(/do \/ Check1.*…/);
    // Subsequent lines must NOT appear in the state box
    expect(texts).not.toContain('Check2');
    expect(texts).not.toContain('Dispatch');
  });

  test('multiline do with spaces in first line rendered correctly', async ({ page }) => {
    await setDsl(page, `initial i at 1,1
state idle "Idle" at 3,3 size 8x5 do="if (Ready) -> active\\nPollSensors()"
state active "Active" at 14,3 size 8x5
i -> idle`);
    const texts = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#svg-wrap svg text'))
        .map(t => t.textContent).join(' | ');
    });
    expect(texts).toMatch(/do \/ if \(Ready\) -> active.*…/);
    expect(texts).not.toContain('PollSensors');
  });
});
