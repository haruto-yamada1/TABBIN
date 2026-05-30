---
name: writing-plans
description: 複数ステップのタスクに仕様や要件があるとき、コードに触れる前に使います。
---

# 計画の作成

## 概要

コードベースの文脈ゼロ、好みも疑わしいエンジニアを想定して、包括的な実装計画を書く。各タスクで触るファイル、コード、確認すべきテスト・ドキュメント、検証方法をすべて記載。計画全体を bite-sized タスクに分割。DRY。YAGNI。TDD。頻繁な commit。

熟練開発者だが、ツールセットや問題領域はほぼ知らないと想定。良いテスト設計もあまり知らないと想定。

**開始時に宣言:** 「writing-plans skill を使って実装計画を作成します。」

**コンテキスト:** brainstorming skill が作成した専用 worktree で実行する想定。

**計画の保存先:** `docs/plans/YYYY-MM-DD-<feature-name>.md`

## bite-sized タスクの粒度

**各ステップは 1 アクション（2〜5 分）:**
- 「失敗するテストを書く」— 1 ステップ
- 「失敗することを確認するために実行」— 1 ステップ
- 「テストを通す最小コードを実装」— 1 ステップ
- 「テストを実行して通ることを確認」— 1 ステップ
- 「commit」— 1 ステップ

## 計画ドキュメントのヘッダー

**すべての計画は次のヘッダーで始める:**

```markdown
# [Feature Name] Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

---
```

## タスク構造

````markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

**Step 1: Write the failing test**

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with "function not defined"

**Step 3: Write minimal implementation**

```python
def function(input):
    return expected
```

**Step 4: Run test to verify it passes**

Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```
````

## 覚えておくこと
- 常に正確なファイルパス
- 計画に完全なコード（「バリデーションを追加」ではない）
- 期待出力付きの正確なコマンド
- 関連 skill は @ 構文で参照
- DRY、YAGNI、TDD、頻繁な commit

## 実行の引き渡し

計画保存後、実行方法を提示:

**「計画を `docs/plans/<filename>.md` に保存しました。実行方法は 2 つ:**

**1. サブエージェント駆動（このセッション）** — タスクごとに新しいサブエージェントを dispatch、タスク間でレビュー、高速イテレーション

**2. 並行セッション（別セッション）** — executing-plans で新セッションを開き、チェックポイント付きバッチ実行

**どちらにしますか？」**

**サブエージェント駆動を選んだ場合:**
- **必須 SUB-SKILL:** superpowers:subagent-driven-development を使う
- このセッションで継続
- タスクごとに新しいサブエージェント + コードレビュー

**並行セッションを選んだ場合:**
- worktree で新セッションを開くよう案内
- **必須 SUB-SKILL:** 新セッションでは superpowers:executing-plans を使う
