// @ts-check
// Cross-feature regression sweep (Task 12 of @cyclic transitions plan).
//
// This file locks in the 10 OBS fixes delivered by Sprint 1-6 plus the
// 2026-04-04 action-textarea autocomplete feature. Every test here re-
// exercises an existing behavior end-to-end via the running dev server
// and asserts the fixed invariant. If any of these ever start failing we
// know a cross-feature change broke a previously-shipped safety net.
//
// Design notes:
//   - Helpers at the top (loadExample / setDsl / switchToTable / captureDl)
//     keep each test body short and declarative.
//   - `parsed` and `sel` are script-scoped `let` bindings inside
//     stablestate.html, so they are reached via `eval('parsed')` /
//     `eval('sel = [...]')` inside page.evaluate — same pattern as the
//     Sprint 1-6 specs in tests/ux-brushup.
//   - Top-level `function` declarations in stablestate.html (setDsl,
//     refresh, getDsl, autoRoute, addNewElement, deleteSelected,
//     updateTransFieldByLine, exportPlantUML, getExportSVGString,
//     switchTab, ...) ARE available as `window.<name>`.

const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8765/stablestate.html';

// Fetch one of the examples/*.sstate files via the dev server and install
// it into the editor textarea, triggering the input handler so the app
// runs its full refresh() pipeline (parse → cleanupInternalTransitions →
// renderSVG → renderTable).
async function loadExample(page, filename) {
  await page.evaluate(async (name) => {
    const res = await fetch('examples/' + name);
    const text = await res.text();
    const ta = document.querySelector('#editor');
    ta.value = text;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }, filename);
  await page.waitForTimeout(200);
}

// Seed the editor with an inline DSL string and fire the input handler.
async function setDsl(page, dsl) {
  await page.evaluate((d) => {
    const ta = document.querySelector('#editor');
    ta.value = d;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }, dsl);
  await page.waitForTimeout(100);
}

// Switch to the Table tab via the global switchTab function (the click
// handler on the toolbar button calls exactly this).
async function switchToTable(page) {
  await page.evaluate(() => {
    if (typeof switchTab === 'function') switchTab('table');
  });
  await page.waitForTimeout(100);
}

// Trigger a download by invoking `fn` inside the page, wait for the
// download event, read the stream and return its text. Works because
// exportPlantUML() uses anchor.click() → the browser fires a download.
async function captureDl(page, fn) {
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(fn)
  ]);
  const stream = await dl.createReadStream();
  if (!stream) return null;
  let buf = '';
  for await (const chunk of stream) buf += chunk.toString();
  return buf;
}

test.describe('Cross-feature regression sweep', () => {
  test.beforeEach(async ({ page }) => {
    // Silence any confirm() dialogs the app may raise during batch edits.
    page.on('dialog', d => d.dismiss().catch(() => {}));
    await page.goto(BASE);
    await page.waitForFunction(() =>
      typeof window.setDsl === 'function' &&
      typeof window.refresh === 'function' &&
      typeof parsed !== 'undefined'
    );
  });

  // ─── Sprint 1 ─────────────────────────────────────────────────────────
  test('OBS-04: AutoRoute does not throw ReferenceError', async ({ page }) => {
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', e => pageErrors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

    await loadExample(page, 'tcp-connection.sstate');

    const result = await page.evaluate(() => {
      try {
        if (typeof window.autoRoute === 'function') window.autoRoute();
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String(e) + '\n' + (e.stack || '') };
      }
    });

    expect(result.ok, `autoRoute() threw: ${result.error || ''}`).toBe(true);
    const combined = pageErrors.join('\n') + '\n' + consoleErrors.join('\n');
    expect(combined).not.toMatch(/ReferenceError/);
    expect(combined).not.toMatch(/getBox is not defined/);
  });

  test('OBS-13: Table guard edit preserves indent and bare ids on nested transitions', async ({ page }) => {
    await loadExample(page, 'automotive-ecu.sstate');

    // updateTransFieldByLine is the Sprint 1 OBS-13 preservation path.
    // It mutates the editor in place (setDsl + refresh) — we read getDsl()
    // AFTER the call to see the result.
    const result = await page.evaluate(() => {
      if (typeof window.updateTransFieldByLine !== 'function') {
        return { ok: false, reason: 'updateTransFieldByLine missing' };
      }
      const dsl = window.getDsl();
      const lines = dsl.split('\n');
      // Locate `    idle -> active : EvDriveRequest [IsReady] / InitDrive`
      let lineIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (/^\s+idle\s*->\s*active\s*:\s*EvDriveRequest\s*\[IsReady\]/.test(lines[i])) {
          lineIdx = i;
          break;
        }
      }
      if (lineIdx < 0) return { ok: false, reason: 'target line not found' };

      window.updateTransFieldByLine(lineIdx + 1, 'guard', 'IsReady && BatteryOK');
      const newDsl = window.getDsl();
      const newLine = newDsl.split('\n')[lineIdx];
      return { ok: true, newLine, newDsl };
    });

    expect(result.ok, `OBS-13 setup failed: ${result.reason || ''}`).toBe(true);
    // Indentation preserved (at least 4 spaces).
    expect(result.newLine).toMatch(/^\s{4}idle\s*->\s*active/);
    // New guard applied.
    expect(result.newLine).toContain('[IsReady && BatteryOK]');
    // Bare ids kept — no dotted-path corruption.
    expect(result.newLine).not.toContain('run.normal.idle');
    expect(result.newDsl).not.toMatch(/run\.normal\.idle\s*->\s*run\.normal\.active/);
  });

  // ─── Sprint 2 ─────────────────────────────────────────────────────────
  test('OBS-08: SVG export strips data-resize handles', async ({ page }) => {
    await loadExample(page, 'automotive-ecu.sstate');
    const svg = await page.evaluate(() => getExportSVGString());
    expect(svg).toBeTruthy();
    expect(svg).not.toContain('data-resize=');
  });

  test('OBS-11: PlantUML export nests history and declares final as <<end>>', async ({ page }) => {
    await loadExample(page, 'automotive-ecu.sstate');
    const puml = await captureDl(page, () => exportPlantUML());
    expect(puml).not.toBeNull();
    // history pseudo-state declared with <<history>>
    expect(puml).toMatch(/state\s+h_run\s+<<history>>/);
    // final pseudo-state declared with <<end>> (not flattened to [*])
    expect(puml).toMatch(/state\s+shutdown\s+<<end>>/);
  });

  // ─── Sprint 3 ─────────────────────────────────────────────────────────
  test('OBS-02: Unrecognized syntax error includes template hint', async ({ page }) => {
    await setDsl(page, 'state Red');

    const errMsgs = await page.evaluate(() => {
      // eslint-disable-next-line no-eval
      const p = eval('parsed');
      return p && p.errors ? p.errors.map(e => e.msg || String(e)) : [];
    });

    expect(errMsgs.length).toBeGreaterThan(0);
    const joined = errMsgs.join('\n');
    expect(joined).toContain('Unrecognized syntax');
    // Template fragments appended by the Sprint 3 fix — plain substring
    // checks (the raw errors[] strings carry the literal <id>/<label>
    // placeholders before HTML escaping).
    expect(joined).toContain('expected: state <id>');
    expect(joined).toContain('"<label>"');
    expect(joined).toContain('at <x>,<y>');
    expect(joined).toContain('size <w>x<h>');
  });

  test('OBS-16: Brace mismatch hint survives (Sprint 3 base family)', async ({ page }) => {
    await loadExample(page, 'automotive-ecu.sstate');

    const errMsgs = await page.evaluate(() => {
      const dsl = window.getDsl();
      // Strip the trailing `{` from the `state run "Run" ...` line.
      const broken = dsl.split('\n').map(l =>
        /^state\s+run\s+"Run"\s+.*\{\s*$/.test(l) ? l.replace(/\s*\{\s*$/, '') : l
      ).join('\n');
      window.setDsl(broken);
      window.refresh();
      // eslint-disable-next-line no-eval
      const p = eval('parsed');
      return p && p.errors ? p.errors.map(e => 'L' + e.line + ': ' + e.msg) : [];
    });

    expect(errMsgs.length).toBeGreaterThan(0);
    const joined = errMsgs.join('\n');
    // At least one of the Sprint 3 hint families must be present.
    expect(joined).toMatch(/Unclosed '\{'|no matching|Hint:|Unexpected closing brace/);
  });

  // ─── Sprint 4 ─────────────────────────────────────────────────────────
  test('OBS-15: Deleting cruise removes its orphan transitions', async ({ page }) => {
    await loadExample(page, 'automotive-ecu.sstate');

    const result = await page.evaluate(() => {
      // eslint-disable-next-line no-eval
      const p = eval('parsed');
      const cruiseEl = p && p.stateMap ? p.stateMap['cruise'] : null;
      const cruisePath = cruiseEl ? (cruiseEl.path || cruiseEl.id || 'cruise') : 'cruise';
      // Select cruise the way a click does (path-based id) and delete it.
      // eslint-disable-next-line no-eval
      eval('sel = [{type: "state", id: ' + JSON.stringify(cruisePath) + '}]');
      window.deleteSelected();
      return { dsl: window.getDsl() };
    });

    // After deletion, no transitions should reference cruise as endpoint.
    expect(result.dsl).not.toMatch(/accel\s*->\s*cruise/);
    expect(result.dsl).not.toMatch(/cruise\s*->\s*accel/);
    // And the state definition itself must be gone.
    expect(result.dsl).not.toMatch(/state\s+cruise\b/);
  });

  test('OBS-01: +State button yields distinct root coordinates across consecutive calls', async ({ page }) => {
    // Start with a minimal canvas so addNewElement's root slot search has
    // a predictable sizing frame. Empty DSL also works, but this is more
    // explicit about the test setup.
    await setDsl(page, '@canvas width=800 height=600 grid=20\n');

    const coords = await page.evaluate(() => {
      // Ensure no state is selected — OBS-01 is specifically the root-add
      // path (parentState === null branch of addNewElement).
      // eslint-disable-next-line no-eval
      eval('sel = []');
      const xs = [];
      for (let i = 0; i < 3; i++) {
        if (typeof window.addNewElement === 'function') window.addNewElement('state');
      }
      const dsl = window.getDsl();
      const re = /at\s+(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)/g;
      let m;
      while ((m = re.exec(dsl)) !== null) {
        xs.push(m[1] + ',' + m[2]);
      }
      return xs;
    });

    expect(coords.length).toBeGreaterThanOrEqual(3);
    const unique = new Set(coords);
    expect(
      unique.size,
      `Expected at least as many unique coords as calls, got ${coords.length} coords with ${unique.size} unique: ${JSON.stringify(coords)}`
    ).toBe(coords.length);
  });

  // ─── Sprint 5 ─────────────────────────────────────────────────────────
  test('OBS-19: @internal self-transition with a trigger survives load', async ({ page }) => {
    await loadExample(page, 'automotive-ecu.sstate');

    const result = await page.evaluate(() => {
      const dsl = window.getDsl();
      // eslint-disable-next-line no-eval
      const p = eval('parsed');
      const watchdog = (p && p.transitions ? p.transitions : [])
        .filter(t => t.from === 'run' && t.to === 'run' && t.kind === 'internal' && t.event === 'EvWatchdogKick');
      return { dsl, watchdogCount: watchdog.length };
    });

    // DSL text itself preserves the line.
    expect(result.dsl).toContain('run -> run : EvWatchdogKick @internal');
    // Runtime representation carries it too.
    expect(result.watchdogCount).toBeGreaterThanOrEqual(1);
  });

  // ─── Sprint 6 ─────────────────────────────────────────────────────────
  test('OBS-18: Brace hint anchors at the true unclosed frame (run, not failsafe)', async ({ page }) => {
    await loadExample(page, 'automotive-ecu.sstate');

    const out = await page.evaluate(() => {
      const dsl = window.getDsl();
      // Find `run` composite line and strip its trailing `{`.
      const lines = dsl.split('\n');
      let runLine = -1;
      for (let i = 0; i < lines.length; i++) {
        if (/^state\s+run\s+"Run"\s+.*\{\s*$/.test(lines[i])) {
          runLine = i + 1; // 1-based
          lines[i] = lines[i].replace(/\s*\{\s*$/, '');
          break;
        }
      }
      window.setDsl(lines.join('\n'));
      window.refresh();
      // eslint-disable-next-line no-eval
      const p = eval('parsed');
      return {
        runLine,
        errorMsgs: p && p.errors ? p.errors.map(e => 'L' + e.line + ': ' + e.msg) : []
      };
    });

    expect(out.runLine).toBeGreaterThan(0);
    expect(out.errorMsgs.length).toBeGreaterThan(0);

    const joined = out.errorMsgs.join('\n');
    // Hint-bearing families from Sprint 3/6.
    const hintBearing = out.errorMsgs.filter(m =>
      m.includes('Hint:') || m.includes("Unclosed '{'")
    );
    expect(hintBearing.length, `expected at least one Hint/Unclosed message in:\n${joined}`).toBeGreaterThan(0);

    // The hint must reference `run` (as a word) or L<runLine>. Sprint 6
    // fixed this from previously misdirecting to `failsafe`/L49.
    const runToken = 'L' + out.runLine;
    const mentionsRun = hintBearing.some(m => /\brun\b/.test(m) || m.includes(runToken));
    expect(
      mentionsRun,
      `OBS-18: hint must reference 'run' or ${runToken}, got:\n${hintBearing.join('\n')}`
    ).toBe(true);
  });

  // ─── Action autocomplete (2026-04-04 feature) ─────────────────────────
  test('Action textarea autocomplete still works after Task 8 helper extraction', async ({ page }) => {
    await setDsl(page, `initial i at 1,1
state a "A" at 3,3 size 8x5
state b "B" at 14,3 size 8x5
i -> a
a -> b : EvX / Act`);

    await switchToTable(page);

    // Click the action cell for the a->b transition. The cell has
    // data-field="action" and its textContent starts with `Act`.
    const clicked = await page.evaluate(() => {
      const tds = Array.from(document.querySelectorAll('#table-wrap td[data-field="action"]'));
      const target = tds.find(c => (c.textContent || '').trim().startsWith('Act'));
      if (target) { target.click(); return true; }
      return false;
    });
    expect(clicked, 'action cell with text Act should exist in the table view').toBe(true);

    // Property panel must have rendered a <textarea id="pp-table-action">.
    // The Task 8 extraction promoted this editor from <input> to <textarea>.
    const taTag = await page.evaluate(() => {
      const el = document.getElementById('pp-table-action');
      return el ? el.tagName : null;
    });
    expect(taTag).toBe('TEXTAREA');

    // Type `-> b` into the textarea. attachMultilineAutocomplete (Task 8)
    // should detect the `-> ` prefix, invoke stateCandidates(), filter by
    // `b`, and show a single `.ac-item` for state `b`.
    await page.evaluate(() => {
      const el = document.getElementById('pp-table-action');
      el.focus();
      el.value = '-> b';
      el.setSelectionRange(el.value.length, el.value.length);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(100);

    const acInfo = await page.evaluate(() => {
      const list = document.querySelector('.ac-list');
      if (!list) return { present: false, count: 0, items: [] };
      const items = Array.from(list.querySelectorAll('.ac-item')).map(el => (el.textContent || '').trim());
      return { present: true, count: items.length, items };
    });

    expect(acInfo.present, 'autocomplete .ac-list should appear after typing `-> b`').toBe(true);
    expect(acInfo.count).toBeGreaterThanOrEqual(1);
    expect(acInfo.items).toContain('b');
  });
});
