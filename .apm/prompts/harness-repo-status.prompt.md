---
description: ACTIVE run がない状態でもハーネス readiness と次アクションを確認する。
---

# ハーネス Repo Status

`bun run harness:repo-status` を実行し、ACTIVE run の有無に関係なく repo readiness を
確認してください。

## 確認観点

- ACTIVE run がある場合は schema と次アクションが妥当か。
- ACTIVE run がない場合でも、surface score、security finding 数、Top actions から
  repo-level の不足が分かるか。
- 完了前に `harness:surface-audit`、`harness:security-audit`、
  `harness:validate` のどれを追加で実行すべきか。

## 出力

readiness、overall score、security finding 数、次に実行すべきコマンドを簡潔に報告してください。
