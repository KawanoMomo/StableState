# CLAUDE.md

## 概要

StableState — ブラウザベースのUML状態遷移図エディタ。テキストDSLから状態遷移図（SVG）と状態遷移表を生成・編集する。StableBlockと同じ思想（明示的グリッド座標によるGit-friendlyな安定レイアウト）を踏襲しつつ、状態遷移図に特化した機能を提供する。

設計仕様書: `docs/superpowers/specs/2026-03-27-stablestate-design.md`

## アーキテクチャ

- `stablestate.html` 単一ファイルにパーサー・レンダラー・インタラクションをすべて収める
- 外部依存なし、ビルドステップなし（Google Fontsのみ外部読み込み）
- Excel出力時のみSheetJS利用（HTMLに埋め込み、CDN非依存）

## ファイル構成

```
E:/00_Git/04_StableState/
├── stablestate.html              # 単体HTML版（メイン）
├── CLAUDE.md                     # 本ファイル（開発ガイダンス）
├── VERSION                       # セマンティックバージョン
├── docs/
│   └── superpowers/specs/        # 設計仕様書
└── vscode-stablestate/           # VSCode拡張（予定）
    ├── package.json
    ├── src/extension.js
    ├── language-configuration.json
    └── syntaxes/
        └── stablestate.tmLanguage.json
```

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
- **左ペイン（320px）**: DSLテキストエディタ
- **中央ペイン**: Diagram / Table タブ切替（排他表示）
- **右ペイン（220px）**: プロパティパネル（選択要素の編集 + Config設定）

## 開発規約

- StableBlockのCSS/レイアウトを踏襲（ダークテーマ、3ペイン）
- StableBlockのJS/ロジックはコピーしない（状態遷移図向けに新規実装）
- 正規表現ベースの行単位パーサー（StableBlock方式）
- DSL双方向同期: GUI操作 → DSLテキスト書き戻し、DSLテキスト変更 → 図の再レンダリング
- Undo/Redo: DSLテキスト全体のスナップショットをスタックに保持

## 段階的リリース計画

- **Phase 1（コア）**: 単純状態 + 複合状態、基本遷移、開始/終了/選択擬似状態、DSL↔GUI双方向同期、状態遷移表、注釈、SVG/PNGエクスポート、VSCode拡張
- **Phase 2（拡張）**: 履歴擬似状態、PlantUML/Excelエクスポート、Auto-Route、検索/フィルター、Visual Diff
- **Phase 3（直交領域）**: 直交領域（region）、フォーク/ジョイン
