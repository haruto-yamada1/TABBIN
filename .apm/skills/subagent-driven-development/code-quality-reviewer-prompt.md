# コード品質レビュアー プロンプトテンプレート

コード品質レビュアーサブエージェントを dispatch するときにこのテンプレートを使います。

**目的:** 実装がよく作られているか（クリーン、テスト済み、保守可能）を検証する

**spec 準拠レビューが通った後にのみ dispatch すること。**

```
Task tool (code-reviewer):
  Use template at requesting-code-review/code-reviewer.md

  WHAT_WAS_IMPLEMENTED: [from implementer's report]
  PLAN_OR_REQUIREMENTS: Task N from [plan-file]
  BASE_SHA: [commit before task]
  HEAD_SHA: [current commit]
  DESCRIPTION: [task summary]
```

**コードレビュアーの返答:** Strengths、Issues (Critical/Important/Minor)、Assessment
