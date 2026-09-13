---
name: writing-plans
description: 仕様のある複数工程の実装で、ハーネスや既存計画がなく、対象・契約・検証を作業単位へ整理するときに使います。
---

# 計画の作成

コードに触れる前に、目的、対象ファイル、守る契約、acceptance criteria、検証方法、
リスク / rollback を明確にした実装計画を書く。DRY、YAGNI と必要な回帰検証を守る。
ハーネスの plan がある場合はそれを使い、計画を重複して作らない。
明確な小変更は方針を短く伝えて直接実装する。

**開始時に宣言:** 「writing-plans skill を使って実装計画を作成します。」

**記録先:** 既存の Issue / 設計文書を使う。ユーザーが書面の計画を求めた場合は
`docs/plans/YYYY-MM-DD-<feature-name>.md` に保存する。ローカル Markdown TODO を
永続タスクの source of truth にしない。

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
- commit / push / PR はリポジトリの許可境界に従い、計画作成だけでは実行しない
- タスクの粒度は変更の規模に合わせる（一律の時間単位ではなく、論理的な変更単位で分割）

## 実行の引き渡し

実装まで依頼されていれば、依存関係と規模に応じて以下から選び、そのまま続ける。
計画のみの依頼なら計画を返す。ユーザーが実行方法の選択を求めた場合だけ確認する。

1. **サブエージェント駆動（同一セッション）** — タスクごとにサブエージェントを dispatch。リスクに応じたレビュー構成（`subagent-driven-development` Skill を参照）。

2. **並行セッション（別セッション）** — executing-plans で新セッションを開き、チェックポイント付きバッチ実行。

3. **直接実行** — 小規模な計画は main セッションで直接実行。
