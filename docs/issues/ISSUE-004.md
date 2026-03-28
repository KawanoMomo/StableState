# ISSUE-004: ドラッグ/リサイズ操作にRequestAnimationFrame最適化が未適用

- **ステータス**: Open
- **種別**: 改善
- **優先度**: MEDIUM
- **発見日**: 2026-03-28
- **影響ファイル**:
  - `stablestate.html`

## コンテキスト

ドラッグ・リサイズ操作中の `mousemove` ハンドラが毎イベントで同期レンダリングを実行しており、高頻度のマウス移動イベント（フレームレート以上）でも都度レンダリングが走る。また遷移のエッジグループ内でインデックス探索に `findIndex()`（O(n)）を使用しており、遷移数が多い図での性能劣化が懸念される。

## 問題の詳細

1. **RAF未使用** (`stablestate.html:2814` 付近の `mousemove` ハンドラ):
   毎 `mousemove` イベントで `refresh()` 相当の同期レンダリングを実行。RAFバッチングにより複数のイベントを1フレーム分にまとめることができる。

2. **findIndex O(n) 探索** (`stablestate.html:1457-1458`):
   ```javascript
   const srcIdx = srcEdge.findIndex(e => e.ti === ti);
   const tgtIdx = tgtEdge.findIndex(e => e.ti === ti);
   ```
   エッジグループのソート後にインデックスマップが未構築。遷移数が多いステートでレンダリング毎にO(n)探索が繰り返される。

## 対策

1. `mousemove` ハンドラにRAFバッチング導入（前フレームのRAFが未完了の場合はスキップ）
2. DSLテキスト同期（`syncEditor`相当）を `mouseup` まで遅延
3. エッジグループのソート後にインデックスマップを事前構築してO(1)でアクセス

## 結果

（未記入 — 完了時に記載）
