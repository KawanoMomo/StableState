# ISSUE-002: ラベル入力中にプロパティパネルのフォーカスが喪失する

- **ステータス**: Open
- **種別**: 不具合修正
- **優先度**: HIGH
- **発見日**: 2026-03-28
- **影響ファイル**:
  - `stablestate.html`
  - `vscode-stablestate/src/webview.html`

## コンテキスト

プロパティパネルのラベル入力欄（`pp-label`）でテキストを入力中に `change` イベントが発火すると、プロパティパネル全体が再構築されてinput要素が破棄・フォーカス喪失する。StableBlockで発見・対処済みの既知問題だが、StableStateでも同一の構造的問題が存在する。

## 問題の詳細

`propChange('pp-label', ...)` のコールバックが `refresh()` を呼び出す。`refresh()` は `renderProps()` を含む全再レンダリングを実行し、`panel.innerHTML = html` でDOM全体を書き換えるため入力中のinput要素が破棄される。

コールスタック:
```
propChange('pp-label', callback)
  → refresh()
    → renderProps()
      → panel.innerHTML = html  ← input要素が破棄される
```

影響範囲:
- ラベル入力フィールド（確認済み）
- 位置・サイズ・色など他のプロパティ入力フィールドでも同様の問題が潜在する

## 対策

`propChange('pp-label', ...)` のコールバックで `refresh()` の代わりに `renderProps()` を除いた処理を呼ぶ。DSL書き戻し → パース → SVG/Table再レンダリングのみ実行し、プロパティパネル自体は再構築しない。

## 結果

（未記入 — 完了時に記載）
