# ADR-018 分析: プロパティパネル拡張と矢印キー移動

- **判定**: 部分実装 — 反映推奨
- **リスク**: MEDIUM
- **対象ファイル**: `stablestate.html`, `vscode-stablestate/src/webview.html`

## StableBlockでの改善

2ブロック選択時の接続管理パネル（作成/削除/反転/双方向化）、グループ内ブロック追加、矢印キーによる1グリッド移動。

## StableStateの現状

### 実装済

- **2要素選択時の接続作成** (`stablestate.html:2092-2095`): 「Connect」ボタン表示

### 未実装

| 機能 | 状態 |
|------|------|
| 接続削除 | 未実装 |
| 方向反転 | 未実装 |
| 双方向化切替 | 未実装 |
| グループ内ステート追加 | 未実装 |
| 矢印キー移動 | 未実装 |

### 2要素選択時のUI（現状）

```javascript
// stablestate.html:2092-2095 — 最小限の実装
} else if (selArr.length === 2) {
  html += `<button onclick="connectSelected()">Connect</button>`;
}
```

接続作成ボタンのみ。既存接続の表示・操作UIなし。

## 推奨対策

1. **矢印キー移動**: keydownハンドラにArrow Up/Down/Left/Right追加、`nudge()` 関数実装（優先度高）
2. **接続管理拡張**: 削除/反転/双方向化ボタンをプロパティパネルに追加
3. **グループ内追加**: コンポジットステート選択時に「ステート追加」ボタン
