# Interaction Alignment: StableBlock → StableState 移植計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** StableStateのブロック操作感をStableBlockと完全に一致させる。座標ベースhitTestをDOM方式に置換し、選択バグを根本解決する。

**Architecture:** StableBlockの`data-id`/`data-type`属性 + `setupInteractions()`パターンを移植。renderSVG()で各要素に属性を付与し、描画後にイベントハンドラを再アタッチする。プロパティパネルにバッチ操作・遷移管理UIを追加。

**Tech Stack:** Vanilla JS (single HTML file)

**対象ファイル:** `stablestate.html` のみ

---

## 差分一覧（修正対象）

| 項目 | StableBlock（正） | StableState（現） | 変更内容 |
|------|-------------------|-------------------|----------|
| SVG要素属性 | `<g data-type="block" data-id="xxx">` | 属性なし | 全要素にdata-id/data-type追加 |
| インタラクション方式 | DOM要素別`mousedown` + `setupInteractions()` | `svg-wrap`全体mousedown + `hitTest()` | DOM方式に全面移行 |
| リサイズ最小値 | `Math.max(1, ...)` | `Math.max(2, ...)` | 2→1に変更 |
| 選択視覚効果 | 白stroke + drop-shadow | 白strokeのみ | drop-shadow追加 |
| ズーム範囲 | 0.25〜3.0 | 0.25〜4.0 | 4.0→3.0に変更 |
| ペーストID | `__new_N` | `_timestamp_suffix` | `__new_N`方式に統一 |
| Ctrl+Shift+Z | Redo | 未対応 | 追加 |
| Ctrl+X | Cut | 未対応 | 追加 |
| H キー | Highlight mode | 未対応 | 追加 |
| プロパティ(複数選択) | バッチ位置/サイズ/色/スタイル変更 | 件数表示+Connect/Groupのみ | バッチ操作追加 |
| プロパティ(2要素選択) | 接続管理UI(Flip/Bidir/色/幅/スタイル) | Connectボタンのみ | 遷移管理UI追加 |
| 選択モデル | `sel=[{type,id},...]` 配列 | `selection=Set(id)` Set | `sel`配列方式に統一 |
| カーソルスタイル | `cursor:grab` | なし | 追加 |

---

## Task 1: 選択モデルをStableBlock方式に統一

StableBlockの`sel=[{type,id},...]`配列方式に切り替える。これにより以降のTask全てで型情報が利用可能になる。

**Files:**
- Modify: `stablestate.html:272-292` (state variables)
- Modify: `stablestate.html:279` (isSelected helper)
- Modify: 全ファイル中の `selection.has/add/delete/clear/size/for...of` 呼び出し

- [ ] **Step 1: グローバル変数の置き換え**

```javascript
// === 変更前 (line 278-279) ===
let selection = new Set();
function isSelected(id) { return selection.has(id); }

// === 変更後 ===
let sel = []; // [{type, id}, ...] — StableBlock互換
function isSel(id) { return sel.some(s => s.id === id); }
function isSelected(id) { return isSel(id); } // renderSVG互換ラッパー
```

- [ ] **Step 2: ヘルパー関数の追加**

```javascript
// getItem: sel要素からparsedオブジェクトを取得（StableBlock互換）
function getItem(si) {
  if (!parsed) return null;
  if (si.type === 'state') return parsed.stateMap[si.id] || null;
  if (si.type === 'group') return parsed.groupMap[si.id] || null;
  if (si.type === 'note') return parsed.noteMap[si.id] || null;
  // pseudo-states
  return parsed.pseudoMap[si.id] || null;
}

// resolveSelType: IDからtype文字列を解決
function resolveSelType(id) {
  if (!parsed) return 'state';
  if (parsed.stateMap[id]) return 'state';
  if (parsed.pseudoMap[id]) return parsed.pseudoMap[id].type;
  if (parsed.groupMap[id]) return 'group';
  if (parsed.noteMap[id]) return 'note';
  return 'state';
}
```

- [ ] **Step 3: 全ての`selection`参照を`sel`に置換**

以下パターンを一括変換:
- `selection.clear()` → `sel = []`
- `selection.add(id)` → `sel.push({type: resolveSelType(id), id})`（既存チェック追加）
- `selection.has(id)` → `isSel(id)`
- `selection.delete(id)` → `sel = sel.filter(s => s.id !== id)`
- `selection.size` → `sel.length`
- `for (const id of selection)` → `for (const si of sel)` + `si.id`/`si.type`使用
- `[...selection]` → `sel.map(s => s.id)` or `sel` 直接
- `selection = new Set(...)` → `sel = [...].map(id => ({type: resolveSelType(id), id}))`

影響箇所:
- `mousedown` handler (lines 3305-3340)
- `hitTest` usage in mousedown
- `collectDragSet` (line 3116-3145)
- `copySelection` (line 3533-3565)
- `pasteSelection` (line 3567-3591)
- `deleteSelected` (line 3518-3528)
- `connectSelected` (line 3472-3481)
- `groupSelected` (line 3673-3706)
- keyboard handler (lines 3904-3954)
- `renderProps` (line 2151-2528)
- `renderSVG` — `isSelected(id)` calls (no change needed, wrapper handles it)
- `applySearchFilter` (lines 3849-3889)

- [ ] **Step 4: 動作確認**

ブラウザで`stablestate.html`を開き、以下を確認:
- クリック選択、Shift+クリック複数選択
- Ctrl+A全選択
- Delete削除
- プロパティパネル表示

- [ ] **Step 5: コミット**

```bash
git add stablestate.html
git commit -m "refactor: replace selection Set with sel array (StableBlock compat)"
```

---

## Task 2: renderSVGにdata-id/data-type属性とリサイズハンドル追加

SVG要素にDOM操作用属性を追加し、リサイズハンドルをSVG内に描画する。

**Files:**
- Modify: `stablestate.html` — `renderSVG()` function (lines 1061-1780)

- [ ] **Step 1: グループ要素に属性追加**

```javascript
// === 変更前 (line 1089) ===
svg += `<g${dimGrp}>`;

// === 変更後 ===
svg += `<g data-type="group" data-id="${grp.id}" style="cursor:${annotationMode?'default':'grab'}"${dimGrp}>`;
```

- [ ] **Step 2: 複合状態に属性追加**

```javascript
// === 変更前 (line 1110) ===
svg += `<g${dimSt}>`;

// === 変更後 ===
svg += `<g data-type="state" data-id="${st.id}" style="cursor:${annotationMode?'default':'grab'}"${dimSt}>`;
```

- [ ] **Step 3: リーフ状態に属性追加 + drop-shadow**

```javascript
// === 変更前 (line 1162-1163) ===
svg += `<g${dimSt}>`;
svg += `<rect x="${pos.x}" ...  ${shadow}/>`;

// === 変更後 ===
const selShadow = sel ? 'filter="drop-shadow(0 4px 12px rgba(99,102,241,0.5))"' : shadow;
svg += `<g data-type="state" data-id="${st.id}" style="cursor:${annotationMode?'default':'grab'}"${dimSt}>`;
svg += `<rect x="${pos.x}" ... ${selShadow}/>`;
```

複合状態にも同様のdrop-shadow適用。

- [ ] **Step 4: 擬似状態に属性追加**

```javascript
// === 変更前 (line 1196) ===
svg += `<g${dimPs}>`;

// === 変更後 ===
svg += `<g data-type="${ps.type}" data-id="${ps.id}" style="cursor:grab"${dimPs}>`;
```

- [ ] **Step 5: 注釈(note)に属性追加**

注釈レイヤーのnote描画を見つけ、同様にdata属性追加。

```javascript
svg += `<g data-type="note" data-id="${n.id}" style="cursor:${annotationMode?'grab':'default'}"${dimNote}>`;
```

- [ ] **Step 6: テキスト要素にpointer-events:none追加**

全ての`<text>`要素に`style="pointer-events:none"`を追加（StableBlockと同様、テキストがクリック対象にならないようにする）。

- [ ] **Step 7: リサイズハンドルをSVG末尾に描画**

renderSVG()の末尾（`</svg>`の前）にStableBlockと同じリサイズハンドル描画を追加:

```javascript
// Resize handles for selected items
sel.forEach(si => {
  const it = getItem(si);
  if (!it || it.w == null || it.h == null) return; // pseudo-states have no w/h
  const isNote = si.type === 'note';
  if (isNote && !annotationMode) return;
  if (!isNote && annotationMode) return;
  const pos = getAbsolutePos(it, parsed);
  const w = it.w * g, h = it.h * g;
  const hs = 10, hitS = 20;
  const hColor = isNote ? '#F59E0B' : '#6366F1';
  const handles = [
    {cx: pos.x,      cy: pos.y,      cur: 'nw-resize', edge: 'nw'},
    {cx: pos.x + w,  cy: pos.y,      cur: 'ne-resize', edge: 'ne'},
    {cx: pos.x,      cy: pos.y + h,  cur: 'sw-resize', edge: 'sw'},
    {cx: pos.x + w,  cy: pos.y + h,  cur: 'se-resize', edge: 'se'},
    {cx: pos.x + w/2,cy: pos.y,      cur: 'n-resize',  edge: 'n'},
    {cx: pos.x + w/2,cy: pos.y + h,  cur: 's-resize',  edge: 's'},
    {cx: pos.x,      cy: pos.y + h/2,cur: 'w-resize',  edge: 'w'},
    {cx: pos.x + w,  cy: pos.y + h/2,cur: 'e-resize',  edge: 'e'},
  ];
  handles.forEach(hd => {
    svg += `<rect data-resize="${hd.edge}" data-rid="${si.id}" data-rtype="${si.type}" x="${hd.cx - hitS/2}" y="${hd.cy - hitS/2}" width="${hitS}" height="${hitS}" fill="transparent" style="cursor:${hd.cur}"/>`;
    svg += `<rect x="${hd.cx - hs/2}" y="${hd.cy - hs/2}" width="${hs}" height="${hs}" fill="${hColor}" stroke="#fff" stroke-width="1.5" rx="2" style="pointer-events:none"/>`;
  });
});
```

- [ ] **Step 8: SVGにviewBox属性追加（StableBlock方式のズーム）**

```javascript
// === 変更前 ===
let svg = `<svg xmlns="..." width="${canvas.width}" height="${canvas.height}">`;

// === 変更後 ===
let svg = `<svg xmlns="..." width="${canvas.width * zoom}" height="${canvas.height * zoom}" viewBox="0 0 ${canvas.width} ${canvas.height}">`;
```

これにより`applyZoom()`のCSS transformが不要になり、座標変換がStableBlockの`getSvgScale()`方式と一致する。`applyZoom()`を`getSvgScale()`で置き換え。

- [ ] **Step 9: コミット**

```bash
git add stablestate.html
git commit -m "feat: add data-id/data-type attrs, resize handles, selection shadows to SVG"
```

---

## Task 3: setupInteractions()でDOM方式インタラクションに移行

座標ベースの`hitTest`/mousedownハンドラを削除し、StableBlockの`setupInteractions()`パターンに全面移行。

**Files:**
- Modify: `stablestate.html` — 新規`setupInteractions()`関数作成
- Delete: `hitTest()`, `hitTestHandle()`, 旧`setupMouseHandlers()` IIFE (lines 3032-3458)

- [ ] **Step 1: getSvgScale()関数追加**

```javascript
function getSvgScale() {
  const svg = document.querySelector('#svg-wrap svg');
  if (!svg) return { sx: 1, sy: 1 };
  const r = svg.getBoundingClientRect();
  return { sx: parsed.canvas.width / r.width, sy: parsed.canvas.height / r.height };
}
```

- [ ] **Step 2: setupInteractions()関数作成 — リサイズハンドラ**

```javascript
function setupInteractions() {
  const g = parsed.canvas.grid;

  // --- Resize handles ---
  document.querySelectorAll('[data-resize]').forEach(el => {
    el.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      const edge = el.dataset.resize, id = el.dataset.rid, type = el.dataset.rtype;
      const item = getItem({type, id});
      if (!item) return;
      pushHistory();
      const { sx, sy } = getSvgScale();
      const mx0 = e.clientX, my0 = e.clientY;
      const ox = item.x, oy = item.y, ow = item.w, oh = item.h;

      function onMove(ev) {
        const dxg = Math.round((ev.clientX - mx0) * sx / g);
        const dyg = Math.round((ev.clientY - my0) * sy / g);
        let nx = ox, ny = oy, nw = ow, nh = oh;
        if (edge.includes('e')) { nw = Math.max(1, ow + dxg); }
        if (edge.includes('w')) { nw = Math.max(1, ow - dxg); nx = ox + ow - nw; }
        if (edge.includes('s')) { nh = Math.max(1, oh + dyg); }
        if (edge.includes('n')) { nh = Math.max(1, oh - dyg); ny = oy + oh - nh; }
        let dsl = getDsl();
        dsl = updatePos(type, id, Math.max(0, nx), Math.max(0, ny), dsl);
        dsl = updateSize(type, id, nw, nh, dsl);
        setDsl(dsl);
        parsed = parseDSL(getDsl());
        document.getElementById('svg-wrap').innerHTML = renderSVG(parsed);
      }
      function onUp() {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        refresh();
      }
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  });
```

- [ ] **Step 3: setupInteractions() — ドラッグハンドラ**

```javascript
  // --- Drag items ---
  document.querySelectorAll('#svg-wrap g[data-id]').forEach(el => {
    el.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      const type = el.dataset.type, id = el.dataset.id;
      // Annotation mode filter (StableBlock L519-520)
      if (type === 'note' && !annotationMode) return;
      if (type !== 'note' && annotationMode) return;

      // Selection logic (StableBlock L522-528)
      if (e.shiftKey) {
        if (isSel(id)) sel = sel.filter(s => s.id !== id);
        else sel.push({type, id});
      } else {
        if (!isSel(id)) sel = [{type, id}];
      }
      renderProps();
      document.getElementById('svg-wrap').innerHTML = renderSVG(parsed);
      setupInteractions(); // re-attach after re-render

      // Collect drag set (StableBlock L535-544)
      const { sx, sy } = getSvgScale();
      const mx0 = e.clientX, my0 = e.clientY;
      const dragSet = new Map();
      sel.forEach(si => {
        const it = getItem(si); if (!it) return;
        dragSet.set(si.id, {type: si.type, id: si.id, sx: it.x, sy: it.y, w: it.w, h: it.h, parent: it.parent || null});
        // Groups drag children too
        if (si.type === 'group') {
          for (const st of parsed.states) {
            const cx = st.x + (st.w || 0) / 2, cy = st.y + (st.h || 0) / 2;
            const grp = parsed.groupMap[si.id];
            if (grp && cx >= grp.x && cx <= grp.x + grp.w && cy >= grp.y && cy <= grp.y + grp.h) {
              if (!dragSet.has(st.id)) dragSet.set(st.id, {type: 'state', id: st.id, sx: st.x, sy: st.y, w: st.w, h: st.h, parent: st.parent});
            }
          }
        }
        // Composite states drag children too
        if (si.type === 'state') {
          const st = parsed.stateMap[si.id];
          if (st && st.children && st.children.length > 0) {
            for (const child of st.children) {
              if (!dragSet.has(child.id)) dragSet.set(child.id, {type: 'state', id: child.id, sx: child.x, sy: child.y, w: child.w, h: child.h, parent: child.parent});
            }
            // Also drag pseudo-states inside this composite
            for (const ps of parsed.pseudoStates) {
              if (ps.parent === si.id && !dragSet.has(ps.id)) {
                dragSet.set(ps.id, {type: ps.type, id: ps.id, sx: ps.x, sy: ps.y, parent: ps.parent});
              }
            }
          }
        }
      });
      const items = [...dragSet.values()];
      let moved = false, histPushed = false;

      function onMove(ev) {
        if (!histPushed) { pushHistory(); histPushed = true; }
        moved = true;
        const dx = Math.round((ev.clientX - mx0) * sx / g);
        const dy = Math.round((ev.clientY - my0) * sy / g);
        let dsl = getDsl();
        items.forEach(it => {
          const nx = Math.max(0, it.sx + dx);
          const ny = Math.max(0, it.sy + dy);
          dsl = updatePos(it.type, it.id, nx, ny, dsl);
        });
        setDsl(dsl);
        parsed = parseDSL(getDsl());
        snapGuides = computeSnapGuides(items);
        document.getElementById('svg-wrap').innerHTML = renderSVG(parsed);
      }
      function onUp() {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        if (!moved) return;
        snapGuides = [];
        refresh();
      }
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  });
```

- [ ] **Step 4: setupInteractions() — 空白クリックで選択解除**

```javascript
  // --- Click blank to deselect ---
  const svg = document.querySelector('#svg-wrap svg');
  if (svg) svg.addEventListener('mousedown', e => {
    if (e.target.tagName === 'svg' || (e.target.tagName === 'rect' && !e.target.closest('g[data-id]') && !e.target.dataset.resize)) {
      sel = [];
      snapGuides = [];
      renderProps();
      document.getElementById('svg-wrap').innerHTML = renderSVG(parsed);
      setupInteractions();
    }
  });
} // end setupInteractions
```

- [ ] **Step 5: renderSVGの末尾でsetupInteractions()を呼び出し**

ただし、renderSVG()自体はSVG文字列を返す純粋関数にし、呼び出し元でsetupInteractions()を呼ぶ。`refresh()`内でSVG描画後に呼ぶ:

```javascript
function refresh() {
  const text = document.getElementById('editor').value;
  parsed = parseDSL(text);
  validate(parsed);
  updateErrorBar(parsed);
  document.getElementById('svg-wrap').innerHTML = renderSVG(parsed);
  setupInteractions(); // ← 追加
  renderTable(parsed);
  renderProps();
  updateLineNumbers();
  updateStatus();
  updateHighlight();
}

function refreshView() {
  const text = document.getElementById('editor').value;
  parsed = parseDSL(text);
  validate(parsed);
  updateErrorBar(parsed);
  document.getElementById('svg-wrap').innerHTML = renderSVG(parsed);
  setupInteractions(); // ← 追加
  renderTable(parsed);
  updateLineNumbers();
  updateStatus();
  updateHighlight();
}
```

- [ ] **Step 6: 旧コードの削除**

以下の関数/コードブロックを削除:
- `hitTest()` (lines 3032-3073)
- `hitTestHandle()` (lines 3078-3111)
- `collectDragSet()` (lines 3116-3145) — setupInteractions内のドラッグセット収集で代替
- `setupMouseHandlers()` IIFE全体 (lines 3242-3458)
- `svgCoords()` (lines 3024-3027) — getSvgScale()で代替
- `applyZoom()` (lines 343-350) — viewBox方式で代替
- マウスホイールハンドラ (lines 3463-3467) — zoom関数内に統合

- [ ] **Step 7: ズーム関連の統合**

```javascript
function setZoom(delta) {
  zoom = Math.max(0.25, Math.min(3, zoom + delta * 0.25)); // 範囲3.0に変更
  document.getElementById('zoom-label').textContent = Math.round(zoom * 100) + '%';
  document.getElementById('svg-wrap').innerHTML = renderSVG(parsed);
  setupInteractions();
}
```

マウスホイールは`refresh()`後に`svg-wrap`に再アタッチするか、setupInteractions内に配置:

```javascript
// Mouse wheel zoom (inside setupInteractions or once globally)
document.getElementById('svg-wrap').addEventListener('wheel', function(e) {
  e.preventDefault();
  setZoom(e.deltaY > 0 ? -1 : 1);
}, { passive: false });
```

注意: wheelイベントは`setupInteractions()`の外で一度だけアタッチする（毎回アタッチすると重複する）。

- [ ] **Step 8: connectモードの維持**

setupInteractions()のドラッグハンドラに`currentTool === 'connect'`時の処理を追加:

```javascript
// g[data-id] mousedown内、ドラッグ処理の前に:
if (currentTool === 'connect') {
  if (!connectFrom) {
    connectFrom = id;
    sel = [{type, id}];
    renderProps();
    document.getElementById('svg-wrap').innerHTML = renderSVG(parsed);
    setupInteractions();
  } else if (id !== connectFrom) {
    const event = prompt('Event name (optional):');
    pushHistory();
    let dsl = getDsl();
    dsl = addTransition(connectFrom, id, event || null, null, null, null, dsl);
    setDsl(dsl);
    connectFrom = null;
    sel = [];
    setTool('select');
    refresh();
  }
  return; // connectモード時はドラッグしない
}
```

空白クリック（deselect）でもconnectモードをキャンセル:
```javascript
if (currentTool === 'connect') {
  connectFrom = null;
  setTool('select');
}
```

- [ ] **Step 9: 動作確認**

- クリックで正しい要素が選択されること
- Shift+クリックで複数選択
- ドラッグ移動が正常
- リサイズが8方向で動作
- 複合状態の子要素が正しく選択されること
- 擬似状態が選択可能で、近くの状態と干渉しないこと
- 空白クリックで選択解除

- [ ] **Step 10: コミット**

```bash
git add stablestate.html
git commit -m "feat: replace hitTest with DOM-based setupInteractions (StableBlock compat)"
```

---

## Task 4: 操作パラメータの統一

リサイズ最小値、ペーストID、ズーム範囲をStableBlockに合わせる。

**Files:**
- Modify: `stablestate.html` — pasteSelection, addCounter, keyboard handler

- [ ] **Step 1: ペーストIDを`__new_N`方式に統一**

```javascript
// === 変更前 (addCounter, line 3596) ===
let addCounter = { state: 0, group: 0, initial: 0, final: 0, note: 0 };

// === 変更後 ===
let addCounter = 1; // StableBlock互換: 単一カウンタ
```

pasteSelection()を修正:

```javascript
function pasteSelection() {
  if (!clipboard || !clipboard.length) return;
  pushHistory();
  const newSel = [];
  const pastedLines = clipboard.map(line => {
    const newId = `__new_${addCounter++}`;
    const idMatch = line.match(/^(\s*(?:state|group|note|initial|final|choice|history|deephistory|fork|join))\s+(\S+)/);
    if (!idMatch) return line;
    const oldId = idMatch[2];
    let result = line.replace(new RegExp(`^(\\s*(?:state|group|note|initial|final|choice|history|deephistory|fork|join)\\s+)${oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), `$1${newId}`);
    result = result.replace(/\bat\s+([\d.]+)\s*,\s*([\d.]+)/g, (m, x, y) => `at ${parseFloat(x) + 2},${parseFloat(y) + 2}`);
    const type = idMatch[1].trim();
    newSel.push({type: type === 'state' ? 'state' : type, id: newId});
    return result;
  });
  let dsl = getDsl();
  dsl = dsl.trimEnd() + '\n' + pastedLines.join('\n') + '\n';
  setDsl(dsl);
  sel = newSel;
  refresh();
}
```

- [ ] **Step 2: addNewElement内のID生成を__new_N方式に統一**

既存の`addNewElement()`内のID生成も統一:

```javascript
// 変更前: const id = `state_${addCounter.state++}`;
// 変更後: const id = `__new_${addCounter++}`;
```

- [ ] **Step 3: 動作確認**

- コピー＆ペーストで`__new_N`形式のIDが生成されること
- ツールバーからの状態追加で同形式のIDが生成されること

- [ ] **Step 4: コミット**

```bash
git add stablestate.html
git commit -m "fix: unify paste ID and zoom range to match StableBlock"
```

---

## Task 5: 不足キーボードショートカットの追加

Ctrl+Shift+Z (Redo), Ctrl+X (Cut), H (Highlight) を追加。

**Files:**
- Modify: `stablestate.html` — keyboard handler (lines 3904-3954)
- Add: `cutSelection()` function
- Add: `toggleHighlight()` function + `highlight` state variable

- [ ] **Step 1: highlight状態変数とtoggleHighlight追加**

```javascript
let highlight = false;

function getConnectedIds() {
  if (!parsed) return new Set();
  const ids = new Set();
  for (const t of parsed.transitions) {
    const fromEl = resolveStateRef(t.from, parsed);
    const toEl = resolveStateRef(t.to, parsed);
    if (fromEl) ids.add(fromEl.id);
    if (toEl) ids.add(toEl.id);
  }
  return ids;
}

function toggleHighlight() {
  highlight = !highlight;
  const btn = document.getElementById('btn-highlight');
  if (btn) btn.classList.toggle('active', highlight);
  refresh();
}
```

renderSVG内でhighlight時のディミング処理を追加:

```javascript
// renderSVG内、各状態描画時:
const hlIds = highlight ? getConnectedIds() : null;
// ...各状態のopacity計算:
const hlDim = hlIds && !hlIds.has(st.id) ? 0.15 : null;
```

- [ ] **Step 2: cutSelection()追加**

```javascript
function cutSelection() {
  if (!sel.length) return;
  copySelection();
  pushHistory();
  let dsl = getDsl();
  sel.forEach(si => {
    dsl = removeDSLElement(si.id, dsl);
  });
  sel = [];
  setDsl(dsl);
  refresh();
}
```

- [ ] **Step 3: キーボードハンドラの拡張**

```javascript
document.addEventListener('keydown', function(e) {
  const ta = document.getElementById('editor');
  const ae = document.activeElement;

  // Ctrl+Z: Undo (always works, StableBlock L869)
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
  // Ctrl+Y or Ctrl+Shift+Z: Redo (StableBlock L871)
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }

  // Don't intercept while editing DSL
  if (ae === ta) return;
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'SELECT' || ae.tagName === 'TEXTAREA')) {
    if (!e.ctrlKey && !e.metaKey) return;
  }

  // Ctrl+C: Copy (StableBlock L875)
  if ((e.ctrlKey || e.metaKey) && e.key === 'c') { e.preventDefault(); copySelection(); return; }
  // Ctrl+X: Cut (StableBlock L877) ← 新規
  if ((e.ctrlKey || e.metaKey) && e.key === 'x') { e.preventDefault(); cutSelection(); return; }
  // Ctrl+V: Paste (StableBlock L879)
  if ((e.ctrlKey || e.metaKey) && e.key === 'v') { e.preventDefault(); pasteSelection(); return; }
  // Delete / Backspace (StableBlock L881)
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); return; }
  // Ctrl+A: Select all (StableBlock L883)
  if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
    e.preventDefault();
    if (!parsed) return;
    if (annotationMode) {
      sel = parsed.notes.map(n => ({type: 'note', id: n.id}));
    } else {
      sel = [
        ...parsed.states.map(s => ({type: 'state', id: s.id})),
        ...parsed.pseudoStates.map(p => ({type: p.type, id: p.id})),
        ...parsed.groups.map(g => ({type: 'group', id: g.id}))
      ];
    }
    refresh();
    return;
  }
  // Arrow keys (StableBlock L885)
  if (sel.length && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
    e.preventDefault();
    const ax = (e.key === 'ArrowLeft' || e.key === 'ArrowRight') ? 'x' : 'y';
    const d = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : -1;
    if (sel.length > 1) batchNudge(ax, d); else nudge(ax, d);
    return;
  }
  // H: Toggle highlight (StableBlock L887) ← 新規
  if (e.key === 'h' || e.key === 'H') { e.preventDefault(); toggleHighlight(); return; }
  // N: Toggle annotations (StableBlock L888)
  if (e.key === 'n' || e.key === 'N') { e.preventDefault(); toggleAnnotations(); return; }
});
```

- [ ] **Step 4: ツールバーにHighlightボタン追加**

HTML toolbar内に追加:
```html
<button id="btn-highlight" class="tb" onclick="toggleHighlight()" title="Highlight connected (H)">◎ HL</button>
```

- [ ] **Step 5: 動作確認**

- Ctrl+Shift+Zでredoが動作
- Ctrl+Xで切り取り（コピー後に削除）
- Hキーでハイライトモードトグル（非接続状態がディミング）

- [ ] **Step 6: コミット**

```bash
git add stablestate.html
git commit -m "feat: add Cut, Highlight mode, Ctrl+Shift+Z redo (StableBlock compat)"
```

---

## Task 6: プロパティパネル — バッチ操作と遷移管理UI

複数選択時のバッチ操作UI、2要素選択時の遷移管理UIをStableBlockから移植。

**Files:**
- Modify: `stablestate.html` — `renderProps()` (lines 2151-2528)
- Add: batch action functions, transition management functions

- [ ] **Step 1: バッチ操作関数の追加**

```javascript
// ═══════════════════════════════════════════════
// Actions: batch (multi-select) — StableBlock互換
// ═══════════════════════════════════════════════
function batchNudge(axis, delta) {
  pushHistory();
  let dsl = getDsl();
  sel.forEach(si => {
    const it = getItem(si); if (!it) return;
    const step = parsed.pseudoMap && parsed.pseudoMap[si.id] ? 0.5 : 1;
    const d = delta * step;
    const nx = Math.max(0, it.x + (axis === 'x' ? d : 0));
    const ny = Math.max(0, it.y + (axis === 'y' ? d : 0));
    dsl = updatePos(si.type, si.id, nx, ny, dsl);
  });
  setDsl(dsl);
  refresh();
}

function batchNudgeSz(axis, delta) {
  pushHistory();
  let dsl = getDsl();
  sel.forEach(si => {
    const it = getItem(si); if (!it || it.w == null) return;
    const nw = axis === 'w' ? Math.max(1, it.w + delta) : it.w;
    const nh = axis === 'h' ? Math.max(1, it.h + delta) : it.h;
    dsl = updateSize(si.type, si.id, nw, nh, dsl);
  });
  setDsl(dsl);
  refresh();
}

function batchProp(prop, val) {
  pushHistory();
  let dsl = getDsl();
  sel.forEach(si => {
    dsl = updateProp(si.type, si.id, prop, val, dsl);
  });
  setDsl(dsl);
  refresh();
}

function batchDelete() {
  pushHistory();
  let dsl = getDsl();
  sel.forEach(si => { dsl = removeDSLElement(si.id, dsl); });
  sel = [];
  setDsl(dsl);
  refresh();
}
```

- [ ] **Step 2: 遷移管理関数の追加**

```javascript
// ═══════════════════════════════════════════════
// Transition management (two-select) — StableBlock互換
// ═══════════════════════════════════════════════
function findTransBetween(a, b) {
  if (!parsed) return [];
  return parsed.transitions.filter(t =>
    (t.from === a && t.to === b) || (t.from === b && t.to === a) ||
    // Handle dot-path refs like parent.child
    (t.from.endsWith('.' + a) && t.to === b) || (t.from === a && t.to.endsWith('.' + b)) ||
    (t.from.endsWith('.' + b) && t.to === a) || (t.from === b && t.to.endsWith('.' + a))
  );
}

function connectTwo(a, b) {
  pushHistory();
  let dsl = getDsl();
  dsl = addTransition(a, b, null, null, null, null, dsl);
  setDsl(dsl);
  refresh();
}

function removeTrans(a, b) {
  pushHistory();
  let dsl = getDsl();
  const lines = dsl.split('\n');
  dsl = lines.filter(l => {
    const m = l.trim().match(/^(\S+)\s*->\s*(\S+)/);
    if (!m) return true;
    return !((m[1] === a && m[2] === b) || (m[1] === b && m[2] === a));
  }).join('\n');
  setDsl(dsl);
  refresh();
}

function flipTrans(a, b) {
  pushHistory();
  let dsl = getDsl();
  const lines = dsl.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].trim().match(/^(\S+)(\s*->\s*)(\S+)(.*)/);
    if (!m) continue;
    if ((m[1] === a && m[3] === b) || (m[1] === b && m[3] === a)) {
      lines[i] = lines[i].replace(/^(\s*)(\S+)(\s*->\s*)(\S+)/, `$1${m[3]}$3${m[1]}`);
      break;
    }
  }
  setDsl(lines.join('\n'));
  refresh();
}

function setTransProp(a, b, prop, val) {
  pushHistory();
  let dsl = getDsl();
  const lines = dsl.split('\n');
  const re = new RegExp(prop + '=\\S+');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].trim().match(/^(\S+)\s*->\s*(\S+)/);
    if (!m) continue;
    if ((m[1] === a && m[2] === b) || (m[1] === b && m[2] === a)) {
      lines[i] = re.test(lines[i])
        ? lines[i].replace(re, `${prop}=${val}`)
        : lines[i].trimEnd() + ` ${prop}=${val}`;
      break;
    }
  }
  setDsl(lines.join('\n'));
  refresh();
}
```

- [ ] **Step 3: renderProps()の複数選択セクションを書き換え**

```javascript
} else if (selArr.length >= 2) {
  const COLORS = ['#6366F1','#818CF8','#4338CA','#22C55E','#F59E0B','#EF4444','#EC4899','#8B5CF6','#64748B','#DC2626','#1E293B','#0F172A'];
  const hasStates = sel.some(s => parsed.stateMap[s.id]);
  const colorDots = COLORS.map(c => `<div class="color-dot" style="background:${c}" onclick="batchProp('color','${c}')"></div>`).join('');

  html += `<div style="font-size:12px;font-weight:700;color:#A5B4FC;margin-bottom:10px">${selArr.length}個のアイテムを選択中</div>`;

  // Batch position
  html += `<div class="prop-section"><div class="prop-label">一括 位置調整</div>`;
  html += `<div class="prop-row">`;
  html += `<div style="flex:1"><div class="prop-sub">X</div><div style="display:flex;gap:2px"><button class="tb" onclick="batchNudge('x',-1)">◀</button><button class="tb" onclick="batchNudge('x',1)">▶</button></div></div>`;
  html += `<div style="flex:1"><div class="prop-sub">Y</div><div style="display:flex;gap:2px"><button class="tb" onclick="batchNudge('y',-1)">▲</button><button class="tb" onclick="batchNudge('y',1)">▼</button></div></div>`;
  html += `</div></div>`;

  // Batch size
  html += `<div class="prop-section"><div class="prop-label">一括 サイズ調整</div>`;
  html += `<div class="prop-row">`;
  html += `<div style="flex:1"><div class="prop-sub">W</div><div style="display:flex;gap:2px"><button class="tb" onclick="batchNudgeSz('w',-1)">−</button><button class="tb" onclick="batchNudgeSz('w',1)">+</button></div></div>`;
  html += `<div style="flex:1"><div class="prop-sub">H</div><div style="display:flex;gap:2px"><button class="tb" onclick="batchNudgeSz('h',-1)">−</button><button class="tb" onclick="batchNudgeSz('h',1)">+</button></div></div>`;
  html += `</div></div>`;

  // Batch color
  html += `<div class="prop-section"><div class="prop-label">一括 色変更</div><div class="color-grid">${colorDots}</div></div>`;

  // Batch style (states only)
  if (hasStates) {
    html += `<div class="prop-section"><div class="prop-label">一括 スタイル</div><div style="display:flex;gap:4px">`;
    html += ['solid','dashed','bold'].map(st => `<button class="tb" onclick="batchProp('style','${st}')">${st}</button>`).join('');
    html += `</div></div>`;
  }

  // Transition management (2-select)
  if (selArr.length === 2) {
    const a = sel[0].id, b = sel[1].id;
    const trans = findTransBetween(a, b);
    const transColors = ['#89DDFF','#64748B','#6366F1','#8B5CF6','#EC4899','#EF4444','#F59E0B','#22C55E','#3B82F6','#06B6D4'];
    html += `<div class="prop-section"><div class="prop-label">遷移</div>`;
    if (trans.length === 0) {
      html += `<div style="display:flex;gap:4px">`;
      html += `<button class="tb tb-accent" onclick="connectTwo('${a}','${b}')" style="flex:1">${esc(a)} → ${esc(b)}</button>`;
      html += `<button class="tb tb-accent" onclick="connectTwo('${b}','${a}')" style="flex:1">${esc(b)} → ${esc(a)}</button>`;
      html += `</div>`;
    } else {
      const t = trans[0];
      html += `<div style="padding:6px 8px;background:var(--surface,#1e1e3e);border-radius:6px;margin-bottom:8px;font-size:12px;color:var(--fg,#e0e0e0);text-align:center">${esc(t.from)} → ${esc(t.to)}</div>`;
      html += `<div style="display:flex;gap:4px;flex-wrap:wrap">`;
      html += `<button class="tb" onclick="flipTrans('${t.from}','${t.to}')" style="flex:1" title="方向を反転">⇄ 反転</button>`;
      html += `</div>`;
      html += `<div class="prop-sub" style="margin-top:6px">線の色</div><div class="color-grid">${transColors.map(c => `<div class="color-dot" style="background:${c}" onclick="setTransProp('${t.from}','${t.to}','color','${c}')"></div>`).join('')}</div>`;
      html += `<div class="prop-sub" style="margin-top:6px">線の太さ</div><div style="display:flex;gap:4px">${[1,1.5,2,3,4].map(w => `<button class="tb" onclick="setTransProp('${t.from}','${t.to}','width','${w}')">${w}</button>`).join('')}</div>`;
      html += `<div class="prop-sub" style="margin-top:6px">線のスタイル</div><div style="display:flex;gap:4px">${['solid','dashed'].map(st => `<button class="tb" onclick="setTransProp('${t.from}','${t.to}','style','${st}')">${st}</button>`).join('')}</div>`;
      html += `<div style="margin-top:4px"><button class="tb" onclick="removeTrans('${t.from}','${t.to}')" style="width:100%;border-color:#EF4444;color:#FCA5A5">遷移を削除</button></div>`;
    }
    html += `</div>`;
  }

  // Group selected
  if (sel.length >= 2) {
    html += `<button class="tb" onclick="groupSelected()" style="margin-top:8px;width:100%;border-color:#818CF8;color:#C4B5FD">選択をグループ化</button>`;
  }

  // Batch delete
  html += `<div style="margin-top:16px"><button class="tb" onclick="batchDelete()" style="width:100%;border-color:#EF4444;color:#FCA5A5">選択を全削除</button></div>`;
}
```

- [ ] **Step 4: 単一選択プロパティにStableBlock型ステッパーUI追加**

現在のプロパティパネルの位置/サイズinputにStableBlockと同じ▲▼ステッパーボタンを追加。`nudge()`と`nudgeSz()`関数を追加:

```javascript
function nudge(axis, delta) {
  if (!sel.length) return;
  pushHistory();
  const si = sel[0];
  const it = getItem(si); if (!it) return;
  const step = parsed.pseudoMap && parsed.pseudoMap[si.id] ? 0.5 : 1;
  const d = delta * step;
  let dsl = getDsl();
  dsl = updatePos(si.type, si.id, Math.max(0, it.x + (axis === 'x' ? d : 0)), Math.max(0, it.y + (axis === 'y' ? d : 0)), dsl);
  setDsl(dsl);
  refresh();
}

function nudgeSz(axis, delta) {
  if (!sel.length) return;
  pushHistory();
  const si = sel[0];
  const it = getItem(si); if (!it || it.w == null) return;
  let dsl = getDsl();
  dsl = updateSize(si.type, si.id, axis === 'w' ? Math.max(1, it.w + delta) : it.w, axis === 'h' ? Math.max(1, it.h + delta) : it.h, dsl);
  setDsl(dsl);
  refresh();
}
```

- [ ] **Step 5: 未選択時にショートカットヘルプ表示**

```javascript
if (selArr.length === 0) {
  if (annotationMode) {
    // ... existing annotation mode help
  } else {
    html += `<div class="prop-section">
      <button class="tb tb-accent" style="margin-bottom:6px;width:100%" onclick="addNewElement('state')">+ 状態追加</button>
      <button class="tb" style="border-color:#818CF8;color:#C4B5FD;width:100%" onclick="addNewElement('group')">+ グループ追加</button>
    </div>
    <div style="font-size:10px;color:#666;margin-top:16px;line-height:1.5">
      クリック選択 / Shift+クリック複数選択<br>ドラッグ移動 / ハンドルでリサイズ<br>
      <span style="color:#888">Ctrl+Z</span> 戻る <span style="color:#888">Ctrl+Y</span> やり直し<br>
      <span style="color:#888">Ctrl+C</span> コピー <span style="color:#888">Ctrl+X</span> 切取<br>
      <span style="color:#888">Ctrl+V</span> 貼付 <span style="color:#888">Ctrl+A</span> 全選択<br>
      <span style="color:#888">Delete</span> 削除<br>
      <span style="color:#888">H</span> ハイライト <span style="color:#888">N</span> 注釈
    </div>`;
  }
}
```

- [ ] **Step 6: 単一選択に削除ボタン追加**

各要素タイプ（state/pseudo/group/note）の末尾に:

```javascript
html += `<div style="margin-top:16px"><button class="tb" onclick="deleteSelected()" style="width:100%;border-color:#EF4444;color:#FCA5A5">削除</button></div>`;
```

- [ ] **Step 7: 動作確認**

- 複数選択時にバッチ位置/サイズ/色/スタイル変更が動作
- 2要素選択時に遷移管理UI表示（作成/反転/色/幅/スタイル/削除）
- 単一選択時にステッパーボタンで位置/サイズ変更
- 未選択時にショートカットヘルプ表示
- 削除ボタンが動作

- [ ] **Step 8: コミット**

```bash
git add stablestate.html
git commit -m "feat: add batch operations, transition management UI, stepper controls (StableBlock compat)"
```

---

## Task 7: 統合テストと最終調整

全タスク完了後の統合テスト。

**Files:**
- Modify: `stablestate.html` (微調整のみ)

- [ ] **Step 1: 基本操作テスト**

ブラウザで以下を手動確認:
1. 状態をクリック → 選択ハイライト（白stroke + drop-shadow）
2. 別の状態をクリック → 前の選択解除、新しい選択
3. Shift+クリック → 複数選択
4. 複合状態の子をクリック → 子が選択される（親ではない）
5. 擬似状態クリック → 正しく選択
6. 空白クリック → 選択解除

- [ ] **Step 2: ドラッグ/リサイズテスト**

1. 状態をドラッグ → グリッドスナップで移動
2. 複合状態をドラッグ → 子も一緒に移動
3. リサイズハンドル8方向 → 最小サイズ1グリッド
4. 擬似状態ドラッグ → 0.5グリッドスナップ

- [ ] **Step 3: キーボードショートカットテスト**

1. Ctrl+Z → undo / Ctrl+Y → redo / Ctrl+Shift+Z → redo
2. Ctrl+C → copy / Ctrl+X → cut / Ctrl+V → paste（+2,+2オフセット、__new_N ID）
3. Delete/Backspace → 削除
4. 矢印キー → 移動
5. Ctrl+A → 全選択
6. H → ハイライトモード
7. N → 注釈モード

- [ ] **Step 4: プロパティパネルテスト**

1. 未選択 → ショートカットヘルプ + 追加ボタン
2. 単一選択 → プロパティ編集 + ステッパー + 削除ボタン
3. 複数選択 → バッチ操作UI
4. 2要素選択 → 遷移管理UI（作成/反転/色/幅/スタイル/削除）

- [ ] **Step 5: エッジケース確認**

1. connectモードでの2クリック接続
2. 注釈モードでnoteのみ操作可能
3. ズーム変更後のドラッグ/リサイズ精度
4. DSLエディタ編集中のキーボードショートカット非干渉

- [ ] **Step 6: 問題があれば修正してコミット**

```bash
git add stablestate.html
git commit -m "fix: integration test fixes for interaction alignment"
```

---

## 完了条件

- [ ] 選択バグ解消: 全ての要素（状態/擬似状態/グループ/注釈）がクリックで正しく選択される
- [ ] ドラッグが全要素で正常動作
- [ ] リサイズが8方向で動作、最小サイズ1グリッド
- [ ] コピー/カット/ペーストが`__new_N` ID方式
- [ ] Ctrl+Shift+Z, Ctrl+X, Hキーが動作
- [ ] 選択時にdrop-shadowが表示
- [ ] 複数選択バッチ操作が動作
- [ ] 2要素選択で遷移管理UIが動作
- [ ] StableBlockと同じキーボードショートカット体系
