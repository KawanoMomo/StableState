# ISSUE-001: VSCode拡張でCtrl+Z/Y/C/X/Vが動作しない

- **ステータス**: Open
- **種別**: 不具合修正
- **優先度**: HIGH
- **発見日**: 2026-03-28
- **影響ファイル**:
  - `vscode-stablestate/package.json`
  - `vscode-stablestate/src/extension.js`
  - `vscode-stablestate/src/webview.html`

## コンテキスト

VSCode拡張のWebviewプレビュー上でUndo/Redo（Ctrl+Z/Y）・コピー/ペースト（Ctrl+C/X/V）が動作しない。ブラウザ版（stablestate.html）は正常動作する。

## 問題の詳細

VSCodeはCtrl+Z/Y/C/X/VをWebviewに到達する前にEditorレベルでインターセプトする。StableBlockで発見・対処済みの既知問題だが、StableStateのVSCode拡張では対策が未実装。

現状の実装状況:
- **Webview keydownハンドラ**: `webview.html` に実装済みだが、VSCodeにインターセプトされキーイベントが届かない
- **Extension keybinding**: `package.json` に `Ctrl+Shift+V`（プレビュー表示）のみ登録。`Ctrl+Z/Y/C/X/V/Delete/Backspace` のExtension keybindingが未登録
- **Clipboardイベントリスナ**: `document.addEventListener('copy'/'cut'/'paste')` が未実装。Electronレベルのインターセプトに対応できない

結果として:
- Undo/Redo（Ctrl+Z/Y）が動作しない
- コピー/カット/ペースト（Ctrl+C/X/V）が動作しない
- Delete/Backspaceは動作する（VSCodeがインターセプトしない）

## 対策

StableBlockと同じ3層構造を適用する:

1. `package.json` に `Ctrl+Z`/`Ctrl+Y`/`Ctrl+Shift+Z`/`Ctrl+A`/`Ctrl+C`/`Ctrl+X`/`Ctrl+V` のExtension keybinding追加
2. `extension.js` に各キーコマンドを登録し、Webviewへ `postMessage` で転送
3. `webview.html` に `document.addEventListener('copy'/'cut'/'paste')` のClipboardイベントリスナを追加

## 結果

（未記入 — 完了時に記載）
