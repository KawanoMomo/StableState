# ISSUE-029: 状態遷移表のスティッキーヘッダー/レイアウトが不安定

- **ステータス**: Open
- **種別**: 改善
- **優先度**: HIGH
- **発見日**: 2026-03-28
- **影響ファイル**:
  - `stablestate.html`（renderTable関数周辺）

## コンテキスト

状態遷移表のスティッキーヘッダー実装において、12件以上の連続fixコミットとRevertが発生している。rowspan/colspan・border-collapse・z-index・背景色・スクロール挙動など、CSSレイアウトの複合的な問題が繰り返し修正されており、根本的なアプローチに課題がある可能性が高い。

## 問題の詳細

関連コミット（時系列順）:
- `7f0e8d5` fix: sticky header and left column in transition table
- `1665926` fix: opaque backgrounds on sticky table cells
- `632ad21` fix: table border-collapse restore + box-shadow for sticky edges
- `6754c5f` fix: transition table header hierarchy with rowspan for shallow leaves
- `40891ed` fix: table header — 2-row layout eliminates rowspan gaps
- `9dc7792` Revert 上記
- `0e707a0` fix: table border-separate + inset box-shadow + dynamic sticky top
- `0471e77` fix: eliminate rowspan in sticky header — use flat cell grid
- `c796c4c` fix: rowspan header cells hidden on scroll — raise z-index
- `313e749` fix: freeze-pane table — header and body as separate tables
- `271c788` fix: table styling — right-aligned headers, eye-friendly palette
- `12a2c26` fix: header left-aligned + body horizontal scroll enabled

主な問題パターン:
1. `position: sticky` と `rowspan`/`colspan` の組み合わせがブラウザ間で挙動不安定
2. `border-collapse: collapse` と `position: sticky` の非互換
3. 階層ヘッダー（親状態→子状態）の表現とスティッキー動作の両立が困難

## 対策
（未記入 — 着手時に記載）

## 結果
（未記入 — 完了時に記載）
