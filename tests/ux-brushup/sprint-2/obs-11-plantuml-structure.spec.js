// OBS-11 regression test — PlantUML export must preserve composite-state
// nesting, declare history pseudo-states, and distinguish final from initial.
//
// Bug: `exportPlantUML()` emits composite states with their children nested in
// `state X { ... }` blocks but then emits ALL transitions at root scope,
// including transitions whose endpoints live inside a composite. It also
// never declares history pseudo-states (`h_run`) and collapses `final` to
// `[*]` the same way it collapses `initial`, losing the distinction.
//
// Evidence: `.eval/ux-review-2026-04-05/artifacts/persona2-exported-puml.puml`
// from automotive-ecu.sstate shows the breakage:
//   * `[*] --> cooling` at root — cooling is inside `Running` composite
//   * `h_run` referenced but never declared
//   * `[*]` is both initial AND final target (off --> [*] is EvPowerOff final)
//   * cooling --> heating emitted OUTSIDE the `state Running { }` block
//
// This test installs a monkey-patched `a.click()` stub so `exportPlantUML()`
// does NOT actually trigger a file download in the browser, then captures
// the Blob content via a URL.createObjectURL hook. It asserts the resulting
// text for structural correctness (AC3-AC6).
//
// Note on globals: `parsed` is script-scoped (let). `exportPlantUML` is a
// top-level `function` declaration, hence available as `window.exportPlantUML`.

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

// Captures the puml text emitted by exportPlantUML() without actually
// downloading the file. Works by:
//   1. Stubbing HTMLAnchorElement.prototype.click to a no-op
//   2. Stubbing URL.createObjectURL to inspect the Blob and store its text
async function capturePumlOutput(page, dsl) {
  return page.evaluate(async dslText => {
    window.setDsl(dslText);
    window.refresh();
    // eslint-disable-next-line no-eval
    const p = eval('parsed');
    if (!p) return { puml: null, error: 'parsed is null' };

    // Stub download mechanism. exportPlantUML does:
    //   blob = new Blob([text], {type:'text/plain'})
    //   a.href = URL.createObjectURL(blob)
    //   a.click()
    //   URL.revokeObjectURL(a.href)
    // We intercept createObjectURL to read the Blob synchronously via FileReader.
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    const origClick = HTMLAnchorElement.prototype.click;
    let capturedBlob = null;
    URL.createObjectURL = function(blob) {
      capturedBlob = blob;
      return 'blob:fake';
    };
    URL.revokeObjectURL = function() {};
    HTMLAnchorElement.prototype.click = function() {};

    try {
      window.exportPlantUML();
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
      HTMLAnchorElement.prototype.click = origClick;
    }
    if (!capturedBlob) return { puml: null, error: 'no blob captured' };
    const text = await capturedBlob.text();
    return { puml: text, error: null };
  }, dsl);
}

test.describe('OBS-11: PlantUML export nests composites, declares history, and distinguishes final', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', d => d.dismiss().catch(() => {}));
  });

  test('AC3: root-level `[*] -->` only targets root-level child states (not composite-interior states)', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await page.goto('/stablestate.html');
    await page.waitForFunction(() => typeof window.exportPlantUML === 'function');

    const { puml, error } = await capturePumlOutput(page, AUTOMOTIVE_DSL);
    expect(error, `capture error: ${error}`).toBeNull();
    expect(puml, 'puml should be a non-empty string').toBeTruthy();

    // Extract root-level content (the slice OUTSIDE any `state ... { ... }` block).
    // PlantUML composite states use `state "Label" as id {` to open and `}` to close.
    // We walk line by line tracking brace depth relative to @startuml.
    const lines = puml.split('\n');
    const rootLines = [];
    let depth = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      // Count { and } on this line. A line opening a composite has `{` at end.
      const opens = (trimmed.match(/\{/g) || []).length;
      const closes = (trimmed.match(/\}/g) || []).length;
      if (depth === 0 && opens === 0 && closes === 0) {
        rootLines.push(trimmed);
      } else if (depth === 0 && opens > 0) {
        // Composite opener at root: line itself is root-level (the declaration),
        // but the inside is not. Keep the `state X {` declaration as root.
        rootLines.push(trimmed);
      }
      depth += opens - closes;
      if (depth < 0) depth = 0;
    }

    // From root lines, find all `[*] --> <id>` transitions. Each target must
    // be either:
    //   a) a root-level state (its `state "..." as <id>` declaration appears
    //      at root, optionally with a `{` opening a block), OR
    //   b) `[*]` itself (final transition at root level, valid).
    const rootInitialTargets = [];
    for (const line of rootLines) {
      const m = line.match(/^\[\*\]\s*-->\s*(\S+)/);
      if (m) rootInitialTargets.push(m[1]);
    }

    // Collect the set of root-level state ids (things declared at depth 0).
    const rootStateIds = new Set();
    depth = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (depth === 0) {
        // Matches `state "Label" as id` or `state "Label" as id {`
        const m = trimmed.match(/^state\s+"[^"]*"\s+as\s+(\S+?)(\s*\{)?$/);
        if (m) rootStateIds.add(m[1]);
      }
      depth += (trimmed.match(/\{/g) || []).length - (trimmed.match(/\}/g) || []).length;
      if (depth < 0) depth = 0;
    }

    // AC3: every root-level `[*] -->` target must be in rootStateIds (or `[*]`).
    // In particular, `cooling`/`heating`/`dehumidify` MUST NOT appear as root
    // initial targets, because they are inside `running`.
    for (const target of rootInitialTargets) {
      if (target === '[*]') continue;
      expect(
        rootStateIds.has(target),
        `AC3 violated: root-level [*] --> ${target}, but ${target} is not a root-level state.\n` +
        `Root state ids: ${[...rootStateIds].join(', ')}\n\n` +
        `Full PUML:\n${puml}`
      ).toBe(true);
    }

    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('AC4: history pseudo-state is declared with <<history>> before being referenced', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await page.goto('/stablestate.html');
    await page.waitForFunction(() => typeof window.exportPlantUML === 'function');

    const { puml } = await capturePumlOutput(page, AUTOMOTIVE_DSL);
    expect(puml).toBeTruthy();

    // automotive-ecu.sstate has `history h_run at 37,15` inside `run`, and
    // `diagnostic -> h_run` references it. The exported PUML must contain
    //   state h_run <<history>>
    // somewhere, and it must appear BEFORE any line that references `h_run`
    // as a transition target.
    const declRegex = /^\s*state\s+h_run\s+<<history>>\s*$/m;
    expect(
      declRegex.test(puml),
      `AC4 violated: puml does not declare \`state h_run <<history>>\`.\n\nFull PUML:\n${puml}`
    ).toBe(true);

    const lines = puml.split('\n');
    let declIdx = -1;
    let firstRefIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*state\s+h_run\s+<<history>>\s*$/.test(line)) {
        if (declIdx === -1) declIdx = i;
      }
      if (/-->\s*h_run\b/.test(line) || /\bh_run\s*-->/.test(line)) {
        if (firstRefIdx === -1) firstRefIdx = i;
      }
    }
    expect(declIdx, 'history declaration must appear').toBeGreaterThanOrEqual(0);
    if (firstRefIdx >= 0) {
      expect(
        declIdx,
        `AC4 violated: history declaration at line ${declIdx} must precede first reference at line ${firstRefIdx}`
      ).toBeLessThan(firstRefIdx);
    }

    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('AC5: final pseudo-state is declared as <<end>> and distinct from initial', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await page.goto('/stablestate.html');
    await page.waitForFunction(() => typeof window.exportPlantUML === 'function');

    const { puml } = await capturePumlOutput(page, AUTOMOTIVE_DSL);
    expect(puml).toBeTruthy();

    // automotive-ecu.sstate has `final shutdown at 1,10.5` at root.
    // The exported PUML must contain a `state shutdown <<end>>` declaration
    // (or equivalent for that id). We check the literal id `shutdown`
    // because that is the stable id in the example file.
    const finalDeclRegex = /^\s*state\s+shutdown\s+<<end>>\s*$/m;
    expect(
      finalDeclRegex.test(puml),
      `AC5 violated: puml does not declare \`state shutdown <<end>>\`.\n\nFull PUML:\n${puml}`
    ).toBe(true);

    // Additionally: the final transition `sleep -> shutdown : EvBatteryDead`
    // should reference `shutdown` (the end state), not be flattened to `[*]`.
    // We check that the line `sleep --> shutdown` appears somewhere.
    expect(
      /sleep\s*-->\s*shutdown\b/.test(puml),
      `AC5 violated: transition to final state 'shutdown' is missing or flattened to [*].\n\nFull PUML:\n${puml}`
    ).toBe(true);

    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('AC6: child transitions of composite state `running` are emitted INSIDE its {} block', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await page.goto('/stablestate.html');
    await page.waitForFunction(() => typeof window.exportPlantUML === 'function');

    const { puml } = await capturePumlOutput(page, AUTOMOTIVE_DSL);
    expect(puml).toBeTruthy();

    // Find the line that opens the `run` composite: `state "Run" as run {`.
    // Then find the matching `}` at the same nesting depth. All child
    // transitions (`norm_ini --> idle`, `idle --> active`, etc.) and the
    // initial pseudo-state transition must appear strictly between these
    // two positions.
    const lines = puml.split('\n');
    let openIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*state\s+"[^"]*"\s+as\s+run\s*\{\s*$/.test(lines[i])) {
        openIdx = i;
        break;
      }
    }
    expect(
      openIdx,
      `AC6 pre: puml must declare \`state "..." as run {\`.\n\nFull PUML:\n${puml}`
    ).toBeGreaterThanOrEqual(0);

    // Walk forward tracking depth (starting at 1 right after the opening line).
    let depth = 1;
    let closeIdx = -1;
    for (let i = openIdx + 1; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      depth += (trimmed.match(/\{/g) || []).length;
      depth -= (trimmed.match(/\}/g) || []).length;
      if (depth === 0) { closeIdx = i; break; }
    }
    expect(closeIdx, 'matching `}` for run composite must exist').toBeGreaterThan(openIdx);

    const inside = lines.slice(openIdx + 1, closeIdx).join('\n');

    // Child transitions that live inside `run`. Per automotive-ecu.sstate:
    //   run_ini -> normal
    //   normal -> diagnostic : ...
    //   normal -> failsafe : ...
    //   diagnostic -> failsafe : ...
    //   failsafe -> normal : ...
    //   diagnostic -> h_run : ...
    // At minimum one of these must live inside the run composite block.
    // We check the most distinctive: `normal --> diagnostic`.
    expect(
      /normal\s*-->\s*diagnostic\b/.test(inside),
      `AC6 violated: transition 'normal --> diagnostic' must appear INSIDE \`state run { ... }\`.\n` +
      `Inside block:\n${inside}\n\nFull PUML:\n${puml}`
    ).toBe(true);

    // And similarly, the run_ini --> normal initial transition must be inside.
    expect(
      /run_ini\s*-->\s*normal\b|\[\*\]\s*-->\s*normal\b/.test(inside),
      `AC6 violated: run's initial transition (run_ini --> normal or [*] --> normal) must be INSIDE \`state run { ... }\`.\n` +
      `Inside block:\n${inside}\n\nFull PUML:\n${puml}`
    ).toBe(true);

    // And: these transitions must NOT also appear at root (to avoid duplication).
    const rootSlice = lines.slice(0, openIdx).concat(lines.slice(closeIdx + 1)).join('\n');
    expect(
      /^[^{}\n]*\bnormal\s*-->\s*diagnostic\b/m.test(rootSlice),
      `AC6 violated: transition 'normal --> diagnostic' must NOT appear at root level (it belongs inside \`run\`).\n\nRoot slice:\n${rootSlice}`
    ).toBe(false);

    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('AC3+AC6 smoke (tcp-connection.sstate): no composite-interior state appears at root [*] -->', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await page.goto('/stablestate.html');
    await page.waitForFunction(() => typeof window.exportPlantUML === 'function');

    const { puml } = await capturePumlOutput(page, TCP_DSL);
    expect(puml).toBeTruthy();

    // Generic invariant: for EVERY root-level `[*] --> X`, X must be a
    // root-level state id or `[*]`.
    const lines = puml.split('\n');
    const rootLines = [];
    let depth = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      const opens = (trimmed.match(/\{/g) || []).length;
      const closes = (trimmed.match(/\}/g) || []).length;
      if (depth === 0) rootLines.push(trimmed);
      depth += opens - closes;
      if (depth < 0) depth = 0;
    }
    const rootStateIds = new Set();
    depth = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (depth === 0) {
        const m = trimmed.match(/^state\s+"[^"]*"\s+as\s+(\S+?)(\s*\{)?$/);
        if (m) rootStateIds.add(m[1]);
      }
      depth += (trimmed.match(/\{/g) || []).length - (trimmed.match(/\}/g) || []).length;
      if (depth < 0) depth = 0;
    }
    for (const line of rootLines) {
      const m = line.match(/^\[\*\]\s*-->\s*(\S+)/);
      if (m && m[1] !== '[*]') {
        expect(
          rootStateIds.has(m[1]),
          `tcp-connection: root [*] --> ${m[1]} but that id is not a root-level state.\nRoot states: ${[...rootStateIds].join(', ')}\n\nPUML:\n${puml}`
        ).toBe(true);
      }
    }

    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('AC7+AC9 regression: examples load with 0 errors and no console noise during export', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', err => consoleErrors.push(err.message));

    await page.goto('/stablestate.html');
    await page.waitForFunction(() => typeof window.exportPlantUML === 'function');

    for (const dsl of [AUTOMOTIVE_DSL, TCP_DSL]) {
      const errCount = await page.evaluate(d => {
        window.setDsl(d);
        window.refresh();
        // eslint-disable-next-line no-eval
        const p = eval('parsed');
        return p && p.errors ? p.errors.length : -1;
      }, dsl);
      expect(errCount).toBe(0);
      const { puml } = await capturePumlOutput(page, dsl);
      expect(puml).toBeTruthy();
      expect(puml).toContain('@startuml');
      expect(puml).toContain('@enduml');
    }

    expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  });
});
