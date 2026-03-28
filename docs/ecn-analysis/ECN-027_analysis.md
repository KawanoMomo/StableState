# ECN-027 分析: バージョン一元管理

- **判定**: 部分実装 — 反映推奨
- **リスク**: LOW
- **対象ファイル**: `VERSION`, `stablestate.html`, `vscode-stablestate/package.json`

## StableBlockでの改善

VERSIONファイルをSingle Source of Truthとし、bump-version.shで全ファイルのバージョン参照を一括更新。

## StableStateの現状

### 実装済

- `VERSION` ファイル: `0.1.0`

### 未実装

- `bump-version.sh` スクリプト
- バージョン参照の自動更新

### バージョン参照箇所

| ファイル | 現在値 | 備考 |
|---------|--------|------|
| `VERSION` | `0.1.0` | 正 |
| `stablestate.html:135` | `v0.1` | パッチバージョン欠落 |
| `vscode-stablestate/package.json` | `0.1.0` | 正 |

HTMLバッジが `v0.1` と短縮表示されており、VERSIONファイルの `0.1.0` と不一致。

## 推奨対策

1. `bump-version.sh` を作成（StableBlockのスクリプトを参考にHTMLの `<span class="badge">` パターンに対応）
2. HTMLバッジの正規表現を `s/v[0-9.]\+<\/span>/` で設計（ECN-014の教訓を反映）
