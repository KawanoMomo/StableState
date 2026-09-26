// @ts-check
// Default-render obstacle avoidance: renderSVG now collision-checks every
// geometric route and reroutes via A* when it would cut through an
// unrelated state box. No AutoRoute button press required — this is the
// always-on behavior, and it survives DSL edits because it runs per render.
const { test, expect } = require('@playwright/test');
const BASE = 'http://localhost:8765/stablestate.html';

async function setDsl(page, dsl) {
  await page.evaluate((d) => {
    document.querySelector('#editor').value = d;
    document.querySelector('#editor').dispatchEvent(new Event('input', { bubbles: true }));
  }, dsl);
  await page.waitForTimeout(100);
}

async function loadExample(page, name) {
  await page.evaluate(async (n) => {
    const res = await fetch('examples/' + n);
    const text = await res.text();
    document.querySelector('#editor').value = text;
    document.querySelector('#editor').dispatchEvent(new Event('input', { bubbles: true }));
  }, name);
  await page.waitForTimeout(200);
}

/** Check rendered routes (tr._renderedRoute) against leaf/pseudo boxes. */
function checkPenetrations() {
  // Runs in page context
  const g = parsed.canvas.grid;
  const boxes = collectObstacleBoxesShared(parsed, g);
  let penetrations = 0, routed = 0, nonOrtho = 0;
  for (const tr of parsed.transitions) {
    const wp = tr._renderedRoute;
    if (!wp || wp.length < 2) continue;
    if (tr.from === tr.to) continue; // self loops have a fixed local shape
    routed++;
    const srcBox = getBoxShared(tr.from, parsed, g);
    const tgtBox = getBoxShared(tr.to, parsed, g);
    for (let k = 1; k < wp.length; k++) {
      const p1 = wp[k - 1], p2 = wp[k];
      if (Math.abs(p1.x - p2.x) > 0.5 && Math.abs(p1.y - p2.y) > 0.5) nonOrtho++;
      for (const box of boxes) {
        if (boxesAlmostEqualShared(box, srcBox) || boxesAlmostEqualShared(box, tgtBox)) continue;
        const bx1 = box.x, by1 = box.y, bx2 = box.x + box.w, by2 = box.y + box.h;
        if (Math.abs(p1.y - p2.y) < 0.01) {
          const y = p1.y, xMin = Math.min(p1.x, p2.x), xMax = Math.max(p1.x, p2.x);
          if (y > by1 && y < by2 && xMax > bx1 && xMin < bx2) penetrations++;
        } else if (Math.abs(p1.x - p2.x) < 0.01) {
          const x = p1.x, yMin = Math.min(p1.y, p2.y), yMax = Math.max(p1.y, p2.y);
          if (x > bx1 && x < bx2 && yMax > by1 && yMin < by2) penetrations++;
        }
      }
    }
  }
  return { penetrations, routed, nonOrtho };
}

test.describe('default-render obstacle avoidance', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.waitForFunction(() => typeof renderSVG === 'function');
    page.on('dialog', d => d.dismiss().catch(() => {}));
  });

  test('straight route detours around a box in between', async ({ page }) => {
    await setDsl(page, `@canvas width=800 height=400 grid=20
state a "A" at 2,5 size 6x4
state b "B" at 14,5 size 6x4
state c "C" at 26,5 size 6x4
a -> c : go`);
    const r = await page.evaluate(checkPenetrations);
    expect(r.routed).toBe(1);
    expect(r.penetrations).toBe(0);
    expect(r.nonOrtho).toBe(0);
  });

  test('L-route detours when its corner lands inside a box', async ({ page }) => {
    await setDsl(page, `@canvas width=800 height=600 grid=20
state a "A" at 2,2 size 6x4
state blocker "Blocker" at 20,2 size 6x4
state c "C" at 20,16 size 6x4
a -> c : go`);
    const r = await page.evaluate(checkPenetrations);
    expect(r.penetrations).toBe(0);
  });

  test('unobstructed pair keeps the simple geometric route', async ({ page }) => {
    await setDsl(page, `@canvas width=600 height=300 grid=20
state a "A" at 2,4 size 6x4
state b "B" at 16,4 size 6x4
a -> b : go`);
    const len = await page.evaluate(() => parsed.transitions[0]._renderedRoute.length);
    expect(len).toBe(2);
  });

  test('automotive-ecu.sstate default render: zero penetrations', async ({ page }) => {
    await loadExample(page, 'automotive-ecu.sstate');
    const r = await page.evaluate(checkPenetrations);
    expect(r.routed).toBeGreaterThan(0);
    expect(r.penetrations).toBe(0);
    expect(r.nonOrtho).toBe(0);
  });

  test('tcp-connection.sstate default render: zero penetrations', async ({ page }) => {
    await loadExample(page, 'tcp-connection.sstate');
    const r = await page.evaluate(checkPenetrations);
    expect(r.routed).toBeGreaterThan(0);
    expect(r.penetrations).toBe(0);
    expect(r.nonOrtho).toBe(0);
  });

  test('avoidance survives a DSL edit (re-render recomputes routes)', async ({ page }) => {
    await setDsl(page, `@canvas width=800 height=400 grid=20
state a "A" at 2,5 size 6x4
state b "B" at 14,5 size 6x4
state c "C" at 26,5 size 6x4
a -> c : go`);
    // Edit: add an unrelated transition, forcing parseDSL + re-render
    await setDsl(page, `@canvas width=800 height=400 grid=20
state a "A" at 2,5 size 6x4
state b "B" at 14,5 size 6x4
state c "C" at 26,5 size 6x4
a -> c : go
b -> c : next`);
    const r = await page.evaluate(checkPenetrations);
    expect(r.routed).toBe(2);
    expect(r.penetrations).toBe(0);
  });

  test('render stays fast on the largest example', async ({ page }) => {
    await loadExample(page, 'automotive-ecu.sstate');
    const ms = await page.evaluate(() => {
      const t0 = performance.now();
      for (let i = 0; i < 10; i++) renderSVG(parsed);
      return (performance.now() - t0) / 10;
    });
    expect(ms).toBeLessThan(200);
  });

  test('no page errors after rendering all examples', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadExample(page, 'automotive-ecu.sstate');
    await loadExample(page, 'tcp-connection.sstate');
    await page.waitForTimeout(100);
    expect(errors).toEqual([]);
  });
});
