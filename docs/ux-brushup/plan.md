# Implementation Plan: StableState UX Brushup (2026-04-05)

- **Source of Truth**: `E:/00_Git/04_StableState/.eval/ux-review-2026-04-05/report.md`
- **Design Doc**: `E:/00_Git/04_StableState/docs/ux-brushup/design.md`
- **Target File**: `E:/00_Git/04_StableState/stablestate.html` (single-file editor)
- **Working Branch**: `fix/ux-review-2026-04-05` (already checked out)
- **Total Sprints**: 4 (serial)
- **Total OBS in Scope**: 8 (OBS-04, OBS-13, OBS-08, OBS-11, OBS-02, OBS-16, OBS-15, OBS-01)

---

## NOTE (Orchestrator / Generator / Evaluator constraints)

この plan.md は通常の subagent-driven-development フローと異なる運用制約の下で
実行される。Generator / Evaluator / Top-level conductor は以下を厳守すること。

1. **Generator は Evaluator を直接呼ばない**
   Claude Code platform の制約で nested Agent dispatch が不可のため、
   Generator は `stablestate.html` への実装編集と単体コミットのみを行い、
   Evaluator (Playwright MCP によるブラウザ再現テスト) の起動は Top-level
   conductor が各スプリント完了後に責任を持って行う。

2. **plan.md の `status` 更新は Top-level conductor の責務**
   Generator は自分のスプリントの `status` を書き換えない。Evaluator の
   PASS 判定を受けて Top-level が `pending → done` (or `failed`) に遷移させる。

3. **作業ブランチは `fix/ux-review-2026-04-05`**
   既に checkout 済み。本パスの全コミットはこのブランチ内で完結させる。
   **master / main への push / merge / rebase は禁止**。

4. **dev server は起動済み**
   http://localhost:8765/stablestate.html は Top-level が起動済みの前提。
   Generator も Evaluator も新規にサーバを立ち上げない / 既存プロセスを
   kill しない。

5. **コミット規律**
   - **1 OBS = 1 commit** (スプリント内に 2 OBS あるなら 2 commit)。
   - コミットメッセージ: `fix(ux): OBS-XX <短い説明>`。
   - `--no-verify` は使用禁止 (pre-commit hook が失敗したら原因を直して再コミット)。
   - 証拠 (スクリーンショット / console ログファイルの絶対パス) を添えない
     PASS 報告は禁止。Evaluator は `.eval/ux-brushup-sprint-N/` 配下に
     再現テストのエビデンスを残すこと。

6. **TDD の扱い**
   Playwright ベースの「再現テスト」を各 OBS について先に書いて RED 確認 →
   実装 → GREEN 確認、の順で進める。再現テストの置き場所は
   `E:/00_Git/04_StableState/tests/ux-brushup/sprint-N/obs-XX.spec.*`
   とし、Generator が実装と同じコミット内で追加する。

7. **スコープ外 OBS には触らない**
   design.md 第 5 節の「スコープ外」に挙げた OBS-03/05/06/07/09/12/14 は
   本パスで一切編集しない。近傍を触る必要がある場合も、副作用で挙動が
   変わらないよう最小限にとどめる。

---

## 依存グラフ概要

```
Sprint 1 (P1 Critical: OBS-04, OBS-13)
        ↓
Sprint 2 (Export quality: OBS-08, OBS-11)
        ↓
Sprint 3 (Error messages: OBS-02, OBS-16)
        ↓
Sprint 4 (Edit consistency: OBS-15, OBS-01)
```

直列構成。Top-level conductor は逐次実行する (並列化しない)。理由は
いずれのスプリントも `stablestate.html` という単一ファイルを編集するため、
並列化するとマージコンフリクトが不可避だから。

---

## Sprint 1: P1 Critical — 止血 (AutoRoute 復活 + テーブル編集の DSL 構造破壊修正)

- **sprint_number**: 1
- **status**: done (2026-04-05, HEAD=7ced1ae, attempt 1/10, evaluator evidence at `.eval/ux-brushup-sprint-1/attempt-1/report.md`)
- **depends_on**: []
- **description**:
  レポートで Critical 指定された 2 件を修正する。
  - **OBS-04**: ツールバーの AutoRoute ボタンを押すと
    `ReferenceError: getBox is not defined at autoRoute (stablestate.html:4760:20)`
    となり機能が完全に死んでいる。`getBox` 相当のヘルパを autoRoute スコープ内
    から参照可能な形で復活させ、遷移リストから Box を取得できるようにする。
  - **OBS-13**: `automotive-ecu.sstate` をロードして Table ビュー経由で
    `EvDriveRequest × IDLE` の guard セルを編集すると、`    idle -> active : ...`
    (4 スペースインデント + bare ID) が `run.normal.idle -> run.normal.active : ...`
    (インデント消失 + 絶対ドットパス化) に書き換わり、同じ複合状態ブロック内で
    L36 / L38 との一貫性が崩れる。ECN-044 で導入された `replaceTransition` /
    `updateTransFieldByLine` に、元行のインデント幅保持と相対 ID 復元を追加する。

- **deliverables**:
  - `stablestate.html` の `autoRoute` 関数周辺 (レポート記載 L4760 近傍) に
    `getBox` ヘルパを実装/復活 (OBS-04)
  - `stablestate.html` の `replaceTransition` / `updateTransFieldByLine`
    (ECN-044 由来) にインデント保持・相対 ID 復元ロジックを追加 (OBS-13)
  - 再現テスト: `tests/ux-brushup/sprint-1/obs-04-autoroute.spec.*`
  - 再現テスト: `tests/ux-brushup/sprint-1/obs-13-table-edit-preserves-indent.spec.*`

- **acceptance_criteria**:
  - [ ] **AC1 (OBS-04 再現防止)**: `examples/tcp-connection.sstate` をロードした
        状態で AutoRoute ボタンをクリックしたとき、console に
        `ReferenceError: getBox is not defined` が出力されない (console ログファイルを
        エビデンスとして残す)。
  - [ ] **AC2 (OBS-04 機能回復)**: 同上操作の前後で、少なくとも 1 本の遷移の
        `d` 属性 (SVG path) または中継点が変化する (Playwright snapshot 差分で確認)。
        「クリックしても何も変化しない」状態ではなくなったことを証拠化する。
  - [ ] **AC3 (OBS-13 再現防止)**: `examples/automotive-ecu.sstate` をロードし、
        Table ビューで `EvDriveRequest × IDLE` の guard を `IsReady` から
        `IsReady && BatteryOK` に変更した後、DSL の該当行が
        `    idle -> active : EvDriveRequest [IsReady && BatteryOK] / InitDrive`
        のように **元の 4 スペースインデントと bare ID 形式** を保っている
        (絶対ドットパス `run.normal.idle -> run.normal.active` に書き換わっていない)。
  - [ ] **AC4 (OBS-13 整合性)**: 上記編集後、同じ複合状態ブロック内の隣接行
        (L36 `norm_ini -> idle` / L38 `active -> idle : ...` 相当) のインデントと
        ID 表記が編集前と**完全一致**している (diff が該当 1 行のみ)。
  - [ ] **AC5 (回帰: サンプルロード)**: `examples/automotive-ecu.sstate` と
        `examples/tcp-connection.sstate` の両方が、リロード直後に描画され、
        errorBar が 0 件、Diagram / Table 両ビューに切り替えできる。
  - [ ] **AC6 (Positive-1 維持)**: OBS-13 の guard 編集を行った直後に Ctrl+Z を押すと
        DSL がガード追加前の状態に戻り、Ctrl+Y で再び追加後に戻る。
  - [ ] **AC7 (暗黙)**: 上記の一連の操作中、`console.error` が 0 件
        (`.eval/ux-brushup-sprint-1/console.log` に記録)。

- **test_strategy**:
  - Playwright MCP (browser_navigate → browser_snapshot → browser_click →
    browser_evaluate → browser_console_messages) で OBS-04 / OBS-13 の再現手順を
    忠実にトレースするテストを 2 本先に書く。Generator は実装前にこの 2 本が
    必ず RED になることを確認し (コミット前検証)、修正後に GREEN になることを
    確認してから 1 OBS につき 1 コミットを作る。

- **commit_format**:
  - `fix(ux): OBS-04 restore getBox helper so AutoRoute no longer throws ReferenceError`
  - `fix(ux): OBS-13 preserve original indent and relative IDs when updating transitions via table`

---

## Sprint 2: Export 品質 (SVG/PNG からハンドル除去 + PlantUML 構造化)

- **sprint_number**: 2
- **status**: done (2026-04-05, HEAD=08d9850, attempt 0/10, evaluator evidence at `.eval/ux-brushup-sprint-2/report.md`)
- **depends_on**: [1]
- **description**:
  外部共有される成果物 (エクスポート出力) の信頼性を回復する。
  - **OBS-08**: `getExportSVGString()` (レポート記載 L3494 付近) は
    `#annotation-banner` を除去するが、`[data-resize]` 属性を持つ 8 個の
    リサイズハンドル矩形と青色装飾 (`fill="#6366F1" stroke="#fff"`) を除去しない
    ため、選択中要素のハンドルが SVG/PNG export に焼き込まれる。clone 段階で
    これらを `remove()` する 1 行を追加する。
  - **OBS-11**: `exportPlantUML()` が複合状態を平坦化してしまい、以下 4 点が壊れる。
    1. `[*] --> cooling` がルート階層に出る (cooling は running の内側)
    2. `h_run` が参照されるが `state h_run <<history>>` の宣言がない
    3. `final shutdown` と `off --> [*]` の initial/final が混在
    4. running 内の子遷移 (`cooling -> heating` 等) が running の `{}` ブロックの
       外側に書かれている
    複合状態を再帰降下で出力し、history/final を正しい PlantUML 語彙
    (`state h <<history>>` / `state Final <<end>>`) で宣言するように修正する。

- **deliverables**:
  - `stablestate.html` の `getExportSVGString()` にハンドル要素除去追記 (OBS-08)
  - `stablestate.html` の `exportPlantUML()` を再帰出力に書き換え (OBS-11)
  - 再現テスト: `tests/ux-brushup/sprint-2/obs-08-svg-export-no-handles.spec.*`
  - 再現テスト: `tests/ux-brushup/sprint-2/obs-11-plantuml-structure.spec.*`

- **acceptance_criteria**:
  - [ ] **AC1 (OBS-08 再現防止)**: 任意の状態を選択した状態で
        `getExportSVGString()` を `browser_evaluate` で取得した結果に、
        `data-resize=` 文字列が **1 つも含まれない** (`indexOf === -1`)。
  - [ ] **AC2 (OBS-08 追加除去確認)**: 同 SVG 文字列に
        `fill="#6366F1"` (選択ハンドルの青色装飾) が含まれない、または
        ハンドル 8 個分の矩形カウントが 0 である。
  - [ ] **AC3 (OBS-11 ルート階層)**: `examples/automotive-ecu.sstate` をロードして
        `exportPlantUML()` を評価した結果、`[*] --> cooling` のような
        **複合状態内部の状態名がルート階層に出現しない**
        (ルートの `[*] -->` は必ずルートの直下子状態を指す)。
  - [ ] **AC4 (OBS-11 history 宣言)**: 出力に `h_run` (または該当する
        history pseudo-state ID) が参照される場合、同一出力内に
        `state h_run <<history>>` 行が先に現れている。
  - [ ] **AC5 (OBS-11 final 区別)**: `final` キーワードの状態は
        `state <id> <<end>>` として宣言され、`[*]` と initial が区別される。
  - [ ] **AC6 (OBS-11 ネスト)**: 複合状態 `running` 内の子遷移
        (`cooling -> heating` 等) が `state running {` と `}` の **内側**に
        配置されている (正規表現でブロック範囲抽出 → 行番号検証)。
  - [ ] **AC7 (回帰: サンプルロード)**: Sprint 1 と同じく
        `automotive-ecu.sstate` / `tcp-connection.sstate` が 0 errorBar でロード完了。
  - [ ] **AC8 (Sprint 1 退行チェック)**: AutoRoute が引き続き動作し、
        テーブル経由 guard 編集のインデント保持が維持されている
        (Sprint 1 の AC1〜AC4 を再実行)。
  - [ ] **AC9 (暗黙)**: 一連の操作中、`console.error` が 0 件。

- **test_strategy**:
  - OBS-08 は `browser_evaluate("getExportSVGString()")` の文字列で `data-resize`
    の有無を検査すればよく、テストは純粋に決定的。
  - OBS-11 はサンプル DSL を使って出力 PlantUML をパースし、ルート階層 /
    複合状態内部 / history 宣言 / final 宣言の 4 観点を個別アサーションで検証する。
    出力の人間可読性確認として `.eval/ux-brushup-sprint-2/artifacts/ecu.puml` を残す。

- **commit_format**:
  - `fix(ux): OBS-08 strip resize handles from exported SVG/PNG`
  - `fix(ux): OBS-11 emit PlantUML with nested composite states, history, and final`

---

## Sprint 3: エラーメッセージ改善 (DSL 構文テンプレート + ブレース位置)

- **sprint_number**: 3
- **status**: done (2026-04-05, HEAD=35cff33, attempt 0/10, evaluator evidence at `.eval/ux-brushup-sprint-3/report.md`; non-blocking note: OBS-16 hint anchors to lastPoppedFrame which in automotive-ecu points to failsafe/L49 instead of run/L19 — AC3 OR-criterion still satisfied via "no matching" wording, future refinement candidate)
- **depends_on**: [2]
- **description**:
  ユーザーが詰まる瞬間のエラーメッセージ品質を改善する。
  - **OBS-02**: 空の DSL に `state Red` だけ書くと
    `L1: Unrecognized syntax: state Red` と表示されるが、必須フィールド
    (`<id> "<label>" at <x>,<y> size <w>x<h>`) のテンプレートが提示されないため
    初見ユーザーは修正方針が立たない。`Unrecognized syntax` 系メッセージに
    期待テンプレート例を付記する。
  - **OBS-16**: `state run "Run" ... {` の `{` を削除すると、
    パーサは対応する `}` を見つけて `L68: Unexpected closing brace }` と報告して
    しまい、本当の原因 (L20 の開始ブレース欠落) を指さない。ブレース対応の
    スタックトラッキングを行い、「`L20` の `{` に対応する `}` が見つかりません」
    のような補足メッセージを追加する。

- **deliverables**:
  - `stablestate.html` の DSL パーサーエラーメッセージ生成部
    (`Unrecognized syntax` を投げている箇所) にテンプレート文字列を追記 (OBS-02)
  - `stablestate.html` のブレース検査ロジックにスタックトラッキングと
    補足メッセージを追加 (OBS-16)
  - 再現テスト: `tests/ux-brushup/sprint-3/obs-02-syntax-template-hint.spec.*`
  - 再現テスト: `tests/ux-brushup/sprint-3/obs-16-brace-mismatch-hint.spec.*`

- **acceptance_criteria**:
  - [ ] **AC1 (OBS-02 再現防止)**: 空 DSL に `state Red` のみを入力した状態で
        errorBar (または `errors` 配列) の先頭メッセージに
        `state <id> "<label>" at <x>,<y> size <w>x<h>` の**文字列テンプレートが
        含まれる** (文字列検索で確認)。
  - [ ] **AC2 (OBS-02 維持)**: 既存の正常 DSL (`examples/automotive-ecu.sstate`) を
        ロードしたとき errors が 0 件である (誤検知でテンプレートが出ない)。
  - [ ] **AC3 (OBS-16 再現防止)**: `automotive-ecu.sstate` をロード後、
        `run` の開始ブレース `{` を `browser_evaluate` で削除したとき、
        errorBar に **L20 (または元の開始ブレースがあった行番号) を言及する
        補足メッセージ** が含まれる (`L20` という文字列、または
        「対応する `{` が見つかりません」という文言)。
  - [ ] **AC4 (OBS-16 副作用チェック)**: 開始ブレースを復旧したら
        errors が 0 件に戻る (エラーがスタックしない)。
  - [ ] **AC5 (OBS-17 維持)**: OBS-16 の破壊試験時、Diagram がパース可能な範囲で
        描画され続ける (空白にならない)。スクリーンショットで証拠化。
  - [ ] **AC6 (Sprint 1/2 退行チェック)**: AutoRoute 動作・テーブル編集の
        インデント保持・SVG export のハンドル除去・PlantUML 構造が維持されている。
  - [ ] **AC7 (暗黙)**: `console.error` が 0 件。

- **test_strategy**:
  - 両 OBS とも errorBar のテキスト内容を `browser_evaluate` で取得して
    アサーションする純粋な文字列検査。国際化を考慮する必要はない (日本語の
    既存メッセージに追記する形で OK)。

- **commit_format**:
  - `fix(ux): OBS-02 include expected syntax template in Unrecognized syntax error`
  - `fix(ux): OBS-16 point brace mismatch error back to the unclosed opening brace`

---

## Sprint 4: 編集整合性 (孤立遷移クリーンアップ + 新規状態の座標分散)

- **sprint_number**: 4
- **status**: done (2026-04-05, HEAD=6939780, attempt 0/10, evaluator evidence at `.eval/ux-brushup-sprint-4/report.md`; side-discovery: `run -> run : EvWatchdogKick @internal` drops on load via cleanupInternalTransitions() — pre-existing, out of scope, recommend separate OBS)
- **depends_on**: [3]
- **description**:
  編集操作の副作用で起きる軽度の整合性崩れを 2 件まとめて対応。
  - **OBS-15**: `automotive-ecu.sstate` で `cruise` を選択して Del キーを押すと
    `cruise` 自体は削除されるが、`accel -> cruise : ...` と
    `cruise -> accel : ...` の 2 本の遷移が DSL に残り、
    errorBar に `Undefined state reference: cruise` が出る。削除処理で参照遷移を
    収集し、一緒に削除する (確認ダイアログは必須ではないが、最低限「孤立遷移も
    削除しました」の Undo 可能な一括処理にする)。
  - **OBS-01**: `+State` ボタンを連打すると全要素が `at 10,10` 固定で生成され
    Diagram 上は 1 個にしか見えない。既存要素を避けるオフセット探索
    (例: 直前追加要素の右に固定オフセット、または空き領域を簡易探索) を実装する。

- **deliverables**:
  - `stablestate.html` の状態削除ハンドラ (Del キー / delete ボタン) に参照遷移
    自動削除処理を追加 (OBS-15)
  - `stablestate.html` の `+State` ハンドラに座標分散ロジックを追加 (OBS-01)
  - 再現テスト: `tests/ux-brushup/sprint-4/obs-15-delete-cleans-transitions.spec.*`
  - 再現テスト: `tests/ux-brushup/sprint-4/obs-01-add-state-offsets.spec.*`

- **acceptance_criteria**:
  - [ ] **AC1 (OBS-15 再現防止)**: `examples/automotive-ecu.sstate` をロードして
        `cruise` 状態を選択 → Del キー操作の後、DSL 内に `cruise` を参照する行が
        **1 行も残らない** (`accel -> cruise` / `cruise -> accel` が消えている)。
  - [ ] **AC2 (OBS-15 整合性)**: 同操作後 errorBar に `Undefined state reference`
        が 0 件。
  - [ ] **AC3 (OBS-15 Positive-1 維持)**: Ctrl+Z で cruise とそれに付随していた
        2 本の遷移が**まとめて復元される** (Undo 1 回で元通り)。これにより
        「一括削除が 1 トランザクションとして扱われている」ことを検証。
  - [ ] **AC4 (OBS-01 再現防止)**: 空 DSL から `+State` を 3 回連打した結果、
        3 つの状態が **互いに異なる `at` 座標** を持つ (DSL 文字列内の
        `at X,Y` を 3 つ抽出して全て相異なることを確認)。
  - [ ] **AC5 (OBS-01 可視性)**: 同操作後、Diagram ビューで 3 つの矩形が
        視覚的に重ならずに表示されている (snapshot で bounding box の重なり面積が
        0、または簡易には bbox の x/y が異なることを確認)。
  - [ ] **AC6 (OBS-01 Positive-1 維持)**: +State 連打 → Undo × 3 で空 DSL に戻り、
        Redo × 3 で 3 状態が復元される。
  - [ ] **AC7 (回帰: 全スプリントスモーク)**: Sprint 1/2/3 の主要 AC を再実行
        (AutoRoute / テーブル編集 / SVG export / PlantUML / エラーメッセージ) し、
        全て維持されている。
  - [ ] **AC8 (暗黙)**: `console.error` が 0 件。

- **test_strategy**:
  - OBS-15 は DSL 文字列の `cruise` 出現回数 = 0 と errorBar 件数 = 0 の 2 条件で
    決定的に判定。Undo 後の復元確認まで 1 テストで扱う。
  - OBS-01 は DSL 内の `at` 座標を正規表現抽出して set 化し、全要素が相異なる
    ことを検証。

- **commit_format**:
  - `fix(ux): OBS-15 remove orphan transitions when deleting a referenced state`
  - `fix(ux): OBS-01 offset newly added states to avoid stacking at 10,10`

---

## 付録: スプリント完了時の Top-level conductor チェックリスト

各スプリント完了時、Top-level conductor は以下を順に実施する
(Generator / Evaluator 本人は実施しない)。

1. Generator が対象スプリントのコミット (1 OBS = 1 commit) を積んだことを
   `git log fix/ux-review-2026-04-05 --oneline` で確認。
2. Evaluator に該当スプリントの acceptance_criteria を渡し、再現テストを実行。
3. 証拠が `.eval/ux-brushup-sprint-N/` に残っていることを確認
   (スクリーンショット / console ログ / artifact)。
4. 全 AC が PASS したら plan.md の該当スプリントの `status` を `pending` から
   `done` に書き換えてコミットする。FAIL の場合は `failed` に書き換え、
   Generator に再修正を指示する。
5. 全 4 スプリントが done になったら、design.md の第 6 節「成功の定義」を
   最終チェックとして 1 回だけ通し、完了を宣言する。
