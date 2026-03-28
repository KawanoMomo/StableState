# ADR-007 分析: 正規表現テンプレートリテラルエラー

- **判定**: 該当なし
- **リスク**: なし

## StableBlockでの問題

テンプレートリテラル内の正規表現文字クラスに未エスケープの `${}` が含まれ、テンプレート補間として解釈されSyntaxErrorが発生。

## StableStateの現状

- `stablestate.html`: テンプレートリテラル内でRegExpを使用しているが、変数補間 `${...}` は文字クラス `[...]` の外に配置されており安全
- `webview.html`: 旧形式の文字列連結（`+`演算子）でRegExpを構築しており、テンプレートリテラルの問題が発生しない

```javascript
// stablestate.html:766 — 安全（${}は文字クラス外）
const re = new RegExp(`^(\\s*${type}\\s+${id}\\s+...)$`, 'm');

// webview.html:600 — 安全（文字列連結）
var re = new RegExp('^(\\s*' + type + '\\s+' + id + '\\s+...)$', 'm');
```

## 結論

該当パターンなし。対処不要。
