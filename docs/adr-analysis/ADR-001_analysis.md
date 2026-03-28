# ADR-001 分析: VSCode ショートカットキー動作不良

- **判定**: 該当あり
- **リスク**: HIGH
- **対象ファイル**: `vscode-stablestate/package.json`, `vscode-stablestate/src/extension.js`, `vscode-stablestate/src/webview.html`

## StableBlockでの問題

VSCodeがCtrl+Z/Y/C/X/VをWebviewに到達する前にインターセプトするため、ショートカットキーが動作しなかった。3層構造（Extension keybinding、Webview keydown、Clipboardイベント）で対処。

## StableStateの現状

### Webview keydownハンドラ（実装済だが不十分）

`webview.html:1630-1639` にCtrl+Z/Y/C/V、Delete/Backspaceのkeydownハンドラが存在する。inputフィールドフォーカス時のearly returnも実装済。

```javascript
// webview.html:1631
if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
```

### Extension keybinding（未実装）

`package.json` にはCtrl+Shift+V（プレビュー表示）のみ登録されている。Ctrl+Z/Y/C/X/V/Delete/BackspaceのExtension keybindingが未登録のため、**VSCodeがインターセプトするキーはWebviewに到達しない**。

### Clipboardイベントリスナ（未実装）

Ctrl+C/X/VはElectron/ネイティブレベルでインターセプトされるため、`document.addEventListener('copy'/'cut'/'paste')` が必要だが未実装。

## 影響

- VSCode拡張でUndo/Redo（Ctrl+Z/Y）が動作しない
- VSCode拡張でコピー/カット/ペースト（Ctrl+C/X/V）が動作しない
- Delete/Backspaceは動作する（VSCodeがインターセプトしない）
- **ブラウザ版（stablestate.html）は影響なし**

## 推奨対策

StableBlockと同じ3層構造を適用:

1. `package.json` にCtrl+Z/Y/Shift+Z/A/C/X/VのExtension keybinding追加
2. `extension.js` にコマンド登録とpostMessage転送
3. `webview.html` にclipboard eventリスナ追加
