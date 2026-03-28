# ECN-021 分析: スナップガイドの視覚のみ化

- **判定**: 実装済
- **リスク**: なし

## StableBlockでの改善

スナップガイドから位置強制を除去し、ガイドラインの視覚表示のみに変更。

## StableStateの現状

設計段階から視覚のみの実装になっている。

```javascript
// stablestate.html:2839-2848 — 位置更新はグリッド丸めのみ、スナップ補正なし
const newX = Math.max(0, item.origX + dxGrid);
const newY = Math.max(0, item.origY + dyGrid);
```

スナップガイドは `computeSnapGuides()`（line 2620-2676）で計算され、`renderSVG()`（line 1624-1632）で橙色破線として描画されるが、ドラッグ位置への影響はない。

## 結論

対処不要。
