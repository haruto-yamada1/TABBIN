---
name: harness-optimizer
description: TABBIN の Evaluator 指摘や governance event から learning.json を作り、必要な follow-up issue または .apm/instructions 追記候補を整理するときに使います。
---

# Harness Optimizer

Evaluator の指摘、`governance.jsonl`、surface audit の結果から再発防止候補を抽出します。
自動で follow-up issue や `.apm/instructions` へ反映せず、候補を `learning.json` に残します。

## 手順

1. `bun run harness:audit` で現在の指摘、検証証跡、follow-up 候補を確認します。
2. `bun run harness:learn` で `learning.json` を更新します。
3. 必要に応じて `bun run harness:surface-audit` で repo surface の deterministic scorecard を確認します。
4. 永続化が必要な候補だけ、ユーザー判断または後続作業で follow-up issue か `.apm/instructions`
   に反映します。

## ガードレール

- 学習候補を自動で source-of-truth へ書き込みません。
- 一時的な失敗と再発防止すべき構造問題を分けます。
- 既存 hook に repo-wide `bun run quality` を追加しません。
