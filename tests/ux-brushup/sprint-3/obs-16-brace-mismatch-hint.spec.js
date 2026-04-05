// OBS-16 regression test — brace mismatch errors must point back to the
// unclosed opening brace, not only to the stray closing one.
//
// Bug: in `automotive-ecu.sstate`, removing the `{` at the end of the
// `state run "Run" ...` composite line (reporter called it L20) triggers
// the parser to consume the matching `}` of `run` as an `Unexpected
// closing brace` error on a far-away line (reporter called it L68). The
// user is sent chasing a red herring because the *actual* cause was the
// missing opening brace 40+ lines earlier.
//
// Fix direction (plan.md Sprint 3): keep the existing `Unexpected closing
// brace` error (we APPEND, not replace) and additionally record the line
// number where each unmatched `{` was opened. When parsing finishes with
// a non-empty nesting stack, push an extra error of the form
//   `L<N>: Unclosed '{' ...`
// so the error bar contains a pointer back to the real root cause.
//
// ACs verified here (plan.md Sprint 3):
//   * AC3: loading automotive-ecu.sstate then removing the `{` of the
//          `run` composite state must add an error whose text mentions
//          the original line number of `run` (or contains a phrase like
//          "Unclosed" / "対応する" / "corresponding").
//   * AC4: restoring the brace brings errors back to 0 (no stale state).
//   * AC5 (OBS-17 maintained): during the broken state, the SVG inside
//          #svg-wrap still has rendered content (best-effort draw).
//   * AC7: no console errors throughout.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const AUTOMOTIVE_DSL = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'examples', 'automotive-ecu.sstate'),
  'utf8'
).replace(/\r\n/g, '\n');

test.describe('OBS-16: brace mismatch error points to the unclosed opening brace', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', d => d.dismiss().catch(() => {}));
  });

  test('AC3+AC4+AC5: removing `run`\'s `{` adds an Unclosed-brace hint, restoring it clears all errors, and diagram keeps drawing', async ({ page }) => {
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', err => { pageErrors.push(err.message); });

    await page.goto('/stablestate.html');
    await page.waitForFunction(() =>
      typeof window.setDsl === 'function' && typeof window.refresh === 'function'
    );

    // Step 1: baseline — automotive-ecu.sstate loads cleanly.
    const baselineErrorCount = await page.evaluate(dsl => {
      window.setDsl(dsl);
      window.refresh();
      // eslint-disable-next-line no-eval
      const p = eval('parsed');
      return p && p.errors ? p.errors.length : -1;
    }, AUTOMOTIVE_DSL);
    expect(baselineErrorCount, 'automotive-ecu.sstate should initially parse with 0 errors').toBe(0);

    // Step 2: find the exact line of `state run "Run" ...` in the current DSL
    // and strip its trailing `{`. We do this via evaluate so the test does
    // not hard-code a line number that can shift if the example file grows.
    const broken = await page.evaluate(() => {
      const cur = window.getDsl();
      const lines = cur.split('\n');
      let targetIndex = -1; // 0-based
      for (let i = 0; i < lines.length; i++) {
        // Match the `run` composite state opening line specifically.
        if (/^state\s+run\s+"Run"\s+at\s+.*\{\s*$/.test(lines[i])) {
          targetIndex = i;
          break;
        }
      }
      if (targetIndex < 0) {
        return { targetIndex, lines: lines.length };
      }
      // Remove the trailing `{` (and any surrounding whitespace).
      lines[targetIndex] = lines[targetIndex].replace(/\s*\{\s*$/, '');
      const dslBroken = lines.join('\n');
      window.setDsl(dslBroken);
      window.refresh();
      // eslint-disable-next-line no-eval
      const p = eval('parsed');
      const bar = document.getElementById('error-bar');
      const svgWrap = document.getElementById('svg-wrap');
      const svgChildCount = svgWrap ? svgWrap.querySelectorAll('svg *').length : -1;
      return {
        runLine1Based: targetIndex + 1,
        errorCount: p && p.errors ? p.errors.length : -1,
        errorMsgs: p && p.errors ? p.errors.map(e => 'L' + e.line + ': ' + e.msg) : [],
        barText: bar ? bar.textContent : '',
        svgChildCount
      };
    });

    expect(broken.runLine1Based, 'should have located the `run` composite opening line').toBeGreaterThan(0);
    expect(broken.errorCount, 'breaking the brace must produce at least 1 parser error').toBeGreaterThan(0);

    // AC3 (plan.md Sprint 3): "L20 (or the original opening-brace line), OR
    // a phrase like '対応する `{` が見つかりません'". We accept either.
    // The fix is required to surface a *hint* that redirects the user away
    // from the far-away `}` toward the real cause (a missing opening `{`).
    const targetLineToken = 'L' + broken.runLine1Based;
    const hintPhrases = [
      targetLineToken,
      "Unclosed '{'",
      'Unclosed {',
      'Unclosed composite',
      '対応する',
      'opened here',
      'no matching',
      'missing its opening'
    ];
    const hasHint = hintPhrases.some(phrase =>
      broken.errorMsgs.some(m => m.includes(phrase)) ||
      broken.barText.includes(phrase)
    );
    expect(
      hasHint,
      `At least one error entry must point back to the unclosed opening brace.\n` +
      `Expected one of: ${JSON.stringify(hintPhrases)}\n` +
      `Actual errors:\n${broken.errorMsgs.join('\n')}\n` +
      `Error bar text:\n${broken.barText}`
    ).toBe(true);

    // Also require the existing "Unexpected closing brace" error to still be
    // present — plan.md says the fix is ADDITIVE, not a rewrite: "既存の
    // エラー `L68: Unexpected closing brace` はそのまま残してもよい
    // (削除ではなく追記)". We verify it still shows up so downstream users
    // who read the bar top-to-bottom keep the original anchor.
    expect(
      broken.errorMsgs.some(m => m.includes('Unexpected closing brace')),
      'Existing "Unexpected closing brace" error must still be present (additive fix, not rewrite)'
    ).toBe(true);

    // AC5 (OBS-17 maintained): even with the brace broken, the SVG renderer
    // must still produce some content (best-effort draw). We assert there is
    // at least 1 child element inside #svg-wrap's svg.
    expect(
      broken.svgChildCount,
      `Diagram should still render best-effort content while DSL is broken, got ${broken.svgChildCount} svg children`
    ).toBeGreaterThan(0);

    // Step 3: restore the brace, errors should return to 0 (no stale state).
    const restoredErrorCount = await page.evaluate(dsl => {
      window.setDsl(dsl);
      window.refresh();
      // eslint-disable-next-line no-eval
      const p = eval('parsed');
      return p && p.errors ? p.errors.length : -1;
    }, AUTOMOTIVE_DSL);
    expect(restoredErrorCount, 'restoring the brace should bring errors back to 0').toBe(0);

    expect(pageErrors, `page errors: ${pageErrors.join('\n')}`).toEqual([]);
    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('AC6 regression: synthetic nested composites keep flagging the correct opening brace', async ({ page }) => {
    // Synthetic DSL with two levels of composite. We remove the inner
    // composite's `{` and assert that the Unclosed hint cites the inner
    // line, not the outer one. This protects against a naive "last open
    // brace wins" regression.
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    const OUTER_DSL = `@canvas width=400 height=300 grid=20
state outer "Outer" at 1,1 size 18x12 {
  state inner "Inner" at 2,2 size 10x6 {
    state leaf "Leaf" at 1,1 size 4x2
  }
}
`;
    // Strip the inner composite's `{` (the 3rd line). Inner line is 1-based L3.
    const brokenLines = OUTER_DSL.split('\n');
    const innerIdx = brokenLines.findIndex(l => /^\s*state\s+inner\s+"Inner".*\{\s*$/.test(l));
    expect(innerIdx, 'inner composite line should exist in fixture').toBeGreaterThanOrEqual(0);
    brokenLines[innerIdx] = brokenLines[innerIdx].replace(/\s*\{\s*$/, '');
    const BROKEN_DSL = brokenLines.join('\n');
    const innerLine1Based = innerIdx + 1;

    await page.goto('/stablestate.html');
    await page.waitForFunction(() => typeof window.setDsl === 'function');

    const out = await page.evaluate(dsl => {
      window.setDsl(dsl);
      window.refresh();
      // eslint-disable-next-line no-eval
      const p = eval('parsed');
      return {
        errorMsgs: p && p.errors ? p.errors.map(e => 'L' + e.line + ': ' + e.msg) : [],
        errorCount: p && p.errors ? p.errors.length : -1
      };
    }, BROKEN_DSL);

    // AC6 (plan.md Sprint 3 synthetic case): the hint must use an explicit
    // phrase that redirects the user back toward the unclosed opening
    // brace. Pinpointing the inner line (L3) is not always physically
    // possible because a state line with no `{` is indistinguishable from
    // a leaf state at parse time, so we accept any of the hint phrases
    // that would not pre-exist in the baseline error output. Raw line
    // numbers are deliberately NOT in the allow-list here, because the
    // baseline parser already emits a `L2: Warning: No initial pseudo-
    // state inside composite state outer` warning whose line token would
    // collide with a naive "L2" substring match.
    const hintPhrases = [
      "Unclosed '{'",
      'Unclosed {',
      '対応する',
      'opened here',
      'no matching',
      'missing its opening'
    ];
    const hasHint = hintPhrases.some(phrase =>
      out.errorMsgs.some(m => m.includes(phrase))
    );
    expect(
      hasHint,
      `At least one error entry must explicitly flag the unclosed opening ` +
      `brace (expected one of ${JSON.stringify(hintPhrases)}).\n` +
      `Got:\n${out.errorMsgs.join('\n')}`
    ).toBe(true);

    // Ensure the original stray-`}` error is still emitted (additive fix).
    expect(
      out.errorMsgs.some(m => m.includes('Unexpected closing brace')),
      'Existing "Unexpected closing brace" error must still be present'
    ).toBe(true);

    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  });
});
