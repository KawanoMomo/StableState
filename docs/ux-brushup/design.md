# StableState UX Brushup (2026-04-05)

> **このドキュメントは新規製品の設計仕様ではありません。**
> 既に実施済みの UX レビューレポートを要件定義として扱い、そこで特定済みの
> 障害 (OBS-01〜OBS-17) のうち P1/P2 に該当する 8 件を修正対象として束ねる
> 「修正スコープ定義書」です。新機能の企画は行いません。

## 1. 要件定義の所在

- **ソース (必読)**: `E:/00_Git/04_StableState/.eval/ux-review-2026-04-05/report.md` (446 行)
- 再現手順、根本原因推定、改善方向、エビデンス (スクリーンショット / console ログ /
  artifact) はすべてレポート側に記述済み。本 design.md は「どれを直すか / 直さないか」
  を確定させるスコープ境界の宣言に徹する。
- 併読推奨:
  - `E:/00_Git/04_StableState/docs/ecn/ECN-043_複合状態とドットパス対応.md`
  - `E:/00_Git/04_StableState/docs/ecn/ECN-044_複数遷移ルーティングと個別管理.md`
    (OBS-13 で退行した機能の背景)
  - `E:/00_Git/04_StableState/examples/automotive-ecu.sstate`
  - `E:/00_Git/04_StableState/examples/tcp-connection.sstate`

## 2. 対象プロダクト

- **対象**: `E:/00_Git/04_StableState/stablestate.html`
  (単一 HTML のブラウザ UML ステートマシンエディタ、DSL ↔ Diagram ↔ Table 三面同期)
- **対象 URL**: http://localhost:8765/stablestate.html (評価時と同じローカル dev server)
- **変更方針**: 既存アーキテクチャを維持し、最小限の近傍編集のみで障害を除去する。
  ファイル分割・モジュール化・フレームワーク導入など構造的リファクタは行わない。

## 3. 対象ユーザー (レポートの 3 ペルソナをそのまま引用)

### Persona 1: 初見ユーザー (UML 基礎知識あり、DSL 未経験)
  - 代表タスク: 空の DSL からトラフィックライト (Red→Green→Yellow→Red) を作る
  - 本スコープで影響する OBS: OBS-02, OBS-04, OBS-01

### Persona 2: 組込エンジニア (エアコン ECU 新規設計)
  - 代表タスク: 複合状態 / history / choice / guard / action を全部使う 7 states
    14 transitions 規模の DSL を書き、SVG/PNG/PlantUML で成果物を外部共有する
  - 本スコープで影響する OBS: OBS-08, OBS-11

### Persona 3: 既存 .sstate 修正担当
  - 代表タスク: `automotive-ecu.sstate` に状態挿入 / guard 追加 / リネーム / 削除
  - 本スコープで影響する OBS: OBS-13, OBS-15, OBS-16

## 4. スコープ (今回直すもの = 計 8 OBS)

レポートの P1 (即時対応) と P2 (次スプリント) を本修正パスに採用する。

| Sprint | OBS ID | 重大度 | 1 行概要 |
|---|---|---|---|
| 1 | OBS-04 | Critical | AutoRoute ボタンが `getBox is not defined` で ReferenceError |
| 1 | OBS-13 | Critical | テーブル経由 guard/action 編集で複合状態内遷移のインデントが崩壊しドットパス化 |
| 2 | OBS-08 | High     | SVG/PNG export に選択中要素のリサイズハンドル (`[data-resize]`) が焼き込まれる |
| 2 | OBS-11 | High     | PlantUML export が構造的に壊れている (initial/final/history/複合状態の出力) |
| 3 | OBS-02 | High     | DSL 構文エラー時に期待テンプレート (`state <id> "<label>" at x,y size wxh`) 未提示 |
| 3 | OBS-16 | High     | ブレース不整合時にエラー位置が対応する `}` を指してしまいミスリード |
| 4 | OBS-15 | High     | 状態削除時に参照している遷移が orphan として残り `Undefined state reference` 発生 |
| 4 | OBS-01 | High     | `+State` ボタン連打で全要素が `at 10,10` に重なる |

### 4.1 スプリント境界の意図

- **Sprint 1 = 止血 (P1 Critical)**: 「ツールバーが死んでいる」「既存ファイルが破壊される」
  という最もブロッキングな 2 件を最優先。
- **Sprint 2 = 成果物品質 (Export)**: 外部共有物 (SVG/PNG/PUML) の信頼を回復。
  Sprint 1 の修正とは編集箇所 (`getExportSVGString` / `exportPlantUML`) が独立。
- **Sprint 3 = エラー可読性**: 書き手が詰まる瞬間のメッセージ品質改善。Sprint 1/2 の
  データ破壊系修正が終わってから行うことで、回帰差分を切り分けやすくする。
- **Sprint 4 = 編集整合性**: 削除と新規追加の 2 つの入口で起きる軽度の整合性崩れを
  まとめて処理。Sprint 1 の OBS-13 対応で整えた ID / インデント保持ロジックと
  隣接するため最後に回す。

## 5. スコープ外 (今回は直さないもの)

レポート中の以下 OBS は **本パスでは着手しない**。理由を付記する。

| OBS ID | 重大度 | スコープ外とする理由 |
|---|---|---|
| OBS-03 | Medium | 循環遷移の迂回ルーティングは ECN-044 拡張が必要で工数中、暫定回避は手動座標で可能 |
| OBS-05 | High   | ラベル衝突回避は AutoRoute の本格実装に依存。OBS-04 修正後に別スプリントで扱う |
| OBS-06 | Medium | DSL エディタの IDE 化 (SH / 折りたたみ / GoTo) は textarea→CodeMirror 等の基盤変更が必要 |
| OBS-07 | Medium | ID リネーム機能は影響範囲解析が重く、単一 HTML の近傍編集では安全に実装不可 |
| OBS-09 | Low    | 検索の DSL 側反映は nice-to-have、クリティカルパスではない |
| OBS-12 | Medium | 「遷移の途中に状態を挿入」GUI は新規コンテキストメニュー追加、ECN 案件扱い |
| OBS-14 | Medium | ID リネーム追従は OBS-07 と依存、本スコープでは扱わない |

**Positive Observations (OBS-17 / Positive-1 / Positive-2) は維持確認 AC として
各スプリントに組み込む (後述 plan.md 参照)。**

## 6. 成功の定義

本修正パスが完了したと見なせる条件は次の 2 つが同時に成立すること。

1. **全 8 OBS の再現手順を Evaluator (Playwright) で実行したとき、
   レポートの「再現手順」セクションに記載されたエラー現象が再現しない**
   (各スプリントの acceptance_criteria にスクリーンショット / console ログで証拠化)。
2. **既存の回帰が維持される**
   - `examples/automotive-ecu.sstate` と `examples/tcp-connection.sstate` を
     load → parse → Diagram / Table の両ビュー描画が、変更前と同等の States 数 /
     Transitions 数 / console.error 0 件で完遂する。
   - **Positive-1 (Undo/Redo の信頼性)**: +State 連打 → Undo、状態削除 → Undo/Redo が
     DSL / Diagram の両方で正しく復元される。
   - **Positive-2 (テーブルビューの表現力)**: 複合状態の self 列マーカー、choice 分岐の
     1 セル表現、entry/do/exit 行構成がレポート時点と同じ可視性で保たれる。
   - **OBS-17 (ベストエフォート描画)**: 構文エラーを意図的に注入しても、パース可能な
     範囲で Diagram が描画され続ける挙動を壊さない。

## 7. 制約 (Orchestrator 向け申し送り)

詳細は `plan.md` 冒頭の NOTE セクションに再掲するが、本修正パスには以下の
Claude Code platform 制約および運用制約がある。

- **Generator は Evaluator を直接呼び出せない** (nested Agent dispatch 不可)。
  Evaluator の起動は Top-level conductor が担当する。
- **plan.md の sprint `status` 更新も Top-level conductor の責務**。Generator は
  実装コミットのみ行う。
- **作業ブランチ**: `fix/ux-review-2026-04-05` がすでに checkout 済み。
  master への push / merge は本パス内では禁止。
- **dev server**: http://localhost:8765/stablestate.html は既に起動中。
  Generator / Evaluator は新規起動しない。
- **コミット規律**: 1 OBS = 1 commit。`fix(ux): OBS-XX <短い説明>`。`--no-verify` 禁止。
  証拠 (スクリーンショット / console ログ) のない PASS 報告禁止。
