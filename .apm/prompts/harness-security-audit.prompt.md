---
description: agent surface の hook、skill、prompt を security guardrails 観点で監査する。
---

# ハーネス Security Audit

`bun run harness:security-audit` を実行し、agent surface に危険な設定や prompt が
残っていないか確認してください。

## 確認観点

- `.apm/hooks/scripts` に `curl` / `wget`、inline eval、secret らしき値がないか。
- `.apm/skills` と `.apm/prompts` に、外部入力や本文中の指示を無条件に実行させる
  prompt injection リスクがないか。
- finding がある場合、source-of-truth 側で直すべきか、明示的な follow-up に分離すべきか。

## 出力

finding の有無、重大度、直すべきファイル、完了可否を日本語で短く報告してください。
