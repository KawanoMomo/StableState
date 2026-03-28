# ECN-014 分析: バージョンバッジ正規表現

- **判定**: 対象外
- **リスク**: LOW

## StableBlockでの問題

`bump-version.sh` の正規表現がHTML構造と不一致でバージョンバッジが更新されなかった。

## StableStateの現状

バージョン管理スクリプト（`bump-version.sh` 等）が存在しない。バージョン更新は手動。

### バージョン管理箇所

| ファイル | 行 | 現在値 |
|---------|-----|-------|
| `VERSION` | 1 | `0.1.0` |
| `stablestate.html` | 135 | `<span class="badge">v0.1</span>` |
| `vscode-stablestate/package.json` | — | `"version": "0.1.0"` |

### 潜在リスク

手動管理のためバージョン不整合が発生しやすい。将来バージョンアップ時に `bump-version.sh` を作成する場合は、HTMLの `<span class="badge">vX.Y</span>` パターンに合わせた正規表現を使用すること。

## 結論

自動化スクリプトが存在しないため問題パターンに直接該当しない。バージョン一括管理の仕組みは未整備。
