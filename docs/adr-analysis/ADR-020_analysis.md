# ADR-020 分析: 注釈レイヤー

- **判定**: 実装済
- **リスク**: なし

## StableBlockでの改善

note DSL構文、注釈編集モード、ディミング、モード別Ctrl+A、エクスポート対応。

## StableStateの現状

同等の機能が実装済。

| 機能 | StableState |
|------|-------------|
| note DSL構文 | `stablestate.html:504-526` |
| 3段階トグル (OFF→VIEW→EDIT) | `stablestate.html:3101-3120` |
| 編集モード時ディミング (opacity 0.35) | `stablestate.html:988, 1140` |
| ノート接続線（破線黄色） | `stablestate.html:1580-1596` |
| Nキーバインド | `stablestate.html:3132` |
| モード別Ctrl+A | 実装済 |

## 結論

対処不要。
