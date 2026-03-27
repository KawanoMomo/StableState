# StableState 設計仕様書

## 概要

StableStateは、テキストベースDSLからUML準拠の状態遷移図を生成・編集するブラウザベースエディタ。StableBlockと同じ思想（明示的グリッド座標によるGit-friendly な安定レイアウト）を踏襲しつつ、状態遷移図に特化した機能を提供する。

状態遷移表の自動生成・双方向編集にも対応し、02_Stateの表形式をブラウザ上で再現する。

## アーキテクチャ

### 方針: StableBlock完全踏襲（単一HTMLファイル + VSCode拡張）

- `stablestate.html` 1ファイルにパーサー・レンダラー・インタラクションをすべて収める
- VSCode拡張は同じコアロジックをWebviewに埋め込む
- 外部依存なし、ビルドステップなし
- Excel出力時のみSheetJS利用（`<script>` タグでHTMLに埋め込み。CDN非依存でオフライン動作を保証）

### ファイル構成

```
E:/00_Git/04_StableState/
├── stablestate.html              # 単体HTML版（メイン）
├── CLAUDE.md
├── README.md
├── CHANGELOG.md
├── VERSION
├── LICENSE
└── vscode-stablestate/
    ├── package.json
    ├── src/extension.js
    ├── language-configuration.json
    └── syntaxes/
        └── stablestate.tmLanguage.json
```

### ファイルサイズに関する注記

StableBlockのHTML版は約863行。StableStateはUML対応・表エディタ・遷移ルーティングが加わるため2000〜3000行を見込む。関数分割で保守性を確保する。VSCode拡張はHTML版と同じコアロジックを埋め込む方式を踏襲するが、コードが大きくなった場合は共通ロジックの抽出を検討する。

## DSL構文

StableBlockの `block id "label" at x,y size WxH` パターンを踏襲しつつ、UMLステートマシン図に特化。

### キャンバスと設定

```
@canvas width=960 height=600 grid=20
@config transition=local
@config orthogonal=false
@config history=false
```

`@config` は1行につき1キー。複数キーの同一行記述は不可。

### 設定キー

| キー | 値 | デフォルト | 説明 |
|---|---|---|---|
| `transition` | `local` / `external` / `internal` | `local` | デフォルト遷移種別 |
| `orthogonal` | `true` / `false` | `false` | 直交領域の有効化 |
| `history` | `true` / `false` | `false` | 履歴擬似状態の有効化 |

### 状態

```
# 単純状態（スタイルプロパティ含む）
state idle "Idle" at 2,3 size 8x4 entry=IdleEntry do=IdleDo exit=IdleExit color=#6366F1 text=#FFFFFF border=#4338CA round=10 style=solid

# 複合状態（子を { } でネスト、子の座標は親からの相対位置）
state active "Active" at 15,3 size 20x12 entry=ActiveEntry exit=ActiveExit color=#EEF2FF border=#818CF8 {
  state accel "Accelerating" at 1,2 size 8x3 entry=AccelEntry do=AccelDo
  state cruise "Cruising" at 10,2 size 8x3 entry=CruiseEntry
}
```

**スタイルプロパティ（すべて省略可能、省略時はテーマデフォルト）:**

| プロパティ | 説明 | 例 |
|---|---|---|
| `color` | 背景色 | `color=#6366F1` |
| `text` | テキスト色 | `text=#FFFFFF` |
| `border` | ボーダー色 | `border=#4338CA` |
| `round` | 角丸半径（グリッド単位） | `round=10` |
| `style` | 線スタイル | `style=solid` / `style=dashed` / `style=bold` |

### 座標系

- すべての座標・サイズはグリッド単位（ピクセルではない）
- 複合状態の子要素の座標は親の左上隅からの相対位置
- `updatePos()` は相対座標を受け取る。GUIドラッグ時はSVG座標から親オフセットを減算して相対座標に変換する
- 親をドラッグした場合、子の相対座標は変更されない（親の座標のみ更新、子は自動的に追従）

### 擬似状態

```
initial ini at 1,4                    # 開始擬似状態（●）
final fin at 30,4                     # 終了擬似状態（◎）
history h1 at 14,2                    # 浅い履歴（H）※ history=true時のみ
deephistory dh1 at 14,5              # 深い履歴（H*）※ history=true時のみ
choice c1 at 10,8                     # 選択擬似状態（◇）
fork f1 at 12,1 size 1x6             # フォーク（■）※ orthogonal=true時のみ
join j1 at 25,1 size 1x6             # ジョイン（■）※ orthogonal=true時のみ
```

### 直交領域（orthogonal=true時のみ）

```
state active "Active" at 5,3 size 24x14 {
  region motor "Motor Control" at 0,0 size 24x6 {
    state stopped "Stopped" at 1,1 size 6x3
    state running "Running" at 8,1 size 6x3
  }
  region sensor "Sensor" at 0,7 size 24x6 {
    state idle "SensorIdle" at 1,1 size 6x3
    state sampling "Sampling" at 8,1 size 6x3
  }
}
```

### 遷移

```
ini -> idle
idle -> active : EvStart [IsReady] / ActInit
active.accel -> active.cruise : EvSpeedReached

# 遷移種別の明示（デフォルト以外を使う場合）
active.cruise -> active.accel : EvBrake @external
active -> active : EvRefresh @internal

# 同一イベントに対する複数ガード付き遷移（サポート対象）
idle -> active : EvStart [IsReady] / ActInit
idle -> error : EvStart [IsError] / ActError
```

遷移構文: `source -> target : Event [Guard] / Action @kind`
- Event, Guard, Action, @kind はすべて省略可能
- @kind 省略時は `@config transition` の値を使用
- 同一 (source, event) に対して複数のガード付き遷移を定義可能（ガード条件で分岐）

**選択擬似状態からの分岐:**
```
idle -> c1 : EvCheck
c1 -> active : [IsReady]
c1 -> error : [IsError]
c1 -> idle :                          # ガードなし = else/default分岐
```
選択擬似状態はイベントを持たず、ガード条件のみで分岐先を決定する。ガードなしの遷移が1本だけ許可され、else（デフォルト）分岐として扱う。

### 注釈

```
note tip "Important" at 2,1 size 10x2 color=#FEF3C7

# 注釈から状態への点線接続
tip -> idle
```

noteからstateへの接続は通常の遷移構文 `->` を使用する。パーサーはsource/targetの型を判定し、note→state接続の場合は点線で描画する（遷移ではなく注釈接続として扱う）。

### コメント

```
# This is a comment
```

コメントは行頭の `#` のみ。インラインコメント（行末の `# ...`）はサポートしない（StableBlock踏襲）。

## パーサーと内部データモデル

正規表現ベースの行単位パーサー（StableBlock踏襲）。

### パース結果のデータ構造

```javascript
{
  canvas: { width, height, grid },
  config: {
    transition: "local",
    orthogonal: false,
    history: false
  },
  states: [
    { type:"state", id, label, x, y, w, h, color, textColor, borderColor,
      round, style, entry, do, exit, parent, children:[], isInitial, line }
  ],
  pseudoStates: [
    { type:"initial"|"final"|"history"|"deephistory"|"choice"|"fork"|"join",
      id, x, y, w?, h?, line }
  ],
  regions: [
    { id, label, parentId, x, y, w, h, line }
  ],
  transitions: [
    { from, to, event, guard, action, kind:"local"|"external"|"internal",
      label, line }
  ],
  notes: [
    { type:"note", id, label, x, y, w, h, color, textColor, line }
  ],
  noteConnections: [
    { noteId, targetId, line }
  ],
  errors: [{ line, msg }],
  stateMap: {},
  pseudoMap: {},
  noteMap: {}
}
```

### パース対象の行パターン

| パターン | 例 |
|---|---|
| `@canvas` | `@canvas width=960 height=600 grid=20` |
| `@config` | `@config transition=local` |
| `state` | `state idle "Idle" at 2,3 size 8x5 entry=IdleEntry color=#6366F1` |
| `state { }` | 複合状態（ネスト、子の座標は親からの相対） |
| `region` | `region motor "Motor" at 0,0 size 24x6 { }` |
| `initial/final` | `initial ini at 1,4` |
| `history/deephistory` | `history h1 at 14,2` |
| `choice/fork/join` | `choice c1 at 10,8` |
| `note` | `note tip "Note text" at 2,1 size 10x2 color=#FEF3C7` |
| 遷移/接続 `->` | `idle -> active : EvStart [IsReady] / ActInit @external` |
| コメント `#` | `# comment` |

`->` のパースでは、source/targetのIDをstateMap, pseudoMap, noteMapで検索し、note→stateの場合はnoteConnectionsに、それ以外はtransitionsに振り分ける。

### DSL更新関数（双方向同期用）

StableBlockと同じ正規表現ベースの in-place 置換:

- `updatePos(type, id, nx, ny)` — 座標変更（相対座標）
- `updateSize(type, id, nw, nh)` — サイズ変更
- `updateProp(type, id, prop, val)` — プロパティ変更（color, entry等）
- `updateLabel(type, id, label)` — ラベル変更
- `addTransition(from, to, event, guard, action, kind)` — 遷移追加
- `removeTransition(from, to, event, guard)` — 遷移削除（guard指定で同一イベント複数遷移を区別）
- `updateTransition(from, to, event, guard, field, val)` — guard/action/kind変更

### バリデーションルール

パース後に以下の検証を行い、違反はerrors配列に追加:

| ルール | 説明 |
|---|---|
| ID重複禁止 | state, pseudo, note, region のID はすべてグローバルで一意 |
| 参照先存在 | 遷移のfrom/toは定義済みの state/pseudo を参照すること |
| 初期状態必須 | 各階層レベル（ルート、各複合状態内）に1つの initial 擬似状態が必要 |
| 初期状態の遷移先 | initial からは遷移が1本だけ出ること（ガード/イベントなし） |
| choice分岐 | choice からの遷移はガード条件のみ。ガードなし遷移は最大1本（else） |
| fork/join | fork の出力遷移数 = 対象の直交領域数。join の入力遷移数 = 対象の直交領域数 |
| 直交領域制約 | orthogonal=false の時に region/fork/join を使用した場合は警告 |
| 履歴制約 | history=false の時に history/deephistory を使用した場合は警告 |
| ネスト整合 | 子状態の座標+サイズが親状態の範囲内に収まること（警告） |

## SVGレンダラー

### 描画順序（z-order）

1. グリッド背景（ドットパターン）
2. 複合状態の外枠（半透明背景 + ボーダー）
3. 直交領域の区切り線（点線、orthogonal=true時のみ）
4. 遷移線（直線 + 直角折れ線、交差時にブリッジホップ）
5. 単純状態（角丸矩形 + ラベル、Actionsモード時はentry/do/exit表示）
6. 擬似状態（●開始、◎終了、H履歴、◇選択、■フォーク/ジョイン）
7. 注釈レイヤー（トグルON時のみ、notes + 点線接続）
8. 選択ハンドル（選択中の要素に8点リサイズハンドル）
9. スナップガイド（ドラッグ中のアラインメント補助線）

### 遷移線のルーティング（直角折れ線ルーティング）

すべての遷移線は直線と直角の折れ線で描画する。曲線（ベジェ）は使用しない。

**接続ポート決定:**
- source/target の相対位置からどの辺（上/下/左/右）を使うか決定
- 辺の中央を基本ポートとする（角からの接続は禁止）
- 同一辺から複数の遷移が出る場合は均等分散

**経路計算:**
- 同一水平/垂直ライン上 → 直線1本
- それ以外 → L字（1回折れ）またはコの字（2回折れ）
- 親状態の境界をまたぐ場合や状態と重なる場合は追加の折れ（3回以上）を許容

**自己遷移の描画:**
- source = target の場合、状態の右辺中央から出て上に折れ、上辺中央に戻るループ形状
- 折れ線は状態の外側に1〜2グリッド分のマージンを取る

**交差検出とブリッジ:**
- 全遷移線のセグメントペアで交差判定
- 交差点に半円アーク（半径6px）を挿入
- 後から描画される線がブリッジ側になる

### 状態ボックスの描画モード

| モード | 表示内容 | トグル |
|---|---|---|
| Names only（デフォルト） | ラベルのみ、コンパクト | ツールバー「Actions」ボタン OFF |
| Actions ON | ラベル + 区切り線 + entry/do/exit | ツールバー「Actions」ボタン ON |

### 擬似状態の描画仕様

| 種別 | 形状 | サイズ |
|---|---|---|
| initial | 塗り潰し円 ● | r=10 |
| final | 二重円 ◎（外輪 + 内塗り） | r=12, r_inner=7 |
| history | 円 + "H" テキスト | r=16 |
| deephistory | 円 + "H*" テキスト | r=16 |
| choice | ダイヤモンド ◇ | 20x20 |
| fork/join | 太い矩形バー ■ | 幅6px、高さDSL指定 |

## 状態遷移表

### 表の構造（02_State準拠）

```
ヘッダ行1: [空] | 親状態名（colspan で子をまたぐ）
ヘッダ行2: [空] | >初期子状態名 | 子状態名...
─────────────────────────────
entry行:   entry | 各状態の entry アクション
do行:      do    | 各状態の do アクション
exit行:    exit  | 各状態の exit アクション
═════════════════════════════
イベント行: EvName |（空セル）
  guard行:    guard  | ガード関数名 or -
  action行:   action | 遷移アクション名 or -
  target行:   target | 遷移先状態名 or -
─────────────────────────────
（イベントごとに4行ブロックを繰り返し）
```

**初期状態の表示:** 02_Stateと同様に、ヘッダ行の状態名に `>` プレフィックスを付与して初期状態を示す（例: `>Idle`）。initial擬似状態の遷移先から自動判定する。

**空セルの表示:** データのない箇所は `-` を表示（02_State互換）。

**遷移種別の表現:** 表の4行ブロック（guard/action/target）はデフォルト遷移種別を前提とする。デフォルト以外の遷移種別を持つ場合、target セルに種別を付記する（例: `Active @external`）。

**同一イベント・同一状態に複数ガード付き遷移がある場合:** guard/action/target の各セルに改行区切りで複数エントリを表示する（例: guard セルに `IsReady\nIsError`、target セルに `Active\nError`）。表からの編集時は行単位で対応する。

### 表示

- Diagram / Table はタブ切替の排他表示
- Diagramタブ: 状態遷移図 + 図専用ツールバー
- Tableタブ: 状態遷移表フルスクリーン + 表専用ツールバー

### 列の生成規則

- 状態ツリーを深さ優先で走査
- 親状態は子状態の列をcolspanでまとめる
- リーフ状態が実際のデータ列
- 直交領域ON時は表生成スキップ（警告表示）
- トップレベルの状態群は暗黙の「Root」親としてグループ化（02_State互換のExcel出力時に使用）

### セル幅の自動拡張

各列の最大文字数を計算し、`min-width` を `max(80px, 文字数 × 8px)` で設定。アクション名が長い場合にセルが横に広がる。

### 双方向同期

**表 → DSL（遷移線のみ追加/変更、状態位置は不変）:**

1. ユーザーが表のセルを編集
2. 変更種別を判定:
   - entry/do/exit セル → `updateProp(stateId, field, value)`
   - target が "-" → 状態名 → `addTransition(sourceState, targetState, event, guard, action, kind)`
   - target が 状態名 → "-" → `removeTransition(sourceState, targetState, event, guard)`
   - guard/action の変更 → `updateTransition(sourceState, targetState, event, guard, field, value)`
3. DSLテキスト更新 → 再パース → 図を再レンダリング

**DSL → 表:**

1. DSLテキスト変更（テキスト編集 or GUI操作）
2. 再パース
3. 状態ツリーから列構造を再構築、遷移リストから各セルの値を再計算
4. 表を再レンダリング

### 表の編集制約

- 状態の追加/削除/リネームは表からはできない（図 or DSLで操作）
- 表からはイベントの追加と、遷移の guard/action/target の編集のみ
- 「+ Event」ボタン: イベント名を入力するダイアログを表示し、空の4行ブロック（guard: -, action: -, target: - の全列）を表末尾に追加。DSLにはイベント名のみのコメント行を挿入（実際の遷移はtargetセルの編集で追加される）

## オプション機能

### 直交領域（orthogonal=true時）

- `region` / `fork` / `join` キーワードが使用可能に
- 状態遷移表は無効化、Tableタブに警告バナー表示
- GUIの設定チェックボックスに「直交領域を有効にすると状態遷移表の自動生成はサポートされません」の警告

### 履歴擬似状態（history=true時）

- `history` / `deephistory` キーワードが使用可能に
- 表の target セルに `H` `H*` 記法が使用可能

### 遷移種別

- デフォルトは `@config transition` の値（初期値: `local`）
- 個別遷移で `@external` / `@internal` を明示して上書き可能
- local: 親のexit/entryは実行されない（親内で完結）
- external: 親のexit/entryも実行される
- internal: 状態遷移なし、アクションだけ実行

## 注釈レイヤー（StableBlock踏襲）

- `note` キーワードでDSLに記述
- `note -> state` 構文で注釈から状態への点線接続
- `N` キーまたはツールバーボタンでトグル表示
- 注釈編集モード時は状態・遷移が半透明化、noteが前面に

## スクリーンショット機能（StableBlock踏襲）

- SVGエクスポート: ファイル保存ダイアログ
- PNGエクスポート: Canvas経由レンダリング、透過背景対応
- クリップボードコピー: ツールバーボタン1クリックでPNGコピー

## エクスポート

| 形式 | 内容 | 備考 |
|---|---|---|
| SVG | 図面をSVGファイルとして保存 | |
| PNG | Canvas経由、透過背景対応 | |
| PlantUML | DSLからPlantUML構文に変換 | 下記変換ルール参照 |
| Excel | 状態遷移表を02_State互換の.xlsx形式で出力 | SheetJS埋め込み |

### PlantUML変換ルール

```
state idle "Idle"                  → state "Idle" as idle
state active "Active" { ... }      → state "Active" as active { ... }
idle -> active : EvStart [IsReady] / ActInit
  → idle --> active : EvStart\n[IsReady] / ActInit
initial ini → [*] --> idle
final fin   → active --> [*]
```

### Excel出力（02_State互換）

- SheetJS (xlsx) をHTMLに埋め込み、ブラウザ内で生成
- Transitionシート: 表タブと同じ構造をそのまま書き出し。ヘッダ行1にRoot相当の親、ヘッダ行2に子状態（02_State互換の階層表現）
- Configシート: @config の内容をキー/値で出力
- 状態名はネスト階層からドットパス（`Active.Accel`）に変換して出力（02_State の完全修飾名と互換）

## インタラクション

### 操作一覧

| 操作 | 動作 |
|---|---|
| クリック | 要素選択 |
| Shift+クリック | マルチ選択に追加/除外 |
| ドラッグ | 選択要素の移動（グリッドスナップ） |
| リサイズハンドル | 8点ドラッグでサイズ変更 |
| 2要素選択 → Connect | 遷移線追加（イベント名入力ダイアログ） |
| Delete/Backspace | 選択要素の削除 |
| Ctrl+Z / Ctrl+Y | Undo / Redo |
| Ctrl+C / Ctrl+V | コピー / ペースト |
| Ctrl+A | 全選択 |
| N | 注釈レイヤー トグル |
| Ctrl+F | 検索/フィルター（Phase 2） |
| ホイール | ズーム |

**ドラッグによる遷移作成は非サポート。** 遷移は2要素選択 → Connectボタン、または DSL/表から追加する。

### Undo/Redo

- DSLテキスト全体のスナップショットをスタックに保持（StableBlock方式）
- すべてのDSL変更操作（GUI操作、テキスト編集、表セル編集）の前に `pushHistory()` を呼ぶ
- スタック深度: 100（超過時は最古を破棄）
- タブ切替（Diagram ↔ Table）をまたいでも同一スタックを共有

### 複合状態のドラッグ

- 親をドラッグ → 親の座標のみDSL更新。子の相対座標は不変なので自動的に追従
- 子をドラッグ → 親の中で移動（親境界にクリップ、相対座標で更新）

### スナップガイド

ドラッグ中に他要素の辺/中心と0.5グリッド以内で揃う時に黄色点線表示。

## VSCode拡張

| 項目 | 仕様 |
|---|---|
| 拡張ID | `stablestate` |
| 対象ファイル | `.sstate` 拡張子 |
| プレビュー起動 | `Ctrl+Shift+V` |
| Webview | HTML版と同じコアロジックを埋め込み |
| 双方向同期 | エディタ ↔ Webview 間で `dslUpdate` メッセージ |
| エクスポート | Save dialogを経由してSVG/PNG/PlantUML/Excel |
| シンタックスハイライト | TextMate grammar（.tmLanguage.json） |
| Visual Diff | HEAD vs 現在の図面を並列表示（Phase 2） |

### TextMate grammar トークン

| スコープ | 対象 |
|---|---|
| `keyword.control` | `@canvas`, `@config`, `state`, `initial`, `final`, `history`, `deephistory`, `choice`, `fork`, `join`, `region`, `note` |
| `entity.name.tag` | 要素ID |
| `string.quoted.double` | `"ラベル"` |
| `constant.numeric` | 座標、サイズ |
| `keyword.operator` | `->` |
| `variable.other` | イベント名 |
| `constant.other.color` | `#RRGGBB` |
| `comment.line` | `# ...` |

## UIレイアウト

### 3ペイン構成

- 左: DSLテキストエディタ（シンタックスハイライト付き）
- 中央: Diagram / Table タブ切替
  - Diagramタブ: 状態遷移図（SVG）、ツールバー（Select, +State, ●Initial, ◎Final, ↗Connect, Actions トグル）
  - Tableタブ: 状態遷移表（フルスクリーン）、ツールバー（+Event）
- 右: プロパティパネル（選択要素の編集 + Config設定）

### ツールバー（共通）

エクスポートボタン: SVG, PNG, PlantUML, Excel
スクリーンショット: クリップボードコピーボタン

## 段階的リリース計画

### Phase 1（コア）

- 単純状態 + 複合状態（階層）
- 基本遷移（event / guard / action）
- 遷移種別（local / external / internal）
- 開始擬似状態（●）+ 終了擬似状態（◎）
- 選択擬似状態（◇）
- DSL ↔ GUI 双方向同期
- 状態遷移表（自動生成 + 双方向編集）
- 注釈レイヤー
- SVG / PNG エクスポート + スクリーンショット
- VSCode拡張
- バリデーション

### Phase 2（拡張）

- 履歴擬似状態（H / H*）— history=true オプション
- PlantUML エクスポート
- Excel エクスポート（02_State互換）
- 検索/フィルター: 状態名・イベント名・アクション名をテキスト検索。非マッチ要素はopacity 0.2に減衰（StableBlock方式）
- Visual Diff（VSCode）: HEAD vs 現在のDSLを並列プレビュー。変更/追加/削除された要素を色分け表示

### Phase 3（直交領域）

- 直交領域（region）— orthogonal=true オプション
- フォーク/ジョイン（fork / join）
- 表サポート外の警告UI
