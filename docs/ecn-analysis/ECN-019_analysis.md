# ECN-019 分析: 接続線スタイル（実線/破線）

- **判定**: 部分実装 — 遷移線への拡張を推奨
- **リスク**: LOW
- **対象ファイル**: `stablestate.html`

## StableBlockでの改善

接続線に solid/dashed スタイルをDSL属性とUI切替で設定可能にした。

## StableStateの現状

### 実装済

- **ステートのスタイル**: solid/dashed/bold がDSL属性とUIドロップダウン（`stablestate.html:2035`）でサポート
- コンポジットステート（line 1015）、リーフステート（line 1049）に `stroke-dasharray` 適用

### 未実装

- **遷移線のスタイル**: 全遷移線が固定の実線（`stroke="#89DDFF" stroke-width="1.5"`、line 1526）
- 遷移パーサーに `style=` 属性の読み取りなし

## 推奨対策

1. 遷移パーサー（line 529-543）に `style=` 属性の解析を追加
2. 遷移レンダリング（line 1526）で `stroke-dasharray` をスタイルに応じて適用
3. プロパティパネルに遷移スタイル切替UIを追加

UML状態遷移図では内部遷移やローカル遷移を破線で表現する慣例があり、実用性が高い。
