# StableState 設計仕様書

## 概要

StableStateは、テキストベースDSLからUML準拠の状態遷移図を生成・編集するブラウザベースエディタ。StableBlockと同じ思想（明示的グリッド座標によるGit-friendly な安定レイアウト）を踏襲しつつ、状態遷移図に特化した機能を提供する。

状態遷移表の自動生成・双方向編集にも対応し、02_Stateの表形式をブラウザ上で再現する。

## アーキテクチャ

### 方針: StableBlock完全踏襲（単一HTMLファイル + VSCode拡張）

- `stablestate.html` 1ファイルにパーサー・レンダラー・インタラクションをすべて収める
- VSCode拡張は同じコアロジックをWebviewに埋め込む
- 外部依存なし（Excel出力時のみSheetJS CDN）、ビルドステップなし

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

## DSL構文

StableBlockの `block id "label" at x,y size WxH` パターンを踏襲しつつ、UMLステートマシン図に特化。

### キャンバスと設定

```
@canvas width=960 height=600 grid=20
@config transition=local
@config orthogonal=false
@config history=false
```

### 設定キー

| キー | 値 | デフォルト | 説明 |
|---|---|---|---|
| `transition` | `local` / `external` / `internal` | `local` | デフォルト遷移種別 |
| `orthogonal` | `true` / `false` | `false` | 直交領域の有効化 |
| `history` | `true` / `false` | `false` | 履歴擬似状態の有効化 |

### 状態

```
# 単純状態
state idle "Idle" at 2,3 size 8x4 entry=IdleEntry do=IdleDo exit=IdleExit

# 複合状態（子を { } でネスト、子の座標は親からの相対位置）
state active "Active" at 15,3 size 20x12 entry=ActiveEntry exit=ActiveExit {
  state accel "Accelerating" at 1,2 size 8x3 entry=AccelEntry do=AccelDo
  state cruise "Cruising" at 10,2 size 8x3 entry=CruiseEntry
}
```

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
```

遷移構文: `source -> target : Event [Guard] / Action @kind`
- Event, Guard, Action, @kind はすべて省略可能
- @kind 省略時は `@config transition` の値を使用

### 注釈

```
note tip "Important" at 2,1 size 10x2 color=#FEF3C7
```

### コメント

```
# This is a comment
```

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
      round, style, entry, do, exit, parent, children:[], line }
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
| `@config` | `@config transition=local orthogonal=false` |
| `state` | `state idle "Idle" at 2,3 size 8x5 entry=IdleEntry` |
| `state { }` | 複合状態（ネスト、子の座標は親からの相対） |
| `region` | `region motor "Motor" at 0,0 size 24x6 { }` |
| `initial/final` | `initial ini at 1,4` |
| `history/deephistory` | `history h1 at 14,2` |
| `choice/fork/join` | `choice c1 at 10,8` |
| `note` | `note tip "Note text" at 2,1 size 10x2` |
| 遷移 `->` | `idle -> active : EvStart [IsReady] / ActInit @external` |
| コメント `#` | `# comment` |

### DSL更新関数（双方向同期用）

StableBlockと同じ正規表現ベースの in-place 置換:

- `updatePos(type, id, nx, ny)` — 座標変更
- `updateSize(type, id, nw, nh)` — サイズ変更
- `updateProp(type, id, prop, val)` — プロパティ変更
- `updateLabel(type, id, label)` — ラベル変更
- `addTransition(from, to, event, guard, action)` — 遷移追加（表からの同期用）
- `removeTransition(from, to, event)` — 遷移削除
- `updateTransition(from, to, event, field, val)` — guard/action/kind変更

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

### 遷移線のルーティング（Orthogonal Routing）

すべての遷移線は直線と直角の折れ線で描画する。曲線（ベジェ）は使用しない。

**接続ポート決定:**
- source/target の相対位置からどの辺（上/下/左/右）を使うか決定
- 辺の中央を基本ポートとする（角からの接続は禁止）
- 同一辺から複数の遷移が出る場合は均等分散

**経路計算:**
- 同一水平/垂直ライン上 → 直線1本
- それ以外 → 最大2回の直角折れ（L字またはコの字）
- 親状態の境界をまたぐ場合は外周を回り込む

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
ヘッダ行2: [空] | [空] | 子状態名...
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

### 表示

- Diagram / Table はタブ切替の排他表示
- Diagramタブ: 状態遷移図 + 図専用ツールバー
- Tableタブ: 状態遷移表フルスクリーン + 表専用ツールバー

### 列の生成規則

- 状態ツリーを深さ優先で走査
- 親状態は子状態の列をcolspanでまとめる
- リーフ状態が実際のデータ列
- 直交領域ON時は表生成スキップ（警告表示）

### セル幅の自動拡張

各列の最大文字数を計算し、`min-width` を `max(80px, 文字数 × 8px)` で設定。アクション名が長い場合にセルが横に広がる。

### 双方向同期

**表 → DSL（遷移線のみ追加/変更、状態位置は不変）:**

1. ユーザーが表のセルを編集
2. 変更種別を判定:
   - entry/do/exit セル → `updateProp(state, field, value)`
   - target が "-" → 状態名 → `addTransition(state, event, ...)`
   - target が 状態名 → "-" → `removeTransition(state, event)`
   - guard/action の変更 → `updateTransition(state, event, field, value)`
3. DSLテキスト更新 → 再パース → 図を再レンダリング

**DSL → 表:**

1. DSLテキスト変更（テキスト編集 or GUI操作）
2. 再パース
3. 状態ツリーから列構造を再構築、遷移リストから各セルの値を再計算
4. 表を再レンダリング

### 表の編集制約

- 状態の追加/削除/リネームは表からはできない（図 or DSLで操作）
- 表からはイベントの追加と、遷移の guard/action/target の編集のみ
- イベント行の追加は「+ Event」ボタン

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
- `N` キーまたはツールバーボタンでトグル表示
- 注釈編集モード時は状態・遷移が半透明化、noteが前面に
- noteからstateへの点線接続サポート

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
| Excel | 状態遷移表を02_State互換の.xlsx形式で出力 | SheetJS (CDN) 利用 |

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

- SheetJS (xlsx) をCDNから読み込み、ブラウザ内で生成
- Transitionシート: 表タブと同じ構造をそのまま書き出し
- Configシート: @config の内容をキー/値で出力

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
| Ctrl+Z / Ctrl+Y | Undo / Redo（DSL履歴スタック） |
| Ctrl+C / Ctrl+V | コピー / ペースト |
| Ctrl+A | 全選択 |
| N | 注釈レイヤー トグル |
| Ctrl+F | 検索/フィルター |
| ホイール | ズーム |

### 複合状態のドラッグ

- 親をドラッグ → 子状態も一緒に移動（相対位置維持）
- 子をドラッグ → 親の中で移動（親境界にクリップ）

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
| Visual Diff | HEAD vs 現在の図面を並列表示 |

### TextMate grammar トークン

| スコープ | 対象 |
|---|---|
| `keyword.control` | `@canvas`, `@config`, `state`, `initial`, `final`, `history`, `region`, `note` |
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

### Phase 2（拡張）

- 履歴擬似状態（H / H*）— history=true オプション
- PlantUML エクスポート
- Excel エクスポート（02_State互換）
- 検索/フィルター
- Visual Diff（VSCode）

### Phase 3（直交領域）

- 直交領域（region）— orthogonal=true オプション
- フォーク/ジョイン（fork / join）
- 表サポート外の警告UI
