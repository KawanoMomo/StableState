# ECN-013 分析: 重複IDの名前変更処理

- **判定**: 該当なし
- **リスク**: LOW

## StableBlockでの問題

グローバル正規表現置換で重複IDが全出現箇所で同一の新IDに置換され、重複が解消されない。

## StableStateの現状

### 重複ID検出（設計段階で防止）

```javascript
// stablestate.html:619-621
if (result.stateMap[id] || result.pseudoMap[id] || result.groupMap[id] || result.noteMap[id]) {
  result.errors.push({ line: lineNum, msg: 'Duplicate ID: ' + id });
}
```

パーサーが重複IDを検出してエラー報告するため、重複IDが作成されにくい設計。

### ID自動リネーム機能

StableStateにはID自動修正（fixNames等）機能が存在しない。IDの重複はバリデーションエラーとしてユーザーに通知される。

### DSL更新は行ベース

更新関数（`updatePos`, `updateSize`, `updateLabel`等）は全て `'m'`（multiline）フラグで行単位マッチを使用。グローバル置換（`'g'`フラグ）は使用されていない。

### 軽微な懸念

要素削除時（`removeDSLElement`: line 2924-2954）に `\b${id}\b` で単語境界マッチを使用しているが、`s` と `s1` のようなIDの場合、`\b` により正しく区別される。

## 結論

設計段階で重複IDを防止しており、ID自動リネーム機能も存在しないため、StableBlockの問題パターンに該当しない。
