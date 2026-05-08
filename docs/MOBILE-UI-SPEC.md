# StableState モバイルUI 仕様書 (Draft)

## 1. 目的とスコープ

スマートフォンで **状態遷移図をフル編集できる** 専用UIを設ける。
PC版 (`stablestate.html`) と独立したエントリ (`stablestate-mobile.html`) として実装し、
PC版と同等の表現力を持ちつつ、モバイル特有の制約に最適化したジェスチャー中心のUXを提供する。

### スコープ
- 状態 (state / initial / final / choice) の追加・移動・リサイズ・削除
- グループ (composite state) の作成・包含
- 遷移 (transition) の追加・編集・削除
- イベント / ガード / アクションの編集
- ファイル入出力 (open / save .sstate)
- 画像エクスポート (PNG / SVG)

### スコープ外
- DSLテキストエディタ（モバイルでは非表示）
- 状態遷移表ビュー（モバイルでは非表示）
- PlantUML / Excelエクスポート（メニュー奥に格納、優先度低）
- AutoRoute / SmartRoute（v1ではオフ）

## 2. プラットフォーム / 配信

**モバイル版は独立したネイティブアプリとして配信する**。PC版（`stablestate.html`）とは
別物として扱い、URL/ブレークポイントによる自動切替は行わない。

| 区分 | 方針 |
|---|---|
| 主形態 | **Android APK**（Capacitor で `stablestate-mobile.html` をラップ） |
| 副形態 | iOS（同 Capacitor プロジェクト）、PWA は副次成果物 |
| 開発形態 | ブラウザで `stablestate-mobile.html` 単体を実行できる（開発・モック確認用） |
| ターゲット | Android 10+ (API 29+), iOS 16+ |
| 画面サイズ | 360×640 〜 430×932（iPhone Pro / Pixel系で確認） |
| 横向き | 対応（キャンバスのみ拡大、UIは同一） |

### 2.1 ビルドパイプライン (Capacitor)

```
stablestate-mobile.html ──┐
manifest.json             │
sw.js                     ├─→ Capacitor (web/) ─→ Android Studio ─→ APK
icons/                    │                  └─→ Xcode         ─→ IPA
core.js (parseDSL等)      ┘
```

- `npx cap init StableState com.stablestate.mobile`
- `npx cap add android` / `npx cap add ios`
- web資産は `web/` または `dist/` に配置、`capacitor.config.ts` で `webDir` 指定
- ファイル入出力は `@capacitor/filesystem` を経由（PWAでは `<input type=file>` フォールバック）
- 共有は `@capacitor/share`（PNG/SVGをOSの共有シートへ）

## 3. 設計原則

1. **指で図を作る**：PCの「ツール選択 → クリック」モデルを捨て、ジェスチャーで配置
2. **常時表示は最小限**：詳細プロパティは選択時のみ、ボトムシートで必要分のみ表示
3. **片手親指で操作可能**：常駐コントロールは画面下部に集約
4. **同時表示しない**：DSL/表/図の3ペインは廃止し、図のみの単一ビュー
5. **PCと別物**：レイアウトもインタラクションも独立。共通化はコアロジックのみ

## 4. 画面構成

```
┌─────────────────────────┐
│ ≡   StableState     ⋯  │  ヘッダ 44pt
├─────────────────────────┤
│                         │
│                         │
│                         │
│       SVGキャンバス       │  ピンチ/パン/長押しで操作
│                         │
│   ╭──────╮              │
│   │ Idle │              │
│   ╰──────╯              │
│                         │
│             ┌─╮         │
│             │+│ FAB     │
│             └─╯         │
├─────────────────────────┤
│  ↶  ↷    ⊕    ⇲   ⋯   │  コマンドバー 56pt
└─────────────────────────┘
```

### 4.1 ヘッダ (44pt)
- 左：`≡` メニュー（New / Open / Save / Settings / About）
- 中央：ファイル名（タップで rename インライン編集）
- 右：`⋯` 補助メニュー（Export PNG / Export SVG / Share）

### 4.2 キャンバス（残り全領域）
- SVGを `viewBox` 制御で表示。CSS `touch-action: none` でジェスチャー完全制御
- 背景は薄いグリッドドット（PC版より淡い）
- 選択時のみ要素にアウトラインとリサイズハンドル表示

### 4.3 コマンドバー（56pt、画面下部固定）
- 左から `Undo / Redo / +State (FAB大) / Fit / メニュー(⋯)`
- safe-area-inset-bottom に対応

### 4.4 セレクションバブル（選択中のみ要素上に浮遊）
状態を選択するとその要素の **上方** に小さなピル型バーが浮かぶ：

```
   ╭─ 🎨  ✏️  🗑  ⋯ ─╮
   │   Idle           │
   ╰──────────────────╯
```

- 🎨 カラー切替（ポップオーバー）
- ✏️ 名前編集（インライン）
- 🗑 削除
- ⋯ 詳細（ボトムシート展開）

### 4.5 ボトムシート（詳細プロパティ）
高さ 50% / 全画面の2段階。下スワイプで閉じる。

| セクション | 内容 |
|---|---|
| 基本 | name, label, color, border |
| エントリ/Do/Exit | entry, do, exit アクション |
| 遷移（選択要素が起点の場合） | 一覧 + 編集 |
| Advanced | path / size など低頻度項目 |

## 5. ジェスチャー仕様

| ジェスチャー | 対象 | 動作 |
|---|---|---|
| タップ | 空白 | 選択解除 |
| タップ | 要素 | 選択 → セレクションバブル表示 |
| ダブルタップ | 空白 | その位置に状態を追加（インライン名前入力） |
| ダブルタップ | 要素 | 名前のインライン編集 |
| 長押し | 空白 | コンテキストメニュー（State / Group / Initial / Final / Choice / Note） |
| 長押し | 要素 | 接続モードに入る → 指を別要素までドラッグして遷移を作成 |
| ドラッグ | 要素 | 移動（離した時にグリッドスナップ） |
| ドラッグ | 端ハンドル | リサイズ |
| ドラッグ | 空白 | パン |
| ピンチ | 任意 | ズーム（25%〜400%） |
| 2本指タップ | 任意 | Undo |
| 3本指タップ | 任意 | Redo |
| 要素を別要素に重ねる | 要素 | 親グループに含める（ハイライト表示） |
| グループから外側にドラッグ | 要素 | 親から外す |

### 5.1 接続モードの視覚フィードバック
長押し開始 → 要素を青く点滅 → 指の位置から仮の線が伸びる →
指を要素上に置くとその要素が強調 → 離すと遷移確定 → イベント名インライン入力。

### 5.2 ジェスチャー競合の解決
- 単指の長押し vs ピンチ：2本目の指が触れた時点で長押しをキャンセル、ピンチに切替
- ドラッグ vs パン：要素hit-test成功でドラッグ、失敗でパン
- 移動 vs リサイズ：エッジから 16dp 以内のタッチ開始でリサイズと判定

## 6. FAB（中央 ⊕ ボタン）

- **タップ**：画面中央に新しい状態を追加（位置は viewport 中心、ID自動採番）
- **長押し**：放射メニュー（パイメニュー）展開
  - State / Group / Initial / Final / Choice / Note
  - 各アイコンに指をスワイプして離すと、その要素を中央に作成

## 6.5 遷移ラベル編集UI（3案・要選定）

`event[guard] / action` の編集UIを 3案でモック化（`mocks/transition-label-mock.html`）。
最終的に1案を採用する。

### A案: ボトムシート起動（推奨案）
- 遷移をタップ → ボトムシートが開いて 3フィールド + DSLプレビューを表示
- メリット：状態編集と同じパターンで一貫性、入力エリアが広い、プレビュー可
- デメリット：シートが画面の半分を占有して図が見えにくい

### B案: インライン編集
- 遷移ラベルをダブルタップ → ラベル位置にミニ入力欄（タグで現在のフィールドを表示）
- Tab/Enterで event → guard → action へ循環
- メリット：操作が早い、現在地から動かない
- デメリット：ソフトキーボードで隠れる、フィールド切替が直感的でない

### C案: ポップアップ・インスペクタ
- 遷移をタップ → 240px幅のフローティングカードがラベル付近に出現
- 3フィールドを同時表示、OK/Cancelで確定
- メリット：図と同時に見える、3フィールドを並列編集
- デメリット：240px幅が小さめのスマホ（iPhone SE 375px）でぎりぎり

### 比較表

| 項目 | A: シート | B: インライン | C: ポップアップ |
|---|---|---|---|
| 学習コスト | 低（一貫） | 中 | 中 |
| 入力速度 | 中 | 速 | 中 |
| 図の見やすさ | △ | ◎ | ○ |
| 小型端末対応 | ◎ | ◎ | △ |
| プレビュー | ◎ | △ | ○ |
| 連続編集 | △ | ◎ | ○ |
| **推奨** | ★ | | |

実機で `mocks/transition-label-mock.html` を開いて3案を切替比較し、最終決定する。

## 7. プロパティ表示の階層化

「軽いUI」のため、**画面に出る情報量を3段階** で制御：

1. **常時**：ヘッダのファイル名、コマンドバー、FAB
2. **選択時**：セレクションバブル（4ボタンのみ）
3. **要求時**：詳細プロパティのボトムシート（⋯ で展開）

## 8. ファイル/データ

### 8.1 ファイル入出力
- 「Save」で `.sstate` ダウンロード（現行と同じDSLフォーマット）
- 「Open」でファイル選択 → DSL読込 → 図に反映
- Capacitor版は `@capacitor/filesystem` で端末ストレージへ、PWA/ブラウザ版は `<input type=file>` / `<a download>`
- 内部表現は PC版の `parseDSL` / `serializeDSL` を流用（コアロジック共通）

### 8.2 自動保存戦略

2層構成。一定容量を超えたら IndexedDB にフォールバック：

```
┌─ LocalStorage (default) ─┐    超過 (~5MB)    ┌─ IndexedDB ─┐
│  key: ss-mobile.current  │ ────────────────→ │ store: docs │
│  key: ss-mobile.recent[] │   QuotaExceeded   │  - id, name │
└──────────────────────────┘                   │  - dsl, ts  │
                                               └─────────────┘
```

| 項目 | 値 |
|---|---|
| 保存間隔 | 編集後 5秒 debounce（タイマーではなく操作トリガ） |
| 保存対象 | DSL文字列のみ（パース後ASTは保存しない） |
| 履歴本数 | 直近 10件をローテーション（最古を削除） |
| LocalStorage超過判定 | `setItem` の `QuotaExceededError` を捕捉して IndexedDB へ移行 |
| 起動時復元 | `current` を読んで自動ロード、エラー時は空ドキュメントで起動 |
| 移行後の挙動 | LocalStorageに移行済みフラグを置き、以降は IndexedDB を一次ストアとする |

実装は `storage.js` に抽象化し、 `save(key, value)` / `load(key)` インタフェースで隠蔽。

## 9. PWA要件

```json
// manifest.json (抜粋)
{
  "name": "StableState",
  "short_name": "StableState",
  "start_url": "./stablestate-mobile.html",
  "display": "standalone",
  "orientation": "any",
  "theme_color": "#1a1a2e",
  "background_color": "#0f0f23",
  "icons": [...]
}
```

- Service Worker：`stablestate-mobile.html` と関連リソースをキャッシュ
- iOS用：`<meta name="apple-mobile-web-app-capable" content="yes">` 等
- viewport：`viewport-fit=cover` でノッチ対応

## 10. ファイル構成案

```
/
├── stablestate.html              # PC版（既存、変更なし）
├── stablestate-mobile.html       # モバイル版エントリ（新規）
├── manifest.json                 # PWAマニフェスト（新規）
├── sw.js                         # Service Worker（新規）
└── mocks/
    └── mobile-mock.html          # 静的モック（本仕様の検証用、新規）
```

将来的にコアロジック（parseDSL / serializeDSL / レイアウト計算等）を
`core.js` に分離し、両エントリから読み込む構成を検討する。
**v1では分離せず、モバイル版に必要な関数のみコピーまたは抜き出す**。

## 11. v1のリリース範囲

| 項目 | v1 | v2以降 |
|---|---|---|
| 状態の追加/移動/削除 | ✅ | |
| グループの作成と包含 | ✅ | |
| 遷移の追加/編集 | ✅ | |
| プロパティ編集（基本） | ✅ | |
| Undo/Redo | ✅ | |
| ピンチズーム/パン | ✅ | |
| Save/Open (.sstate) | ✅ | |
| Export PNG/SVG | ✅ | |
| PWA対応 | ✅ | |
| Choice擬似状態 | ✅ | |
| Note（注釈） | | ✅ |
| AutoRoute | | ✅ |
| 検索 | | ✅ |
| 状態遷移表閲覧（read-only） | | ✅ |
| Capacitorラッパ | | ✅ |

## 12. 確定事項とアイコン仕様

### 12.1 アイコン

すべて **SVGインライン** で実装する。CSSの `currentColor` で配色制御。

```html
<!-- 例: + アイコン -->
<svg viewBox="0 0 24 24" width="24" height="24" fill="none"
     stroke="currentColor" stroke-width="2" stroke-linecap="round">
  <path d="M12 5v14M5 12h14"/>
</svg>
```

| 用途 | アイコン | viewBox |
|---|---|---|
| メニュー | hamburger | 24×24 |
| その他 | dots-vertical | 24×24 |
| 追加(FAB) | plus | 24×24 |
| Undo/Redo | curved-arrow | 24×24 |
| Fit | crosshair | 24×24 |
| 削除 | trash | 24×24 |
| 改名 | pencil | 24×24 |
| 色 | palette | 24×24 |

`mocks/mobile-mock.html` 内の絵文字を v1 実装で SVG 置換する。

### 12.2 切替方針（再掲）

PC/モバイルの自動切替は行わない。モバイル版は独立アプリ（APK/IPA）として配信。
ブラウザで `stablestate-mobile.html` を直接開けば動作するが、これは開発確認用と位置付ける。

### 12.3 残課題

- [ ] iPad 等大画面タブレットの扱い（横向き時の余白活用、サイドにシートを常駐させるか）
- [ ] アクセシビリティ（VoiceOver / TalkBack 対応の優先度）
- [ ] 多言語化（現状は日本語UI、英語化の要否）

## 13. 関連

- PC版仕様: `stablestate.html`（既存）
- モック: `mocks/mobile-mock.html`
- 関連ADR: ADR-027 (Action choice gen), ADR-028 (Dotpath stateMap)
