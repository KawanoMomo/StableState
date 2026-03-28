# ADR-010 分析: 注釈ボタン初期状態

- **判定**: 要検討
- **リスク**: LOW
- **対象ファイル**: `stablestate.html`, `vscode-stablestate/src/webview.html`

## StableBlockでの問題

`showAnnotations` のデフォルト値が `true` で、注釈データが空なのにボタンがハイライト状態で表示される不整合。

## StableStateの現状

### デフォルト値

```javascript
// stablestate.html:261
let showAnnotations = true;

// webview.html:176
var showAnnotations = true;
```

両ファイルとも `true` がデフォルト。注釈データが空の初期状態でボタンがアクティブ表示される。

### ディミングopacity

```javascript
// stablestate.html:988, 1140
if (annotationEditMode) svg += `<g opacity="0.35">`;
```

ディミングは `0.35` で適切（StableBlock修正後の値と同一）。

## 影響

- 初期ロード時に注釈ボタンがアクティブ状態で表示される
- 注釈が存在しない場合でもアクティブ表示のため、ユーザーに誤解を与える可能性
- 実害は軽微

## 推奨対策

```javascript
let showAnnotations = false;
```

に変更し、ボタンの初期CSSクラスからもactive指定を除去。
