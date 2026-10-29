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
番号付きの後に来ます。競合する規則がある場合は番号の小さい順（02 → 03）を
優先し、その後に harness、最後に repository-guidelines を適用します。

1. `02-vitest-local-development.instructions.md` — Vitest ローカル実行ガイド
2. `03-github-pr-review.instructions.md` — PR review 対応時の skill routing
3. `harness.instructions.md` — Orchestrator/Planner/Generator/Evaluator ハーネス規約
4. `repository-guidelines.instructions.md` — リポジトリ全体のガイドライン

新規 instruction を追加するときは、優先度に応じて `04-` / `05-` の番号プレフィックスを
付けるか、全般ガイドとして番号なしにするかを意識的に選んでください。番号なしは
「常に参照される全般ガイド」の意味で使います。

## Codex の context 運用

採用確認済み端末の Codex は Headroom の既存 proxy 経路と透過 cache を利用し、
通常の tool 選択は native tools を使います。未導入端末でも native tools で続けます。
導入条件と実機検証は
[Codex context optimization runbook](../docs/maintenance/codex-context-optimization.md)
を参照してください。APM 同期は Headroom や context-mode の導入を行いません。

- [`rtk`](skills/rtk/SKILL.md): 長い test / lint / build ログの圧縮。短い観測、厳密な
  diff、少量 JSON は native tools または `rtk proxy` で原文を保持します。
- [`context-mode`](skills/context-mode/SKILL.md): 大量集計・横断検索・長い履歴の復旧時に
  明示的に選びます。未配備なら対象を絞った native tools で続けます。

これらは用途別 Skill です。全 shell に RTK や context-mode を要求しません。
Claude Code など他 client は各環境の routing と既存 hook に従い、Codex の方針から
hook を無効化しません。取得・編集・publish の許可境界は各環境の規則を維持します。

## メンテナンス運用

各 instruction の frontmatter の `description` にはトリガー条件を明記し、
LLM がルーティング判断をしやすくしてください。実測時間やテスト本数など環境・時期で
変わる数値は、最終計測日を本文中に併記してください（02-vitest の実測時間が該当します）。

最終同期: APM 0.18.0 / 2026-07-19
