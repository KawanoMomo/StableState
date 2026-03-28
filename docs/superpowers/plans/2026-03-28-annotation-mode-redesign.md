# Annotation Mode Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the 3-state annotation toggle (OFF → show → edit) into a 2-state toggle (OFF ↔ annotation mode) with full interaction restrictions so that annotation mode truly prevents editing normal elements and enables adding notes from the UI.

**Architecture:** Replace `showAnnotations` + `annotationEditMode` with a single `annotationMode` boolean. When ON: notes visible/editable, normal elements dimmed + non-interactive. hitTest, mousedown, Ctrl+A, and renderProps all check this flag. Same changes applied to both `stablestate.html` and webview.

**Tech Stack:** Vanilla JavaScript, single-file HTML

---

### Task 1: Merge state variables and update toggle

**Files:**
- Modify: `stablestate.html:264-265` (state variables)
- Modify: `stablestate.html:3143-3162` (toggleAnnotations)
- Modify: `stablestate.html:152` (button HTML)
- Modify: `stablestate.html:3234` (Nキーbinding)

- [ ] **Step 1: Replace state variables**

Replace at line 264-265:
```javascript
// OLD
let showAnnotations = false; // ADR-010: default off
let annotationEditMode = false; // when true, dim states/transitions, notes foreground

// NEW
let annotationMode = false; // annotation mode: notes visible + editable, normal elements dimmed + non-interactive
```

- [ ] **Step 2: Rewrite toggleAnnotations()**

Replace at line 3143-3162:
```javascript
function toggleAnnotations() {
  annotationMode = !annotationMode;
  // Filter selection on mode change
  if (annotationMode) {
    // Entering annotation mode: keep only notes
    const noteIds = new Set(parsed ? parsed.notes.map(n => n.id) : []);
    selection = new Set([...selection].filter(id => noteIds.has(id)));
  } else {
    // Exiting annotation mode: remove notes from selection
    const noteIds = new Set(parsed ? parsed.notes.map(n => n.id) : []);
    selection = new Set([...selection].filter(id => !noteIds.has(id)));
  }
  const btn = document.getElementById('btn-annotations');
  if (btn) {
    btn.classList.toggle('active', annotationMode);
    btn.textContent = annotationMode ? 'Notes (Edit)' : 'Notes';
  }
  refresh();
}
```

Button HTML stays the same (line 152, already has no `active` class per ADR-010).

- [ ] **Step 3: Commit**

```
git add stablestate.html
git commit -m "refactor: merge annotation state into single annotationMode boolean"
```

---

### Task 2: Update all references from old variables to annotationMode

**Files:**
- Modify: `stablestate.html` (multiple locations)

All occurrences of `showAnnotations` and `annotationEditMode` must be replaced.

- [ ] **Step 1: Update renderSVG dimming**

Line 1000: `if (annotationEditMode)` → `if (annotationMode)`
Line 1144: `if (annotationEditMode)` → `if (annotationMode)`
Line 1147: `if (showAnnotations && parsed.notes.length > 0)` → `if (annotationMode && parsed.notes.length > 0)`
Line 1164: `if (annotationEditMode)` → `if (annotationMode)`
Line 1617: `if (showAnnotations)` → `if (annotationMode)` (note connections)
Line 1671: `if (annotationEditMode)` → `if (annotationMode)`

- [ ] **Step 2: Commit**

```
git add stablestate.html
git commit -m "refactor: replace showAnnotations/annotationEditMode refs with annotationMode"
```

---

### Task 3: Add interaction restrictions to hitTest and mousedown

**Files:**
- Modify: `stablestate.html:2543-2583` (hitTest)
- Modify: `stablestate.html:2588` (hitTestHandle)

- [ ] **Step 1: Update hitTest to skip non-notes in annotation mode**

```javascript
function hitTest(px, py) {
  if (!parsed) return null;
  const g = parsed.canvas.grid;

  // In annotation mode, only notes are interactive
  if (!annotationMode) {
    // Check states (reverse order = topmost first)
    for (let i = parsed.states.length - 1; i >= 0; i--) {
      const st = parsed.states[i];
      const abs = getAbsolutePos(st, parsed);
      if (px >= abs.x && px <= abs.x + st.w * g && py >= abs.y && py <= abs.y + st.h * g) {
        return { id: st.id, type: 'state', element: st };
      }
    }

    // Check pseudo-states (click radius ~15px around center)
    for (const ps of parsed.pseudoStates) {
      const abs = getAbsolutePos(ps, parsed);
      if (Math.hypot(px - abs.x, py - abs.y) < 15) {
        return { id: ps.id, type: ps.type, element: ps };
      }
    }

    // Check groups
    for (let i = parsed.groups.length - 1; i >= 0; i--) {
      const grp = parsed.groups[i];
      const x = grp.x * g, y = grp.y * g;
      if (px >= x && px <= x + grp.w * g && py >= y && py <= y + grp.h * g) {
        return { id: grp.id, type: 'group', element: grp };
      }
    }
  }

  // Check notes (only when annotationMode is ON)
  if (annotationMode) {
    for (const n of parsed.notes) {
      const x = n.x * g, y = n.y * g;
      if (px >= x && px <= x + n.w * g && py >= y && py <= y + n.h * g) {
        return { id: n.id, type: 'note', element: n };
      }
    }
  }

  return null;
}
```

- [ ] **Step 2: Update hitTestHandle to restrict to notes in annotation mode**

At line 2591, after `const selEl = ...`:
```javascript
// In annotation mode, only allow resize for notes
if (annotationMode && !parsed.noteMap[selId]) return null;
// In normal mode, don't allow resize for notes
if (!annotationMode && parsed.noteMap[selId]) return null;
```

- [ ] **Step 3: Commit**

```
git add stablestate.html
git commit -m "feat: restrict hitTest to notes-only in annotation mode"
```

---

### Task 4: Update Ctrl+A and arrow key mode filtering

**Files:**
- Modify: `stablestate.html:3238` (Ctrl+A)
- Modify: `stablestate.html` (arrow key nudge)

- [ ] **Step 1: Update Ctrl+A**

Replace line 3238:
```javascript
// OLD
selection = new Set([...parsed.states, ...parsed.pseudoStates, ...parsed.groups, ...parsed.notes].map(el => el.id));

// NEW
if (annotationMode) {
  selection = new Set(parsed.notes.map(el => el.id));
} else {
  selection = new Set([...parsed.states, ...parsed.pseudoStates, ...parsed.groups].map(el => el.id));
}
```

- [ ] **Step 2: Commit**

```
git add stablestate.html
git commit -m "feat: Ctrl+A selects only notes in annotation mode"
```

---

### Task 5: Add note creation to addNewElement and property panel

**Files:**
- Modify: `stablestate.html:3099` (addCounter)
- Modify: `stablestate.html:3101-3131` (addNewElement)
- Modify: `stablestate.html:2030-2031` (renderProps — empty selection)

- [ ] **Step 1: Add note to addCounter**

Line 3099:
```javascript
// OLD
let addCounter = { state: 0, group: 0, initial: 0, final: 0 };

// NEW
let addCounter = { state: 0, group: 0, initial: 0, final: 0, note: 0 };
```

- [ ] **Step 2: Add note case to addNewElement**

After the `case 'final'` block (line 3130), add:
```javascript
    case 'note': {
      addCounter.note++;
      const id = 'note_' + addCounter.note;
      line = `note ${id} "Annotation" at 5,5 size 8x2 color=#FEF3C7`;
      break;
    }
```

Also, after `setDsl(dsl); refresh();` (line 3135-3136), add logic to auto-enable annotation mode:
```javascript
  if (line) {
    dsl = dsl + '\n' + line;
    setDsl(dsl);
    // Auto-enable annotation mode when adding a note
    if (type === 'note' && !annotationMode) {
      annotationMode = true;
      const btn = document.getElementById('btn-annotations');
      if (btn) { btn.classList.add('active'); btn.textContent = 'Notes (Edit)'; }
    }
    refresh();
  }
```

- [ ] **Step 3: Update renderProps for empty selection in annotation mode**

Replace line 2030-2031:
```javascript
  if (selArr.length === 0) {
    if (annotationMode) {
      html += `<div class="prop-section"><div class="prop-label">Annotation Mode</div>`;
      html += `<div class="prop-sub">Click notes to select. States are locked.</div>`;
      html += `<button class="tb tb-accent" style="margin-top:8px;width:100%" onclick="addNewElement('note')">+ Add Note</button>`;
      html += `</div>`;
    } else {
      html += `<div class="prop-section"><div class="prop-label">Selected</div><div class="prop-sub">Select an element to edit</div></div>`;
    }
```

- [ ] **Step 4: Commit**

```
git add stablestate.html
git commit -m "feat: add note creation UI and auto-enable annotation mode"
```

---

### Task 6: Apply same changes to webview.html

**Files:**
- Modify: `vscode-stablestate/src/webview.html`

The webview currently has a simpler 2-state toggle (`showAnnotations` only, no `annotationEditMode`). Apply the same pattern:

- [ ] **Step 1: Replace state variable**

Line 176: `var showAnnotations = false;` → `var annotationMode = false;`

- [ ] **Step 2: Update toggleAnnotations()**

Replace the existing simple toggle (line 1670-1673) with the same logic as stablestate.html but using `var` instead of `const`/`let`:

```javascript
function toggleAnnotations() {
  annotationMode = !annotationMode;
  if (annotationMode) {
    var noteIds = new Set(parsed ? parsed.notes.map(function(n){return n.id;}) : []);
    selection = new Set([].concat(Array.from(selection)).filter(function(id){return noteIds.has(id);}));
  } else {
    var noteIds2 = new Set(parsed ? parsed.notes.map(function(n){return n.id;}) : []);
    selection = new Set([].concat(Array.from(selection)).filter(function(id){return !noteIds2.has(id);}));
  }
  var btn = document.getElementById('btn-annotations');
  if (btn) { btn.classList.toggle('active', annotationMode); btn.textContent = annotationMode ? 'Notes (Edit)' : 'Notes'; }
  refresh();
}
```

- [ ] **Step 3: Replace all showAnnotations references with annotationMode**

Update rendering code: `showAnnotations` → `annotationMode` everywhere (lines 881, 1060, etc.)

Add dimming `<g opacity="0.35">` wrappers around groups/states/pseudos/transitions when `annotationMode` is true (webview.html currently has no dimming at all).

- [ ] **Step 4: Update hitTest to skip non-notes in annotation mode**

Same pattern as stablestate.html: wrap state/pseudo/group checks in `if (!annotationMode)`, wrap note check in `if (annotationMode)`.

- [ ] **Step 5: Update Ctrl+A**

Same mode-based filtering as stablestate.html.

- [ ] **Step 6: Add note to addNewElement and addCounter**

Add `note: 0` to addCounter, add `case 'note'` branch, add auto-enable annotation mode logic.

- [ ] **Step 7: Add renderProps annotation mode UI**

Same empty-selection panel with "+注釈追加" button.

- [ ] **Step 8: Commit**

```
git add vscode-stablestate/src/webview.html
git commit -m "feat: apply annotation mode redesign to VSCode webview"
```

---

### Task 7: Verify and clean up

**Files:**
- Modify: `stablestate.html` (if needed)
- Modify: `vscode-stablestate/src/webview.html` (if needed)

- [ ] **Step 1: Grep for stale references**

Search both files for any remaining `showAnnotations` or `annotationEditMode` references that were missed.

```bash
grep -n "showAnnotations\|annotationEditMode" stablestate.html vscode-stablestate/src/webview.html
```

Expected: 0 results. If any found, update them.

- [ ] **Step 2: Browser smoke test**

Open `stablestate.html` in browser and verify:
1. Press N → annotation mode ON → notes visible, states dimmed at 0.35
2. Click a state → nothing happens (hitTest blocks)
3. Click a note → selected (highlight)
4. Drag a note → moves
5. Ctrl+A → selects only notes
6. Property panel shows "+ Add Note" button
7. Click "+ Add Note" → new note DSL appended
8. Press N → annotation mode OFF → notes hidden, states full opacity, normal interaction
9. Arrow keys: notes don't move in normal mode; states don't move in annotation mode

- [ ] **Step 3: Final commit**

```
git add stablestate.html vscode-stablestate/src/webview.html
git commit -m "fix: clean up stale annotation variable references"
```
