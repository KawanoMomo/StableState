// OBS-19 regression test — @internal self-transitions that carry a
// meaningful trigger (or guard / action) must NOT be silently dropped
// by `cleanupInternalTransitions()` when a DSL is loaded.
//
// Bug: on load of examples/automotive-ecu.sstate, line 85:
//   run -> run : EvWatchdogKick @internal
// is erased by `cleanupInternalTransitions()` inside `refresh()` because
// the pre-fix predicate was "any @internal without `/ action` is junk".
// This is silent data loss: the user wrote a watchdog tick self-transition
// that only carries trigger information (state does not change, no action
// runs, the trigger itself is the signal) and the tool throws it away.
//
// Fix direction (plan.md Sprint 5 — minimal): keep the cleanup alive but
// tighten its predicate. Only remove transitions whose body after the ':'
// is literally empty apart from the `@internal` marker itself — i.e.
// "X -> Y : @internal" with no trigger, no guard, no action. Anything
// meaningful in the body protects the line.
//
// ACs verified here:
//   * AC1: after loading automotive-ecu.sstate, getDsl() still contains
//          `run -> run : EvWatchdogKick @internal`.
//   * AC2: the total arrow-line count (`->`) in the loaded DSL equals the
//          arrow-line count of the raw file on disk (no other silent drops).
//   * AC3: parsed.transitions contains a matching entry (from=run, to=run,
//          event=EvWatchdogKick, kind=internal), i.e. runtime representation
//          also retains the transition.
//   * AC4 (negative / regression-lock): a synthetic DSL that contains a
//          truly empty `a -> b : @internal` line (no trigger, no guard,
//          no action) still gets that specific line cleaned up on load.
//          This proves the fix is "narrow the predicate", not
//          "disable cleanup".
//   * AC5: after loading automotive-ecu.sstate AND tcp-connection.sstate,
//          errorBar shows 0 errors, SVG root is non-empty. (Smoke.)
//   * AC7: zero console errors across the whole flow.
//
// Note on globals: `parsed` is a script-scoped `let` in stablestate.html,
// so it is accessed via direct eval inside page.evaluate — same pattern as
// sprint-1..4 tests.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const AUTOMOTIVE_PATH = path.join(__dirname, '..', '..', '..', 'examples', 'automotive-ecu.sstate');
const TCP_PATH = path.join(__dirname, '..', '..', '..', 'examples', 'tcp-connection.sstate');

const AUTOMOTIVE_DSL = fs.readFileSync(AUTOMOTIVE_PATH, 'utf8').replace(/\r\n/g, '\n');
const TCP_DSL = fs.readFileSync(TCP_PATH, 'utf8').replace(/\r\n/g, '\n');

// Count arrow lines (transitions) using a word-level regex that ignores
// comments (# ...) and blank lines, the way a human would eyeball it.
function countArrowLines(dsl) {
  return dsl.split('\n').filter(l => {
    const t = l.trim();
    if (!t || t.startsWith('#')) return false;
    return /->/.test(t);
  }).length;
}

test.describe('OBS-19: @internal self-transitions with a meaningful trigger are preserved', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', d => d.dismiss().catch(() => {}));
  });

  test('AC1+AC2+AC3: automotive-ecu.sstate keeps `run -> run : EvWatchdogKick @internal` after load', async ({ page }) => {
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', err => { pageErrors.push(err.message); });

    await page.goto('/stablestate.html');
    await page.waitForFunction(() =>
      typeof window.setDsl === 'function' &&
      typeof window.getDsl === 'function' &&
      typeof window.refresh === 'function'
    );

    const result = await page.evaluate(dsl => {
      window.setDsl(dsl);
      window.refresh();
      // eslint-disable-next-line no-eval
      const p = eval('parsed');
      const allT = p && p.transitions ? p.transitions : [];
      return {
        dsl: window.getDsl(),
        errorCount: p && p.errors ? p.errors.length : -1,
        errorMsgs: p && p.errors ? p.errors.map(e => 'L' + e.line + ': ' + e.msg) : [],
        watchdogTransitions: allT
          .filter(t => t.from === 'run' && t.to === 'run' && t.kind === 'internal')
          .map(t => ({ from: t.from, to: t.to, event: t.event, guard: t.guard, action: t.action, kind: t.kind })),
        transitionCount: allT.length
      };
    }, AUTOMOTIVE_DSL);

    // AC1: DSL text itself must still mention the exact line
    expect(
      result.dsl.indexOf('run -> run : EvWatchdogKick @internal'),
      `after loading automotive-ecu.sstate, getDsl() should still contain the EvWatchdogKick @internal self-transition.\n` +
      `Current DSL lines containing EvWatchdogKick or @internal:\n` +
      result.dsl.split('\n').filter(l => /EvWatchdogKick|@internal/.test(l)).map(l => '  ' + l).join('\n')
    ).toBeGreaterThanOrEqual(0);

    // AC2: total arrow-line count must match the raw file (no other lines
    // silently disappeared as a side-effect of our fix). We count arrows
    // in the raw file (as read from disk) and compare to the loaded DSL.
    const arrowsRaw = countArrowLines(AUTOMOTIVE_DSL);
    const arrowsLoaded = countArrowLines(result.dsl);
    expect(
      arrowsLoaded,
      `arrow-line count must match between raw file (${arrowsRaw}) and loaded DSL (${arrowsLoaded}). ` +
      `If this diverges, cleanupInternalTransitions() is still dropping something silently.`
    ).toBe(arrowsRaw);

    // AC3: runtime representation must carry the transition as well.
    expect(
      result.watchdogTransitions.length,
      `expected at least one parsed.transitions entry where from=to=run and kind=internal, got: ${JSON.stringify(result.watchdogTransitions)}`
    ).toBeGreaterThanOrEqual(1);
    expect(
      result.watchdogTransitions[0].event,
      `the preserved @internal self-transition should still carry its trigger event (EvWatchdogKick)`
    ).toBe('EvWatchdogKick');

    // Parser sanity: no new errors introduced by the fix.
    expect(
      result.errorCount,
      `automotive-ecu.sstate must parse cleanly, got errors:\n${result.errorMsgs.join('\n')}`
    ).toBe(0);

    expect(pageErrors, `page errors: ${pageErrors.join('\n')}`).toEqual([]);
    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('AC4: a truly empty `X -> Y : @internal` (no trigger, no guard, no action) is still cleaned up on load', async ({ page }) => {
    // Synthetic DSL — minimal two-state graph plus a naked @internal line
    // that carries no trigger, no guard, no action. The pre-existing
    // cleanup semantics for this exact shape must still fire after the
    // fix; otherwise the fix has accidentally turned itself into a
    // blanket `cleanup = noop`.
    const EMPTY_INTERNAL_DSL = `@canvas width=400 height=300 grid=20
initial ini at 0.5,1
state a "A" at 1,1 size 6x4
state b "B" at 10,1 size 6x4
ini -> a
a -> b : Go
a -> b : @internal
`;
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await page.goto('/stablestate.html');
    await page.waitForFunction(() => typeof window.setDsl === 'function' && typeof window.refresh === 'function');

    const result = await page.evaluate(dsl => {
      window.setDsl(dsl);
      window.refresh();
      // eslint-disable-next-line no-eval
      const p = eval('parsed');
      return {
        dsl: window.getDsl(),
        errorCount: p && p.errors ? p.errors.length : -1,
        errorMsgs: p && p.errors ? p.errors.map(e => 'L' + e.line + ': ' + e.msg) : []
      };
    }, EMPTY_INTERNAL_DSL);

    // AC4: the specific empty @internal line must be gone
    expect(
      result.dsl.indexOf('a -> b : @internal'),
      `a truly empty \`a -> b : @internal\` line should be cleaned up on load; got DSL:\n${result.dsl}`
    ).toBe(-1);

    // But the other real transition (a -> b : Go) must remain
    expect(
      result.dsl.indexOf('a -> b : Go'),
      `the non-@internal transition \`a -> b : Go\` must be preserved after cleanup; got DSL:\n${result.dsl}`
    ).toBeGreaterThanOrEqual(0);

    expect(result.errorCount, `synthetic DSL should parse cleanly, got:\n${result.errorMsgs.join('\n')}`).toBe(0);
    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('AC5: automotive-ecu.sstate and tcp-connection.sstate both load without errorBar or SVG regression', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await page.goto('/stablestate.html');
    await page.waitForFunction(() => typeof window.setDsl === 'function' && typeof window.refresh === 'function');

    for (const [name, dsl] of [['automotive-ecu', AUTOMOTIVE_DSL], ['tcp-connection', TCP_DSL]]) {
      const snap = await page.evaluate(d => {
        window.setDsl(d);
        window.refresh();
        // eslint-disable-next-line no-eval
        const p = eval('parsed');
        const svg = document.querySelector('#svg-wrap svg');
        const errorBar = document.getElementById('error-bar');
        return {
          parsedErrorCount: p && p.errors ? p.errors.length : -1,
          parsedErrorMsgs: p && p.errors ? p.errors.map(e => 'L' + e.line + ': ' + e.msg) : [],
          svgPresent: !!svg,
          svgChildCount: svg ? svg.childElementCount : 0,
          errorBarText: errorBar ? (errorBar.textContent || '').trim() : null,
          errorBarVisible: errorBar ? (errorBar.style.display !== 'none' && (errorBar.textContent || '').trim().length > 0) : false
        };
      }, dsl);

      expect(snap.parsedErrorCount, `${name}: parsed.errors should be empty, got:\n${snap.parsedErrorMsgs.join('\n')}`).toBe(0);
      expect(snap.svgPresent, `${name}: SVG root should be rendered`).toBe(true);
      expect(snap.svgChildCount, `${name}: SVG should contain child elements`).toBeGreaterThan(0);
      expect(snap.errorBarVisible, `${name}: errorBar should not be visible, text=${JSON.stringify(snap.errorBarText)}`).toBe(false);
    }

    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  });
});
