---
description: 完了前にハーネス run、変更ファイル、証跡、follow-up 候補を監査する。
---

# ハーネス監査

`bun run harness:audit` と `bun run harness:validate` を実行し、完了可能か確認してください。

## 確認観点

- schema が通るか。
- Orchestrator の plan と実際の変更ファイルが対応しているか。
- Generator の検証証跡が十分か。
- Evaluator が必要な作業で `evaluator.json` がない、または `approved` でない状態になっていないか。
- `changes_requested` / `blocked` の再発防止候補が Beads または `.apm/instructions` に残すべきものか。

## 出力

完了可否、足りない証跡、次に実行すべきコマンドを簡潔に報告してください。
