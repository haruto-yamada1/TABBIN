---
name: caveman-stats
disable-model-invocation: true
description: >
  Claude Code 専用。Show real token usage and estimated savings for the current session.
  Reads directly from the Claude Code session log — no AI estimation. 他クライアント
  (Codex / Cursor / Gemini / Copilot) では動作しないため読み込んでも実行しないこと。
  Triggers on /caveman-stats. Output is injected by the mode-tracker hook;
  the model itself does not compute the numbers.
metadata:
  surfaces:
    - claude-code
---

This skill is delivered by `hooks/caveman-stats.js` (read by `hooks/caveman-mode-tracker.js` on `/caveman-stats`). The model does not need to do anything when this skill fires — the hook returns `decision: "block"` with the formatted stats as the reason. The user sees the numbers immediately.

Claude Code 以外のクライアントでこの skill が読み込まれた場合は、session log が存在しないため何も出力せず終了してください。
