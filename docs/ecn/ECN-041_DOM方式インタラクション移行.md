# ECN-041: DOM方式インタラクション移行

- **ステータス**: 適用済
- **種別**: 大規模リファクタリング
- **対象コミット**: `1c4433d`, `83cbd61`, `db5ccd8`
- **影響ファイル**: `stablestate.html`
- **関連ADR**: ADR-001, ADR-002

## コンテキスト

座標ベースの`hitTest()`によるブロック選択にバグがあり、選択不可・誤選択が頻発していた。StableBlockで安定稼働しているDOM方式（`data-id`属性 + `setupInteractions()`）への全面移行を実施。

## 対策

1. **選択モデル変更** (`1c4433d`): `selection = new Set()` → `sel = [{type, id}, ...]` 配列。`isSel`/`getItem`/`resolveSelType`ヘルパー追加。25箇所以上の参照を変換
2. **SVG属性追加** (`83cbd61`): 全`<g>`要素に`data-type`/`data-id`追加。リサイズハンドルに`data-resize`/`data-rid`/`data-rtype`追加。drop-shadow選択エフェクト。viewBoxズーム方式
3. **DOM方式移行** (`db5ccd8`): `setupInteractions()`新設。`hitTest`/`hitTestHandle`/`collectDragSet`/`svgCoords`/`applyZoom`を削除。`refresh()`/`refreshView()`から`setupInteractions()`を呼び出し

## 結果

選択バグが完全に解消。コード量は約70行削減（3985→3919行）。StableBlockとの操作感が一致。
