// OBS-04 regression test — AutoRoute must not throw ReferenceError.
//
// Bug: clicking the `AutoRoute` toolbar button throws
//   ReferenceError: getBox is not defined at autoRoute (stablestate.html:4760:20)
// because `getBox` (and the other routing helpers) live inside the
// `renderSVG` closure but top-level `autoRoute` tries to call them directly.
//
// This test loads stablestate.html, seeds a multi-transition DSL, captures
// console errors, calls autoRoute(), and asserts that no ReferenceError was
// emitted. It also checks that the function ran to completion (at least one
// of the expected user-visible side effects occurred — alert dialog).
//
// Note on globals: stablestate.html uses classic-script `let parsed = null`,
// which is NOT exposed on `window`. Top-level `function` declarations *are*
// window properties (setDsl, getDsl, autoRoute, parseDSL, replaceTransition,
// stateDotPath, resolveStateRef, refresh). We access the script-scoped
// `parsed` binding via direct-eval-in-page-context where needed.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const EXAMPLE_DSL = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'examples', 'tcp-connection.sstate'),
  'utf8'
);

// Small synthetic DSL with four states and multiple transitions. The exact
// crossing outcome depends on the deterministic edge-gap algorithm; what
// matters for AC2 is that `autoRoute` runs its route-building loop for
// every transition. We verify that by spying on `resolveStateRef` (invoked
// from inside the restored `getBox` helper) and asserting it was called
// at least twice per transition (once for src, once for tgt).
const MULTI_TRANS_DSL = `@canvas width=400 height=320 grid=20
initial p at 0.5,3
state a "A" at 1,1 size 4x3
state b "B" at 10,1 size 4x3
state c "C" at 1,8 size 4x3
state d "D" at 10,8 size 4x3
p -> a
a -> d : E1
c -> b : E2
a -> b : E3
c -> d : E4
`;

test.describe('OBS-04: AutoRoute no longer throws ReferenceError', () => {
  test('AC1+AC2: autoRoute runs over all transitions without ReferenceError', async ({ page }) => {
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => {
      pageErrors.push(err.message + '\n' + (err.stack || ''));
    });

    // Capture alert dialogs (autoRoute may report its result via alert())
    const dialogs = [];
    page.on('dialog', async dialog => {
      dialogs.push({ type: dialog.type(), message: dialog.message() });
      await dialog.dismiss();
    });

    await page.goto('/stablestate.html');
    await page.waitForFunction(() => typeof window.autoRoute === 'function' && typeof window.setDsl === 'function');

    // Load the multi-transition DSL
    const parsedStats = await page.evaluate(dsl => {
      window.setDsl(dsl);
      if (typeof window.refresh === 'function') window.refresh();
      // parsed is script-scoped (let) so access via direct eval inside page.
      // eslint-disable-next-line no-eval
      const p = eval('parsed');
      return {
        hasParsed: !!p,
        transitionCount: p && p.transitions ? p.transitions.length : -1,
        errorCount: p && p.errors ? p.errors.length : -1,
      };
    }, MULTI_TRANS_DSL);
    expect(parsedStats.hasParsed, 'parsed should be populated after setDsl+refresh').toBe(true);
    expect(parsedStats.errorCount, 'DSL should have zero parse errors').toBe(0);
    expect(parsedStats.transitionCount, 'DSL should have >= 2 transitions').toBeGreaterThanOrEqual(2);

    // Clear any pre-existing errors from the initial load phase
    consoleErrors.length = 0;
    pageErrors.length = 0;

    // Spy on resolveStateRef (called by the restored getBox helper for every
    // transition's src+tgt) so we can prove the routing loop actually ran.
    // Then invoke autoRoute. Before the fix this would throw ReferenceError
    // on the very first call to getBox(), so resolveStateRef would be called
    // 0 times from inside autoRoute.
    const callResult = await page.evaluate(() => {
      const origResolve = window.resolveStateRef;
      let callCount = 0;
      window.resolveStateRef = function(ref, p) {
        callCount++;
        return origResolve.apply(this, arguments);
      };
      try {
        window.autoRoute();
        return { ok: true, resolveCalls: callCount };
      } catch (e) {
        return { ok: false, resolveCalls: callCount, error: String(e) + '\n' + (e.stack || '') };
      } finally {
        window.resolveStateRef = origResolve;
      }
    });

    // AC1: no ReferenceError in console or as a page error
    const allErrorText = consoleErrors.join('\n') + '\n' + pageErrors.join('\n') + '\n' + (callResult.error || '');
    expect(allErrorText, `AutoRoute should not throw ReferenceError. Captured:\n${allErrorText}`).not.toMatch(/ReferenceError/);
    expect(allErrorText).not.toMatch(/getBox is not defined/);
    expect(callResult.ok, 'autoRoute() should run to completion').toBe(true);

    // AC2: autoRoute actually exercises its routing logic. For N transitions,
    // the first loop alone does 2 resolveStateRef calls per transition (src+tgt
    // via getBox), so we expect at least 2*N calls. Before the fix, the very
    // first getBox threw ReferenceError, so resolveStateRef was never called
    // from inside autoRoute and callCount was 0. After the fix we get >= 2*N.
    const expectedMin = 2 * parsedStats.transitionCount;
    expect(
      callResult.resolveCalls,
      `autoRoute should call resolveStateRef at least ${expectedMin} times (2 per transition). Got ${callResult.resolveCalls}`
    ).toBeGreaterThanOrEqual(expectedMin);

    // AC7: no console errors at all during the autoRoute invocation
    expect(
      consoleErrors,
      `Expected 0 console errors during autoRoute, got:\n${consoleErrors.join('\n')}`
    ).toEqual([]);
    expect(
      pageErrors,
      `Expected 0 page errors during autoRoute, got:\n${pageErrors.join('\n')}`
    ).toEqual([]);
  });

  test('AC1: autoRoute on tcp-connection.sstate runs without ReferenceError', async ({ page }) => {
    // Additional smoke test against the actual example file. We do NOT assert
    // an alert here because a well-laid-out diagram may be optimal already,
    // causing autoRoute to return silently — that is correct behavior.
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', err => { pageErrors.push(err.message + '\n' + (err.stack || '')); });
    page.on('dialog', d => d.dismiss().catch(() => {}));

    await page.goto('/stablestate.html');
    await page.waitForFunction(() => typeof window.autoRoute === 'function');

    const callResult = await page.evaluate(dsl => {
      window.setDsl(dsl);
      if (typeof window.refresh === 'function') window.refresh();
      try {
        window.autoRoute();
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String(e) + '\n' + (e.stack || '') };
      }
    }, EXAMPLE_DSL);

    const allErrorText = consoleErrors.join('\n') + '\n' + pageErrors.join('\n') + '\n' + (callResult.error || '');
    expect(allErrorText).not.toMatch(/ReferenceError/);
    expect(callResult.ok).toBe(true);
    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
    expect(pageErrors, `page errors: ${pageErrors.join('\n')}`).toEqual([]);
  });

  // Shared evaluator for AC2: loads `dsl` into the page, snapshots the SVG
  // geometry, invokes autoRoute(), and returns before/after snapshots plus
  // the transition count. Used by the three AC2 literal tests below.
  async function snapshotAutoRouteDelta(page, dsl) {
    page.on('dialog', d => d.dismiss().catch(() => {}));
    await page.goto('/stablestate.html');
    await page.waitForFunction(() => typeof window.autoRoute === 'function' && typeof window.setDsl === 'function');
    return page.evaluate(dslText => {
      window.setDsl(dslText);
      if (typeof window.refresh === 'function') window.refresh();
      function snapshot() {
        // renderSVG is injected into #svg-wrap as innerHTML; the inner
        // <svg> element itself has no id.
        const wrap = document.getElementById('svg-wrap');
        if (!wrap) return [];
        const out = [];
        const polylines = wrap.querySelectorAll('polyline');
        for (const el of polylines) {
          out.push('polyline:' + (el.getAttribute('points') || ''));
        }
        const paths = wrap.querySelectorAll('path');
        for (const el of paths) {
          out.push('path:' + (el.getAttribute('d') || ''));
        }
        return out;
      }
      const before = snapshot();
      // eslint-disable-next-line no-eval
      const pBefore = eval('parsed');
      const transitionCount = pBefore && pBefore.transitions ? pBefore.transitions.length : -1;
      // Invoke autoRoute. autoRoute is expected to re-render the SVG itself;
      // the test deliberately does NOT call refresh() between snapshots.
      window.autoRoute();
      const after = snapshot();
      return { before, after, transitionCount };
    }, dsl);
  }

  function assertAC2Delta(result, label) {
    expect(result.transitionCount, `${label}: DSL should have >= 2 transitions`).toBeGreaterThanOrEqual(2);
    expect(result.before.length, `${label}: snapshot should contain at least one geometry entry`).toBeGreaterThan(0);
    expect(result.after.length, `${label}: snapshot length should be stable across autoRoute`).toBe(result.before.length);
    const diffs = [];
    for (let i = 0; i < result.before.length; i++) {
      if (result.before[i] !== result.after[i]) {
        diffs.push({ i, before: result.before[i], after: result.after[i] });
      }
    }
    expect(
      diffs.length,
      `${label} (AC2): expected at least 1 transition path to change after autoRoute, got 0.\n` +
      `Before snapshot (${result.before.length} entries):\n${result.before.join('\n')}\n\n` +
      `After snapshot (${result.after.length} entries):\n${result.after.join('\n')}`
    ).toBeGreaterThanOrEqual(1);
  }

  test('AC2 literal (synthetic): autoRoute causes at least one transition\'s d/points to change', async ({ page }) => {
    // AC2 wording from docs/ux-brushup/plan.md:
    //   "同上操作の前後で、少なくとも 1 本の遷移の `d` 属性 (SVG path) または
    //    中継点が変化する (Playwright snapshot 差分で確認)。
    //    「クリックしても何も変化しない」状態ではなくなったことを証拠化する。"
    //
    // The previous OBS-04 fix only restored the getBox helper so autoRoute
    // wouldn't throw ReferenceError — but the function still silently early-
    // returned on `currentCrossings === 0` and never wrote its results back
    // to any rendered element, so zero polylines/paths changed after click.
    // This test snapshots every transition's rendered geometry before and
    // after autoRoute and asserts at least one entry differs.
    const result = await snapshotAutoRouteDelta(page, MULTI_TRANS_DSL);
    assertAC2Delta(result, 'MULTI_TRANS_DSL');
  });

  test('AC2 literal (tcp-connection.sstate): autoRoute changes at least one transition\'s geometry', async ({ page }) => {
    // Real sample file the Evaluator exercised during Sprint 1 review. The
    // previous fix produced 0 deltas on this file (evaluator report AC2).
    const result = await snapshotAutoRouteDelta(page, EXAMPLE_DSL);
    assertAC2Delta(result, 'tcp-connection.sstate');
  });

  test('AC2 literal (automotive-ecu.sstate): autoRoute changes at least one transition\'s geometry', async ({ page }) => {
    // Second real sample file the Evaluator exercised during Sprint 1 review.
    // 26 transitions, includes reverse-direction pairs and nested composites.
    const AUTOMOTIVE_DSL = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'examples', 'automotive-ecu.sstate'),
      'utf8'
    );
    const result = await snapshotAutoRouteDelta(page, AUTOMOTIVE_DSL);
    assertAC2Delta(result, 'automotive-ecu.sstate');
  });

  test('AC5 regression: examples still load with 0 errorBar entries', async ({ page }) => {
    // Handle any accidental dialogs so they don't hang the test
    page.on('dialog', d => d.dismiss().catch(() => {}));

    await page.goto('/stablestate.html');
    await page.waitForFunction(() => typeof window.setDsl === 'function');

    for (const file of ['automotive-ecu.sstate', 'tcp-connection.sstate']) {
      const dsl = fs.readFileSync(
        path.join(__dirname, '..', '..', '..', 'examples', file),
        'utf8'
      );
      const errorCount = await page.evaluate(dslText => {
        window.setDsl(dslText);
        if (typeof window.refresh === 'function') window.refresh();
        // eslint-disable-next-line no-eval
        const p = eval('parsed');
        return p && p.errors ? p.errors.length : -1;
      }, dsl);
      expect(errorCount, `${file} should parse with 0 errors`).toBe(0);
    }
  });
});
