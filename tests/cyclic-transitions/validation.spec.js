// @ts-check
const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8765/stablestate.html';

async function setDslAndGetValidation(page, dsl) {
  await page.evaluate((d) => {
    const ta = document.querySelector('#editor');
    ta.value = d;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }, dsl);
  await page.waitForTimeout(100);
  return await page.evaluate(() => ({
    errors: (parsed.errors || []).map(e => e.msg || e),
    warnings: (parsed.warnings || []).map(w => w.msg || w)
  }));
}

test.describe('@cyclic validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.waitForFunction(() => typeof parsed !== 'undefined');
  });

  test('E1: initial → @cyclic raises error', async ({ page }) => {
    const r = await setDslAndGetValidation(page, `initial i at 1,1
state a "A" at 3,3 size 8x5
i -> a : @cyclic`);
    const matched = r.errors.find(m => /initial.*must not have @cyclic/i.test(m));
    expect(matched).toBeTruthy();
  });

  test('E2: choice → @cyclic raises error', async ({ page }) => {
    const r = await setDslAndGetValidation(page, `initial i at 1,1
state a "A" at 3,3 size 8x5 do=Poll
state b "B" at 14,3 size 8x5
choice c at 10,1
i -> a
a -> c
c -> b : [OK] @cyclic`);
    const matched = r.errors.find(m => /choice.*must not have @cyclic/i.test(m));
    expect(matched).toBeTruthy();
  });

  test('W1: cyclic transition without do= raises warning (not error)', async ({ page }) => {
    const r = await setDslAndGetValidation(page, `initial i at 1,1
state idle "Idle" at 3,3 size 8x5
state active "Active" at 14,3 size 8x5
i -> idle
idle -> active : [Ready] @cyclic`);
    // Should NOT be in errors
    expect(r.errors.filter(m => /no do/i.test(m)).length).toBe(0);
    // SHOULD be in warnings
    expect(r.warnings.find(m => /@cyclic.*no 'do=' activity|@cyclic.*no do activity/i.test(m))).toBeTruthy();
  });

  test('cyclic with do= has no warning', async ({ page }) => {
    const r = await setDslAndGetValidation(page, `initial i at 1,1
state idle "Idle" at 3,3 size 8x5 do=Poll
state active "Active" at 14,3 size 8x5
i -> idle
idle -> active : [Ready] @cyclic`);
    expect(r.warnings.filter(w => /@cyclic/.test(w)).length).toBe(0);
  });

  test('event + cyclic is allowed (no warning/error)', async ({ page }) => {
    const r = await setDslAndGetValidation(page, `initial i at 1,1
state a "A" at 3,3 size 8x5 do=Poll
state b "B" at 14,3 size 8x5
i -> a
a -> b : EvX [G] / Act @cyclic`);
    expect(r.errors.filter(m => /@cyclic/.test(m)).length).toBe(0);
    expect(r.warnings.filter(w => /@cyclic/.test(w) && !/do/.test(w)).length).toBe(0);
  });

  test('@external @cyclic combined is allowed', async ({ page }) => {
    const r = await setDslAndGetValidation(page, `initial i at 1,1
state a "A" at 3,3 size 8x5 do=Poll
state b "B" at 14,3 size 8x5
i -> a
a -> b : [G] / Act @external @cyclic`);
    expect(r.errors.filter(m => /@cyclic|@external/.test(m)).length).toBe(0);
  });
});
