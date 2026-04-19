// OBS-01 regression test — `+State` button must offset newly added states
// so that consecutive clicks don't stack them at the same (10,10) origin.
//
// Bug: `addNewElement('state')` in stablestate.html uses a fixed default
// position `at 10,10` at the root level. Clicking `+State` three times
// yields three DSL lines `state __new_N "New State" at 10,10 size 8x4`
// with identical coordinates, so the diagram shows only one visible
// rectangle even though the DSL has grown.
//
// Fix direction (plan.md Sprint 4): compute a non-overlapping position by
// offsetting from the previous add (or from existing elements). The exact
// algorithm is free as long as three consecutive `+State` clicks on an
// empty DSL yield three distinct `at X,Y` coordinates.
//
// ACs verified here:
//   * AC4: 3 `+State` clicks from an empty DSL → 3 distinct `at X,Y`.
//   * AC5: the 3 resulting states have non-overlapping axis-aligned bboxes
//          (either x or y is different — with the default size 8x4 that is
//          sufficient for visual separation).
//   * AC6: after 3 adds, Undo×3 returns to the original DSL and Redo×3
//          restores all 3 states (positive Undo/Redo baseline must hold).
//   * AC8: no console errors during the whole flow.

const { test, expect } = require('@playwright/test');

// Extract all `at X,Y` pairs from a DSL string. Returns an array of
// { x:number, y:number, raw:string } in textual order.
function extractAtCoords(dsl) {
  const out = [];
  const re = /\bat\s+([\d.]+)\s*,\s*([\d.]+)/g;
  let m;
  while ((m = re.exec(dsl)) !== null) {
    out.push({ x: parseFloat(m[1]), y: parseFloat(m[2]), raw: m[0] });
  }
  return out;
}

// Extract the `state __new_N "..." at X,Y size WxH` lines specifically,
// so we only look at the freshly-added states and not at any other `at`
// coords the file might carry.
function extractNewStateRects(dsl) {
  const out = [];
  const re = /^\s*state\s+(\S+)\s+"[^"]*"\s+at\s+([\d.]+)\s*,\s*([\d.]+)\s+size\s+([\d.]+)x([\d.]+)/gm;
  let m;
  while ((m = re.exec(dsl)) !== null) {
    out.push({
      id: m[1],
      x: parseFloat(m[2]),
      y: parseFloat(m[3]),
      w: parseFloat(m[4]),
      h: parseFloat(m[5])
    });
  }
  return out;
}

function rectsOverlap(a, b) {
  return !(a.x + a.w <= b.x ||
           b.x + b.w <= a.x ||
           a.y + a.h <= b.y ||
           b.y + b.h <= a.y);
}

test.describe('OBS-01: +State button spreads new states to distinct coordinates', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', d => d.dismiss().catch(() => {}));
  });

  test('AC4+AC5: 3 consecutive +State clicks on empty DSL yield 3 distinct, non-overlapping rectangles', async ({ page }) => {
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', err => { pageErrors.push(err.message); });

    await page.goto('/stablestate.html');
    await page.waitForFunction(() =>
      typeof window.setDsl === 'function' &&
      typeof window.refresh === 'function' &&
      typeof window.addNewElement === 'function'
    );

    const result = await page.evaluate(() => {
      // Start from a minimally-valid DSL (empty is also valid, but the
      // canvas line keeps the grid setting predictable).
      window.setDsl('@canvas width=800 height=600 grid=20\n');
      window.refresh();
      // Clear any lingering selection so addNewElement takes the root
      // branch (no parent state).
      // eslint-disable-next-line no-eval
      eval('sel = []');
      window.addNewElement('state');
      window.addNewElement('state');
      window.addNewElement('state');
      return { dsl: window.getDsl() };
    });

    const rects = extractNewStateRects(result.dsl);
    expect(
      rects.length,
      `expected 3 new state lines in DSL, got ${rects.length}. DSL was:\n${result.dsl}`
    ).toBe(3);

    // AC4: all 3 must have distinct `at X,Y`.
    const coordKeys = rects.map(r => r.x + ',' + r.y);
    const uniqCoords = new Set(coordKeys);
    expect(
      uniqCoords.size,
      `expected 3 distinct \`at X,Y\` coords, got keys [${coordKeys.join('; ')}]`
    ).toBe(3);

    // AC5: pairwise non-overlapping bboxes using the DSL-level (grid
    // units) size. This is sufficient for visual separation — the SVG
    // renderer multiplies by grid size, preserving the non-overlap.
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(
          rectsOverlap(rects[i], rects[j]),
          `rects ${i}(${rects[i].id} at ${rects[i].x},${rects[i].y} size ${rects[i].w}x${rects[i].h}) and ` +
          `${j}(${rects[j].id} at ${rects[j].x},${rects[j].y} size ${rects[j].w}x${rects[j].h}) must not overlap`
        ).toBe(false);
      }
    }

    expect(pageErrors, `page errors: ${pageErrors.join('\n')}`).toEqual([]);
    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('AC6: Undo×3 clears the 3 new states and Redo×3 restores them', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await page.goto('/stablestate.html');
    await page.waitForFunction(() =>
      typeof window.setDsl === 'function' &&
      typeof window.addNewElement === 'function' &&
      typeof window.undo === 'function' &&
      typeof window.redo === 'function'
    );

    const EMPTY = '@canvas width=800 height=600 grid=20\n';

    // Seed empty DSL + add 3 states.
    const afterAdd = await page.evaluate(empty => {
      window.setDsl(empty);
      window.refresh();
      // eslint-disable-next-line no-eval
      eval('sel = []');
      window.addNewElement('state');
      window.addNewElement('state');
      window.addNewElement('state');
      return { dsl: window.getDsl() };
    }, EMPTY);

    expect(extractNewStateRects(afterAdd.dsl).length, 'should have 3 new state lines after 3 adds').toBe(3);

    // Undo three times → should return to the original EMPTY DSL (string
    // equality). pushHistory stacks one snapshot per addNewElement call, so
    // three undos unwind all three.
    const afterUndo = await page.evaluate(() => {
      window.undo();
      window.undo();
      window.undo();
      return { dsl: window.getDsl() };
    });

    expect(
      extractNewStateRects(afterUndo.dsl).length,
      `after undo×3 the DSL should have 0 state lines, got:\n${afterUndo.dsl}`
    ).toBe(0);
    expect(
      afterUndo.dsl.trim(),
      'after undo×3 the DSL should be back to the empty seed'
    ).toBe(EMPTY.trim());

    // Redo three times → should restore all 3 states to the same coords
    // as after the initial add (text equality of the whole DSL).
    const afterRedo = await page.evaluate(() => {
      window.redo();
      window.redo();
      window.redo();
      return { dsl: window.getDsl() };
    });

    expect(
      extractNewStateRects(afterRedo.dsl).length,
      'after redo×3 the DSL should have 3 state lines again'
    ).toBe(3);
    expect(
      afterRedo.dsl,
      'after redo×3 the DSL should match the post-add DSL exactly'
    ).toBe(afterAdd.dsl);

    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  });
});
