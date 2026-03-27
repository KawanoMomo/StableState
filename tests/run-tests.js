// Node.js test runner for StableState parser
// Run: node tests/run-tests.js

// ═══════════════════════════════════════════════
// Parser (identical to stablestate.html)
// ═══════════════════════════════════════════════
function parseDSL(text) {
  const result = {
    canvas: { width: 960, height: 600, grid: 20 },
    config: { transition: 'local', orthogonal: false, history: false },
    states: [],
    pseudoStates: [],
    groups: [],
    regions: [],
    transitions: [],
    notes: [],
    noteConnections: [],
    errors: [],
    stateMap: {},
    pseudoMap: {},
    groupMap: {},
    noteMap: {}
  };

  const lines = text.split('\n');
  const nestingStack = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const raw = lines[i];
    const trimmed = raw.trim();

    if (trimmed === '' || trimmed.startsWith('#')) continue;

    if (/^\}/.test(trimmed)) {
      if (nestingStack.length === 0) {
        result.errors.push({ line: lineNum, msg: 'Unexpected closing brace }' });
        continue;
      }
      const parentId = nestingStack.pop();
      const afterBrace = trimmed.slice(1).trim();
      if (afterBrace && result.stateMap[parentId]) {
        parseProps(afterBrace, result.stateMap[parentId]);
      }
      continue;
    }

    const canvasMatch = trimmed.match(/^@canvas\s+(.+)$/);
    if (canvasMatch) {
      const propsStr = canvasMatch[1];
      const wm = propsStr.match(/width=(\d+)/);
      const hm = propsStr.match(/height=(\d+)/);
      const gm = propsStr.match(/grid=(\d+)/);
      if (wm) result.canvas.width = parseInt(wm[1], 10);
      if (hm) result.canvas.height = parseInt(hm[1], 10);
      if (gm) result.canvas.grid = parseInt(gm[1], 10);
      continue;
    }

    const configMatch = trimmed.match(/^@config\s+(\w+)=(\S+)$/);
    if (configMatch) {
      const key = configMatch[1];
      const val = configMatch[2];
      if (key === 'transition') result.config.transition = val;
      else if (key === 'orthogonal') result.config.orthogonal = val === 'true';
      else if (key === 'history') result.config.history = val === 'true';
      continue;
    }

    const pseudoMatch = trimmed.match(/^(initial|final|choice|history|deephistory|fork|join)\s+(\S+)\s+at\s+(-?[\d.]+)\s*,\s*(-?[\d.]+)(?:\s+size\s+(-?[\d.]+)\s*x\s*(-?[\d.]+))?/);
    if (pseudoMatch) {
      const id = pseudoMatch[2];
      if (checkDuplicate(id, lineNum, result)) continue;
      const ps = {
        type: pseudoMatch[1], id,
        x: parseFloat(pseudoMatch[3]), y: parseFloat(pseudoMatch[4]),
        w: pseudoMatch[5] ? parseFloat(pseudoMatch[5]) : null,
        h: pseudoMatch[6] ? parseFloat(pseudoMatch[6]) : null,
        parent: nestingStack.length > 0 ? nestingStack[nestingStack.length - 1] : null,
        line: lineNum
      };
      result.pseudoStates.push(ps);
      result.pseudoMap[id] = ps;
      continue;
    }

    const stateMatch = trimmed.match(/^state\s+(\S+)\s+"([^"]*)"\s+at\s+(-?[\d.]+)\s*,\s*(-?[\d.]+)\s+size\s+(-?[\d.]+)\s*x\s*(-?[\d.]+)(.*)$/);
    if (stateMatch) {
      const id = stateMatch[1];
      if (checkDuplicate(id, lineNum, result)) continue;
      const rest = stateMatch[7].trim();
      const isComposite = rest.endsWith('{');
      const propsStr = isComposite ? rest.slice(0, -1).trim() : rest;
      const st = {
        type: 'state', id, label: stateMatch[2],
        x: parseFloat(stateMatch[3]), y: parseFloat(stateMatch[4]),
        w: parseFloat(stateMatch[5]), h: parseFloat(stateMatch[6]),
        color: null, textColor: null, borderColor: null, round: null, style: null,
        entry: null, do: null, exit: null,
        parent: nestingStack.length > 0 ? nestingStack[nestingStack.length - 1] : null,
        children: [], isInitial: false, line: lineNum
      };
      if (propsStr) parseProps(propsStr, st);
      result.states.push(st);
      result.stateMap[id] = st;
      if (st.parent && result.stateMap[st.parent]) result.stateMap[st.parent].children.push(id);
      if (isComposite) nestingStack.push(id);
      continue;
    }

    const groupMatch = trimmed.match(/^group\s+(\S+)\s+"([^"]*)"\s+at\s+(-?[\d.]+)\s*,\s*(-?[\d.]+)\s+size\s+(-?[\d.]+)\s*x\s*(-?[\d.]+)(.*)$/);
    if (groupMatch) {
      const id = groupMatch[1];
      if (checkDuplicate(id, lineNum, result)) continue;
      const rest = groupMatch[7].trim();
      const g = {
        type: 'group', id, label: groupMatch[2],
        x: parseFloat(groupMatch[3]), y: parseFloat(groupMatch[4]),
        w: parseFloat(groupMatch[5]), h: parseFloat(groupMatch[6]),
        color: null, borderColor: null, textColor: null, style: null, line: lineNum
      };
      if (rest) parseProps(rest, g);
      result.groups.push(g);
      result.groupMap[id] = g;
      continue;
    }

    const noteMatch = trimmed.match(/^note\s+(\S+)\s+"([^"]*)"\s+at\s+(-?[\d.]+)\s*,\s*(-?[\d.]+)\s+size\s+(-?[\d.]+)\s*x\s*(-?[\d.]+)(.*)$/);
    if (noteMatch) {
      const id = noteMatch[1];
      if (checkDuplicate(id, lineNum, result)) continue;
      const rest = noteMatch[7].trim();
      const n = {
        type: 'note', id, label: noteMatch[2],
        x: parseFloat(noteMatch[3]), y: parseFloat(noteMatch[4]),
        w: parseFloat(noteMatch[5]), h: parseFloat(noteMatch[6]),
        color: null, textColor: null, line: lineNum
      };
      if (rest) parseProps(rest, n);
      result.notes.push(n);
      result.noteMap[id] = n;
      continue;
    }

    const transMatch = trimmed.match(/^(\S+)\s*->\s*(\S+)(.*)$/);
    if (transMatch) {
      const from = transMatch[1], to = transMatch[2], rest = transMatch[3].trim();
      if (result.noteMap[from]) {
        result.noteConnections.push({ noteId: from, targetId: to, line: lineNum });
        continue;
      }
      let event = null, guard = null, action = null, kind = null;
      if (rest.startsWith(':')) {
        const detail = rest.slice(1).trim();
        const kindMatch = detail.match(/@(local|external|internal)\s*$/);
        let remaining = detail;
        if (kindMatch) { kind = kindMatch[1]; remaining = detail.slice(0, detail.lastIndexOf('@' + kind)).trim(); }
        const slashIdx = remaining.indexOf('/');
        if (slashIdx !== -1) { action = remaining.slice(slashIdx + 1).trim() || null; remaining = remaining.slice(0, slashIdx).trim(); }
        const guardMatch2 = remaining.match(/\[([^\]]*)\]/);
        if (guardMatch2) { guard = guardMatch2[1].trim() || null; remaining = remaining.slice(0, remaining.indexOf('[')).trim(); }
        event = remaining.trim() || null;
      }
      result.transitions.push({ from, to, event, guard, action, kind: kind || result.config.transition, label: rest.startsWith(':') ? rest.slice(1).trim() : null, line: lineNum });
      continue;
    }

    result.errors.push({ line: lineNum, msg: 'Unrecognized syntax: ' + trimmed });
  }

  if (nestingStack.length > 0) {
    result.errors.push({ line: lines.length, msg: 'Unclosed composite state: ' + nestingStack.join(', ') });
  }

  return result;
}

function parseProps(propsStr, target) {
  const propRe = /(\w+)=(\S+)/g;
  let m;
  while ((m = propRe.exec(propsStr)) !== null) {
    switch (m[1]) {
      case 'entry': target.entry = m[2]; break;
      case 'do': target.do = m[2]; break;
      case 'exit': target.exit = m[2]; break;
      case 'color': target.color = m[2]; break;
      case 'text': target.textColor = m[2]; break;
      case 'border': target.borderColor = m[2]; break;
      case 'round': target.round = parseFloat(m[2]); break;
      case 'style': target.style = m[2]; break;
    }
  }
}

function checkDuplicate(id, lineNum, result) {
  if (result.stateMap[id] || result.pseudoMap[id] || result.groupMap[id] || result.noteMap[id]) {
    result.errors.push({ line: lineNum, msg: 'Duplicate ID: ' + id });
    return true;
  }
  return false;
}

function resolveStateRef(dotPath, parsed) {
  if (parsed.stateMap[dotPath]) return parsed.stateMap[dotPath];
  if (parsed.pseudoMap[dotPath]) return parsed.pseudoMap[dotPath];
  const parts = dotPath.split('.');
  const leafId = parts[parts.length - 1];
  const candidates = parsed.states.filter(s => s.id === leafId);
  for (const c of candidates) {
    let match = true, cur = c;
    for (let i = parts.length - 2; i >= 0; i--) {
      if (!cur.parent || cur.parent !== parts[i]) { match = false; break; }
      cur = parsed.stateMap[cur.parent];
    }
    if (match) return c;
  }
  return null;
}

// ═══════════════════════════════════════════════
// Test Framework
// ═══════════════════════════════════════════════
let totalTests = 0, passedTests = 0, failedTests = 0;
const failures = [];

function assert(condition, msg) {
  totalTests++;
  if (condition) {
    passedTests++;
  } else {
    failedTests++;
    failures.push(msg);
    console.log('  FAIL: ' + msg);
  }
}

function runTest(name, fn) {
  console.log(name);
  try {
    fn();
  } catch (e) {
    failedTests++;
    totalTests++;
    failures.push(name + ': ' + e.message);
    console.log('  ERROR: ' + e.message);
  }
}

// ═══════════════════════════════════════════════
// Test Cases
// ═══════════════════════════════════════════════

runTest('test_canvas', () => {
  const r = parseDSL('@canvas width=960 height=600 grid=20');
  assert(r.canvas.width === 960, 'canvas width');
  assert(r.canvas.height === 600, 'canvas height');
  assert(r.canvas.grid === 20, 'canvas grid');
});

runTest('test_config', () => {
  const r = parseDSL('@config transition=local\n@config orthogonal=false\n@config history=true');
  assert(r.config.transition === 'local', 'config transition');
  assert(r.config.orthogonal === false, 'config orthogonal');
  assert(r.config.history === true, 'config history');
});

runTest('test_config_defaults', () => {
  const r = parseDSL('@canvas width=100 height=100 grid=10');
  assert(r.config.transition === 'local', 'default transition');
  assert(r.config.orthogonal === false, 'default orthogonal');
  assert(r.config.history === false, 'default history');
});

runTest('test_simple_state', () => {
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
});

runTest('test_pseudo_states', () => {
  const r = parseDSL('initial ini at 1,4\nfinal fin at 30,4\nchoice c1 at 10,8');
  assert(r.pseudoStates.length === 3, 'three pseudos');
  assert(r.pseudoStates[0].type === 'initial', 'initial type');
  assert(r.pseudoStates[1].type === 'final', 'final type');
  assert(r.pseudoStates[2].type === 'choice', 'choice type');
  assert(r.pseudoMap['ini'].x === 1, 'initial x');
});

runTest('test_group', () => {
  const r = parseDSL('group g1 "Motors" at 1,1 size 20x10 color=#EEF2FF border=#818CF8');
  assert(r.groups.length === 1, 'one group');
  assert(r.groups[0].id === 'g1', 'group id');
  assert(r.groups[0].label === 'Motors', 'group label');
  assert(r.groups[0].color === '#EEF2FF', 'group color');
});

runTest('test_note', () => {
  const r = parseDSL('note tip "Important" at 2,1 size 10x2 color=#FEF3C7');
  assert(r.notes.length === 1, 'one note');
  assert(r.notes[0].id === 'tip', 'note id');
  assert(r.notes[0].label === 'Important', 'note label');
});

runTest('test_duplicate_id', () => {
  const r = parseDSL('state a "A" at 1,1 size 4x3\nstate a "B" at 5,5 size 4x3');
  assert(r.errors.length > 0, 'duplicate id error');
});

runTest('test_transition_full', () => {
  const dsl = 'state a "A" at 1,1 size 4x3\nstate b "B" at 10,1 size 4x3\na -> b : EvGo [IsReady] / ActGo @external';
  const r = parseDSL(dsl);
  assert(r.transitions.length === 1, 'one transition');
  const t = r.transitions[0];
  assert(t.from === 'a', 'from');
  assert(t.to === 'b', 'to');
  assert(t.event === 'EvGo', 'event');
  assert(t.guard === 'IsReady', 'guard');
  assert(t.action === 'ActGo', 'action');
  assert(t.kind === 'external', 'kind');
});

runTest('test_transition_minimal', () => {
  const dsl = 'initial ini at 0,0\nstate a "A" at 2,2 size 4x3\nini -> a';
  const r = parseDSL(dsl);
  assert(r.transitions[0].event === null, 'no event');
  assert(r.transitions[0].kind === 'local', 'default kind');
});

runTest('test_note_connection', () => {
  const dsl = 'state a "A" at 1,1 size 4x3\nnote n1 "Note" at 8,1 size 6x2\nn1 -> a';
  const r = parseDSL(dsl);
  assert(r.noteConnections.length === 1, 'one note connection');
  assert(r.transitions.length === 0, 'no transition');
});

runTest('test_composite_state', () => {
  const dsl = 'state active "Active" at 10,1 size 20x12 entry=ActiveEntry {\n  state accel "Accel" at 1,2 size 8x3\n  state cruise "Cruise" at 10,2 size 8x3\n}';
  const r = parseDSL(dsl);
  assert(r.states.length === 3, 'three states');
  const active = r.stateMap['active'];
  assert(active.children.length === 2, 'two children');
  assert(r.stateMap['accel'].parent === 'active', 'accel parent');
  assert(r.stateMap['cruise'].parent === 'active', 'cruise parent');
});

runTest('test_pseudo_inside_composite', () => {
  const dsl = 'state active "Active" at 10,1 size 20x12 {\n  initial ini2 at 1,1\n  state sub "Sub" at 3,3 size 6x3\n}';
  const r = parseDSL(dsl);
  assert(r.pseudoMap['ini2'].parent === 'active', 'pseudo parent in composite');
});

runTest('test_resolve_dot_path', () => {
  const dsl = 'state active "Active" at 10,1 size 20x12 {\n  state accel "Accel" at 1,2 size 8x3\n}';
  const r = parseDSL(dsl);
  const resolved = resolveStateRef('active.accel', r);
  assert(resolved !== null, 'resolved not null');
  assert(resolved.id === 'accel', 'resolved id');
});

runTest('test_closing_brace_props', () => {
  const dsl = 'state active "Active" at 10,1 size 20x12 {\n  state sub "Sub" at 1,1 size 6x3\n} entry=ActiveEntry exit=ActiveExit';
  const r = parseDSL(dsl);
  assert(r.stateMap['active'].entry === 'ActiveEntry', 'closing brace entry prop');
  assert(r.stateMap['active'].exit === 'ActiveExit', 'closing brace exit prop');
});

// ═══════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════
console.log('\n' + '='.repeat(50));
console.log('Total: ' + totalTests + ' | Passed: ' + passedTests + ' | Failed: ' + failedTests);
if (failedTests > 0) {
  console.log('FAILURES: ' + failures.join(', '));
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED');
}
