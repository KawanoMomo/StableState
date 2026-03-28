# ECN-004: VSCode拡張機能

- **ステータス**: 適用済
- **種別**: 機能追加
- **対象コミット**: `d371653`, `22070c5`, `9c771a4`
- **影響ファイル**:
  - `vscode-stablestate/package.json`
  - `vscode-stablestate/language-configuration.json`
  - `vscode-stablestate/syntaxes/stablestate.tmLanguage.json`
  - `vscode-stablestate/src/extension.js`
  - `vscode-stablestate/src/webview.html`
  - `stablestate.html`（シンタックスハイライト追加）
  - `CLAUDE.md`

## コンテキスト

StableStateのDSLをVSCode上で快適に編集するため、シンタックスハイライト・ライブプレビュー・双方向同期を備えたVSCode拡張機能が必要だった。スタンドアロンHTML版と同等の機能をWebviewで提供する設計。

## 対策

1. **拡張スキャフォールド**（`d371653`）: VSCode拡張の基本構造を作成。`.sstate`ファイル用のlanguage-configuration（コメント構文、自動閉じ括弧）、TextMate文法（コメント、ディレクティブ、状態/擬似状態宣言、遷移、プロパティ、色リテラル、kind キーワード、region/group定義）を含む234行のgrammar定義
2. **シンタックスハイライトとポリッシュ**（`22070c5`）: スタンドアロンHTML版にもリアルタイムシンタックスハイライトオーバーレイを実装。コメント・キーワード・矢印・文字列・色・数値をカラーコード表示。スクロール同期も実装。CLAUDE.mdにアーキテクチャ概要、50+関数のリファレンス表、DSL構文リファレンスを追加
3. **Webviewプレビューと双方向同期**（`9c771a4`）: VSCode拡張のメイン機能を実装。`.sstate`ファイルを開くとWebviewパネルでライブプレビュー表示。エディタ↔Webview↔VSCodeエディタの三方向同期。Ctrl+Shift+Vでプレビュー、SVG/PNGエクスポートコマンド。stablestate.htmlの全機能をWebview内に組み込み（1,659行）

## 結果

VSCode上でStableState DSLの編集→即座にプレビュー反映→図上の操作がDSLに反映、という双方向ワークフローが実現。TextMate文法によりDSLの可読性も大幅に向上した。
