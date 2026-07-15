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
bun run apm:sync
bun run apm:check
```

`.apm/` や `apm.yml` を変更したら `bun run apm:sync` で全 configured target を同期し、
`bun run apm:check` で tracked 生成物と scratch 再生成結果の一致を確認してください。raw の
`apm install` / `apm compile` は、隔離した scratch で原因を切り分ける場合だけ使います。
