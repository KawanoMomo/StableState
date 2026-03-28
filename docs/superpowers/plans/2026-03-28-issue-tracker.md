# ローカルIssueトラッカー導入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** StableStateリポジトリに汎用ローカルissueトラッカー（docs/issues/）を導入し、既知の課題を登録する

**Architecture:** `docs/issues/ISSUES.md` にサマリーテーブル、詳細が必要なissueのみ `ISSUE-XXX.md` として個別ファイル化するハイブリッド方式

**Tech Stack:** Markdown

---

### Task 1: ISSUES.md サマリーテーブル作成

**Files:**
- Create: `docs/issues/ISSUES.md`

- [ ] **Step 1: ISSUES.md を作成**

```markdown
# Issues

| ID | 種別 | 優先度 | ステータス | タイトル | 詳細 |
|----|------|--------|-----------|---------|------|
```

- [ ] **Step 2: コミット**

```bash
git add docs/issues/ISSUES.md
git commit -m "docs: add local issue tracker (ISSUES.md)"
```

---

### Task 2: 既知のissueを洗い出して登録

**Files:**
- Modify: `docs/issues/ISSUES.md`

- [ ] **Step 1: CLAUDE.mdの既知の制限事項、ECN分析、コードを調査**

以下を確認してissue候補を収集:
- `CLAUDE.md` の「既知の制限事項」セクション
- `docs/ecn-analysis/` の未対応・部分実装の分析結果
- `stablestate.html` のTODO/FIXMEコメント

- [ ] **Step 2: 収集したissueをISSUES.mdのテーブルに追記**

各issueに ID・種別・優先度・ステータス・タイトルを付与して登録。詳細欄は全て `-` で開始。

- [ ] **Step 3: 詳細説明が必要なissueがあれば個別ファイルを作成**

`docs/issues/ISSUE-XXX.md` を設計仕様書のテンプレートに従って作成し、ISSUES.mdの詳細欄をリンクに更新。

- [ ] **Step 4: コミット**

```bash
git add docs/issues/
git commit -m "docs: register known issues"
```
