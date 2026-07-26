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

## instructions の並び順と優先度

`instructions/` 配下は次の順序で読み込まれます。番号付きファイルが先で、番号なしの
`harness.instructions.md` / `repository-guidelines.instructions.md` は全般ガイドとして
番号付きの後に来ます。競合する規則がある場合は番号の小さい順（00 → 01 → 02 → 03）を
優先し、その後に harness、最後に repository-guidelines を適用します。

1. `00-context-mode.instructions.md` — context-mode ルーティング規則（最優先）
2. `01-rtk.instructions.md` — RTK 圧縮ラッパーの利用規則
3. `02-vitest-local-development.instructions.md` — Vitest ローカル実行ガイド
4. `03-github-pr-review.instructions.md` — PR review 対応時の skill routing
5. `harness.instructions.md` — Orchestrator/Planner/Generator/Evaluator ハーネス規約
6. `repository-guidelines.instructions.md` — リポジトリ全体のガイドライン

新規 instruction を追加するときは、優先度に応じて `04-` / `05-` の番号プレフィックスを
付けるか、全般ガイドとして番号なしにするかを意識的に選んでください。番号なしは
「常に参照される全般ガイド」の意味で使います。

## メンテナンス運用

各 instruction の frontmatter の `description` にはトリガー条件を明記し、
LLM がルーティング判断をしやすくしてください。実測時間やテスト本数など環境・時期で
変わる数値は、最終計測日を本文中に併記してください（02-vitest の実測時間が該当します）。

最終同期: APM 0.18.0 / 2026-07-19
