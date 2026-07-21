---
name: requesting-code-review
description: タスク完了時、大きな機能実装後、merge 前に要件を満たしているか検証するときに使います。
---

# コードレビューの依頼

code-reviewer サブエージェントを dispatch し、問題が連鎖する前に捕捉します。

> **境界:** これは開発中の pre-merge review です。ハーネス run の成果物評価は
> harness-evaluator（fresh-context Evaluator）を使います。

**核心原則:** 早く、頻繁にレビューする。

## レビューを依頼するタイミング

**必須:**
- subagent-driven development の各タスク後
- 大きな機能完了後
- main への merge 前

**任意だが有用:**
- 行き詰まったとき（新鮮な視点）
- リファクタ前（ベースライン確認）
- 複雑な bug 修正後

## 依頼方法

**1. git SHA を取得:**

```bash
BASE_SHA=$(git rev-parse HEAD~1)  # or origin/main
HEAD_SHA=$(git rev-parse HEAD)
```

**2. code-reviewer サブエージェントを dispatch:**

Task tool で code-reviewer タイプを使い、`code-reviewer.md` のテンプレートを埋める。

**プレースホルダー:**
- `{WHAT_WAS_IMPLEMENTED}` - 今作った内容
- `{PLAN_OR_REQUIREMENTS}` - あるべき振る舞い
- `{BASE_SHA}` - 開始 commit
- `{HEAD_SHA}` - 終了 commit
- `{DESCRIPTION}` - 短い要約

**3. フィードバックに対応:**
- Critical issue は即修正
- Important issue は進む前に修正
- Minor issue は後回しメモ
- reviewer が誤りなら理由付きで push back

## 例

```
[Just completed Task 2: Add verification function]

You: Let me request code review before proceeding.

BASE_SHA=$(git log --oneline | grep "Task 1" | head -1 | awk '{print $1}')
HEAD_SHA=$(git rev-parse HEAD)

[Dispatch code-reviewer subagent]
  WHAT_WAS_IMPLEMENTED: Verification and repair functions for conversation index
  PLAN_OR_REQUIREMENTS: Task 2 from docs/plans/deployment-plan.md
  BASE_SHA: a7981ec
  HEAD_SHA: 3df7661
  DESCRIPTION: Added verifyIndex() and repairIndex() with 4 issue types

[Subagent returns]:
  Strengths: Clean architecture, real tests
  Issues:
    Important: Missing progress indicators
    Minor: Magic number (100) for reporting interval
  Assessment: Ready to proceed

You: [Fix progress indicators]
[Continue to Task 3]
```

## ワークフロー連携

**Subagent-Driven Development:**
- 各タスク後にレビュー
- 問題が複合化する前に捕捉
- 次タスクへ進む前に修正

**Executing Plans:**
- 各バッチ（3 タスク）後にレビュー
- フィードバックを反映して続行

**アドホック開発:**
- merge 前にレビュー
- 行き詰まったときにレビュー

## レッドフラグ

**絶対にやらない:**
- 「単純だから」レビューを省略
- Critical issue を無視
- Important issue 未修正のまま進む
- 妥当な技術的フィードバックと議論

**reviewer が誤っている場合:**
- 技術的理由で push back
- 動作を示す code/test を提示
- 必要なら clarification を依頼

テンプレート: requesting-code-review/code-reviewer.md
