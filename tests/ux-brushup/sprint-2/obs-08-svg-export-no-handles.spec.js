// OBS-08 regression test — Exported SVG must not contain resize handles.
//
// Bug: `getExportSVGString()` clones the live SVG and strips only the
// `#annotation-banner` element. It does NOT strip the eight
// `<rect data-resize="nw|ne|sw|se|n|s|w|e">` hit rects nor the matching
// eight visible `<rect fill="#6366F1" stroke="#fff">` decoration rects
// that `renderSVG()` emits for every selected element. Consequence: any
// user who exports SVG/PNG with a selection active gets the blue resize
// handles baked into the artifact (persona2 evidence artifact
// `.eval/ux-review-2026-04-05/artifacts/persona2-export-with-handles.svg`).
//
// This test loads automotive-ecu.sstate, selects the `running` composite
// state so that renderSVG emits 8 handle hit rects + 8 visible rects,
// captures the output of `getExportSVGString()` via `browser_evaluate`,
// and asserts:
//   * `data-resize=` appears 0 times (AC1 - strip data-resize)
//   * `fill="#6366F1"` appears 0 times (AC2 - strip blue decoration)
//   * no console errors (AC9)
//
// Note on globals: `sel` and `parsed` are script-scoped `let` bindings and
// are NOT on `window`. We use direct-eval-in-page to reach them, same as
// sprint-1 tests.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const AUTOMOTIVE_DSL = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'examples', 'automotive-ecu.sstate'),
  'utf8'
).replace(/\r\n/g, '\n');

const TCP_DSL = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'examples', 'tcp-connection.sstate'),
  'utf8'
).replace(/\r\n/g, '\n');

test.describe('OBS-08: exported SVG strips resize handles', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', d => d.dismiss().catch(() => {}));
  });

  test('AC1: data-resize= is not present in getExportSVGString() after selecting a state', async ({ page }) => {
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', err => { pageErrors.push(err.message); });

    await page.goto('/stablestate.html');
    await page.waitForFunction(() =>
      typeof window.setDsl === 'function' &&
      typeof window.refresh === 'function' &&
      typeof window.getExportSVGString === 'function'
    );

    const result = await page.evaluate(dsl => {
      window.setDsl(dsl);
      window.refresh();
      // `sel` is script-scoped; reach it via direct eval in page context.
      // Select the `run` composite (which exists in automotive-ecu.sstate).
      // This causes renderSVG() to emit 16 handle rects (8 hit + 8 visible).
      // eslint-disable-next-line no-eval
      eval('sel.length = 0; sel.push({ type: "state", id: "run" });');
      window.refresh();

      // Verify handles are actually present in the LIVE SVG before export
      // (otherwise the test would trivially pass even if the fix were absent).
      const liveWrap = document.getElementById('svg-wrap');
      const liveHandleCount = liveWrap ? liveWrap.querySelectorAll('[data-resize]').length : -1;

      const svgStr = window.getExportSVGString();
      return {
        svgStr,
        liveHandleCount,
        svgLen: svgStr ? svgStr.length : -1
      };
    }, AUTOMOTIVE_DSL);

    // Precondition: live SVG must have handles (proves renderSVG did emit them
    // and that we selected something selectable). 8 handles per selected item.
    expect(
      result.liveHandleCount,
      'Precondition: live SVG should show 8 resize handles for selected `run` state'
    ).toBe(8);
    expect(result.svgStr, 'getExportSVGString() should return a non-empty string').toBeTruthy();
    expect(result.svgLen, 'SVG string should be non-trivial').toBeGreaterThan(100);

    // AC1: no data-resize= attribute anywhere in exported SVG
    const dataResizeMatches = (result.svgStr.match(/data-resize=/g) || []).length;
    expect(
      dataResizeMatches,
      `Exported SVG must contain 0 occurrences of 'data-resize=', found ${dataResizeMatches}.\n` +
      `First 400 chars after first match:\n` +
      (dataResizeMatches > 0
        ? result.svgStr.slice(result.svgStr.indexOf('data-resize='), result.svgStr.indexOf('data-resize=') + 400)
        : '(none)')
    ).toBe(0);

    // AC9: no console errors
    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
    expect(pageErrors, `page errors: ${pageErrors.join('\n')}`).toEqual([]);
  });

  test('AC2: fill="#6366F1" (blue handle decoration) is not present in exported SVG', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await page.goto('/stablestate.html');
    await page.waitForFunction(() => typeof window.getExportSVGString === 'function');

    const result = await page.evaluate(dsl => {
      window.setDsl(dsl);
      window.refresh();
      // eslint-disable-next-line no-eval
      eval('sel.length = 0; sel.push({ type: "state", id: "run" });');
      window.refresh();
      const svgStr = window.getExportSVGString();
      return { svgStr };
    }, AUTOMOTIVE_DSL);

    // AC2: handle decoration rects use fill="#6366F1" (indigo) — count must be 0.
    // Note: stateMap items can legitimately use #6366F1 as their *border* color
    // (e.g. `border=#6366F1` in automotive-ecu.sstate), which renders as
    // `stroke="#6366F1"` in the SVG, not `fill="#6366F1"`. So matching only
    // `fill="#6366F1"` is precise enough to target ONLY the handle decoration.
    const fillMatches = (result.svgStr.match(/fill="#6366F1"/g) || []).length;
    expect(
      fillMatches,
      `Exported SVG must contain 0 handle-blue fill rects, found ${fillMatches}`
    ).toBe(0);

    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('AC1+AC2: also holds after selecting a top-level state in tcp-connection.sstate', async ({ page }) => {
    // Cross-sample smoke: make sure the fix also handles other DSLs with a
    // different state layout. We pick any state via evaluate and select it.
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await page.goto('/stablestate.html');
    await page.waitForFunction(() => typeof window.getExportSVGString === 'function');

    const result = await page.evaluate(dsl => {
      window.setDsl(dsl);
      window.refresh();
      // Grab the first top-level state id from parsed and select it.
      // eslint-disable-next-line no-eval
      const p = eval('parsed');
      const first = (p && p.states || []).find(s => s.parent === null);
      if (first) {
        // eslint-disable-next-line no-eval
        eval('sel.length = 0; sel.push({ type: "state", id: ' + JSON.stringify(first.id) + ' });');
        window.refresh();
      }
      const liveHandleCount = document.querySelectorAll('#svg-wrap [data-resize]').length;
      const svgStr = window.getExportSVGString();
      return {
        svgStr,
        liveHandleCount,
        selectedId: first ? first.id : null
      };
    }, TCP_DSL);

    expect(result.selectedId, 'should have found a top-level state to select').toBeTruthy();
    expect(result.liveHandleCount, 'precondition: 8 live handles in SVG').toBe(8);

    const dataResizeMatches = (result.svgStr.match(/data-resize=/g) || []).length;
    const fillMatches = (result.svgStr.match(/fill="#6366F1"/g) || []).length;
    expect(dataResizeMatches, 'exported SVG must have 0 data-resize= occurrences').toBe(0);
    expect(fillMatches, 'exported SVG must have 0 fill="#6366F1" handle rects').toBe(0);

    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('AC7 regression: examples load with 0 errorBar entries', async ({ page }) => {
    await page.goto('/stablestate.html');
    await page.waitForFunction(() => typeof window.setDsl === 'function');

    for (const file of ['automotive-ecu.sstate', 'tcp-connection.sstate']) {
      const dsl = fs.readFileSync(
        path.join(__dirname, '..', '..', '..', 'examples', file),
        'utf8'
      );
      const errorCount = await page.evaluate(dslText => {
        window.setDsl(dslText);
        window.refresh();
        // eslint-disable-next-line no-eval
        const p = eval('parsed');
        return p && p.errors ? p.errors.length : -1;
      }, dsl);
      expect(errorCount, `${file} should parse with 0 errors`).toBe(0);
    }
  });
});
