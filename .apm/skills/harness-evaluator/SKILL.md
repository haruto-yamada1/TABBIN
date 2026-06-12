---
name: harness-evaluator
description: TABBIN のハーネス run を fresh-context Evaluator として評価し、evaluator.json に approved / changes_requested / blocked を記録するときに使います。
---

# Harness Evaluator

Generator の成果物を新しいコンテキストで評価します。hook から自動起動せず、
`bun run harness:evaluate` と `.apm/prompts/harness-evaluator.prompt.md` を入口にします。

## 手順

1. `bun run harness:status` と `bun run harness:validate` を確認します。
2. ユーザー依頼、Planner の plan、Generator の checkpoint、実装 diff、検証証跡を対応付けます。
3. capability eval、regression eval、code-based grader、model-based grader、human grader の
   どれが必要だったかを明示します。
4. `.apm` source-of-truth と generated artifacts の drift を確認します。
5. `.agents/harness/runs/<run-id>/evaluator.json` に `approved`、`changes_requested`、
   `blocked` のいずれかを書きます。
6. 書き込み後に `bun run harness:validate` を実行します。

## ガードレール

- 評価中に修正を実装しません。
- 不確実な項目を `approved` にしません。
- 指摘は具体的なファイル、コマンド、証跡に紐付けます。
