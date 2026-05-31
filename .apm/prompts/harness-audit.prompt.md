---
description: 完了前にハーネス run、変更ファイル、証跡、follow-up 候補を監査する。
---

# ハーネス監査

`bun run harness:audit`、`bun run harness:validate`、
`bun run harness:surface-audit`、必要に応じて
`bun run harness:security-audit` と `bun run harness:repo-status` を実行し、
完了可能か確認してください。

## 確認観点

- schema が通るか。
- Orchestrator の plan と実際の変更ファイルが対応しているか。
- Generator の検証証跡が十分か。
- Evaluator が必要な作業で `evaluator.json` がない、または `approved` でない状態になっていないか。
- `changes_requested` / `blocked` の再発防止候補が follow-up issue または `.apm/instructions` に残すべきものか。
- score 付き deterministic scorecard の `overall_score`、failed category、
  Top 3 actions が妥当か。
- agent surface security finding が残っている場合、完了前に直すべきものか、
  明示的な follow-up に分離できるものか。

## 出力

完了可否、足りない証跡、次に実行すべきコマンドを簡潔に報告してください。
