---
description: Evaluator の指摘や blocked 状態から、再発防止候補を抽出する。
---

# ハーネス learn

ACTIVE run の `evaluator.json`、`decision.json`、`governance.jsonl`、`events.jsonl` を確認し、
再発防止として残すべき候補を抽出してください。

## 方針

- 自動で Beads issue や `.apm/instructions` に追記しないでください。
- 繰り返し起きそうな問題だけ候補にしてください。
- 一時的な失敗、環境依存、既に修正済みの単発ミスは候補から外してください。

## 出力

候補ごとに、残す場所、理由、最初に触る source を日本語で短く示してください。
