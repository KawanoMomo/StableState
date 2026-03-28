# CLAUDE.md

## 概要

StableState — ブラウザベースのUML状態遷移図エディタ。テキストDSLから状態遷移図（SVG）と状態遷移表を生成・編集する。StableBlockと同じ思想（明示的グリッド座標によるGit-friendlyな安定レイアウト）を踏襲しつつ、状態遷移図に特化した機能を提供する。

設計仕様書: `docs/superpowers/specs/2026-03-27-stablestate-design.md`

## アーキテクチャ

- `stablestate.html` 単一ファイルにパーサー・レンダラー・インタラクションをすべて収める
- 外部依存なし、ビルドステップなし（Google Fontsのみ外部読み込み）
- Excel出力時のみSheetJS利用（HTMLに埋め込み、CDN非依存）
- パイプライン: DSLテキスト → `parseDSL()` → `validate()` → `renderSVG()` / `renderTable()` / `renderProps()`
- 双方向同期: GUI操作（ドラッグ・リサイズ・プロパティ変更）→ DSLテキスト書き戻し → `refresh()` による全再レンダリング
- Undo/Redo: DSLテキスト全体のスナップショットをスタックに保持（最大100件）

## ファイル構成

```
E:/00_Git/04_StableState/
├── stablestate.html              # 単体HTML版（メイン）
├── CLAUDE.md                     # 本ファイル（開発ガイダンス）
├── VERSION                       # セマンティックバージョン
├── docs/
│   └── superpowers/specs/        # 設計仕様書
├── tests/                        # テストファイル
└── vscode-stablestate/           # VSCode拡張
    ├── package.json
    ├── src/extension.js
    ├── language-configuration.json
    └── syntaxes/
        └── stablestate.tmLanguage.json
```

## 実装済み関数一覧（stablestate.html）

### パーサー
| 関数 | 責務 |
|---|---|
| `parseDSL(text)` | DSLテキストを解析し、states/pseudoStates/groups/transitions/notes等を含むparsedオブジェクトを返す |
| `parseProps(propsStr, target)` | `key=value` 形式のプロパティ文字列を解析しターゲットオブジェクトに適用 |
| `checkDuplicate(id, lineNum, result)` | ID重複チェック（state/pseudo/group/noteの全マップ横断） |
| `resolveStateRef(dotPath, parsed)` | ドット区切りパス（例: `active.accel`）を実際の状態オブジェクトに解決 |
| `validate(result)` | パース結果に対するセマンティック検証（遷移参照、初期状態必須、choice分岐、config制約、境界チェック） |

### DSL書き戻し（双方向同期）
| 関数 | 責務 |
|---|---|
| `updatePos(type, id, nx, ny, dsl)` | 要素の `at X,Y` 座標を更新 |
| `updateSize(type, id, nw, nh, dsl)` | 要素の `size WxH` を更新 |
| `updateProp(type, id, prop, val, dsl)` | プロパティ `key=value` を追加/更新 |
| `updateLabel(type, id, newLabel, dsl)` | クォート付きラベルを更新 |
| `addTransition(from, to, event, guard, action, kind, dsl)` | 遷移行を末尾に追加 |
| `removeTransition(from, to, event, guard, dsl)` | 一致する遷移行を削除 |
| `updateTransition(from, to, event, guard, field, val, dsl)` | 遷移行の特定フィールドを更新 |
| `removeDSLElement(id, dsl)` | 要素定義行（複合状態は子含む）と関連遷移を削除 |

### レンダラー
| 関数 | 責務 |
|---|---|
| `renderSVG(parsed)` | parsedデータからSVG文字列を生成（グリッド・グループ・状態・擬似状態・注釈・遷移・リサイズハンドル・スナップガイド） |
| `renderTable(parsed)` | 状態遷移表HTMLを生成（階層ヘッダー・entry/do/exit行・イベントブロック・インライン編集） |
| `renderProps()` | プロパティパネルHTML生成（状態/擬似状態/グループ/注釈の編集UI + Config設定） |
| `updateHighlight()` | DSLエディタのシンタックスハイライトオーバーレイを更新 |

### レンダリング補助
| 関数 | 責務 |
|---|---|
| `getAbsolutePos(element, parsed)` | ネスト階層を辿って絶対ピクセル座標を算出 |
| `getBox(ref)` | 状態/擬似状態の参照からバウンディングボックス `{x,y,w,h}` を取得 |
| `computePortSide(srcBox, tgtBox)` | 2つのボックス間の接続側面（top/bottom/left/right）を決定 |
| `getPortPoint(box, side, portIndex, portCount)` | ボックス辺上のポート座標を算出（複数ポート分散配置） |
| `buildRoute(fromPt, toPt, fromSide, toSide)` | 直交ルーティング（L字/U字/直線）のポイント列を生成 |
| `buildSelfRoute(box)` | 自己遷移ループのルートを生成 |
| `segmentIntersection(a1, a2, b1, b2)` | 線分交差判定（交差橋描画用） |
| `routeMidpoint(points)` | ポリライン中点算出（ラベル配置用） |

### UI制御
| 関数 | 責務 |
|---|---|
| `refresh()` | メイン更新パイプライン（parse → validate → render all） |
| `switchTab(name)` | Diagram/Tableタブ切替 |
| `setTool(name)` | ツール選択（select/state/group/initial/final/connect） |
| `toggleActions()` | entry/do/exit表示トグル |
| `toggleAnnotations()` | 注釈レイヤー表示トグル |
| `setZoom(delta)` / `applyZoom()` | ズーム制御 |
| `updateLineNumbers()` | エディタ行番号更新 |
| `updateStatus()` | ステータスバー更新 |
| `updateErrorBar(result)` | エラーバー表示 |

### インタラクション
| 関数 | 責務 |
|---|---|
| `svgCoords(e)` | マウスイベントからズーム補正済みSVG座標を算出 |
| `hitTest(px, py)` | クリック座標から要素を特定（状態→擬似→グループ→注釈の順） |
| `hitTestHandle(px, py)` | リサイズハンドルのヒットテスト |
| `collectDragSet(selectionSet)` | 選択要素+グループ内包要素のドラッグ対象一覧を収集 |
| `computeSnapGuides(dragItems)` | ドラッグ中のスナップガイドライン算出 |
| `connectSelected()` | 2要素選択時の接続（遷移追加） |
| `deleteSelected()` | 選択要素の削除 |
| `copySelection()` / `pasteSelection()` | DSL行単位のコピー&ペースト |
| `addNewElement(type)` | ツールバーからの新規要素追加 |

### Undo/Redo
| 関数 | 責務 |
|---|---|
| `getDsl()` / `setDsl(text)` | エディタテキストのget/set |
| `pushHistory()` | 現在のDSLをundoスタックにpush |
| `undo()` / `redo()` | undoスタック/redoスタックからの復元 |

### エクスポート
| 関数 | 責務 |
|---|---|
| `exportSVG()` | SVGファイルダウンロード |
| `exportPNG()` | PNG画像ダウンロード（Canvas経由） |
| `copyPNG()` | PNG画像をクリップボードにコピー |
| `addEvent()` | テーブルビューへの新規イベント追加 |

### ユーティリティ
| 関数 | 責務 |
|---|---|
| `esc(s)` | HTML特殊文字エスケープ |

## DSL構文リファレンス

### キャンバスと設定

```
@canvas width=960 height=600 grid=20
@config transition=local
@config orthogonal=false
@config history=false
```

### 状態

```
# 単純状態
state idle "Idle" at 2,3 size 8x4 entry=IdleEntry do=IdleDo exit=IdleExit color=#6366F1 text=#FFFFFF border=#4338CA round=10 style=solid

# 複合状態（子を { } でネスト、子の座標は親からの相対位置）
state active "Active" at 15,3 size 20x12 entry=ActiveEntry exit=ActiveExit {
  state accel "Accelerating" at 1,2 size 8x3 entry=AccelEntry
  state cruise "Cruising" at 10,2 size 8x3
}
```

### 擬似状態

```
initial ini at 1,4          # 開始擬似状態（●）
final fin at 30,4            # 終了擬似状態（◎）
history h1 at 14,2           # 浅い履歴（H）※ history=true時のみ
deephistory dh1 at 14,5      # 深い履歴（H*）※ history=true時のみ
choice c1 at 10,8            # 選択擬似状態（◇）
fork f1 at 12,1 size 1x6    # フォーク（■）※ orthogonal=true時のみ
join j1 at 25,1 size 1x6    # ジョイン（■）※ orthogonal=true時のみ
```

### グループ（視覚グルーピング）

```
group power "Power Management" at 1,1 size 30x14 color=#EEF2FF border=#818CF8
```

### 遷移

```
ini -> idle
idle -> active : EvStart [IsReady] / ActInit
active.accel -> active.cruise : EvSpeedReached
active -> active : EvRefresh @internal
```

構文: `source -> target : Event [Guard] / Action @kind`
- Event, Guard, Action, @kind はすべて省略可能
- @kind: `@local` / `@external` / `@internal`（省略時は `@config transition` の値）

### 注釈

```
note tip "Important" at 2,1 size 10x2 color=#FEF3C7
tip -> idle    # 注釈から状態への点線接続
```

### コメント

```
# 行頭の # のみ。インラインコメント非サポート
```

## UIレイアウト

3ペイン構成:
- **左ペイン（320px）**: DSLテキストエディタ（シンタックスハイライト付き）
- **中央ペイン**: Diagram / Table タブ切替（排他表示）
- **右ペイン（220px）**: プロパティパネル（選択要素の編集 + Config設定）

## 開発規約

- StableBlockのCSS/レイアウトを踏襲（ダークテーマ、3ペイン）
- StableBlockのJS/ロジックはコピーしない（状態遷移図向けに新規実装）
- 正規表現ベースの行単位パーサー（StableBlock方式）
- DSL双方向同期: GUI操作 → DSLテキスト書き戻し、DSLテキスト変更 → 図の再レンダリング
- Undo/Redo: DSLテキスト全体のスナップショットをスタックに保持

## 段階的リリース計画

- **Phase 1（コア）** --- **完了 (v0.1.0)**
  - 単純状態 + 複合状態（ネスト対応）
  - 基本遷移（イベント/ガード/アクション/種別）
  - 開始/終了/選択擬似状態
  - グループ（視覚グルーピング）
  - 注釈（ノート）+ 点線接続
  - DSL↔GUI双方向同期（ドラッグ移動・リサイズ・プロパティ編集）
  - 状態遷移表（階層ヘッダー・インライン編集）
  - SVG/PNGエクスポート + クリップボードコピー
  - プロパティパネル（色・スタイル・ラベル・座標・サイズ）
  - Undo/Redo（Ctrl+Z/Y）
  - 選択（クリック/Shift+クリック/Ctrl+A）・削除・コピー&ペースト
  - スナップガイド
  - 交差橋（crossing bridge）表示
  - ズーム（ボタン+マウスホイール）
  - シンタックスハイライト（DSLエディタ）
  - VSCode拡張（TextMate文法・プレビュー・スニペット）
- **Phase 2（拡張）** --- **完了 (v0.2.0)**
  - 注釈モード再設計（2段階トグル、操作制限、注釈追加UI、StableBlock準拠レンダリング）
  - 遷移線スタイル dashed対応 + カラーピッカー + 線幅カスタマイズ
  - PlantUMLエクスポート（.puml生成）
  - Excelエクスポート（SheetJS動的CDNロード）
  - ID自動補正（labelToId + Fix IDsボタン）
  - 複数選択→グループ化
  - @includeディレクティブ（preprocessInclude + パーサー警告）
  - Auto-Route（交差数最小化ヒューリスティック）
  - MCPサーバー（Python FastMCP、13ツール、24テスト）
  - Git Visual Diff（VSCode: HEAD vs Current 2ペインSVG比較、Ctrl+Shift+D）
  - 検索/フィルタ（ツールバー入力、非マッチ要素ディミング）
  - 矢印キー移動（1グリッド単位）
  - RAF性能最適化 + エッジギャップアルゴリズム + ポート間隔動的調整
- **Phase 3（直交領域）** --- **完了 (v0.3.0)**
  - 直交領域（region）DSLパース + regionMapデータ構造
  - Region SVGレンダリング（破線セパレータ + 領域ラベル）
  - Fork/Join遷移ルーティング（既存ポート分散で対応済）
  - nestingStackをタグ付きオブジェクト化（state/region区別）

## 既知の制限事項

- DSLパーサーは正規表現ベースのため、非常に複雑なネスト構造（3階層以上）で予期しない動作の可能性あり
- PNGエクスポートはGoogle Fontsの読み込みに依存（オフライン環境ではフォントフォールバック）
- 遷移ルーティングは自動最適化なし（手動制御ポイント未対応）。Phase 2のAuto-Routeで改善予定
- 状態遷移表は直交領域（orthogonal=true）有効時に生成不可
- クリップボードコピー（copyPNG）はHTTPS環境またはlocalhost以外では動作しない（ブラウザセキュリティ制約）
- DSLエディタのシンタックスハイライトは簡易的な正規表現置換のため、コメント行内のキーワードもハイライトされる場合がある
- プロパティ値に空白を含む文字列は未対応（`key=value` 形式のため）
