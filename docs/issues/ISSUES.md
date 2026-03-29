# Issues

| ID | 種別 | 優先度 | ステータス | タイトル | 詳細 |
|----|------|--------|-----------|---------|------|
| ISSUE-001 | 不具合修正 | HIGH | Open | VSCode拡張でCtrl+Z/Y/C/X/Vが動作しない | [ISSUE-001.md](ISSUE-001.md) |
| ISSUE-002 | 不具合修正 | HIGH | Open | ラベル入力中にプロパティパネルのフォーカスが喪失する | [ISSUE-002.md](ISSUE-002.md) |
| ISSUE-003 | 不具合修正 | MEDIUM | Open | 接続面選択アルゴリズムが対角配置・サイズ差で誤動作する | [ISSUE-003.md](ISSUE-003.md) |
| ISSUE-004 | 改善 | MEDIUM | Closed | ドラッグ/リサイズ操作にRAF最適化が未適用 | [ISSUE-004.md](ISSUE-004.md) |
| ISSUE-005 | 機能追加 | MEDIUM | Closed | 矢印キー移動・接続管理パネルが未実装 | [ISSUE-005.md](ISSUE-005.md) |
| ISSUE-006 | 改善 | MEDIUM | Open | スナップガイドの複数候補競合および大規模図での性能劣化リスク | [ISSUE-006.md](ISSUE-006.md) |
| ISSUE-007 | 不具合修正 | MEDIUM | Open | 状態遷移表が直交領域（orthogonal=true）有効時に生成不可 | - |
| ISSUE-008 | 機能追加 | HIGH | Closed | 検索/フィルタ機能が未実装 | - |
| ISSUE-009 | 機能追加 | HIGH | Closed | 遷移線幅カスタマイズが未実装 | - |
| ISSUE-010 | 機能追加 | MEDIUM | Closed | 遷移線スタイル（実線/破線）が未実装 | - |
| ISSUE-011 | 機能追加 | MEDIUM | Closed | 遷移線カラー設定が未実装 | - |
| ISSUE-012 | 機能追加 | MEDIUM | Closed | PlantUMLエクスポートが未実装 | - |
| ISSUE-013 | 改善 | LOW | Closed | ID自動補正機能（labelToId・ID補正ボタン）が未実装 | - |
| ISSUE-014 | 改善 | LOW | Closed | ポート間隔が固定値で接続数に応じた動的調整が未実装 | - |
| ISSUE-015 | 改善 | LOW | Open | 注釈ボタンが空データでも初期アクティブ表示される | - |
| ISSUE-016 | 機能追加 | LOW | Closed | ハイライトモード（Hキー、孤立ステート検出）が未実装 | - |
| ISSUE-017 | 機能追加 | LOW | Closed | @includeディレクティブが未実装 | - |
| ISSUE-018 | 機能追加 | LOW | Closed | Git Visual Diff（VSCode拡張）が未実装 | - |
| ISSUE-019 | 機能追加 | LOW | Closed | MCPサーバーが未実装 | - |
| ISSUE-020 | 改善 | LOW | Open | bump-version.sh未実装・HTMLバージョン表記が不整合 | - |
| ISSUE-021 | 改善 | LOW | Open | .gitignoreが未作成（vsix/node_modules誤コミットリスク） | - |
| ISSUE-022 | 改善 | LOW | Open | ストレステスト用サンプルファイルが未作成 | - |
| ISSUE-023 | 不具合修正 | LOW | Open | DSLパーサーが3階層以上のネスト構造で予期しない動作の可能性 | - |
| ISSUE-024 | 不具合修正 | LOW | Open | PNGエクスポートがオフライン環境でフォントフォールバック | - |
| ISSUE-025 | 不具合修正 | LOW | Open | copyPNGがHTTPS/localhost以外のブラウザ環境で動作しない | - |
| ISSUE-026 | 不具合修正 | LOW | Open | シンタックスハイライトがコメント行内のキーワードもハイライトする | - |
| ISSUE-027 | 機能追加 | LOW | Open | プロパティ値に空白を含む文字列が未対応 | - |
| ISSUE-028 | 不具合修正 | MEDIUM | Open | 遷移ラベルが親ブロック外にはみ出す（ECN-039） | - |
| ISSUE-029 | 不具合修正 | MEDIUM | Closed | 遷移表セル編集時にdouble blurで入力値が消失する（ECN-040関連） | - |
| ISSUE-030 | 不具合修正 | HIGH | Closed | ブロック選択バグ（選択不可・別ブロック選択） — DOM方式に移行で解決 | - |
| ISSUE-031 | 機能追加 | HIGH | Closed | Ctrl+X切り取り・Ctrl+Shift+Zリドゥが未実装 | - |
| ISSUE-032 | 機能追加 | HIGH | Closed | 複数選択時のバッチ操作（位置/サイズ/色/スタイル）が未実装 | - |
| ISSUE-033 | 機能追加 | HIGH | Closed | 2要素選択時の遷移管理UI（作成/反転/色/幅/スタイル/削除） | - |
| ISSUE-034 | 機能追加 | MEDIUM | Closed | 遷移作成時のイベント名入力・複数遷移対応 | - |
| ISSUE-035 | 不具合修正 | HIGH | Closed | 子状態の遷移がbare IDで記録される（ドットパス未対応） | - |
| ISSUE-036 | 不具合修正 | MEDIUM | Closed | flipTransが同ペア間の無関係な遷移を巻き込む | - |
| ISSUE-037 | 不具合修正 | MEDIUM | Closed | 同方向の複数遷移でU字ルートの折れ曲がり位置が重なる | - |
| ISSUE-038 | 不具合修正 | MEDIUM | Closed | 矢印マーカーが固定色（遷移ごとの色が先端に反映されない） | - |
| ISSUE-039 | 機能追加 | MEDIUM | Closed | 状態遷移表に複合状態のself列を追加 | - |
| ISSUE-040 | 機能追加 | MEDIUM | Closed | 状態遷移表にROOT仮想列を追加 | - |
| ISSUE-041 | 機能追加 | MEDIUM | Closed | テーブルセルクリックでプロパティパネルに統一編集フォーム表示 | - |
| ISSUE-042 | 機能追加 | MEDIUM | Closed | @internal遷移（アクション専用、図に描画なし、空なら自動削除） | - |
| ISSUE-043 | 機能追加 | LOW | Closed | 遷移先のプルダウン選択 | - |
| ISSUE-044 | 不具合修正 | MEDIUM | Closed | fixIdsが擬似状態（initial/final等）を補正しない | - |
| ISSUE-045 | 不具合修正 | MEDIUM | Closed | 子状態の最終削除時に親の空{\\}が残る | - |
| ISSUE-046 | 機能追加 | LOW | Closed | 非複合状態の自動複合化（子要素追加時に{\\}を付与） | - |
| ISSUE-047 | 機能追加 | LOW | Closed | キャンバスサイズのプロパティパネル編集 | - |
| ISSUE-048 | 不具合修正 | LOW | Open | 状態遷移表がブラウザズーム率によって崩れる（colgroup同期の丸め誤差） | - |
| ISSUE-049 | 不具合修正 | LOW | Open | autoRoute()がrenderSVG内スコープの関数を参照しReferenceError | - |
