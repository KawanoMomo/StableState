# StableState Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-based UML state machine diagram editor with DSL ↔ GUI bidirectional sync and auto-generated state transition table, packaged as a single HTML file + VSCode extension.

**Architecture:** Single HTML file (`stablestate.html`) containing all CSS, JS (parser, renderer, interactions, table editor). No build step, no external dependencies. VSCode extension wraps the same core logic in a webview. Testing via a separate `tests/test-parser.html` that exercises parser and routing functions in-browser.

**Tech Stack:** Vanilla JavaScript (ES6), SVG (string concatenation), HTML/CSS, Node.js (VSCode extension host), TextMate grammar (syntax highlighting)

**Reference:** Spec at `docs/superpowers/specs/2026-03-27-stablestate-design.md`. StableBlock reference at `E:/00_Git/01_StatbleBlock/stableblock.html`.

---

## File Structure

| File | Responsibility |
|---|---|
| `stablestate.html` | Main editor: HTML layout, CSS, parser, renderer, interactions, table, export — all in one file |
| `tests/test-parser.html` | Browser-based test harness for parser, validation, routing, and table generation functions |
| `CLAUDE.md` | Project documentation for Claude Code |
| `VERSION` | Version string (`0.1.0`) |
| `vscode-stablestate/package.json` | Extension manifest |
| `vscode-stablestate/src/extension.js` | Extension host: webview creation, bidirectional sync, export commands |
| `vscode-stablestate/language-configuration.json` | Bracket matching, comment toggling |
| `vscode-stablestate/syntaxes/stablestate.tmLanguage.json` | TextMate grammar for `.sstate` files |

---

## Task 1: Project Scaffold and HTML Shell

**Files:**
- Create: `stablestate.html`
- Create: `CLAUDE.md`
- Create: `VERSION`

- [ ] **Step 1: Create VERSION and CLAUDE.md**

`VERSION`:
```
0.1.0
```

`CLAUDE.md`: Project documentation describing the tool, DSL syntax overview, file structure, and dev conventions. Reference the spec for details.

- [ ] **Step 2: Create the HTML shell with 3-pane layout**

Create `stablestate.html` with:
- Full HTML document structure (DOCTYPE, head with Google Fonts, style block, body)
- CSS for dark theme matching the mockup (background `#1a1a2e`, panels `#0f0f23` / `#16213e`)
- Header bar: logo "StableState", tab buttons (Diagram/Table), toolbar buttons (Select, +State, +Group, ●Initial, ◎Final, ↗Connect, Actions toggle), export buttons (SVG, PNG, Copy), zoom display
- Left pane: DSL editor (`<textarea>` with monospace font, line numbers display)
- Center pane: two `<div>` containers for Diagram and Table tabs (only one visible at a time)
- Right pane: Property panel sections (Selected item, Position, Actions, Color, Style, Config)
- Tab switching JS: `switchTab(name)` toggles visibility and toolbar state
- Empty JS function stubs: `parseDSL()`, `renderSVG()`, `renderTable()`, `refresh()`
- `refresh()` calls `parseDSL()` → `renderSVG()` + `renderTable()`
- Textarea `input` event listener calls `refresh()`
- Default DSL text in the textarea:
```
@canvas width=960 height=600 grid=20
@config transition=local

initial ini at 1,5
state idle "Idle" at 4,3 size 8x4 entry=IdleEntry
final fin at 20,5

ini -> idle
idle -> fin : EvShutdown
```

- [ ] **Step 3: Verify the shell opens and displays correctly**

Open `stablestate.html` in a browser. Confirm:
- 3-pane layout renders (left editor, center empty diagram area, right property panel)
- Tab switching between Diagram and Table works
- Typing in the textarea doesn't crash (stubs return empty)
- Dark theme colors match the mockup

- [ ] **Step 4: Commit**

```bash
git add stablestate.html CLAUDE.md VERSION
git commit -m "feat: project scaffold with 3-pane HTML shell"
```

---

## Task 2: DSL Parser — Core Elements

**Files:**
- Modify: `stablestate.html` (add `parseDSL` function)
- Create: `tests/test-parser.html`

- [ ] **Step 1: Create test harness**

Create `tests/test-parser.html` — a standalone HTML file that:
- Extracts the `parseDSL` function via a `<script>` tag that copy-pastes the function (or uses an inline approach)
- Defines a minimal test runner: `function assert(cond, msg)`, `function runTests()`, displays pass/fail counts
- Starts with a skeleton of test cases (empty functions to be filled in next steps)

The test harness pattern:
```html
<!DOCTYPE html>
<html><head><title>StableState Parser Tests</title></head>
<body>
<pre id="output"></pre>
<script>
// === Copy parseDSL function here (or inline it) ===
// Tests will reference it directly

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; log('✓ ' + msg); }
  else { failed++; log('✗ ' + msg); }
}
function log(s) { document.getElementById('output').textContent += s + '\n'; }

// === Test functions go below ===

function runTests() {
  // calls all test_* functions
  log('Results: ' + passed + ' passed, ' + failed + ' failed');
}
runTests();
</script>
</body></html>
```

- [ ] **Step 2: Write parser tests for @canvas and @config**

Add test functions:
```javascript
function test_canvas() {
  const r = parseDSL('@canvas width=960 height=600 grid=20');
  assert(r.canvas.width === 960, 'canvas width');
  assert(r.canvas.height === 600, 'canvas height');
  assert(r.canvas.grid === 20, 'canvas grid');
}
function test_config() {
  const r = parseDSL('@config transition=local\n@config orthogonal=false\n@config history=true');
  assert(r.config.transition === 'local', 'config transition');
  assert(r.config.orthogonal === false, 'config orthogonal');
  assert(r.config.history === true, 'config history');
}
function test_config_defaults() {
  const r = parseDSL('@canvas width=100 height=100 grid=10');
  assert(r.config.transition === 'local', 'default transition');
  assert(r.config.orthogonal === false, 'default orthogonal');
  assert(r.config.history === false, 'default history');
}
```

- [ ] **Step 3: Run tests to verify they fail**

Open `tests/test-parser.html` in browser. Expected: all tests fail ("parseDSL is not defined").

- [ ] **Step 4: Implement parseDSL — canvas, config, comments**

In `stablestate.html`, implement `parseDSL(text)`:
```javascript
function parseDSL(text) {
  const result = {
    canvas: { width: 960, height: 600, grid: 20 },
    config: { transition: 'local', orthogonal: false, history: false },
    states: [], pseudoStates: [], groups: [], regions: [],
    transitions: [], notes: [], noteConnections: [],
    errors: [],
    stateMap: {}, pseudoMap: {}, groupMap: {}, noteMap: {}
  };
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const lineNum = i + 1;
    // @canvas
    if (trimmed.startsWith('@canvas')) {
      const m = trimmed.match(/width=(\d+)/); if (m) result.canvas.width = +m[1];
      const m2 = trimmed.match(/height=(\d+)/); if (m2) result.canvas.height = +m2[1];
      const m3 = trimmed.match(/grid=(\d+)/); if (m3) result.canvas.grid = +m3[1];
      continue;
    }
    // @config (one key per line)
    if (trimmed.startsWith('@config')) {
      const kv = trimmed.slice(7).trim();
      const eqIdx = kv.indexOf('=');
      if (eqIdx > 0) {
        const key = kv.slice(0, eqIdx).trim();
        const val = kv.slice(eqIdx + 1).trim();
        if (key === 'transition') result.config.transition = val;
        else if (key === 'orthogonal') result.config.orthogonal = val === 'true';
        else if (key === 'history') result.config.history = val === 'true';
      }
      continue;
    }
    // ... (other patterns added in next steps)
  }
  return result;
}
```

Copy the `parseDSL` function into `tests/test-parser.html` as well (above the test functions).

- [ ] **Step 5: Run tests to verify canvas/config pass**

Open `tests/test-parser.html`. Expected: all 3 test functions pass.

- [ ] **Step 6: Add parser tests for state, group, note, pseudo-states**

```javascript
function test_simple_state() {
  const r = parseDSL('state idle "Idle" at 2,3 size 8x4 entry=IdleEntry color=#6366F1');
  assert(r.states.length === 1, 'one state');
  assert(r.states[0].id === 'idle', 'state id');
  assert(r.states[0].label === 'Idle', 'state label');
  assert(r.states[0].x === 2, 'state x');
  assert(r.states[0].y === 3, 'state y');
  assert(r.states[0].w === 8, 'state w');
  assert(r.states[0].h === 4, 'state h');
  assert(r.states[0].entry === 'IdleEntry', 'state entry');
  assert(r.states[0].color === '#6366F1', 'state color');
  assert(r.stateMap['idle'] === r.states[0], 'stateMap');
}
function test_pseudo_states() {
  const r = parseDSL('initial ini at 1,4\nfinal fin at 30,4\nchoice c1 at 10,8');
  assert(r.pseudoStates.length === 3, 'three pseudos');
  assert(r.pseudoStates[0].type === 'initial', 'initial type');
  assert(r.pseudoStates[1].type === 'final', 'final type');
  assert(r.pseudoStates[2].type === 'choice', 'choice type');
  assert(r.pseudoMap['ini'].x === 1, 'initial x');
}
function test_group() {
  const r = parseDSL('group g1 "Motors" at 1,1 size 20x10 color=#EEF2FF border=#818CF8');
  assert(r.groups.length === 1, 'one group');
  assert(r.groups[0].id === 'g1', 'group id');
  assert(r.groups[0].label === 'Motors', 'group label');
  assert(r.groups[0].color === '#EEF2FF', 'group color');
}
function test_note() {
  const r = parseDSL('note tip "Important" at 2,1 size 10x2 color=#FEF3C7');
  assert(r.notes.length === 1, 'one note');
  assert(r.notes[0].id === 'tip', 'note id');
  assert(r.notes[0].label === 'Important', 'note label');
}
function test_duplicate_id() {
  const r = parseDSL('state a "A" at 1,1 size 4x3\nstate a "B" at 5,5 size 4x3');
  assert(r.errors.length > 0, 'duplicate id error');
}
```

- [ ] **Step 7: Implement state, group, note, pseudo-state parsing**

Add regex patterns to the `parseDSL` loop:
- State: `/^state\s+(\S+)\s+"([^"]*)"\s+at\s+([\d.]+),([\d.]+)\s+size\s+([\d.]+)x([\d.]+)(.*)/`
  - Parse rest-of-line for `entry=`, `do=`, `exit=`, `color=`, `text=`, `border=`, `round=`, `style=`
  - Build state object, add to `result.states` and `result.stateMap`
  - Detect `{` at end of line → push to nesting stack (composite state parsing, next task)
- Group: `/^group\s+(\S+)\s+"([^"]*)"\s+at\s+([\d.]+),([\d.]+)\s+size\s+([\d.]+)x([\d.]+)(.*)/`
- Note: `/^note\s+(\S+)\s+"([^"]*)"\s+at\s+([\d.]+),([\d.]+)\s+size\s+([\d.]+)x([\d.]+)(.*)/`
- Pseudo-states: `/^(initial|final|choice)\s+(\S+)\s+at\s+([\d.]+),([\d.]+)(.*)/`
  - Fork/join also parse optional `size WxH`
- Duplicate ID check: before adding to any map, check if ID already exists → push error

- [ ] **Step 8: Run tests, verify they pass**

- [ ] **Step 9: Add tests and implement transition + note connection parsing**

Tests:
```javascript
function test_transition_full() {
  const dsl = 'state a "A" at 1,1 size 4x3\nstate b "B" at 10,1 size 4x3\na -> b : EvGo [IsReady] / ActGo @external';
  const r = parseDSL(dsl);
  assert(r.transitions.length === 1, 'one transition');
  const t = r.transitions[0];
  assert(t.from === 'a', 'from'); assert(t.to === 'b', 'to');
  assert(t.event === 'EvGo', 'event'); assert(t.guard === 'IsReady', 'guard');
  assert(t.action === 'ActGo', 'action'); assert(t.kind === 'external', 'kind');
}
function test_transition_minimal() {
  const dsl = 'initial ini at 0,0\nstate a "A" at 2,2 size 4x3\nini -> a';
  const r = parseDSL(dsl);
  assert(r.transitions[0].event === null, 'no event');
  assert(r.transitions[0].kind === 'local', 'default kind');
}
function test_note_connection() {
  const dsl = 'state a "A" at 1,1 size 4x3\nnote n1 "Note" at 8,1 size 6x2\nn1 -> a';
  const r = parseDSL(dsl);
  assert(r.noteConnections.length === 1, 'one note connection');
  assert(r.transitions.length === 0, 'no transition');
}
```

Implementation: Parse `->` lines with regex:
```
/^(\S+)\s+->\s+(\S+)(?:\s*:\s*(.*))?$/
```
Then parse the optional part after `:` for `Event [Guard] / Action @kind`.
Check source/target IDs in noteMap vs stateMap/pseudoMap to determine if it's a noteConnection or transition.

- [ ] **Step 10: Run tests, verify they pass**

- [ ] **Step 11: Add tests and implement composite state (nesting) parsing**

Tests:
```javascript
function test_composite_state() {
  const dsl = `state active "Active" at 10,1 size 20x12 entry=ActiveEntry {
  state accel "Accel" at 1,2 size 8x3
  state cruise "Cruise" at 10,2 size 8x3
}`;
  const r = parseDSL(dsl);
  assert(r.states.length === 3, 'three states');
  const active = r.stateMap['active'];
  assert(active.children.length === 2, 'two children');
  assert(r.stateMap['accel'].parent === 'active', 'accel parent');
  assert(r.stateMap['cruise'].parent === 'active', 'cruise parent');
}
```

Implementation: Use a nesting stack. When a state line ends with `{`, push the current state ID. When a line is `}` (with optional trailing props), pop the stack. States AND pseudo-states parsed while the stack is non-empty get `parent` set to the top of the stack. States are also added to the parent's `children[]`.

**Dot-notation state reference resolution:**
The `stateMap` stores states by simple ID (`accel`, not `active.accel`). Transitions may reference states using dot-notation (`active.accel`). Add a helper function:
```javascript
function resolveStateRef(dotPath, parsed) {
  // Try direct lookup first
  if (parsed.stateMap[dotPath]) return parsed.stateMap[dotPath];
  if (parsed.pseudoMap[dotPath]) return parsed.pseudoMap[dotPath];
  // Split on '.' and walk: "active.accel" → find state "accel" with parent "active"
  const parts = dotPath.split('.');
  const leafId = parts[parts.length - 1];
  const candidates = parsed.states.filter(s => s.id === leafId);
  for (const c of candidates) {
    let match = true;
    let cur = c;
    for (let i = parts.length - 2; i >= 0; i--) {
      if (!cur.parent || cur.parent !== parts[i]) { match = false; break; }
      cur = parsed.stateMap[cur.parent];
    }
    if (match) return c;
  }
  return null;
}
```
Use `resolveStateRef` in validation (transition reference checks), routing (finding bounding boxes), and table generation (mapping transitions to columns). The `->` parser stores `from`/`to` as the raw string (e.g., `active.accel`); resolution happens at usage sites.

- [ ] **Step 12: Run tests, verify they pass**

- [ ] **Step 13: Sync test harness and commit**

Copy the updated `parseDSL` function from `stablestate.html` into `tests/test-parser.html`.

```bash
git add stablestate.html tests/test-parser.html
git commit -m "feat: DSL parser for states, pseudo-states, groups, notes, transitions, nesting"
```

---

## Task 3: Validation

**Files:**
- Modify: `stablestate.html` (add `validate` function)
- Modify: `tests/test-parser.html`

- [ ] **Step 1: Write validation tests**

```javascript
function test_validate_undefined_ref() {
  const r = parseDSL('state a "A" at 1,1 size 4x3\na -> nonexistent : EvGo');
  validate(r);
  assert(r.errors.some(e => e.msg.includes('nonexistent')), 'undefined ref error');
}
function test_validate_initial_required() {
  const r = parseDSL('state a "A" at 1,1 size 4x3');
  validate(r);
  assert(r.errors.some(e => e.msg.includes('initial')), 'missing initial warning');
}
function test_validate_initial_one_transition() {
  const dsl = 'initial ini at 0,0\nstate a "A" at 2,2 size 4x3\nstate b "B" at 8,2 size 4x3\nini -> a\nini -> b';
  const r = parseDSL(dsl);
  validate(r);
  assert(r.errors.some(e => e.msg.includes('initial')), 'initial multi-transition error');
}
```

- [ ] **Step 2: Run tests, verify they fail**

- [ ] **Step 3: Implement validate(result)**

```javascript
function validate(result) {
  // 1. Transition references
  for (const t of result.transitions) {
    if (!result.stateMap[t.from] && !result.pseudoMap[t.from])
      result.errors.push({ line: t.line, msg: `Undefined source: ${t.from}` });
    if (!result.stateMap[t.to] && !result.pseudoMap[t.to])
      result.errors.push({ line: t.line, msg: `Undefined target: ${t.to}` });
  }
  // 2. Initial pseudo-state: one outgoing transition, no event/guard
  // 3. Choice: only guard-based transitions, max 1 without guard
  // 4. Hierarchy: each composite state should have an initial child (warning)
  // 5. Config constraints: region/fork/join without orthogonal=true → warning
  // 6. Nesting bounds: child coords + size within parent (warning)
}
```

- [ ] **Step 4: Run tests, verify they pass**

- [ ] **Step 5: Display errors in the UI**

Add an error bar below the textarea in the editor pane. When `result.errors` is non-empty, display them as a list with line numbers. Style: red background, white text.

- [ ] **Step 6: Commit**

```bash
git add stablestate.html tests/test-parser.html
git commit -m "feat: validation rules with error display"
```

---

## Task 4: SVG Renderer — Grid, Groups, Composite States

**Files:**
- Modify: `stablestate.html` (implement `renderSVG`)

- [ ] **Step 1: Implement grid background rendering**

In `renderSVG(parsed)`, build SVG string:
```javascript
function renderSVG(parsed) {
  const { canvas } = parsed;
  const g = canvas.grid;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}">`;
  // Grid dots pattern
  svg += `<defs><pattern id="grid" width="${g}" height="${g}" patternUnits="userSpaceOnUse">`;
  svg += `<circle cx="${g/2}" cy="${g/2}" r="0.8" fill="#2a2a4a"/></pattern></defs>`;
  svg += `<rect width="${canvas.width}" height="${canvas.height}" fill="#1a1a2e"/>`;
  svg += `<rect width="${canvas.width}" height="${canvas.height}" fill="url(#grid)"/>`;
  // ... (add elements in z-order)
  svg += '</svg>';
  return svg;
}
```

Set diagram area's innerHTML to the returned SVG string in `refresh()`.

- [ ] **Step 2: Verify grid renders**

Open browser, confirm grid dot pattern displays.

- [ ] **Step 3: Render groups**

Loop through `parsed.groups`, draw semi-transparent background rectangles with border and label:
```javascript
for (const grp of parsed.groups) {
  const x = grp.x * g, y = grp.y * g, w = grp.w * g, h = grp.h * g;
  const fill = grp.color || '#EEF2FF';
  const stroke = grp.borderColor || '#818CF8';
  svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${fill}" fill-opacity="0.3" stroke="${stroke}" stroke-width="1"/>`;
  svg += `<text x="${x+10}" y="${y+16}" font-size="12" fill="${stroke}" font-weight="bold">${esc(grp.label)}</text>`;
}
```

- [ ] **Step 4: Render composite state outlines**

Loop through states with `children.length > 0`:
```javascript
for (const st of parsed.states.filter(s => s.children.length > 0)) {
  const px = parentOffsetX(st, parsed), py = parentOffsetY(st, parsed);
  const x = (st.x + px) * g, y = (st.y + py) * g, w = st.w * g, h = st.h * g;
  const fill = st.color || 'rgba(99,102,241,0.08)';
  const stroke = st.borderColor || '#6366F1';
  svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
  svg += `<text x="${x+15}" y="${y+20}" font-size="14" fill="${stroke}" font-weight="bold">${esc(st.label)}</text>`;
  // entry/do/exit text (if actions mode is on) rendered below label
}
```

Helper `parentOffsetX/Y`: walk the parent chain, summing up parent x/y coordinates.

- [ ] **Step 5: Verify groups and composite states render with the default DSL**

Update the default DSL to include a composite state and group. Confirm rendering.

- [ ] **Step 6: Commit**

```bash
git add stablestate.html
git commit -m "feat: SVG renderer — grid, groups, composite state outlines"
```

---

## Task 5: SVG Renderer — Simple States and Pseudo-States

**Files:**
- Modify: `stablestate.html`

- [ ] **Step 1: Render leaf states (names-only mode)**

For each state without children (leaf states):
```javascript
const x = (st.x + px) * g, y = (st.y + py) * g, w = st.w * g, h = st.h * g;
const fill = st.color || '#1e293b';
const stroke = isSelected(st.id) ? 'white' : (st.borderColor || '#818CF8');
const sw = isSelected(st.id) ? 2.5 : 1.5;
svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${st.round||8}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" filter="drop-shadow(2px 2px 4px rgba(0,0,0,0.4))"/>`;
svg += `<text x="${x+w/2}" y="${y+h/2+5}" text-anchor="middle" font-size="13" fill="${st.textColor||'#e0e0e0'}" font-weight="bold">${esc(st.label)}</text>`;
```

Actions mode (when toggled ON): draw separator line and entry/do/exit text below the label.

- [ ] **Step 2: Render pseudo-states**

```javascript
for (const ps of parsed.pseudoStates) {
  // Pseudo-states have a `parent` field set by the parser when declared inside { } blocks
  const cx = (ps.x + parentOffsetX(ps, parsed)) * g + g/2;
  const cy = (ps.y + parentOffsetY(ps, parsed)) * g + g/2;
  if (ps.type === 'initial') {
    svg += `<circle cx="${cx}" cy="${cy}" r="10" fill="#e0e0e0"/>`;
  } else if (ps.type === 'final') {
    svg += `<circle cx="${cx}" cy="${cy}" r="12" fill="none" stroke="#e0e0e0" stroke-width="2"/>`;
    svg += `<circle cx="${cx}" cy="${cy}" r="7" fill="#e0e0e0"/>`;
  } else if (ps.type === 'choice') {
    // Diamond shape using <polygon>
    svg += `<polygon points="${cx},${cy-12} ${cx+12},${cy} ${cx},${cy+12} ${cx-12},${cy}" fill="#1e293b" stroke="#818CF8" stroke-width="1.5"/>`;
  }
  // history/deephistory/fork/join handled similarly (Phase 2/3 features but parser accepts them)
}
```

- [ ] **Step 3: Implement Actions toggle**

Add state variable `let showActions = false;`. Toggle button in toolbar calls:
```javascript
function toggleActions() { showActions = !showActions; refresh(); }
```

In state rendering, when `showActions` is true and state has entry/do/exit, increase state box height and render action text.

- [ ] **Step 4: Verify with sample DSL containing states + pseudo-states**

Update default DSL to demonstrate all element types. Confirm visual correctness.

- [ ] **Step 5: Commit**

```bash
git add stablestate.html
git commit -m "feat: SVG renderer — leaf states, pseudo-states, actions toggle"
```

---

## Task 6: SVG Renderer — Transition Routing

**Files:**
- Modify: `stablestate.html`
- Modify: `tests/test-parser.html` (add routing tests)

- [ ] **Step 1: Write routing tests**

```javascript
function test_computePorts_horizontal() {
  // State A at (1,5), State B at (10,5) — same Y → horizontal connection
  const portA = { side: 'right', x: 180, y: 110 };
  const portB = { side: 'left', x: 200, y: 110 };
  // Test that computePorts returns right-side for A and left-side for B
}
function test_computePorts_vertical() {
  // State A at (5,1), State B at (5,10) — same X → vertical connection
}
function test_buildRoute_straight() {
  // Same axis → should produce 2-point polyline (straight line)
}
function test_buildRoute_L_shape() {
  // Different axes → L-shape route (1 turn)
}
function test_buildRoute_U_shape() {
  // Need to go around → U-shape route (2 turns)
}
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement port computation**

```javascript
function computePorts(parsed) {
  // For each transition, determine which side of source/target to use
  // Algorithm:
  // 1. Get bounding boxes for source and target (in pixel coords)
  // 2. Calculate gap on each side (how much space between the two boxes)
  // 3. Choose sides with maximum gap
  // 4. For multiple transitions on the same side, distribute ports evenly

  const portAssignments = []; // { transIdx, fromPort:{x,y,side}, toPort:{x,y,side} }

  // Group transitions by (source, side) to distribute ports
  // Port position: center of side, then offset for multiple connections

  return portAssignments;
}
```

Key function: `getBestSides(srcBox, tgtBox)` returns `{ srcSide, tgtSide }` based on gap analysis. Sides: 'top', 'bottom', 'left', 'right'. Edge center = midpoint of that edge.

- [ ] **Step 4: Implement route building (orthogonal polylines)**

```javascript
function buildRoute(fromPort, toPort, srcBox, tgtBox, allBoxes) {
  // Returns array of {x,y} points forming an orthogonal polyline
  const points = [fromPort];

  if (fromPort.side === 'right' && toPort.side === 'left' && fromPort.x < toPort.x) {
    // Straight horizontal or L-shape
    if (Math.abs(fromPort.y - toPort.y) < 1) {
      points.push(toPort); // straight line
    } else {
      const midX = (fromPort.x + toPort.x) / 2;
      points.push({ x: midX, y: fromPort.y });
      points.push({ x: midX, y: toPort.y });
      points.push(toPort);
    }
  }
  // ... handle all side combinations
  // For U-shapes: extend outward from source, horizontal/vertical channel, come back to target
  // For boundary crossing: add extra segments to route around parent state borders

  return points;
}
```

- [ ] **Step 5: Implement self-transition routing**

When `from === to`:
```javascript
function buildSelfRoute(port, box) {
  const margin = 30; // 1.5 grid units
  // Exit from right-center, go right, go up, come back to top-center
  return [
    { x: box.x + box.w, y: box.y + box.h/2 },     // right-center
    { x: box.x + box.w + margin, y: box.y + box.h/2 }, // right
    { x: box.x + box.w + margin, y: box.y - margin },   // up-right
    { x: box.x + box.w/2, y: box.y - margin },           // up-center
    { x: box.x + box.w/2, y: box.y }                     // top-center
  ];
}
```

- [ ] **Step 6: Render polylines with arrowheads and labels**

```javascript
function renderTransitions(parsed, portAssignments) {
  let svg = '';
  // Arrow marker def
  svg += '<defs><marker id="arrow" markerWidth="10" markerHeight="8" refX="10" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 Z" fill="#89DDFF"/></marker></defs>';

  for (const pa of portAssignments) {
    const t = parsed.transitions[pa.transIdx];
    const route = buildRoute(pa.fromPort, pa.toPort, ...);
    const pts = route.map(p => `${p.x},${p.y}`).join(' ');
    svg += `<polyline points="${pts}" fill="none" stroke="#89DDFF" stroke-width="1.5" marker-end="url(#arrow)"/>`;
    // Label: event name + [guard] / action
    const labelPos = routeMidpoint(route);
    if (t.event) {
      svg += `<text x="${labelPos.x}" y="${labelPos.y-8}" text-anchor="middle" font-size="10" fill="#FFCB6B">${esc(t.event)}</text>`;
    }
    if (t.guard || t.action) {
      const details = (t.guard ? `[${t.guard}]` : '') + (t.action ? ` / ${t.action}` : '');
      svg += `<text x="${labelPos.x}" y="${labelPos.y-20}" text-anchor="middle" font-size="9" fill="#C3E88D">${esc(details.trim())}</text>`;
    }
  }
  return svg;
}
```

- [ ] **Step 7: Run tests, verify they pass**

- [ ] **Step 8: Verify transitions render correctly with sample DSL**

Use the default DSL with multiple transitions (horizontal, vertical, L-shape, U-shape, self-transition). Visually verify in browser.

- [ ] **Step 9: Commit**

```bash
git add stablestate.html tests/test-parser.html
git commit -m "feat: orthogonal transition routing with polylines and labels"
```

---

## Task 7: SVG Renderer — Bridge/Hop at Crossings

**Files:**
- Modify: `stablestate.html`
- Modify: `tests/test-parser.html`

- [ ] **Step 1: Write crossing detection tests**

```javascript
function test_segments_cross() {
  // Horizontal line y=100 from x=50 to x=200
  // Vertical line x=120 from y=50 to y=150
  // Should cross at (120, 100)
  const cross = segmentIntersection(
    {x:50,y:100}, {x:200,y:100},
    {x:120,y:50}, {x:120,y:150}
  );
  assert(cross !== null, 'segments cross');
  assert(Math.abs(cross.x - 120) < 1, 'cross x');
  assert(Math.abs(cross.y - 100) < 1, 'cross y');
}
function test_segments_no_cross() {
  const cross = segmentIntersection(
    {x:50,y:100}, {x:100,y:100},
    {x:120,y:50}, {x:120,y:150}
  );
  assert(cross === null, 'no cross');
}
```

- [ ] **Step 2: Run tests, verify they fail**

- [ ] **Step 3: Implement segment intersection and bridge rendering**

```javascript
function segmentIntersection(a1, a2, b1, b2) {
  // Standard line segment intersection algorithm
  // Returns {x, y} or null
}

function renderPolylineWithBridges(points, allOtherPolylines, color) {
  // For each segment in this polyline, check against all segments of other polylines
  // At each intersection point, replace the crossing segment with an arc
  // Arc: half-circle with radius 6px, perpendicular to the crossing line
  let svg = '';
  // Build path string: M start, then for each segment:
  //   - If no crossings: L to end
  //   - If crossings: sort by distance, for each: L to (cross-6), A arc over, L to next
  return svg;
}
```

The bridge is rendered as an SVG arc: `A 6,6 0 0,1 x,y` (semicircle hop).

- [ ] **Step 4: Run tests, verify they pass**

- [ ] **Step 5: Verify bridges render with crossing transitions**

Create a DSL with transitions that cross. Confirm half-circle hops appear at intersections.

- [ ] **Step 6: Commit**

```bash
git add stablestate.html tests/test-parser.html
git commit -m "feat: bridge/hop rendering at transition crossings"
```

---

## Task 8: DSL Updaters (Bidirectional Sync Foundation)

**Files:**
- Modify: `stablestate.html`
- Modify: `tests/test-parser.html`

- [ ] **Step 1: Write updater tests**

```javascript
function test_updatePos() {
  let dsl = 'state idle "Idle" at 2,3 size 8x4';
  dsl = updatePos('state', 'idle', 5, 7, dsl);
  assert(dsl.includes('at 5,7'), 'position updated');
  assert(dsl.includes('size 8x4'), 'size preserved');
}
function test_updateSize() {
  let dsl = 'state idle "Idle" at 2,3 size 8x4';
  dsl = updateSize('state', 'idle', 10, 6, dsl);
  assert(dsl.includes('size 10x6'), 'size updated');
}
function test_updateProp() {
  let dsl = 'state idle "Idle" at 2,3 size 8x4 entry=OldEntry';
  dsl = updateProp('state', 'idle', 'entry', 'NewEntry', dsl);
  assert(dsl.includes('entry=NewEntry'), 'prop updated');
  assert(!dsl.includes('OldEntry'), 'old prop removed');
}
function test_updateLabel() {
  let dsl = 'state idle "Idle" at 2,3 size 8x4';
  dsl = updateLabel('state', 'idle', 'New Label', dsl);
  assert(dsl.includes('"New Label"'), 'label updated');
}
function test_addTransition() {
  let dsl = 'state a "A" at 1,1 size 4x3\nstate b "B" at 8,1 size 4x3';
  dsl = addTransition('a', 'b', 'EvGo', null, 'ActGo', 'local', dsl);
  assert(dsl.includes('a -> b : EvGo / ActGo'), 'transition added');
}
function test_removeTransition() {
  let dsl = 'state a "A" at 1,1 size 4x3\nstate b "B" at 8,1 size 4x3\na -> b : EvGo';
  dsl = removeTransition('a', 'b', 'EvGo', null, dsl);
  assert(!dsl.includes('a -> b'), 'transition removed');
}
```

- [ ] **Step 2: Run tests, verify they fail**

- [ ] **Step 3: Implement all updater functions**

Each function uses regex to find the target line and replace in-place:
```javascript
function updatePos(type, id, nx, ny, dsl) {
  const re = new RegExp(`^(\\s*${type}\\s+${id}\\s+"[^"]*"\\s+at\\s+)[\\d.]+,[\\d.]+(\\s+size\\s+.*)$`, 'm');
  return dsl.replace(re, `$1${nx},${ny}$2`);
}
function updateSize(type, id, nw, nh, dsl) {
  const re = new RegExp(`^(\\s*${type}\\s+${id}\\s+"[^"]*"\\s+at\\s+[\\d.]+,[\\d.]+\\s+size\\s+)[\\d.]+x[\\d.]+(.*)$`, 'm');
  return dsl.replace(re, `$1${nw}x${nh}$2`);
}
function updateProp(type, id, prop, val, dsl) {
  // If prop exists on the line, replace it; otherwise append it
}
function updateLabel(type, id, newLabel, dsl) {
  const re = new RegExp(`^(\\s*${type}\\s+${id}\\s+)"[^"]*"(.*)$`, 'm');
  return dsl.replace(re, `$1"${newLabel}"$2`);
}
function addTransition(from, to, event, guard, action, kind, dsl) {
  let line = `${from} -> ${to}`;
  if (event || guard || action) {
    line += ' :';
    if (event) line += ` ${event}`;
    if (guard) line += ` [${guard}]`;
    if (action) line += ` / ${action}`;
  }
  // Only append @kind if it differs from the default (parsed from @config)
  const defaultKind = parsed ? parsed.config.transition : 'local';
  if (kind && kind !== defaultKind) line += ` @${kind}`;
  return dsl + '\n' + line;
}
function removeTransition(from, to, event, guard, dsl) {
  // Find and remove the matching line
}
function updateTransition(from, to, event, guard, field, val, dsl) {
  // Find the matching transition line and update the specific field
}
```

- [ ] **Step 4: Run tests, verify they pass**

- [ ] **Step 5: Commit**

```bash
git add stablestate.html tests/test-parser.html
git commit -m "feat: DSL updater functions for bidirectional sync"
```

---

## Task 9: Interaction — Selection, Drag, Resize

**Files:**
- Modify: `stablestate.html`

- [ ] **Step 1: Implement selection system**

State variables:
```javascript
let selection = new Set();  // selected element IDs
let dragState = null;       // { startX, startY, items: [{id, origX, origY}] }
let resizeState = null;     // { id, handle, origX, origY, origW, origH }
```

Click handler on SVG:
- Hit-test against states, groups, notes, pseudo-states (check bounding boxes)
- Single click: clear selection, select clicked item
- Shift+click: toggle item in selection
- Click on empty space: clear selection
- Update right panel (`renderProps()`) on selection change

- [ ] **Step 2: Implement drag & drop**

Mousedown on a selected element starts drag:
```javascript
svgEl.addEventListener('mousedown', e => {
  const hit = hitTest(e.offsetX, e.offsetY);
  if (hit && selection.has(hit.id)) {
    pushHistory();
    const items = collectDragSet(selection, parsed);
    dragState = { startX: e.offsetX, startY: e.offsetY, items };
  }
});
svgEl.addEventListener('mousemove', e => {
  if (!dragState) return;
  const dx = Math.round((e.offsetX - dragState.startX) / grid) ;
  const dy = Math.round((e.offsetY - dragState.startY) / grid);
  for (const item of dragState.items) {
    dsl = updatePos(item.type, item.id, item.origX + dx, item.origY + dy, dsl);
  }
  refresh();
});
svgEl.addEventListener('mouseup', () => { dragState = null; });
```

`collectDragSet`: if a group is selected, include all states inside it via `isInside()` check. If a composite state is selected, DO NOT include children (they move automatically via relative coordinates).

**`isInside(inner, outer)` containment check** (StableBlock approach):
```javascript
function isInside(inner, outer) {
  // Center-point containment: inner's center is within outer's bounds
  const icx = inner.x + inner.w / 2, icy = inner.y + inner.h / 2;
  return icx >= outer.x && icx <= outer.x + outer.w &&
         icy >= outer.y && icy <= outer.y + outer.h;
}
```

**Child state boundary clipping during drag:**
When dragging a child state (has `parent`), clamp coordinates to parent bounds:
```javascript
if (item.parent) {
  const parentSt = parsed.stateMap[item.parent];
  const newX = Math.max(0, Math.min(parentSt.w - item.w, item.origX + dx));
  const newY = Math.max(0, Math.min(parentSt.h - item.h, item.origY + dy));
  dsl = updatePos('state', item.id, newX, newY, dsl);
} else {
  dsl = updatePos(item.type, item.id, item.origX + dx, item.origY + dy, dsl);
}
```

- [ ] **Step 3: Implement snap guides**

During drag, check alignment with other elements' edges/centers:
```javascript
function computeSnapGuides(draggedBox, allBoxes) {
  const guides = [];
  const threshold = 0.5 * grid;
  for (const box of allBoxes) {
    // Check left/right/center-x alignment
    // Check top/bottom/center-y alignment
    // If within threshold, add guide line
  }
  return guides;
}
```

Render snap guides as yellow dashed lines in the SVG.

- [ ] **Step 4: Implement resize handles**

When a single item is selected, render 8 resize handles (corners + edge midpoints). Mouse interaction on handles:
- Track which handle is being dragged
- Adjust position and/or size based on handle direction
- Minimum size: 1 grid unit

- [ ] **Step 5: Verify drag, snap, resize work correctly**

Test in browser: drag states, observe snap guides, resize via handles.

- [ ] **Step 6: Commit**

```bash
git add stablestate.html
git commit -m "feat: selection, drag & drop with snap guides, resize handles"
```

---

## Task 10: Interaction — Connect, Delete, Undo/Redo, Keyboard

**Files:**
- Modify: `stablestate.html`

- [ ] **Step 1: Implement Connect button**

When exactly 2 elements are selected and "Connect" is clicked:
```javascript
function connectSelected() {
  if (selection.size !== 2) return;
  const [fromId, toId] = [...selection];
  const event = prompt('Event name (optional):');
  pushHistory();
  dsl = addTransition(fromId, toId, event || null, null, null, null, dsl);
  refresh();
}
```

- [ ] **Step 2: Implement Delete**

Delete/Backspace handler: remove selected elements from DSL.
```javascript
function deleteSelected() {
  pushHistory();
  for (const id of selection) {
    // Remove the line(s) defining this element
    // Also remove any transitions referencing this element
    dsl = removeDSLElement(id, dsl);
  }
  selection.clear();
  refresh();
}
```

- [ ] **Step 3: Implement Undo/Redo**

```javascript
let history = [];
let future = [];
const MAX_HISTORY = 100;

function pushHistory() {
  history.push(dsl);
  if (history.length > MAX_HISTORY) history.shift();
  future = [];
}
function undo() {
  if (!history.length) return;
  future.push(dsl);
  dsl = history.pop();
  setEditorText(dsl);
  refresh();
}
function redo() {
  if (!future.length) return;
  history.push(dsl);
  dsl = future.pop();
  setEditorText(dsl);
  refresh();
}
```

- [ ] **Step 4: Implement keyboard shortcuts**

```javascript
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
  if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (document.activeElement !== textarea) deleteSelected();
  }
  if (e.key === 'n' || e.key === 'N') {
    if (document.activeElement !== textarea) toggleAnnotations();
  }
});
```

- [ ] **Step 5: Implement Add State / Add Group / Add Initial / Add Final toolbar buttons**

Each button generates a new DSL line with a unique ID and default position, appends to DSL text.

- [ ] **Step 6: Verify all interactions**

Test: connect two states, delete an element, undo/redo, add new elements via toolbar.

- [ ] **Step 7: Commit**

```bash
git add stablestate.html
git commit -m "feat: connect, delete, undo/redo, keyboard shortcuts, add buttons"
```

---

## Task 11: Property Panel

**Files:**
- Modify: `stablestate.html`

- [ ] **Step 1: Implement renderProps()**

Render the right panel based on current selection:
```javascript
function renderProps() {
  const panel = document.getElementById('propsContent');
  if (selection.size === 0) {
    panel.innerHTML = '<p class="hint">Select an element</p>';
    renderConfigPanel();
    return;
  }
  if (selection.size === 1) {
    const id = [...selection][0];
    const el = parsed.stateMap[id] || parsed.pseudoMap[id] || parsed.groupMap[id] || parsed.noteMap[id];
    if (!el) return;
    // Render: ID input, Label input, Position (X, Y), Size (W, H)
    // Actions (entry, do, exit) for states
    // Color picker grid (16 preset colors)
    // Border color, Text color, Style dropdown, Round
    // All inputs call pushHistory() + updateXxx() + refresh() on change
  }
  if (selection.size === 2) {
    // Connection UI: Connect button, existing connection properties
  }
  renderConfigPanel(); // Always show config section at bottom
}
```

- [ ] **Step 2: Implement config panel (transition default, orthogonal, history checkboxes)**

```javascript
function renderConfigPanel() {
  // Transition default: <select> with local/external/internal
  // Orthogonal: checkbox + warning message
  // History: checkbox
  // Changes update @config lines in DSL
}
```

- [ ] **Step 3: Verify property editing works end-to-end**

Select a state, change its label in the property panel → DSL updates → SVG re-renders.

- [ ] **Step 4: Commit**

```bash
git add stablestate.html
git commit -m "feat: property panel with state/config editing"
```

---

## Task 12: State Transition Table

**Files:**
- Modify: `stablestate.html`
- Modify: `tests/test-parser.html`

- [ ] **Step 1: Write table generation tests**

```javascript
function test_generateTable_simple() {
  const dsl = `@canvas width=100 height=100 grid=10
initial ini at 0,0
state idle "Idle" at 2,2 size 4x3 entry=IdleEntry
state active "Active" at 8,2 size 4x3
ini -> idle
idle -> active : EvStart [IsReady] / ActInit`;
  const r = parseDSL(dsl); validate(r);
  const table = generateTableData(r);
  assert(table.columns.length === 2, 'two state columns');
  assert(table.columns[0].name === 'Idle', 'first col');
  assert(table.columns[0].isInitial === true, 'idle is initial');
  assert(table.events.length === 1, 'one event');
  assert(table.events[0].name === 'EvStart', 'event name');
}
```

- [ ] **Step 2: Run tests, verify they fail**

- [ ] **Step 3: Implement generateTableData(parsed)**

```javascript
function generateTableData(parsed) {
  // 1. Build column structure from state tree (depth-first)
  //    - Each leaf state = one data column
  //    - Parent states span their children columns (colspan)
  //    - Mark initial states with > prefix
  // 2. Collect unique events from transitions
  // 3. For each (event, state) pair, find matching transitions → guard/action/target
  // 4. Return { headerRows, actionRows (entry/do/exit), events: [{name, rows: [{guard,action,target} per column]}] }

  if (parsed.config.orthogonal) return null; // Table not supported

  const columns = [];
  function walkStates(states, parentId) {
    for (const st of states.filter(s => s.parent === parentId)) {
      if (st.children.length > 0) {
        walkStates(parsed.states, st.id);
      } else {
        columns.push(st);
      }
    }
  }
  walkStates(parsed.states, null);

  // Determine initial states from initial pseudo-state transitions
  // Collect events, build guard/action/target matrix

  return { columns, events, actionRows };
}
```

- [ ] **Step 4: Run tests, verify they pass**

- [ ] **Step 5: Implement renderTable(tableData)**

Render an HTML `<table>` into the Table tab container:
```javascript
function renderTable(tableData) {
  if (!tableData) {
    tableContainer.innerHTML = '<div class="warning-banner">直交領域が有効のため状態遷移表は使用できません</div>';
    return;
  }
  let html = '<table class="stm-table">';
  // Header rows with colspan for parent states
  // Action rows (entry/do/exit) — editable cells
  // Event blocks (4-row: event name, guard, action, target) — editable cells
  // Cell width: max(80px, charCount * 8px)
  // Empty cells display '-'
  html += '</table>';
  tableContainer.innerHTML = html;
  attachTableEditHandlers();
}
```

- [ ] **Step 6: Implement table cell editing**

```javascript
function attachTableEditHandlers() {
  document.querySelectorAll('.stm-table td.editable').forEach(td => {
    td.addEventListener('dblclick', () => {
      const input = document.createElement('input');
      input.value = td.textContent === '-' ? '' : td.textContent;
      td.textContent = '';
      td.appendChild(input);
      input.focus();
      input.addEventListener('blur', () => {
        const newVal = input.value.trim() || '-';
        const { stateId, eventName, field } = td.dataset;
        pushHistory();
        if (field === 'entry' || field === 'do' || field === 'exit') {
          dsl = updateProp('state', stateId, field, newVal === '-' ? '' : newVal, dsl);
        } else if (field === 'target') {
          handleTableTargetEdit(stateId, eventName, td.dataset.guard, td.dataset.oldTarget, newVal);
        } else {
          // guard or action update
          dsl = updateTransition(stateId, td.dataset.target, eventName, td.dataset.guard, field, newVal, dsl);
        }
        refresh();
      });
    });
  });
}
```

**`handleTableTargetEdit` implementation:**
```javascript
function handleTableTargetEdit(sourceStateId, eventName, guard, oldTarget, newTarget) {
  if (oldTarget === '-' && newTarget !== '-') {
    // Add new transition
    dsl = addTransition(sourceStateId, newTarget, eventName, guard || null, null, null, dsl);
  } else if (oldTarget !== '-' && newTarget === '-') {
    // Remove transition
    dsl = removeTransition(sourceStateId, oldTarget, eventName, guard || null, dsl);
  } else if (oldTarget !== '-' && newTarget !== '-' && oldTarget !== newTarget) {
    // Change target: remove old, add new
    dsl = removeTransition(sourceStateId, oldTarget, eventName, guard || null, dsl);
    dsl = addTransition(sourceStateId, newTarget, eventName, guard || null, null, null, dsl);
  }
}
```

- [ ] **Step 7: Implement + Event button**

```javascript
function addEventFromTable() {
  const name = prompt('Event name:');
  if (!name) return;
  pushHistory();
  // Append comment line to DSL as placeholder
  dsl += `\n# Event: ${name}`;
  refresh();
}
```

- [ ] **Step 8: Verify table generation and editing with sample DSL**

Test: view table, edit a target cell to add a transition, confirm line appears in diagram.

- [ ] **Step 9: Commit**

```bash
git add stablestate.html tests/test-parser.html
git commit -m "feat: state transition table with auto-generation and bidirectional editing"
```

---

## Task 13: Annotation Layer

**Files:**
- Modify: `stablestate.html`

- [ ] **Step 1: Implement annotation rendering**

State variable: `let showAnnotations = true;`

In `renderSVG`, when `showAnnotations` is true, render notes after all other elements:
```javascript
// Notes
for (const note of parsed.notes) {
  const x = note.x * g, y = note.y * g, w = note.w * g, h = note.h * g;
  svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${note.color||'#FEF3C7'}" stroke="${note.borderColor||'#FCD34D'}" stroke-width="1"/>`;
  svg += `<text x="${x+8}" y="${y+16}" font-size="11" fill="${note.textColor||'#92400E'}">${esc(note.label)}</text>`;
}
// Note connections (dashed lines)
for (const nc of parsed.noteConnections) {
  // Draw dashed polyline from note center to target state center
}
```

- [ ] **Step 2: Implement annotation edit mode**

When `N` is pressed or annotation button clicked:
- Toggle `annotationEditMode`
- When ON: dim states/transitions to opacity 0.35, notes at full opacity, note interactions enabled
- When OFF: normal display

- [ ] **Step 3: Verify annotations render and toggle works**

- [ ] **Step 4: Commit**

```bash
git add stablestate.html
git commit -m "feat: annotation layer with note rendering and edit mode toggle"
```

---

## Task 14: Export (SVG, PNG, Clipboard)

**Files:**
- Modify: `stablestate.html`

- [ ] **Step 1: Implement SVG export**

```javascript
function exportSVG() {
  const svgStr = renderSVG(parsed); // Pure SVG without interaction elements
  const blob = new Blob([svgStr], { type: 'image/svg+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'stablestate.svg';
  a.click();
}
```

- [ ] **Step 2: Implement PNG export**

```javascript
function exportPNG() {
  const svgStr = renderSVG(parsed);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const img = new Image();
  img.onload = () => {
    canvas.width = parsed.canvas.width;
    canvas.height = parsed.canvas.height;
    // Transparent background (don't fill)
    ctx.drawImage(img, 0, 0);
    canvas.toBlob(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'stablestate.png';
      a.click();
    });
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
}
```

- [ ] **Step 3: Implement clipboard copy**

```javascript
async function copyToClipboard() {
  const svgStr = renderSVG(parsed);
  const canvas = document.createElement('canvas');
  // ... same as PNG but write to clipboard
  canvas.toBlob(async blob => {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  });
}
```

- [ ] **Step 4: Verify all export functions**

Test: click SVG button (downloads .svg), PNG button (downloads .png), Copy button (paste into image editor).

- [ ] **Step 5: Commit**

```bash
git add stablestate.html
git commit -m "feat: SVG/PNG export and clipboard copy"
```

---

## Task 15: VSCode Extension — Scaffold

**Files:**
- Create: `vscode-stablestate/package.json`
- Create: `vscode-stablestate/language-configuration.json`
- Create: `vscode-stablestate/syntaxes/stablestate.tmLanguage.json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "stablestate",
  "displayName": "StableState",
  "description": "UML State Machine Diagram Editor with DSL",
  "version": "0.1.0",
  "engines": { "vscode": "^1.80.0" },
  "categories": ["Programming Languages", "Visualization"],
  "activationEvents": ["onLanguage:stablestate"],
  "main": "./src/extension.js",
  "contributes": {
    "languages": [{
      "id": "stablestate",
      "aliases": ["StableState"],
      "extensions": [".sstate"],
      "configuration": "./language-configuration.json"
    }],
    "grammars": [{
      "language": "stablestate",
      "scopeName": "source.stablestate",
      "path": "./syntaxes/stablestate.tmLanguage.json"
    }],
    "commands": [
      { "command": "stablestate.preview", "title": "StableState: Open Preview" },
      { "command": "stablestate.exportSVG", "title": "StableState: Export SVG" },
      { "command": "stablestate.exportPNG", "title": "StableState: Export PNG" }
    ],
    "keybindings": [
      { "command": "stablestate.preview", "key": "ctrl+shift+v", "when": "editorLangId == stablestate" }
    ]
  }
}
```

- [ ] **Step 2: Create language-configuration.json**

```json
{
  "comments": { "lineComment": "#" },
  "brackets": [["{", "}"], ["[", "]"]],
  "autoClosingPairs": [
    { "open": "{", "close": "}" },
    { "open": "[", "close": "]" },
    { "open": "\"", "close": "\"" }
  ]
}
```

- [ ] **Step 3: Create TextMate grammar**

`stablestate.tmLanguage.json` with patterns for all keywords, IDs, strings, numbers, operators, colors, comments as defined in the spec's TextMate grammar section.

- [ ] **Step 4: Commit**

```bash
git add vscode-stablestate/
git commit -m "feat: VSCode extension scaffold — package.json, language config, TextMate grammar"
```

---

## Task 16: VSCode Extension — Webview and Sync

**Files:**
- Create: `vscode-stablestate/src/extension.js`

- [ ] **Step 1: Implement extension host**

```javascript
const vscode = require('vscode');

function activate(context) {
  let panel = null;

  const previewCmd = vscode.commands.registerCommand('stablestate.preview', () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    panel = vscode.window.createWebviewPanel(
      'stablestatePreview', 'StableState Preview',
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );

    panel.webview.html = getWebviewContent(editor.document.getText());

    // Editor → Webview sync
    vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document === editor.document) {
        panel.webview.postMessage({ type: 'dslUpdate', dsl: e.document.getText() });
      }
    });

    // Webview → Editor sync
    panel.webview.onDidReceiveMessage(msg => {
      if (msg.type === 'dslUpdate') {
        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(0, 0, editor.document.lineCount, 0);
        edit.replace(editor.document.uri, fullRange, msg.dsl);
        vscode.workspace.applyEdit(edit);
      }
      if (msg.type === 'exportSVG') { /* save dialog */ }
      if (msg.type === 'exportPNG') { /* save dialog */ }
    });
  });

  context.subscriptions.push(previewCmd);
}

function getWebviewContent(dsl) {
  // Return the full HTML (same as stablestate.html) with:
  // - vscodeApi integration
  // - Initial DSL set from parameter
  // - Message handlers for bidirectional sync
  return `<!DOCTYPE html>...`;
}

module.exports = { activate };
```

- [ ] **Step 2: Implement export commands**

Register `exportSVG` and `exportPNG` commands that send messages to the webview and handle the save dialog response.

- [ ] **Step 3: Implement keyboard forwarding**

Forward Ctrl+Z, Ctrl+Y, Ctrl+C, Ctrl+V, Ctrl+A to the webview.

- [ ] **Step 4: Test the extension locally**

Run `code --extensionDevelopmentPath=./vscode-stablestate` and open a `.sstate` file. Verify:
- Syntax highlighting works
- `Ctrl+Shift+V` opens the preview webview
- Editing the file updates the preview
- Dragging in the preview updates the file

- [ ] **Step 5: Commit**

```bash
git add vscode-stablestate/src/extension.js
git commit -m "feat: VSCode extension with webview preview and bidirectional sync"
```

---

## Task 17: Final Integration and Polish

**Files:**
- Modify: `stablestate.html`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Wire up zoom (mouse wheel) and fix coordinate transforms**

```javascript
let zoom = 1.0;
svgContainer.addEventListener('wheel', e => {
  e.preventDefault();
  zoom = Math.max(0.25, Math.min(4, zoom + (e.deltaY > 0 ? -0.1 : 0.1)));
  svgEl.style.transform = `scale(${zoom})`;
  svgEl.style.transformOrigin = '0 0';
  document.getElementById('zoomDisplay').textContent = `Zoom: ${Math.round(zoom*100)}%`;
});

// IMPORTANT: All mouse coordinate calculations in hit-testing and drag
// must compensate for zoom. Add a helper used by all interaction handlers:
function svgCoords(e) {
  const rect = svgEl.getBoundingClientRect();
  return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
}
```

Retrofit `svgCoords(e)` into Task 9's `hitTest`, mousedown, and mousemove handlers (replace `e.offsetX/Y` with `svgCoords(e).x/y`). This ensures drag and selection work correctly at any zoom level.

- [ ] **Step 1b: Add missing helpers: `esc()` and `routeMidpoint()`**

```javascript
function esc(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function routeMidpoint(points) {
  // Walk polyline segments, find the point at 50% of total path length
  let totalLen = 0;
  for (let i = 1; i < points.length; i++) {
    totalLen += Math.hypot(points[i].x - points[i-1].x, points[i].y - points[i-1].y);
  }
  let target = totalLen / 2, acc = 0;
  for (let i = 1; i < points.length; i++) {
    const segLen = Math.hypot(points[i].x - points[i-1].x, points[i].y - points[i-1].y);
    if (acc + segLen >= target) {
      const t = (target - acc) / segLen;
      return { x: points[i-1].x + t * (points[i].x - points[i-1].x),
               y: points[i-1].y + t * (points[i].y - points[i-1].y) };
    }
    acc += segLen;
  }
  return points[Math.floor(points.length / 2)];
}
```

- [ ] **Step 1c: Add missing keyboard shortcuts (Ctrl+C, Ctrl+V, Ctrl+A)**

Add to the keyboard handler in Task 10:
```javascript
if (e.ctrlKey && e.key === 'a') {
  e.preventDefault();
  selection = new Set([...parsed.states, ...parsed.pseudoStates, ...parsed.groups, ...parsed.notes].map(el => el.id));
  refresh();
}
if (e.ctrlKey && e.key === 'c') { if (document.activeElement !== textarea) copySelection(); }
if (e.ctrlKey && e.key === 'v') { if (document.activeElement !== textarea) pasteSelection(); }
```

Copy/paste: serialize selected elements' DSL lines to a clipboard buffer string. Paste: append with offset (+2, +2) to avoid overlap, generate new unique IDs.

- [ ] **Step 2: Implement DSL syntax highlighting in the editor pane**

Simple approach: overlay a `<pre>` with colored spans on top of the transparent textarea. Or use a basic token colorizer that processes each line and wraps keywords, strings, numbers, etc. in `<span class="kw">` etc.

- [ ] **Step 3: Update CLAUDE.md with final architecture details**

Document: DSL syntax reference, file structure, key functions, dev workflow.

- [ ] **Step 4: Full integration test**

Open `stablestate.html` with a comprehensive DSL:
```
@canvas width=960 height=600 grid=20
@config transition=local

group sys "System" at 0,0 size 46x28 color=#1a1a3e border=#3a3a5a

initial ini at 1,5
final fin at 40,14

state idle "Idle" at 3,3 size 8x5 entry=IdleEntry
state active "Active" at 15,1 size 24x14 entry=ActiveEntry exit=ActiveExit {
  state accel "Accel" at 1,3 size 9x5 entry=AccelEntry do=AccelDo
  state cruise "Cruise" at 13,3 size 9x5 entry=CruiseEntry
}
state error "Error" at 3,18 size 8x5 color=#7F1D1D border=#DC2626

choice c1 at 12,14
note tip "Check guards carefully" at 30,18 size 14x3

ini -> idle
idle -> active : EvStart [IsReady] / ActInit
active.accel -> active.cruise : EvSpeedOk
active.cruise -> active.accel : EvBrake
active -> idle : EvStop / ActStop
active -> c1 : EvError
c1 -> error : [IsCritical]
c1 -> idle : [IsRecoverable]
c1 -> idle :
error -> fin : EvShutdown
tip -> active
```

Verify:
- All states, pseudo-states, groups render correctly
- Transitions route with orthogonal lines, no corner connections
- Crossing lines have bridge hops
- Table tab shows correct state transition table
- Table editing adds transitions (lines only, no state movement)
- Property panel edits propagate to DSL and diagram
- Undo/redo works across diagram and table edits
- Annotation layer toggles correctly
- SVG/PNG export works
- Actions toggle switches between compact and detailed view

- [ ] **Step 5: Commit**

```bash
git add stablestate.html CLAUDE.md
git commit -m "feat: final integration — zoom, syntax highlighting, polish"
```

- [ ] **Step 6: Tag v0.1.0**

```bash
git tag v0.1.0
```
