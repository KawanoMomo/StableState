// OBS-18 regression test — brace mismatch hint must anchor at the TRUE
// unclosed frame (the one whose `{` is actually missing), not at the most
// recently-popped sibling.
//
// Background: Sprint 3 (OBS-16, commit 35cff33) added a `Hint: no matching
// '{' found ...` line that points at `lastPoppedFrame`. In multi-level
// nests, when the missing `{` belongs to an ancestor, all its children
// balance out before the stray `}` is reached, so `lastPoppedFrame` ends
// up being an innocent sibling and the hint misdirects the user.
//
// Concrete symptom (documented in .eval/ux-brushup-sprint-3/artifacts/
// AC3-brace-removed-errors.txt): removing the `{` on L19 of
// examples/automotive-ecu.sstate (the `state run "Run" ...` composite)
// produces a hint that cites `failsafe` / L49 instead of `run` / L19.
//
// Fix direction (plan.md Sprint 6): when we encounter a stray `}` with an
// empty nesting stack, use an indentation-based heuristic to find the
// real culprit — the latest `state <id>` declaration that was parsed as
// a leaf but whose immediately following non-empty content line is at a
// STRICTLY DEEPER indentation (a smoking gun that the declaration was
// meant to be composite). Emit the hint anchored at that line.
//
// ACs verified here (plan.md Sprint 6):
//   * AC1: automotive-ecu with L19 `{` stripped → hint mentions `run` or L19
//   * AC2: synthetic 3-level nest — outer `{` stripped → hint mentions
//          `outer` or the outer line; mid `{` stripped → hint mentions
//          `mid` or the mid line
//   * AC3: Sprint 3 message family survives (either "no matching '{'" or
//          "Unclosed '{' opened here for" still present)
//   * AC4: normal load of automotive-ecu and tcp-connection emits neither
//          hint variant (no false positives)
//   * AC5: best-effort draw during broken state (svg still has children)
//   * AC7: no console errors

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

// Synthetic 3-level composite fixture for AC2.
// L2 = outer, L3 = mid, L4 = leaf.
const SYNTHETIC_3LEVEL = `@canvas width=400 height=300 grid=20
state outer "Outer" at 1,1 size 40x30 {
  state mid "Mid" at 2,2 size 30x20 {
    state leaf "Leaf" at 3,3 size 10x6
  }
}
`;

function stripBraceOnLineMatching(dsl, regex) {
  const lines = dsl.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) {
      lines[i] = lines[i].replace(/\s*\{\s*$/, '');
      return { dsl: lines.join('\n'), targetLine1Based: i + 1 };
    }
  }
  return { dsl, targetLine1Based: -1 };
}

test.describe('OBS-18: brace mismatch hint anchors at the true unclosed frame', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', d => d.dismiss().catch(() => {}));
  });

  test('AC1: automotive-ecu with L19 `run` `{` removed → hint mentions `run` or its real line, not `failsafe`/L49', async ({ page }) => {
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', err => { pageErrors.push(err.message); });

    await page.goto('/stablestate.html');
    await page.waitForFunction(() =>
      typeof window.setDsl === 'function' && typeof window.refresh === 'function'
    );

    // Sanity: baseline clean load.
    const baselineErrorCount = await page.evaluate(dsl => {
      window.setDsl(dsl);
      window.refresh();
      // eslint-disable-next-line no-eval
      const p = eval('parsed');
      return p && p.errors ? p.errors.length : -1;
    }, AUTOMOTIVE_DSL);
    expect(baselineErrorCount, 'automotive-ecu should parse cleanly at baseline').toBe(0);

    // Strip the `{` on the `run` composite opening line.
    const { dsl: broken, targetLine1Based: runLine } =
      stripBraceOnLineMatching(AUTOMOTIVE_DSL, /^state\s+run\s+"Run"\s+.*\{\s*$/);
    expect(runLine, 'should have located the run composite line').toBeGreaterThan(0);

    const broke = await page.evaluate(dsl => {
      window.setDsl(dsl);
      window.refresh();
      // eslint-disable-next-line no-eval
      const p = eval('parsed');
      const bar = document.getElementById('error-bar');
      const svgWrap = document.getElementById('svg-wrap');
      const svgChildCount = svgWrap ? svgWrap.querySelectorAll('svg *').length : -1;
      return {
        errorCount: p && p.errors ? p.errors.length : -1,
        errorMsgs: p && p.errors ? p.errors.map(e => 'L' + e.line + ': ' + e.msg) : [],
        barText: bar ? bar.textContent : '',
        svgChildCount
      };
    }, broken);

    expect(broke.errorCount, 'breaking the brace must produce at least 1 error').toBeGreaterThan(0);

    // AC1 core: at least one hint-bearing error must explicitly name `run`
    // or `L<runLine>`. We check any error whose msg contains either "Hint"
    // or "Unclosed" — those are the two Sprint 3 families. Among those,
    // the identifier "run" (as a word) or "L<runLine>" must appear.
    const hintBearing = broke.errorMsgs.filter(m =>
      m.includes("Hint:") || m.includes("Unclosed '{'")
    );
    expect(
      hintBearing.length,
      `expected at least one Hint/Unclosed message, got:\n${broke.errorMsgs.join('\n')}`
    ).toBeGreaterThan(0);

    const runLineToken = 'L' + runLine;
    const namesRun = hintBearing.some(m =>
      /\brun\b/.test(m) || m.includes(runLineToken)
    );
    expect(
      namesRun,
      `At least one hint-bearing error must reference 'run' or ${runLineToken}.\n` +
      `Hint-bearing messages were:\n${hintBearing.join('\n')}\n` +
      `All errors:\n${broke.errorMsgs.join('\n')}`
    ).toBe(true);

    // AC1 anti-regression: the primary hint (the one that accompanies
    // "Unexpected closing brace }") must NOT exclusively misdirect the
    // user to `failsafe` / L49. We check the aggregated error-bar text:
    // if `run` / L<runLine> is present, we're good; if only `failsafe`
    // appears and `run` does not, that is the OBS-18 misdirection.
    const barMentionsRun = /\brun\b/.test(broke.barText) || broke.barText.includes(runLineToken);
    expect(
      barMentionsRun,
      `Error bar must mention 'run' or ${runLineToken} to direct the user ` +
      `to the true culprit. Bar text:\n${broke.barText}`
    ).toBe(true);

    // AC5: best-effort render maintained.
    expect(
      broke.svgChildCount,
      `diagram should still draw best-effort content, got ${broke.svgChildCount} children`
    ).toBeGreaterThan(0);

    expect(pageErrors, `page errors: ${pageErrors.join('\n')}`).toEqual([]);
    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('AC2a: synthetic 3-level nest — removing `outer` `{` → hint mentions `outer` or its line', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await page.goto('/stablestate.html');
    await page.waitForFunction(() => typeof window.setDsl === 'function');

    const { dsl: broken, targetLine1Based: outerLine } =
      stripBraceOnLineMatching(SYNTHETIC_3LEVEL, /^state\s+outer\s+"Outer"\s+.*\{\s*$/);
    expect(outerLine, 'outer line should exist in synthetic fixture').toBeGreaterThan(0);

    const out = await page.evaluate(dsl => {
      window.setDsl(dsl);
      window.refresh();
      // eslint-disable-next-line no-eval
      const p = eval('parsed');
      return {
        errorMsgs: p && p.errors ? p.errors.map(e => 'L' + e.line + ': ' + e.msg) : []
      };
    }, broken);

    const hintBearing = out.errorMsgs.filter(m =>
      m.includes("Hint:") || m.includes("Unclosed '{'")
    );
    expect(
      hintBearing.length,
      `expected at least one Hint/Unclosed message, got:\n${out.errorMsgs.join('\n')}`
    ).toBeGreaterThan(0);

    const outerToken = 'L' + outerLine;
    const namesOuter = hintBearing.some(m =>
      /\bouter\b/.test(m) || m.includes(outerToken)
    );
    expect(
      namesOuter,
      `hint must reference 'outer' or ${outerToken}. Got:\n${hintBearing.join('\n')}`
    ).toBe(true);

    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('AC2b: synthetic 3-level nest — removing `mid` `{` → hint mentions `mid` or its line', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await page.goto('/stablestate.html');
    await page.waitForFunction(() => typeof window.setDsl === 'function');

    const { dsl: broken, targetLine1Based: midLine } =
      stripBraceOnLineMatching(SYNTHETIC_3LEVEL, /^\s*state\s+mid\s+"Mid"\s+.*\{\s*$/);
    expect(midLine, 'mid line should exist in synthetic fixture').toBeGreaterThan(0);

    const out = await page.evaluate(dsl => {
      window.setDsl(dsl);
      window.refresh();
      // eslint-disable-next-line no-eval
      const p = eval('parsed');
      return {
        errorMsgs: p && p.errors ? p.errors.map(e => 'L' + e.line + ': ' + e.msg) : []
      };
    }, broken);

    const hintBearing = out.errorMsgs.filter(m =>
      m.includes("Hint:") || m.includes("Unclosed '{'")
    );
    expect(
      hintBearing.length,
      `expected at least one Hint/Unclosed message, got:\n${out.errorMsgs.join('\n')}`
    ).toBeGreaterThan(0);

    const midToken = 'L' + midLine;
    const namesMid = hintBearing.some(m =>
      /\bmid\b/.test(m) || m.includes(midToken)
    );
    expect(
      namesMid,
      `hint must reference 'mid' or ${midToken}. Got:\n${hintBearing.join('\n')}`
    ).toBe(true);

    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('AC3: Sprint 3 hint message family still present (no matching / Unclosed) after improvement', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await page.goto('/stablestate.html');
    await page.waitForFunction(() => typeof window.setDsl === 'function');

    const { dsl: broken } =
      stripBraceOnLineMatching(AUTOMOTIVE_DSL, /^state\s+run\s+"Run"\s+.*\{\s*$/);

    const out = await page.evaluate(dsl => {
      window.setDsl(dsl);
      window.refresh();
      // eslint-disable-next-line no-eval
      const p = eval('parsed');
      return {
        errorMsgs: p && p.errors ? p.errors.map(e => 'L' + e.line + ': ' + e.msg) : []
      };
    }, broken);

    const hasSprint3Family = out.errorMsgs.some(m =>
      m.includes("no matching '{' found") || m.includes("Unclosed '{' opened here for")
    );
    expect(
      hasSprint3Family,
      `Sprint 3 message family must survive. Got:\n${out.errorMsgs.join('\n')}`
    ).toBe(true);

    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('AC4: no false positives on normal automotive-ecu and tcp-connection loads', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await page.goto('/stablestate.html');
    await page.waitForFunction(() => typeof window.setDsl === 'function');

    const autoOut = await page.evaluate(dsl => {
      window.setDsl(dsl);
      window.refresh();
      // eslint-disable-next-line no-eval
      const p = eval('parsed');
      const bar = document.getElementById('error-bar');
      return {
        errorCount: p && p.errors ? p.errors.length : -1,
        errorMsgs: p && p.errors ? p.errors.map(e => 'L' + e.line + ': ' + e.msg) : [],
        barText: bar ? bar.textContent : ''
      };
    }, AUTOMOTIVE_DSL);

    expect(autoOut.errorCount, `automotive-ecu baseline errors:\n${autoOut.errorMsgs.join('\n')}`).toBe(0);
    expect(autoOut.barText.includes("no matching '{'"), `bar should not show hint on clean load, got:\n${autoOut.barText}`).toBe(false);
    expect(autoOut.barText.includes("Unclosed '{' opened here"), `bar should not show Unclosed hint on clean load, got:\n${autoOut.barText}`).toBe(false);

    const tcpOut = await page.evaluate(dsl => {
      window.setDsl(dsl);
      window.refresh();
      // eslint-disable-next-line no-eval
      const p = eval('parsed');
      const bar = document.getElementById('error-bar');
      return {
        errorCount: p && p.errors ? p.errors.length : -1,
        errorMsgs: p && p.errors ? p.errors.map(e => 'L' + e.line + ': ' + e.msg) : [],
        barText: bar ? bar.textContent : ''
      };
    }, TCP_DSL);

    expect(tcpOut.errorCount, `tcp-connection baseline errors:\n${tcpOut.errorMsgs.join('\n')}`).toBe(0);
    expect(tcpOut.barText.includes("no matching '{'"), `bar should not show hint on clean load, got:\n${tcpOut.barText}`).toBe(false);
    expect(tcpOut.barText.includes("Unclosed '{' opened here"), `bar should not show Unclosed hint on clean load, got:\n${tcpOut.barText}`).toBe(false);

    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  });
});
