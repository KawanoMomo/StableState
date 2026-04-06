// @ts-check
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

/** Check if any waypoint segment penetrates any non-src/tgt box */
function checkPenetrations() {
  // Runs in page context
  const g = parsed.canvas.grid;
  const boxes = parsed.states
    .filter(s => s.children.length === 0)
    .map(s => getBoxShared(s.id, parsed, g))
    .filter(Boolean);
  // Also add pseudo-state boxes
  for (const ps of parsed.pseudoStates) {
    const b = getBoxShared(ps.id, parsed, g);
    if (b) boxes.push(b);
  }
  let penetrations = 0;
  let routed = 0;
  for (const tr of parsed.transitions) {
    const wp = tr._autoRouteWaypoints;
    if (!wp || wp.length < 2) continue;
    routed++;
    const srcBox = getBoxShared(tr.from, parsed, g);
    const tgtBox = getBoxShared(tr.to, parsed, g);
    for (let k = 1; k < wp.length; k++) {
      const p1 = wp[k - 1], p2 = wp[k];
      for (const box of boxes) {
        // Skip source and target boxes
        if (srcBox && Math.abs(box.x - srcBox.x) < 1 && Math.abs(box.y - srcBox.y) < 1 &&
            Math.abs(box.w - srcBox.w) < 1 && Math.abs(box.h - srcBox.h) < 1) continue;
        if (tgtBox && Math.abs(box.x - tgtBox.x) < 1 && Math.abs(box.y - tgtBox.y) < 1 &&
            Math.abs(box.w - tgtBox.w) < 1 && Math.abs(box.h - tgtBox.h) < 1) continue;
        const bx1 = box.x, by1 = box.y, bx2 = box.x + box.w, by2 = box.y + box.h;
        if (p1.y === p2.y) {
          const y = p1.y, xMin = Math.min(p1.x, p2.x), xMax = Math.max(p1.x, p2.x);
          if (y > by1 && y < by2 && xMax > bx1 && xMin < bx2) penetrations++;
        }
        if (p1.x === p2.x) {
          const x = p1.x, yMin = Math.min(p1.y, p2.y), yMax = Math.max(p1.y, p2.y);
          if (x > bx1 && x < bx2 && yMax > by1 && yMin < by2) penetrations++;
        }
      }
    }
  }
  return { penetrations, routed };
}

test.describe('autoRoute A* edge cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.waitForFunction(() => typeof parsed !== 'undefined');
    page.on('dialog', d => d.dismiss().catch(() => {}));
  });

  test('pseudo-state (initial) routing does not penetrate state boxes', async ({ page }) => {
    await setDsl(page, `@canvas width=600 height=400 grid=20
initial i at 1,5
state sleep "Sleep" at 3,3 size 8x5
state startup "Startup" at 14,3 size 10x5
state run "Run" at 3,12 size 20x10
i -> sleep
sleep -> startup
startup -> run`);
    await page.evaluate(() => autoRoute());
    const result = await page.evaluate(checkPenetrations);
    expect(result.penetrations).toBe(0);
    expect(result.routed).toBeGreaterThan(0);
  });

  test('automotive-ecu.sstate autoRoute: zero box penetrations', async ({ page }) => {
    await loadExample(page, 'automotive-ecu.sstate');
    await page.evaluate(() => autoRoute());
    const result = await page.evaluate(checkPenetrations);
    expect(result.penetrations).toBe(0);
    expect(result.routed).toBeGreaterThan(0);
  });

  test('tcp-connection.sstate autoRoute: zero box penetrations', async ({ page }) => {
    await loadExample(page, 'tcp-connection.sstate');
    await page.evaluate(() => autoRoute());
    const result = await page.evaluate(checkPenetrations);
    expect(result.penetrations).toBe(0);
    expect(result.routed).toBeGreaterThan(0);
  });

  test('autoRoute completes within 2 seconds on automotive-ecu', async ({ page }) => {
    await loadExample(page, 'automotive-ecu.sstate');
    const ms = await page.evaluate(() => {
      const t0 = performance.now();
      autoRoute();
      return performance.now() - t0;
    });
    expect(ms).toBeLessThan(2000);
  });

  test('console.error is zero after autoRoute', async ({ page }) => {
    await loadExample(page, 'automotive-ecu.sstate');
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.evaluate(() => autoRoute());
    await page.waitForTimeout(100);
    expect(errors.length).toBe(0);
  });

  test('all segments are orthogonal', async ({ page }) => {
    await loadExample(page, 'automotive-ecu.sstate');
    await page.evaluate(() => autoRoute());
    const result = await page.evaluate(() => {
      let nonOrthogonal = 0;
      for (const tr of parsed.transitions) {
        const wp = tr._autoRouteWaypoints;
        if (!wp || wp.length < 2) continue;
        for (let i = 1; i < wp.length; i++) {
          const dx = Math.abs(wp[i].x - wp[i-1].x);
          const dy = Math.abs(wp[i].y - wp[i-1].y);
          if (dx > 0.5 && dy > 0.5) nonOrthogonal++;
        }
      }
      return nonOrthogonal;
    });
    expect(result).toBe(0);
  });

  test('autoRoute does not crash on empty DSL', async ({ page }) => {
    await setDsl(page, '');
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.evaluate(() => autoRoute());
    expect(errors.length).toBe(0);
  });
});
