# ECN-008 分析: 注釈レイアウトシフト

- **判定**: 該当なし
- **リスク**: なし

## StableBlockでの問題

Editボタンの `display:none` 切替でレイアウトシフトが発生。opacity切替に変更して対処。

## StableStateの現状

- `stablestate.html`: 注釈編集モードのディミングに `opacity` を使用（line 988, 1140）。`display:none` はタブ切替（Diagram/Table）にのみ使用
- `webview.html`: 注釈編集モード自体が未実装（単純なon/offトグルのみ）

注釈関連のUI要素にレイアウトシフトを引き起こす `display:none` 切替は使用されていない。

## 結論

対処不要。
