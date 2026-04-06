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

test.describe('A* grid router core', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.waitForFunction(() => typeof parsed !== 'undefined');
  });

  test('buildObstacleGrid marks state boxes as obstacles', async ({ page }) => {
    await setDsl(page, `@canvas width=200 height=200 grid=20
initial i at 1,1
state a "A" at 3,3 size 4x3
i -> a`);
    const result = await page.evaluate(() => {
      const og = buildObstacleGrid(parsed);
      // State 'a' at grid (3,3) size 4x3 → pixel (60,60) to (140,120)
      // With 1-cell margin, cells inside the box should be 0
      const insideCell = og.cells[4 * og.cols + 5]; // row=4, col=5 (inside box area)
      const outsideCell = og.cells[0 * og.cols + 0]; // row=0, col=0 (outside, unless initial hits)
      return { insideCell, outsideCell, cols: og.cols, rows: og.rows };
    });
    expect(result.insideCell).toBe(0);
    expect(result.cols).toBe(10);
    expect(result.rows).toBe(10);
  });

  test('astarRoute finds path avoiding obstacles', async ({ page }) => {
    await setDsl(page, `@canvas width=400 height=200 grid=20
initial i at 1,5
state a "A" at 3,2 size 4x3
state b "B" at 12,2 size 4x3
i -> a
a -> b`);
    const result = await page.evaluate(() => {
      const og = buildObstacleGrid(parsed);
      const g = parsed.canvas.grid;
      const srcBox = getBoxShared('a', parsed, g);
      const tgtBox = getBoxShared('b', parsed, g);
      const path = astarRoute(og, srcBox, tgtBox, new Set());
      return path;
    });
    expect(result).not.toBeNull();
    expect(result.length).toBeGreaterThanOrEqual(2);
    // All segments must be orthogonal
    for (let i = 1; i < result.length; i++) {
      const dx = Math.abs(result[i].x - result[i - 1].x);
      const dy = Math.abs(result[i].y - result[i - 1].y);
      expect(dx === 0 || dy === 0).toBe(true);
    }
  });

  test('astarRoute avoids intermediate boxes', async ({ page }) => {
    await setDsl(page, `@canvas width=600 height=300 grid=20
initial i at 1,1
state a "A" at 2,3 size 4x3
state blocker "Block" at 9,1 size 4x8
state b "B" at 16,3 size 4x3
i -> a
a -> b`);
    const result = await page.evaluate(() => {
      const og = buildObstacleGrid(parsed);
      const g = parsed.canvas.grid;
      const srcBox = getBoxShared('a', parsed, g);
      const tgtBox = getBoxShared('b', parsed, g);
      const blockerBox = getBoxShared('blocker', parsed, g);
      const path = astarRoute(og, srcBox, tgtBox, new Set());
      if (!path) return { path: null };
      let penetrates = false;
      for (let i = 1; i < path.length; i++) {
        const p1 = path[i - 1], p2 = path[i];
        const bx1 = blockerBox.x, by1 = blockerBox.y;
        const bx2 = blockerBox.x + blockerBox.w, by2 = blockerBox.y + blockerBox.h;
        if (p1.y === p2.y) {
          const y = p1.y, xMin = Math.min(p1.x, p2.x), xMax = Math.max(p1.x, p2.x);
          if (y > by1 && y < by2 && xMax > bx1 && xMin < bx2) penetrates = true;
        }
        if (p1.x === p2.x) {
          const x = p1.x, yMin = Math.min(p1.y, p2.y), yMax = Math.max(p1.y, p2.y);
          if (x > bx1 && x < bx2 && yMax > by1 && yMin < by2) penetrates = true;
        }
      }
      return { path, penetrates };
    });
    expect(result.path).not.toBeNull();
    expect(result.penetrates).toBe(false);
  });

  test('astarRoute returns null when completely blocked', async ({ page }) => {
    await setDsl(page, `@canvas width=200 height=200 grid=20
state wall1 "W1" at 0,0 size 10x10
state a "A" at 3,3 size 2x2
state b "B" at 7,7 size 2x2`);
    const result = await page.evaluate(() => {
      const og = buildObstacleGrid(parsed);
      const g = parsed.canvas.grid;
      const srcBox = getBoxShared('a', parsed, g);
      const tgtBox = getBoxShared('b', parsed, g);
      return astarRoute(og, srcBox, tgtBox, new Set());
    });
    expect(result).toBeNull();
  });

  test('simplifyPath collapses collinear points', async ({ page }) => {
    const result = await page.evaluate(() => {
      const gridPath = [
        { gx: 1, gy: 3 }, { gx: 2, gy: 3 }, { gx: 3, gy: 3 },
        { gx: 3, gy: 4 }, { gx: 3, gy: 5 }
      ];
      return simplifyPath(gridPath, 20);
    });
    expect(result.length).toBe(3);
    expect(result[0]).toEqual({ x: 30, y: 70 });
    expect(result[1]).toEqual({ x: 70, y: 70 });
    expect(result[2]).toEqual({ x: 70, y: 110 });
  });
});
