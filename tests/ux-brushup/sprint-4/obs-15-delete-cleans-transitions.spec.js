// OBS-15 regression test — deleting a state must also delete transitions
// that reference it, and the whole operation must be a single Undo
// transaction.
//
// Bug: loading examples/automotive-ecu.sstate, selecting `cruise` (nested
// under run.normal.active), and pressing Delete removes the `state cruise`
// definition but leaves the two referencing transitions
//   accel -> cruise : EvSpeedReached [v>=target]
//   cruise -> accel : EvSpeedLost [v<target-5] / ResetPID
// in the DSL. The parser then reports two `Undefined state reference:
// cruise` errors.
//
// Root cause: `removeDSLElement` passes the full dotted path
// (`run.normal.active.cruise`) as `transId` when building the orphan
// transition regex, but the referencing transitions in the DSL use the
// bare ID (`cruise`). The regex never matches and the orphan lines
// survive.
//
// Fix direction (plan.md Sprint 4): in the delete handler (or inside
// removeDSLElement), strip references by BOTH the bare ID and the dotted
// path, in the SAME pushHistory transaction `deleteSelected` already
// opens. AC3 requires a single Ctrl+Z to restore cruise AND both
// transitions, i.e. the orphan sweep must NOT call pushHistory again.
//
// ACs verified here:
//   * AC1: after Del, DSL contains 0 lines that mention `cruise`.
//   * AC2: after Del, `parsed.errors` has 0 entries whose `msg` contains
//          `Undefined state reference`.
//   * AC3: Ctrl+Z (window.undo()) restores cruise AND both transitions
//          in a single undo step — the DSL `cruise` occurrence count goes
//          back to its original value.
//   * AC8: no console errors during the whole flow.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const AUTOMOTIVE_DSL = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'examples', 'automotive-ecu.sstate'),
  'utf8'
).replace(/\r\n/g, '\n');

// Count `cruise` occurrences as a word boundary so we don't pick up e.g.
// `CruiseCtrl` (camel case starts with capital, grep-safe).
function countCruise(dsl) {
  const m = dsl.match(/\bcruise\b/g);
  return m ? m.length : 0;
}

test.describe('OBS-15: Deleting a state removes orphan transitions and undo is atomic', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', d => d.dismiss().catch(() => {}));
  });

  test('AC1+AC2+AC3: cruise deletion drops referencing transitions, errors stay at 0, undo restores all in one step', async ({ page }) => {
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', err => { pageErrors.push(err.message); });

    await page.goto('/stablestate.html');
    await page.waitForFunction(() =>
      typeof window.setDsl === 'function' &&
      typeof window.refresh === 'function' &&
      typeof window.deleteSelected === 'function' &&
      typeof window.undo === 'function'
    );

    // Step 1: Load automotive-ecu.sstate and verify baseline is clean.
    const baseline = await page.evaluate(dsl => {
      window.setDsl(dsl);
      window.refresh();
      // eslint-disable-next-line no-eval
      const p = eval('parsed');
      return {
        dsl: window.getDsl(),
        errorCount: p && p.errors ? p.errors.length : -1,
        errorMsgs: p && p.errors ? p.errors.map(e => 'L' + e.line + ': ' + e.msg) : [],
        cruiseIsInStateMap: !!(p && p.stateMap && (p.stateMap['cruise'] || p.stateMap['run.normal.active.cruise'])),
        cruisePath: p && p.stateMap && p.stateMap['cruise'] ? (p.stateMap['cruise'].path || p.stateMap['cruise'].id) : null
      };
    }, AUTOMOTIVE_DSL);

    expect(
      baseline.errorCount,
      `automotive-ecu.sstate must parse cleanly before the test, got errors:\n${baseline.errorMsgs.join('\n')}`
    ).toBe(0);
    expect(baseline.cruiseIsInStateMap, 'cruise state should exist in parsed.stateMap').toBe(true);

    const cruiseCountBefore = countCruise(baseline.dsl);
    // We expect 3 occurrences: the `state cruise` def line + `accel -> cruise`
    // + `cruise -> accel`. Assert a sanity minimum so a future DSL edit
    // doesn't accidentally make this test vacuous.
    expect(
      cruiseCountBefore,
      `baseline DSL should mention cruise at least 3 times (def + 2 transitions), got ${cruiseCountBefore}`
    ).toBeGreaterThanOrEqual(3);

    // Step 2: Select cruise by assigning `sel` directly — this mirrors what
    // the mouse-click path does in setupInteractions (uses data-id = path).
    // Then call deleteSelected() to simulate the Del key code path.
    const afterDelete = await page.evaluate(cruisePath => {
      // eslint-disable-next-line no-eval
      eval('sel = [{type: "state", id: ' + JSON.stringify(cruisePath) + '}]');
      window.deleteSelected();
      // eslint-disable-next-line no-eval
      const p = eval('parsed');
      return {
        dsl: window.getDsl(),
        errorCount: p && p.errors ? p.errors.length : -1,
        errorMsgs: p && p.errors ? p.errors.map(e => 'L' + e.line + ': ' + e.msg) : [],
        undefRefErrors: p && p.errors
          ? p.errors.filter(e => /Undefined state reference/.test(e.msg)).map(e => 'L' + e.line + ': ' + e.msg)
          : []
      };
    }, baseline.cruisePath);

    // AC1: DSL must not mention `cruise` anywhere anymore
    const cruiseCountAfter = countCruise(afterDelete.dsl);
    expect(
      cruiseCountAfter,
      `after deleting cruise, DSL should contain 0 \`cruise\` references, got ${cruiseCountAfter}.\n` +
      `DSL lines referencing cruise:\n` +
      afterDelete.dsl.split('\n').filter(l => /\bcruise\b/.test(l)).map(l => '  ' + l).join('\n')
    ).toBe(0);

    // AC2: no Undefined state reference errors
    expect(
      afterDelete.undefRefErrors,
      `expected 0 'Undefined state reference' errors after cruise deletion, got:\n${afterDelete.undefRefErrors.join('\n')}`
    ).toEqual([]);

    // Also assert the overall parser is clean (no new errors introduced by
    // our edit).
    expect(
      afterDelete.errorCount,
      `after cruise deletion the DSL should still parse cleanly, got:\n${afterDelete.errorMsgs.join('\n')}`
    ).toBe(0);

    // Step 3: AC3 — single Undo must restore cruise AND both transitions
    // (i.e. the orphan sweep must live inside the SAME pushHistory
    // transaction deleteSelected opens).
    const afterUndo = await page.evaluate(() => {
      window.undo();
      // eslint-disable-next-line no-eval
      const p = eval('parsed');
      return {
        dsl: window.getDsl(),
        errorCount: p && p.errors ? p.errors.length : -1,
        errorMsgs: p && p.errors ? p.errors.map(e => 'L' + e.line + ': ' + e.msg) : []
      };
    });

    const cruiseCountAfterUndo = countCruise(afterUndo.dsl);
    expect(
      cruiseCountAfterUndo,
      `after a single undo, cruise occurrence count should return to baseline (${cruiseCountBefore}), got ${cruiseCountAfterUndo}.\n` +
      `Undo must be a SINGLE transaction: state def + both transitions restored together.`
    ).toBe(cruiseCountBefore);
    expect(
      afterUndo.errorCount,
      `after undo the DSL should parse cleanly, got:\n${afterUndo.errorMsgs.join('\n')}`
    ).toBe(0);

    expect(pageErrors, `page errors: ${pageErrors.join('\n')}`).toEqual([]);
    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('AC1 cross-check: top-level state deletion also cleans orphan transitions (bare ID path)', async ({ page }) => {
    // Synthetic DSL with a top-level state (bare ID, no dot path) to make
    // sure the fix also covers the non-nested case — and does not regress
    // the already-working top-level branch.
    const SIMPLE_DSL = `@canvas width=400 height=300 grid=20
initial ini at 0.5,1
state a "A" at 1,1 size 6x4
state b "B" at 10,1 size 6x4
state c "C" at 10,8 size 6x4
ini -> a
a -> b : E1
b -> a : E2
b -> c : E3
`;
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await page.goto('/stablestate.html');
    await page.waitForFunction(() =>
      typeof window.setDsl === 'function' && typeof window.deleteSelected === 'function'
    );

    const result = await page.evaluate(dsl => {
      window.setDsl(dsl);
      window.refresh();
      // eslint-disable-next-line no-eval
      eval('sel = [{type: "state", id: "b"}]');
      window.deleteSelected();
      // eslint-disable-next-line no-eval
      const p = eval('parsed');
      return {
        dsl: window.getDsl(),
        errorCount: p && p.errors ? p.errors.length : -1,
        errorMsgs: p && p.errors ? p.errors.map(e => 'L' + e.line + ': ' + e.msg) : []
      };
    }, SIMPLE_DSL);

    // After deleting b, no line should mention `b` as a whole token.
    const bLines = result.dsl.split('\n').filter(l => /\bb\b/.test(l));
    expect(
      bLines,
      `after deleting b, no DSL line should reference b, got:\n${bLines.join('\n')}`
    ).toEqual([]);
    expect(result.errorCount, `DSL should parse cleanly after delete, got:\n${result.errorMsgs.join('\n')}`).toBe(0);
    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  });
});
