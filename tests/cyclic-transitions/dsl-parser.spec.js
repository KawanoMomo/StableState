// @ts-check
const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8765/stablestate.html';

async function setDslAndGetParsed(page, dsl) {
  await page.evaluate((d) => {
    const ta = document.querySelector('#editor');
    ta.value = d;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }, dsl);
  await page.waitForTimeout(50);
  return await page.evaluate(() => {
    return {
      transitions: parsed.transitions.map(t => ({
        from: t.from, to: t.to, event: t.event, guard: t.guard,
        action: t.action, kind: t.kind, cyclic: t.cyclic === true
      })),
      errors: parsed.errors.map(e => e.msg)
    };
  });
}

test.describe('@cyclic DSL parser', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.waitForFunction(() => typeof parsed !== 'undefined');
  });

  test('@cyclic alone sets cyclic=true, kind=default', async ({ page }) => {
    const dsl = `initial i at 1,1
state idle "Idle" at 3,3 size 8x5 do=Poll
state active "Active" at 14,3 size 8x5
i -> idle
idle -> active : [Ready] / Init @cyclic`;
    const r = await setDslAndGetParsed(page, dsl);
    const t = r.transitions.find(x => x.from === 'idle' && x.to === 'active');
    expect(t).toBeTruthy();
    expect(t.cyclic).toBe(true);
    expect(t.kind).toBe('local'); // default when @config transition not set
    expect(t.guard).toBe('Ready');
    expect(t.action).toBe('Init');
  });

  test('@cyclic @external combined, order 1', async ({ page }) => {
    const dsl = `initial i at 1,1
state a "A" at 3,3 size 8x5 do=Poll
state b "B" at 14,3 size 8x5
i -> a
a -> b : EvX [G] / Act @cyclic @external`;
    const r = await setDslAndGetParsed(page, dsl);
    const t = r.transitions.find(x => x.from === 'a' && x.to === 'b');
    expect(t.cyclic).toBe(true);
    expect(t.kind).toBe('external');
    expect(t.event).toBe('EvX');
  });

  test('@external @cyclic combined, reverse order', async ({ page }) => {
    const dsl = `initial i at 1,1
state a "A" at 3,3 size 8x5 do=Poll
state b "B" at 14,3 size 8x5
i -> a
a -> b : EvX [G] / Act @external @cyclic`;
    const r = await setDslAndGetParsed(page, dsl);
    const t = r.transitions.find(x => x.from === 'a' && x.to === 'b');
    expect(t.cyclic).toBe(true);
    expect(t.kind).toBe('external');
  });

  test('no @cyclic → cyclic=false (backward compat)', async ({ page }) => {
    const dsl = `initial i at 1,1
state a "A" at 3,3 size 8x5
state b "B" at 14,3 size 8x5
i -> a
a -> b : EvX`;
    const r = await setDslAndGetParsed(page, dsl);
    const t = r.transitions.find(x => x.from === 'a' && x.to === 'b');
    expect(t.cyclic).toBe(false);
  });

  test('serializer: @kind @cyclic in stable order', async ({ page }) => {
    const dsl = `initial i at 1,1
state a "A" at 3,3 size 8x5 do=Poll
state b "B" at 14,3 size 8x5
i -> a`;
    await setDslAndGetParsed(page, dsl);
    const out = await page.evaluate(() => {
      const newDsl = addTransition('a', 'b', 'EvX', 'G', 'Act', 'external', getDsl(), true /* cyclic */);
      return newDsl;
    });
    expect(out).toMatch(/a -> b : EvX \[G\] \/ Act @external @cyclic/);
  });
});
