# ADR-028: stateMapのキーをドットパスに変更し同一ID子状態を許容

## ステータス

計画中

## コンテキスト

現在stateMapはbare ID（例: `foo`）をキーにしている。親状態が異なる子状態で同一IDを使いたい場合（例: `parent1`の下の`idle`と`parent2`の下の`idle`）、stateMapで衝突して後者が前者を上書きする。

## 決定

stateMapのキーをドットパス（例: `parent1.idle`、`parent2.idle`）に変更する。

### 影響範囲

- `stateMap[id]` → `stateMap[dotPath]`に変更（35箇所）
- `sel`配列のIDをドットパスに変更
- `children`配列の要素をドットパスに変更
- `checkDuplicate`をドットパスベースに変更（同一親内の重複のみエラー）
- `leafColumns`のIDをドットパスに変更
- テーブルの`data-state`属性をドットパスに変更
- `fixNames`/`labelToId`をドットパス対応に変更
- `pseudoMap`も同様にドットパス化が必要

### 方針

1. `parseDSL`で状態をstateMapに登録する際、`parent.id`のドットパスをキーにする
2. ルート状態はbare IDのまま（親がないため）
3. `resolveStateRef`は既にドットパス対応済みだが、stateMapの直接ルックアップ部分を調整
4. 全ての`stateMap[bareId]`参照をドットパスに移行
5. DSL上の遷移参照はドットパスを使用（既に使われている）
6. selectionのIDをドットパスに統一

### リスク

- 50箇所以上の修正で、1箇所のミスで全体が壊れる
- テスト（tests/ディレクトリ）があるが、カバレッジ不明
- SVG描画、テーブル表示、プロパティパネル、インタラクション全てに影響

### 緩和策

- 段階的に実装: (1)stateMap変更+parseDSL (2)renderSVG (3)renderTable (4)selection/interaction
- 各段階でブラウザ確認
- 既存のexampleファイルで回帰テスト

## 関連

- GitHub Issue: KawanoMomo/StableState#19
