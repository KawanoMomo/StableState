# StableState UX Brushup — Known Issues (2026-04-05 以降のキュー)

この文書は UX ブラッシュアップサイクル (2026-04-05 実施、plan.md / design.md 参照) の実行中に**副次的に発見された**新規 OBS を、次サイクルへエンキューする目的で記録する。

- 元 UX レビュー: `.eval/ux-review-2026-04-05/report.md` (OBS-01〜OBS-17)
- 実装サイクル: `fix/ux-review-2026-04-05` ブランチ (14 commits、base=`bc29026`)
- 本文書の位置づけ: 元レポートの addendum (in-scope の 8 OBS は全て done、ここに書く 2 件は次サイクル候補)

---

## OBS-18 [Medium] ブレース不整合ヒントが真因ではなく最も近い子を指す

- **発見経緯**: Sprint 3 (OBS-16 修正) の Evaluator 独立検証中
- **発見日**: 2026-04-05
- **発見証拠**: `.eval/ux-brushup-sprint-3/artifacts/AC3-brace-removed-errors.txt`
- **カテゴリ**: エラー回復 / 学習容易性
- **関連 OBS**: OBS-16 の延長線上 (OBS-16 自体は Sprint 3 で done、この件はその精度向上)

### 症状

OBS-16 の修正により、ブレース欠落時に `Hint: no matching '{' found ... opened here at L<N>` の補足メッセージが出るようになった。しかし多段ネスト構造で試すと、**ヒントが真因ではなく、最も浅く pop された兄弟の開始位置**を指してしまう。

### 再現手順

1. `examples/automotive-ecu.sstate` をロード
2. L19 の `state run "Run" ... {` 末尾の `{` を削除 (browser_evaluate で DSL 書き換え)
3. `refresh()` 呼び出し

### 期待と実測

**期待**: `L19 の '{' に対応する '}' が見つかりません` (真因 = run)
**実測**: 
```
L67: Unexpected closing brace }
L49: Hint: no matching '{' found for '}' on line 67; an ancestor of 'failsafe' (opened here at L49) is likely missing its opening '{'.
```

failsafe (L49) は内部で正しく balanced しているため、外側の run (L19) の `{` 欠落が stray `}` として L67 で顕在化する頃には、`nestingStack` から failsafe は既に pop されている。Generator の実装は `lastPoppedFrame` を参照するため、**最後に pop されたフレームが指される**。automotive-ecu のように深いネストだと真因より内側を指すことになる。

### 現状の許容範囲

plan.md Sprint 3 の AC3 は OR 条件 (`L20` リテラル **または** 「対応する `{` が見つかりません」「no matching」等の文言) で書かれているため、現実装は literal pass している。ユーザーもヒントがあれば「どこかでブレースが開きっぱなし」という事実には気づけるので、破滅的ではない。

### 根本原因

`nestingStack` が LIFO のため、stray `}` 到達時点で真因フレームは既に pop 済み。`lastPoppedFrame` は直前に pop された兄弟で、真因の親ではない。

### 改善方向 (次サイクル候補)

- パース完了時に `nestingStack` が空でなければ **残存フレームを errors に push** (これは Sprint 3 で既実装、Unclosed '{' opened here for ... エラー)
- stray `}` を**ソフトエラー**として扱い、パース続行しながら「どの `{` に対応するはずか」を heuristic で推定
  - 候補: stray `}` の直前行から上向きに走査し、開始ブレースを持つ状態宣言で最も近いものを特定
  - または tokens からブレース平衡を走査してミスマッチ箇所をマーク

### 優先度

**Medium** — OBS-16 自体の AC は満たしており、致命的ではないが、automotive-ecu 規模の実務 DSL で誤誘導される可能性あり。次 UX サイクルで独立 sprint として扱う価値あり。

---

## OBS-19 [High] `@internal` self-transition がロード時に silent drop される

- **発見経緯**: Sprint 1 attempt 1 Evaluator + Sprint 4 Evaluator の両方で独立発見
- **発見日**: 2026-04-05
- **発見証拠**:
  - `.eval/ux-brushup-sprint-1/attempt-1/report.md` (Sprint 1 evaluator notes)
  - `.eval/ux-brushup-sprint-4/report.md` (Sprint 4 evaluator notes)
- **カテゴリ**: 信頼性 / 一貫性 / 発見可能性 (silent data loss)
- **関連コード**: `stablestate.html:4074-4089` (`cleanupInternalTransitions`)、`stablestate.html:4092` (`refresh()` が呼ぶ)

### 症状

`examples/automotive-ecu.sstate` の L85 に:
```
run -> run : EvWatchdogKick @internal
```
が定義されているが、**ロード直後の `refresh()` で silent 削除される**。ユーザーは自分が書いた DSL がいつの間にか消えていることに気づかない (DSL 3973→3841 bytes、Sprint 4 evaluator 計測)。

### 再現手順

1. `examples/automotive-ecu.sstate` をロード
2. `getDsl()` を evaluate して L85 の `run -> run : EvWatchdogKick @internal` の存在を確認
3. **なくなっている**

### 根本原因

`cleanupInternalTransitions()` (L4074-4089):
```javascript
if (t.match(/^(\S+)\s*->\s*(\S+)\s*:.*@internal/) && !t.match(/\/\s*\S+/)) {
  changed = true;
  continue; // skip this line
}
```

`refresh()` の先頭で呼ばれ、「@internal かつ `/ action` なし」の遷移行を**無条件で物理削除** (`setDsl` で DSL テキスト自体を書き換える)。
意図は「action も trigger もない @internal は無意味だから掃除する」だが、**トリガーイベント自体に意味がある場合** (watchdog tick、heartbeat、poll など) を考慮していない。

### 実害

- 自動車 ECU / 組込システムでは「状態は変わらないがイベントだけ記録したい」self-transition は普通に使う (watchdog、heartbeat、poll、carrier detect 等)
- ユーザーが書いた `run -> run : EvWatchdogKick @internal` は **カスタムエントリ・アクション無しでも trigger 自体に意味がある**
- 物理的に DSL から削除されるため、ファイルを保存し直すとオリジナル情報が失われる
- PlantUML export / SVG export にも反映されない (そもそも parsed から消えている)
- **Sprint 1 attempt 1 と Sprint 4 の 2 つの独立した evaluator が別々にこの問題を発見**している — 重要な観測である証拠

### 改善方向 (次サイクル候補)

**最小修正**: `cleanupInternalTransitions()` の条件を見直す
- 「@internal だが trigger があれば残す」に変更: `&& !t.match(/\/\s*\S+/)` を削除して、@internal は一律に削除しない
- もしくは「trigger も action も無い完全に空の self @internal」だけを削除する (`run -> run : @internal` のみ)

**本質修正**: `cleanupInternalTransitions()` を廃止し、@internal 遷移は parser レベルで扱う
- `parseDSL` が `@internal` フラグを認識して runtime フィールド化
- `renderSVG` は @internal を描画対象外にするが、`parsed.transitions` には保持
- テーブルビューでは専用セル (self列) に表示 (既に Positive-2 として認識されている構造を活用)
- PlantUML export も `state run : EvWatchdogKick` のような internal action として出力

### 優先度

**High** — Silent data loss は信頼性の致命傷。自動車 ECU というメインペルソナのサンプルが既に影響を受けている。組込エンジニアの実務 DSL が意図せず改変される。次 UX サイクルで P1 扱いすべき。

### スコープ決定の理由 (本サイクルで対応しなかった)

- 元 UX レビュー (`.eval/ux-review-2026-04-05/report.md`) の 17 OBS には含まれていない (発見前)
- 本サイクルの plan.md は P1+P2 の 8 OBS に厳密スコープ固定されていた
- 本サイクルでスコープ拡張すると 「 ついで改善禁止」の CLAUDE.md 原則に抵触
- 1 つのサイクルで発見された新規問題は、次サイクルのレビューに入力として持ち越すのが健全なループ

---

## サマリ

| ID | 重要度 | カテゴリ | 発見スプリント | 次サイクル優先度 |
|---|---|---|---|---|
| OBS-18 | Medium | エラー回復 | Sprint 3 eval | P2 |
| OBS-19 | High | 信頼性 (silent data loss) | Sprint 1 eval + Sprint 4 eval | P1 |

次 UX レビューサイクルを起こす際は、本文書を元 report.md と併せて Planner に渡すこと。
