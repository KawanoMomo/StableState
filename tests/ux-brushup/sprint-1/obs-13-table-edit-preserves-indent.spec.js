// OBS-13 regression test — Table-driven guard edit must preserve the
// original DSL line's indentation AND its bare / relative-id form.
//
// Bug: editing `EvDriveRequest × IDLE` guard from the Table view rewrites
//     "    idle -> active : EvDriveRequest [IsReady] / InitDrive"
//  to "run.normal.idle -> run.normal.active : EvDriveRequest [...] / InitDrive"
// i.e. the 4-space indent disappears and bare ids get replaced by absolute
// dotted paths, breaking consistency with the sibling lines L35/L37.
//
// Root cause: `replaceTransition()` calls from the table edit handler pass
// `stateDotPath(stateId)` / `stateDotPath(target)` as the new from/to, and
// `replaceTransition()` then writes the whole line from scratch without
// preserving the matched source line's indent or its literal tokens.
//
// This test exercises `replaceTransition()` directly from the page (which is
// exactly what `pp-table-apply` does for a normal-mode edit) and asserts the
// resulting DSL line equals the expected indent-preserving form.
//
// Note on globals: `parsed` is script-scoped (let), so we reach it via
// direct eval inside page.evaluate. See obs-04-autoroute.spec.js for details.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Read + normalise to LF so the in-browser roundtrip (which strips \r)
// produces byte-identical lines. The .sstate file in the repo happens to
// use CRLF on Windows checkouts; the textarea returns LF-only, so we
// compare LF-only on both sides.
const AUTOMOTIVE_DSL = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'examples', 'automotive-ecu.sstate'),
  'utf8'
).replace(/\r\n/g, '\n');

// The exact line we target in automotive-ecu.sstate is L36:
//     "    idle -> active : EvDriveRequest [IsReady] / InitDrive"
// After editing guard to `IsReady && BatteryOK` it should become:
//     "    idle -> active : EvDriveRequest [IsReady && BatteryOK] / InitDrive"
const TARGET_LINE_BEFORE = '    idle -> active : EvDriveRequest [IsReady] / InitDrive';
const TARGET_LINE_AFTER  = '    idle -> active : EvDriveRequest [IsReady && BatteryOK] / InitDrive';

// Sibling lines in the same composite-state block must stay byte-identical.
const SIBLING_L35 = '    norm_ini -> idle';
const SIBLING_L37 = '    active -> idle : EvStopRequest / CleanupDrive';

test.describe('OBS-13: table-view guard edit preserves indent and bare ids', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', d => d.dismiss().catch(() => {}));
    await page.goto('/stablestate.html');
    await page.waitForFunction(() =>
      typeof window.setDsl === 'function' &&
      typeof window.replaceTransition === 'function' &&
      typeof window.stateDotPath === 'function' &&
      typeof window.resolveStateRef === 'function'
    );
  });

  test('AC3+AC4: editing idle->active guard keeps 4-space indent and bare ids; siblings untouched', async ({ page }) => {
    // Sanity: the example file indeed contains the line we expect (guard against
    // the example being edited out from under us).
    expect(AUTOMOTIVE_DSL).toContain(TARGET_LINE_BEFORE);
    expect(AUTOMOTIVE_DSL).toContain(SIBLING_L35);
    expect(AUTOMOTIVE_DSL).toContain(SIBLING_L37);

    // Run the exact sequence pp-table-apply runs for a guard-only edit on the
    // existing `idle -> active : EvDriveRequest [IsReady] / InitDrive` transition.
    // We also capture the pre-edit DSL (what getDsl() returns AFTER the normal
    // refresh()/cleanupInternalTransitions() pipeline the app runs on load)
    // so we compare apples to apples — the raw file has an @internal line the
    // app strips, which would otherwise throw off a line-count diff check.
    const result = await page.evaluate(dsl => {
      window.setDsl(dsl);
      if (typeof window.refresh === 'function') window.refresh();

      // `parsed` is script-scoped (let) → reach it via direct eval.
      // eslint-disable-next-line no-eval
      const p = eval('parsed');
      if (!p) throw new Error('parsed is null after setDsl/refresh');

      // Locate the existing transition the way renderTable does.
      const existing = p.transitions.find(t => {
        if (t.event !== 'EvDriveRequest') return false;
        const fromEl = window.resolveStateRef(t.from, p);
        return fromEl && fromEl.id === 'idle';
      });
      if (!existing) throw new Error('Fixture mismatch: could not find EvDriveRequest transition from idle');

      // Snapshot the baseline (after refresh) for the diff check.
      const beforeDsl = window.getDsl();

      // pp-table-apply path (stablestate.html L2894-L2922), normal mode branch:
      //   target = 'active'  (bare id from <option value="${s.id}">)
      //   guard  = 'IsReady && BatteryOK'
      //   action = 'InitDrive'
      const stateId = 'idle';
      const target = 'active';
      const guard = 'IsReady && BatteryOK';
      const actionRaw = 'InitDrive';
      const ev = 'EvDriveRequest';
      const action = actionRaw.replace(/\n/g, '\\n').trim();
      const targetId = window.stateDotPath(target);
      const afterDsl = window.replaceTransition(
        existing.from, existing.to, existing.event, existing.guard,
        window.stateDotPath(stateId), targetId, ev, guard || null, action || null, null, beforeDsl
      );
      return { beforeDsl, afterDsl };
    }, AUTOMOTIVE_DSL);

    const newDsl = result.afterDsl;
    const beforeDsl = result.beforeDsl;
    const lines = newDsl.split('\n');

    // AC3: the target line must appear in the exact indent-preserving, bare-id form.
    expect(
      lines,
      `Expected updated target line "${TARGET_LINE_AFTER}" not found. Full DSL:\n${newDsl}`
    ).toContain(TARGET_LINE_AFTER);

    // Must NOT contain the dotted-path corruption from the bug.
    const dottedCorruption = /run\.normal\.idle\s*->\s*run\.normal\.active/;
    expect(
      dottedCorruption.test(newDsl),
      `DSL should not contain "run.normal.idle -> run.normal.active" dotted form. DSL:\n${newDsl}`
    ).toBe(false);

    // The old (pre-edit) line must be gone — exactly one change must have occurred.
    expect(newDsl).not.toContain(TARGET_LINE_BEFORE);

    // AC4: siblings must be byte-identical.
    expect(newDsl).toContain(SIBLING_L35);
    expect(newDsl).toContain(SIBLING_L37);

    // AC4 (stricter): diff from the post-refresh baseline must be exactly
    // one line (the idle->active row), so the composite-block structure is
    // unchanged everywhere else.
    const baselineLines = beforeDsl.split('\n');
    expect(lines.length).toBe(baselineLines.length);
    const differing = [];
    for (let i = 0; i < baselineLines.length; i++) {
      if (lines[i] !== baselineLines[i]) differing.push({ i: i + 1, before: baselineLines[i], after: lines[i] });
    }
    expect(
      differing.length,
      `Expected exactly 1 differing line, got ${differing.length}: ${JSON.stringify(differing, null, 2)}`
    ).toBe(1);
    // The target row is L36 in the raw file, but after cleanupInternalTransitions
    // strips the @internal line at L85, the line numbering for rows BEFORE L85
    // is unchanged, so the differing row is still at index 35 (L36, 1-indexed).
    expect(differing[0].i, `Differing line should be L36 (the idle->active row) in the post-refresh baseline`).toBe(36);
    expect(differing[0].before).toBe(TARGET_LINE_BEFORE);
    expect(differing[0].after).toBe(TARGET_LINE_AFTER);
  });

  test('AC5 regression: automotive-ecu.sstate still parses with 0 errors', async ({ page }) => {
    const errCount = await page.evaluate(dsl => {
      window.setDsl(dsl);
      if (typeof window.refresh === 'function') window.refresh();
      // eslint-disable-next-line no-eval
      const p = eval('parsed');
      return p && p.errors ? p.errors.length : -1;
    }, AUTOMOTIVE_DSL);
    expect(errCount).toBe(0);
  });

  test('AC6: undo after guard edit reverts DSL; redo re-applies it (Positive-1 maintained)', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', err => { consoleErrors.push('pageerror: ' + err.message); });

    const result = await page.evaluate(dsl => {
      window.setDsl(dsl);
      if (typeof window.refresh === 'function') window.refresh();
      // eslint-disable-next-line no-eval
      const p = eval('parsed');
      const existing = p.transitions.find(t => {
        if (t.event !== 'EvDriveRequest') return false;
        const fromEl = window.resolveStateRef(t.from, p);
        return fromEl && fromEl.id === 'idle';
      });
      if (!existing) throw new Error('Fixture mismatch');

      const beforeDsl = window.getDsl();

      // Simulate pp-table-apply: pushHistory + setDsl(newDsl) + refresh
      window.pushHistory();
      const newDsl = window.replaceTransition(
        existing.from, existing.to, existing.event, existing.guard,
        window.stateDotPath('idle'), window.stateDotPath('active'),
        'EvDriveRequest', 'IsReady && BatteryOK', 'InitDrive', null, beforeDsl
      );
      window.setDsl(newDsl);
      window.refresh();
      const afterEdit = window.getDsl();

      window.undo();
      const afterUndo = window.getDsl();

      window.redo();
      const afterRedo = window.getDsl();

      return { beforeDsl, afterEdit, afterUndo, afterRedo };
    }, AUTOMOTIVE_DSL);

    // Sanity: the edit actually changed something
    expect(result.afterEdit).not.toBe(result.beforeDsl);
    expect(result.afterEdit).toContain(TARGET_LINE_AFTER);

    // AC6: undo reverts to the pre-edit state
    expect(result.afterUndo).toBe(result.beforeDsl);
    expect(result.afterUndo).toContain(TARGET_LINE_BEFORE);
    expect(result.afterUndo).not.toContain(TARGET_LINE_AFTER);

    // AC6: redo re-applies the edit
    expect(result.afterRedo).toBe(result.afterEdit);
    expect(result.afterRedo).toContain(TARGET_LINE_AFTER);

    // AC7: no console errors during the whole undo/redo cycle
    expect(
      consoleErrors,
      `Expected 0 console errors during undo/redo cycle, got:\n${consoleErrors.join('\n')}`
    ).toEqual([]);
  });
});
