---
description: ACTIVE run の状態、次アクション、証跡を確認する。
---

# ハーネス状態確認

`bun run harness:status` を実行し、ACTIVE run の状態を確認してください。
必要なら `bun run harness:status -- --write` で `.agents/harness/status.md` に
portable handoff を書き出してください。

## 確認観点

- Orchestrator、Generator、Evaluator、Decision の状態。
- 未完了の plan、未解決 findings、次アクション。
- 検証証跡が現在の変更内容に対応しているか。

## 出力

run id、現在の状態、次アクション、必要な follow-up だけを日本語で短く報告してください。
