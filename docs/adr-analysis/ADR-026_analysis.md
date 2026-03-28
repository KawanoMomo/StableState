# ADR-026 分析: エディタ機能8項目の一括追加

- **判定**: 3項目実装済、5項目未実装
- **対象ファイル**: `stablestate.html`, `vscode-stablestate/src/extension.js`

## StableBlockでの改善

接続線幅、複数選択→グループ化、透過PNG/クリップボード、検索/フィルタ、スナップガイド、Mermaidエクスポート、@include、Git Visual Diff の8機能。

## StableStateの現状

| # | 機能 | 状態 | 優先度 | 根拠 |
|---|------|------|--------|------|
| 1 | 遷移線幅カスタマイズ | 未実装 — `stroke-width="1.5"` 固定 (line 1526) | HIGH | 小変更で高効果 |
| 2 | 複数選択→グループ化 | 部分 — 複数選択は可能だがグループ作成UIなし | MEDIUM | コンポジットステート作成に有用 |
| 3 | 透過PNG/クリップボード | **実装済** — `exportPNG()` (line 2341), `copyPNG()` (line 2363) | — | 対処不要 |
| 4 | 検索/フィルタ | 未実装 | HIGH | 大規模状態マシンで必須 |
| 5 | スナップガイド | **実装済** — `computeSnapGuides()` (line 2620) | — | 対処不要 |
| 6 | PlantUML/Mermaidエクスポート | 未実装 | MEDIUM | 他ツール連携に有用 |
| 7 | @includeディレクティブ | 未実装 | LOW | 大規模プロジェクト向け |
| 8 | Git Visual Diff | 未実装 | LOW | Phase 2以降 |

## 推奨対策（優先順）

### 1. 検索/フィルタ（優先度: HIGH）

ツールバーに検索入力欄を追加。ステートID、ラベル、イベント名、ガード条件、アクションでマッチング。非マッチ要素を `opacity: 0.2` でディミング。20+ステートの図で実用性が高い。

### 2. 遷移線幅（優先度: HIGH）

DSL: `idle -> active : EvStart width=2.5`。レンダリングで `stroke-width` をDSL属性から取得。プロパティパネルにドロップダウン追加。小変更。

### 3. 複数選択→グループ化（優先度: MEDIUM）

選択中のステートのバウンディングボックスを計算し、`group` DSL行を生成。ツールバーに「グループ化」ボタン追加。

### 4. PlantUMLエクスポート（優先度: MEDIUM）

状態遷移図にはMermaidよりPlantUMLの方が構文サポートが充実。コンポジットステート、ガード条件、アクションの出力が可能。

### 5. @include / Git Visual Diff（優先度: LOW）

Phase 2以降で検討。
