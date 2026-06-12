---
description: Orchestrator の plan とサブエージェント分担の進捗を確認する。
---

# ハーネス loop status

ACTIVE run の `orchestrator.json` を確認し、plan と agents の進捗を整理してください。

## 確認観点

- `plan[].status` が現実の作業状態と一致しているか。
- `agents[].status` が未更新のまま残っていないか。
- blocking task をメインセッションで処理すべきか、並列 Worker に渡せるか。
- Evaluator を起動する条件が揃っているか。

## 出力

現在の loop 状態、詰まり、次の担当者、次アクションを短く報告してください。
