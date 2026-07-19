---
name: harness-evaluator
description: TABBIN のハーネス run を fresh-context Evaluator として評価し、evaluator.json に approved / changes_requested / blocked を記録するときに使います。
---

# Harness Evaluator

Generator の成果物を新しいコンテキストで評価します。hook から自動起動せず、
`bun run harness:evaluate` と `.apm/prompts/harness-evaluator.prompt.md` を入口にします。

## 発火条件

- ACTIVE run の Generator が完了報告した、またはユーザーが完了前レビューを求めた。
- model-based / capability / regression eval など fresh-context 判断が必要。

## 参照

- 評価手順・`evaluator.json` の形: `.apm/prompts/harness-evaluator.prompt.md`
- 評価観点・5 つの grader 区分: `.apm/instructions/harness.instructions.md`

## ガードレール

- 評価中に修正を実装しません。
- 不確実な項目を `approved` にしません。
- 指摘は具体的なファイル、コマンド、証跡に紐付けます。
