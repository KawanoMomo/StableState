# ADR-015 分析: ドラッグ/リサイズ性能最適化

- **判定**: 未実装 — 反映推奨
- **リスク**: MEDIUM
- **対象ファイル**: `stablestate.html`, `vscode-stablestate/src/webview.html`

## StableBlockでの改善

mousemoveごとの同期レンダリングを `requestAnimationFrame` でフレーム単位にバッチ化。ポート計算の `findIndex()` O(n) をインデックスマップ O(1) に置換。

## StableStateの現状

### RAF未使用

`stablestate.html:2814` のmousemoveハンドラは毎イベントで同期レンダリングを実行。RAF未使用。

### findIndex残存

```javascript
// stablestate.html:1457-1458
const srcIdx = srcEdge.findIndex(e => e.ti === ti);
const tgtIdx = tgtEdge.findIndex(e => e.ti === ti);
```

エッジグループのソート後にインデックスマップが未構築。遷移数が多い状態でO(n)探索が繰り返される。

## 推奨対策

1. ドラッグ/リサイズのmousemoveハンドラにRAFバッチングを導入
2. `syncEditor`相当の処理をmouseupに遅延
3. エッジグループのindexMapを事前構築
