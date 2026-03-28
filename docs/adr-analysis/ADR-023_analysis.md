# ADR-023 分析: 少数接続時のポート間隔調整

- **判定**: 未実装 — 反映推奨
- **リスク**: LOW
- **対象ファイル**: `stablestate.html`

## StableBlockでの改善

ポート分散のパディングを接続数に応じて動的調整。2本→pad=0.4、3-4本→0.25、5+本→0.15。

## StableStateの現状

固定パディング `0.2` を使用。

```javascript
// stablestate.html:1200
function getPortPoint(box, side, portIndex, portCount) {
    const pad = 0.2;  // 固定値
    const t = portCount <= 1 ? 0.5 : pad + (1 - 2 * pad) * portIndex / (portCount - 1);
}
```

接続数が2本の場合でもポートが辺の20%/80%位置に配置され、隣接ステート間でも折れ線の迂回が目立つ。

## 推奨対策

```javascript
const pad = portCount <= 2 ? 0.4 : portCount <= 4 ? 0.25 : 0.15;
```

1行の変更で適用可能。状態遷移図は一般的にステートあたりの遷移数が少ないため、効果が大きい。
