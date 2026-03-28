# ADR-004 分析: 接続線ポート重複

- **判定**: 該当なし
- **リスク**: なし

## StableBlockでの問題

全接続線がブロック辺の中央1点に集中し、複数接続時にパスが重なる。

## StableStateの現状

ポート分散機能が実装済。

### ポート分散関数

```javascript
// stablestate.html:1194-1205
function getPortPoint(box, side, portIndex, portCount) {
  const pad = 0.2;
  const t = portCount <= 1 ? 0.5 : pad + (1 - 2 * pad) * portIndex / (portCount - 1);
  ...
}
```

### 統合エッジグループ

`stablestate.html:1366-1433` で、同一辺の入出力遷移をグループ化し、ポートスペースを共有する設計になっている。

## 結論

StableBlockの教訓が反映されている。対処不要。
