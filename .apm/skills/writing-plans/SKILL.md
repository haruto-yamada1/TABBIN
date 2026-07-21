---
name: writing-plans
description: 複数ステップのタスクに仕様や要件があるとき、コードに触れる前に使います。
---

# 計画の作成

コードに触れる前に、目的、対象ファイル、守る契約、acceptance criteria、検証方法、
リスク / rollback を明確にした実装計画を書く。DRY、YAGNI、TDD、頻繁な commit を守る。

**開始時に宣言:** 「writing-plans skill を使って実装計画を作成します。」

**計画の保存先:** `docs/plans/YYYY-MM-DD-<feature-name>.md`

## 計画ドキュメントの構造

```markdown
# [Feature Name] Implementation Plan

**Goal:** [一文で何を作るか]

**Architecture:** [2-3 文でアプローチ]

---

## Task N: [Task Name]

**目的:** [このタスクで何を達成するか]

**対象ファイル候補:**
- Create: `path/to/new-file.ts`
- Modify: `path/to/existing-file.ts`

**守る契約:**
- [既存の型、schema、API contract、architecture boundary]

**Acceptance criteria:**
- [ ] [確認可能な条件]

**検証方法:**
- [実行するテストコマンドと期待結果]

**リスク / rollback:**
- [想定リスクと発生時の対応]
```

## 計画の原則

- 正確なファイルパスを記載する
- 完全な実装コードではなく、対象ファイルと変更の意図を記載する
- 期待出力付きの検証コマンドを記載する
- 関連 skill は名前で参照する
- DRY、YAGNI、TDD、頻繁な commit を守る
- タスクの粒度は変更の規模に合わせる（一律の時間単位ではなく、論理的な変更単位で分割）

## 実行の引き渡し

計画保存後、実行方法を提示:

1. **サブエージェント駆動（同一セッション）** — タスクごとにサブエージェントを dispatch。リスクに応じたレビュー構成（`subagent-driven-development` Skill を参照）。

2. **並行セッション（別セッション）** — executing-plans で新セッションを開き、チェックポイント付きバッチ実行。

3. **直接実行** — 小規模な計画は main セッションで直接実行。
