// Headless verification harness: loads stablestate.html in jsdom and checks
// that default-rendered transition routes do not penetrate state boxes.
// Usage: node tests/headless/harness.js
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

function boot() {
  const html = fs.readFileSync(path.join(__dirname, '../../stablestate.html'), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
  return dom.window;
}

function setDsl(w, dsl) {
  const ed = w.document.querySelector('#editor');
  ed.value = dsl;
  ed.dispatchEvent(new w.Event('input', { bubbles: true }));
}

// Count route segments that cut through unrelated leaf/pseudo boxes.
// Runs inside the page context (top-level `let parsed` is not a window prop).
const CHECK_SRC = `(() => {
  const g = parsed.canvas.grid;
  const boxes = collectObstacleBoxesShared(parsed, g);
  let penetrations = 0, routed = 0, nonOrtho = 0;
  const offenders = [];
  for (const tr of parsed.transitions) {
    const wp = tr._renderedRoute;
    if (!wp || wp.length < 2) continue;
    if (tr.from === tr.to) continue; // self loops: separate policy
    routed++;
    const srcBox = getBoxShared(tr.from, parsed, g);
    const tgtBox = getBoxShared(tr.to, parsed, g);
    for (let k = 1; k < wp.length; k++) {
      const p1 = wp[k - 1], p2 = wp[k];
      if (Math.abs(p1.x - p2.x) > 0.5 && Math.abs(p1.y - p2.y) > 0.5) nonOrtho++;
      for (const box of boxes) {
        if (boxesAlmostEqualShared(box, srcBox) || boxesAlmostEqualShared(box, tgtBox)) continue;
        const bx1 = box.x, by1 = box.y, bx2 = box.x + box.w, by2 = box.y + box.h;
        if (Math.abs(p1.y - p2.y) < 0.01) {
          const y = p1.y, xMin = Math.min(p1.x, p2.x), xMax = Math.max(p1.x, p2.x);
          if (y > by1 && y < by2 && xMax > bx1 && xMin < bx2) {
            penetrations++; offenders.push(tr.from + '->' + tr.to + ' seg' + k + ' H y=' + y + ' box(' + bx1 + ',' + by1 + ',' + bx2 + ',' + by2 + ')');
          }
        } else if (Math.abs(p1.x - p2.x) < 0.01) {
          const x = p1.x, yMin = Math.min(p1.y, p2.y), yMax = Math.max(p1.y, p2.y);
          if (x > bx1 && x < bx2 && yMax > by1 && yMin < by2) {
            penetrations++; offenders.push(tr.from + '->' + tr.to + ' seg' + k + ' V x=' + x + ' box(' + bx1 + ',' + by1 + ',' + bx2 + ',' + by2 + ')');
          }
        }
      }
    }
  }
  return { penetrations, routed, nonOrtho, offenders };
})()`;

const checkPenetrations = (w) => w.eval(CHECK_SRC);

let failures = 0;
function assert(name, cond, detail) {
  if (cond) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}

// ─── Case 1: straight shot through a middle box ───
{
  const w = boot();
  setDsl(w, `@canvas width=800 height=400 grid=20
state a "A" at 2,5 size 6x4
state b "B" at 14,5 size 6x4
state c "C" at 26,5 size 6x4
a -> c : go`);
  const r = checkPenetrations(w);
  console.log('case 1: A -> C with B in between');
  assert('routes computed', r.routed === 1, `routed=${r.routed}`);
  assert('zero penetrations', r.penetrations === 0, r.offenders.join('; '));
  assert('orthogonal segments', r.nonOrtho === 0, `nonOrtho=${r.nonOrtho}`);
}

// ─── Case 2: L-route corner lands inside an offset box ───
{
  const w = boot();
  setDsl(w, `@canvas width=800 height=600 grid=20
state a "A" at 2,2 size 6x4
state blocker "Blocker" at 20,2 size 6x4
state c "C" at 20,16 size 6x4
a -> c : go`);
  const r = checkPenetrations(w);
  console.log('case 2: L-shape corner collision');
  assert('zero penetrations', r.penetrations === 0, r.offenders.join('; '));
}

// ─── Case 3: shipped examples render with zero penetrations ───
for (const ex of ['automotive-ecu.sstate', 'tcp-connection.sstate']) {
  const w = boot();
  setDsl(w, fs.readFileSync(path.join(__dirname, '../../examples', ex), 'utf8'));
  const r = checkPenetrations(w);
  console.log(`case 3: ${ex}`);
  assert('routes computed', r.routed > 0, `routed=${r.routed}`);
  assert('zero penetrations', r.penetrations === 0, r.offenders.join('; '));
  assert('orthogonal segments', r.nonOrtho === 0, `nonOrtho=${r.nonOrtho}`);
}

// ─── Case 4: clear layouts keep simple geometric routes ───
{
  const w = boot();
  setDsl(w, `@canvas width=600 height=300 grid=20
state a "A" at 2,4 size 6x4
state b "B" at 16,4 size 6x4
a -> b : go`);
  const len = w.eval('parsed.transitions[0]._renderedRoute.length');
  console.log('case 4: unobstructed pair stays geometric');
  assert('straight 2-point route', len === 2, `len=${len}`);
}

// ─── Case 5: render performance on largest example ───
{
  const w = boot();
  const dsl = fs.readFileSync(path.join(__dirname, '../../examples/automotive-ecu.sstate'), 'utf8');
  setDsl(w, dsl);
  const t0 = Date.now();
  w.eval('for (let i = 0; i < 20; i++) renderSVG(parsed);');
  const ms = (Date.now() - t0) / 20;
  console.log(`case 5: render perf (avg ${ms.toFixed(1)}ms / render)`);
  assert('render under 100ms', ms < 100, `${ms.toFixed(1)}ms`);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
