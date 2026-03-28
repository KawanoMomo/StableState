# ECN-006 分析: 接続面選択アルゴリズム

- **判定**: 該当あり
- **リスク**: MEDIUM
- **対象ファイル**: `stablestate.html`

## StableBlockでの問題

中心点間の角度で接続面を決定するアルゴリズムが、対角配置やサイズ差のあるブロックで誤った面を選択。エッジギャップアルゴリズムに変更して対処。

## StableStateの現状

**同一の角度ベースアルゴリズムを使用している。**

```javascript
// stablestate.html:1180-1192
function computePortSide(srcBox, tgtBox) {
  const dx = (tgtBox.x + tgtBox.w / 2) - (srcBox.x + srcBox.w / 2);
  const dy = (tgtBox.y + tgtBox.h / 2) - (srcBox.y + srcBox.h / 2);
  let srcSide, tgtSide;
  if (Math.abs(dx) > Math.abs(dy)) {
    srcSide = dx > 0 ? 'right' : 'left';
    tgtSide = dx > 0 ? 'left' : 'right';
  } else {
    srcSide = dy > 0 ? 'bottom' : 'top';
    tgtSide = dy > 0 ? 'top' : 'bottom';
  }
  return { srcSide, tgtSide };
}
```

### 問題が発生するケース

- **対角配置**: dx ≈ dy の場合に微小な位置変更でsideが反転
- **サイズ差**: 大きいステートと小さいステートの間で、辺が重なっていても中心点角度で反対側の辺が選ばれる

### 使用箇所

- 通常遷移のポート計算（line 1420）
- 逆方向遷移のポート計算（line 1411）
- ノート接続のポート計算（line 1584）

## 推奨対策

StableBlockと同じエッジギャップアルゴリズムに変更:

```javascript
function computePortSide(srcBox, tgtBox) {
  const gapR = tgtBox.x - (srcBox.x + srcBox.w);
  const gapL = srcBox.x - (tgtBox.x + tgtBox.w);
  const gapB = tgtBox.y - (srcBox.y + srcBox.h);
  const gapT = srcBox.y - (tgtBox.y + tgtBox.h);

  const hBest = Math.max(gapR, gapL);
  const vBest = Math.max(gapB, gapT);

  if (vBest >= hBest) {
    return gapB >= gapT
      ? { srcSide: 'bottom', tgtSide: 'top' }
      : { srcSide: 'top', tgtSide: 'bottom' };
  } else {
    return gapR >= gapL
      ? { srcSide: 'right', tgtSide: 'left' }
      : { srcSide: 'left', tgtSide: 'right' };
  }
}
```
