// OBS-02 regression test — Unrecognized syntax errors must include a
// template hint showing the expected `state` declaration form.
//
// Bug: when a first-time user types just `state Red` into an empty DSL,
// the parser emits `L1: Unrecognized syntax: state Red` with no guidance
// about the required shape (`state <id> "<label>" at <x>,<y> size <w>x<h>`).
// The user has no signal that label/coords/size are mandatory.
//
// Fix direction (plan.md Sprint 3): APPEND a template hint to the existing
// `Unrecognized syntax` error message. Do NOT rewrite the base wording,
// only add a suffix like `(expected: state <id> "<label>" at <x>,<y> size
// <w>x<h>)`. Must not produce false positives on valid DSLs.
//
// ACs verified here:
//   * AC1: typing `state Red` alone produces an errorBar entry whose text
//          contains BOTH the base `Unrecognized syntax` phrase AND the
//          template fragments `state <id>` and `"<label>"` and `at <x>,<y>`
//          and `size <w>x<h>`.
//   * AC2: loading examples/automotive-ecu.sstate yields 0 errors (the
//          template hint must not leak out as a false positive).
//   * AC7: no console errors during the whole flow.
//
// Note on script-scoped bindings: stablestate.html uses classic `<script>`
// with `let parsed = null;` at module scope, so `parsed` is not on
// `window`. We reach it via `eval('parsed')` inside page.evaluate, same
// pattern as sprint-1/sprint-2 tests.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const AUTOMOTIVE_DSL = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'examples', 'automotive-ecu.sstate'),
  'utf8'
).replace(/\r\n/g, '\n');

test.describe('OBS-02: Unrecognized syntax error includes template hint', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', d => d.dismiss().catch(() => {}));
  });

  test('AC1: `state Red` alone yields an errorBar message containing the full syntax template', async ({ page }) => {
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', err => { pageErrors.push(err.message); });

    await page.goto('/stablestate.html');
    await page.waitForFunction(() =>
      typeof window.setDsl === 'function' && typeof window.refresh === 'function'
    );

    const result = await page.evaluate(() => {
      window.setDsl('state Red');
      window.refresh();
      // eslint-disable-next-line no-eval
      const p = eval('parsed');
      const bar = document.getElementById('error-bar');
      return {
        errorCount: p && p.errors ? p.errors.length : -1,
        firstError: p && p.errors && p.errors[0] ? p.errors[0] : null,
        errorMsgs: p && p.errors ? p.errors.map(e => 'L' + e.line + ': ' + e.msg) : [],
        barText: bar ? bar.textContent : ''
      };
    });

    // Precondition: there IS a parse error on L1
    expect(result.errorCount, 'parser should flag `state Red` as an error').toBeGreaterThan(0);
    expect(result.firstError, 'first error should exist').toBeTruthy();
    expect(result.firstError.line, 'first error should be on line 1').toBe(1);

    const msg = result.firstError.msg;

    // Base wording preserved (we APPEND a hint, not replace)
    expect(
      msg,
      `first error message should still contain 'Unrecognized syntax' (was: ${JSON.stringify(msg)})`
    ).toContain('Unrecognized syntax');

    // Template fragments required by AC1
    // The plan allows any of: raw text on the errors array (checked here),
    // or the rendered errorBar textContent (checked below). The errors array
    // carries the raw string BEFORE HTML escaping, so `<id>` / `<label>` etc
    // appear literally.
    const templateFragments = [
      'state <id>',
      '"<label>"',
      'at <x>,<y>',
      'size <w>x<h>'
    ];
    for (const frag of templateFragments) {
      expect(
        msg,
        `error message should contain template fragment ${JSON.stringify(frag)} (was: ${JSON.stringify(msg)})`
      ).toContain(frag);
    }

    // The rendered errorBar DOM escapes < and > to &lt; / &gt;. textContent
    // decodes them back, so the fragments must also be visible there.
    for (const frag of templateFragments) {
      expect(
        result.barText,
        `rendered error-bar textContent should contain template fragment ${JSON.stringify(frag)}`
      ).toContain(frag);
    }

    expect(pageErrors, `page errors: ${pageErrors.join('\n')}`).toEqual([]);
    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('AC2: automotive-ecu.sstate loads with 0 parser errors (template hint does not misfire)', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await page.goto('/stablestate.html');
    await page.waitForFunction(() => typeof window.setDsl === 'function');

    const result = await page.evaluate(dsl => {
      window.setDsl(dsl);
      window.refresh();
      // eslint-disable-next-line no-eval
      const p = eval('parsed');
      const bar = document.getElementById('error-bar');
      return {
        errorCount: p && p.errors ? p.errors.length : -1,
        errorMsgs: p && p.errors ? p.errors.map(e => 'L' + e.line + ': ' + e.msg) : [],
        barDisplay: bar ? bar.style.display : null,
        barText: bar ? bar.textContent : ''
      };
    }, AUTOMOTIVE_DSL);

    expect(
      result.errorCount,
      `automotive-ecu.sstate should parse with 0 errors, got:\n${result.errorMsgs.join('\n')}`
    ).toBe(0);
    expect(result.barDisplay, 'error-bar should be hidden').toBe('none');
    expect(result.barText, 'error-bar should have no text').toBe('');

    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('AC2 cross-sample: tcp-connection.sstate also loads with 0 parser errors', async ({ page }) => {
    // Guard against the template hint accidentally triggering on any valid DSL.
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    const TCP_DSL = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'examples', 'tcp-connection.sstate'),
      'utf8'
    );

    await page.goto('/stablestate.html');
    await page.waitForFunction(() => typeof window.setDsl === 'function');

    const errorMsgs = await page.evaluate(dsl => {
      window.setDsl(dsl);
      window.refresh();
      // eslint-disable-next-line no-eval
      const p = eval('parsed');
      return p && p.errors ? p.errors.map(e => 'L' + e.line + ': ' + e.msg) : ['<no parsed>'];
    }, TCP_DSL);

    expect(errorMsgs, `tcp-connection.sstate should parse with 0 errors`).toEqual([]);
    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  });
});
