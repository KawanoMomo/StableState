# ECN-003 分析: ラベル入力時のフォーカス喪失

- **判定**: 該当あり
- **リスク**: HIGH
- **対象ファイル**: `stablestate.html`, `vscode-stablestate/src/webview.html`

## StableBlockでの問題

`setLabel()` が `refresh()` を呼び出し、プロパティパネル全体のHTMLが再構築されてinput要素が破棄されフォーカスが喪失。

## StableStateの現状

**同一の問題が存在する。**

### stablestate.html

```javascript
// stablestate.html:2132-2140
propChange('pp-label', function() {
  const info = getElTypeAndId();
  if (!info) return;
  pushHistory();
  let dsl = getDsl();
  dsl = updateLabel(info.type, info.id, this.value, dsl);
  setDsl(dsl);
  refresh();  // ← 問題: パネル全体を再構築
});
```

`refresh()` の呼び出しチェーン:

```
refresh() (line 2420)
  → parseDSL()
  → validate()
  → updateErrorBar()
  → renderSVG()
  → renderTable()
  → renderProps()  ← ここでパネル全体をinnerHTMLで書き換え
  → updateLineNumbers()
  → updateStatus()
```

`renderProps()` 内（line 2112）:

```javascript
panel.innerHTML = html;  // input要素が破棄される
```

### webview.html

同一構造（line 1300、1369-1378）。

## 影響

- ラベル入力中にchangeイベント発火 → input要素が破棄 → フォーカス喪失
- 他のプロパティ入力（位置、サイズ、色）でも同様の問題が発生する可能性

## 推奨対策

`propChange('pp-label', ...)` のコールバックで `refresh()` の代わりに `renderProps()` を除いた処理を呼ぶ:

```javascript
propChange('pp-label', function() {
  const info = getElTypeAndId();
  if (!info) return;
  pushHistory();
  let dsl = getDsl();
  dsl = updateLabel(info.type, info.id, this.value, dsl);
  setDsl(dsl);
  // refresh() の代わりに renderProps() を除外した処理
  parsed = parseDSL(getDsl());
  validate(parsed);
  updateErrorBar(parsed);
  document.getElementById('svg-wrap').innerHTML = renderSVG(parsed);
  renderTable(parsed);
  updateStatus();
});
```
