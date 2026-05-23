# TABBIN APM パッケージ

このディレクトリは、Codex、Claude Code、Cursor、Gemini、GitHub Copilot
で共通利用するエージェント資産の管理元です。

## 内容

- `instructions/`: APM が `AGENTS.md`、`CLAUDE.md`、`GEMINI.md` などへ
  変換する共通リポジトリガイドライン。
- `skills/`: 対応エージェントへ配布するユーザー管理の skill。
- `prompts/`: 対応クライアントのコマンドとして APM が配布する prompt。
- `hooks/`: 対応クライアントへ配布する hook 定義とスクリプト。
- `harness/`: Orchestrator/Generator/Evaluator ハーネスの schema など、運用補助の
  source-of-truth。
- `SKILLS.md`: ハーネスの頼み方と、配布 skill / agent の用途一覧。

## 使い方

```bash
apm install
apm compile
```

パッケージを変更したら、`apm install` と `apm compile` を再実行してください。
