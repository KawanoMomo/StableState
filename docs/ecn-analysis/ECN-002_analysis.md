# ECN-002 分析: 空ラベル設定時の要素消失

- **判定**: 該当なし
- **リスク**: なし

## StableBlockでの問題

パーサーの正規表現が `[^"]+`（1文字以上）で空ラベルをマッチできずブロックが消失。

## StableStateの現状

全パーサー正規表現が `[^"]*`（0文字以上）を使用しており、空ラベルに対応済。

| 対象 | ファイル | 行 | パターン |
|------|---------|-----|---------|
| state | stablestate.html | 429 | `"([^"]*)"` |
| group | stablestate.html | 479 | `"([^"]*)"` |
| note | stablestate.html | 505 | `"([^"]*)"` |
| updateLabel | stablestate.html | 796 | `"[^"]*"` |
| state (VSCode) | webview.html | 354 | `"([^"]*)"` |
| group (VSCode) | webview.html | 384 | `"([^"]*)"` |

## 結論

StableBlockの教訓が設計時に反映されている。対処不要。
