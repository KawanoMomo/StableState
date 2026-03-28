# ADR-028 分析: vsixバイナリのリポジトリ除外

- **判定**: 現時点で問題なし — 予防的に.gitignore追加を推奨
- **リスク**: LOW
- **対象ファイル**: `.gitignore`（新規作成）

## StableBlockでの改善

vsixバイナリをリポジトリから除去し、.gitignoreで再発防止。

## StableStateの現状

- vsixファイルはGit追跡対象に含まれていない（`git ls-files '*.vsix'` が空）
- **しかし .gitignore が存在しない** — リポジトリルートにも `vscode-stablestate/` にもなし

## 推奨対策

予防的に以下を作成:

**リポジトリルート `.gitignore`**:
```
*.vsix
node_modules/
```

**`vscode-stablestate/.gitignore`**:
```
*.vsix
node_modules/
out/
```

VSCode拡張のパッケージング開始時にvsixが誤ってコミットされるリスクを事前に排除。
