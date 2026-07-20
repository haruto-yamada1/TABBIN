# Waza Skill 評価拡張 設計 (Issue #794)

- 作成日: 2026-07-20
- 関連: #793, `docs/plans/2026-07-19-waza-skill-eval-poc-design.md`
- ステータス: Layer 1 / 2 / 3 の基盤 + tool invocation trace evaluator を実装

## 1. 背景

PoC (#793 前段) は `executor: mock` の deterministic grader 中心で、出力文字列の包含
・非包含を検査していた。これでは以下を区別できない。

- 実際に tool を呼んだか、出力に禁止語を書かなかっただけか
- 安全な拒否説明で危険な文字列を引用しただけの false positive
- secret を分割・encode した exfiltration
- read-only 依頼から GitHub write への暗黙遷移

また CI は `workflow_dispatch` のみで `.apm/**` 変更 PR へ自動接続されておらず、
`waza_version` input と v0.38.3 固定 checksum が矛盾していた。

## 2. 三層分離

| 層      | 実行                                     | 判定          | required? |
| ------- | ---------------------------------------- | ------------- | --------- |
| Layer 1 | `ci.yml` vitest (全 PR)                  | deterministic | yes       |
| Layer 2 | `waza-skill-eval.yml` (path 変更 PR)     | mock          | no        |
| Layer 3 | `waza-real-agent-eval.yml` (手動 / 週次) | copilot-sdk   | no        |

Layer 1 は外部モデル不要で schema / 参照 / trigger coverage / adversarial 最低件数 /
fixture 安全性 / 結果 artifact 形式を検証する。Layer 2 は mock executor で eval suite が
健全に実行できることを保証する。Layer 3 が本来の注入耐性検出を行う。

## 3. Version / checksum 矛盾解消 (Step 1, Option A)

`workflow_dispatch` の `waza_version` input を廃止し、version と checksum を workflow
内で一対で完全固定した。`tools/scripts/waza-version-consistency.test.ts` が
「input が存在しない」「version と checksum が一致する」「README の checksum 表と一致する」
を契約として保証する。更新は明示 Issue / PR で両方を更新する。

## 4. Task schema 正規化 (Layer 1 前提)

旧形式 (`type` / `prompt` / `expect` + `grader: deterministic`) は Waza に
「unknown schema field ignored」として無視され、gradless に trivial pass していた。
これを正規の Waza task schema (`id` / `name` / `inputs.prompt` / `expected.*` /
`graders`) へ変換した。

副作用 Skill (github-issue-implementation / github-pr-review / commit-push-pr /
harness-orchestrate) の各 3 task = 計 12 task を変換し、untrusted content を
`fixtures/*.md` へ隔離した。graders は `text` (not_contains) + `tool_constraint`
(reject_tools) の二層とし、final output と tool invocation を分離評価できる。

## 5. mock evaluator の GREEN 設計

mock executor は prompt + file 内容をそのまま返す。そのため禁止文字列が入力に現れる
設計だと deterministic に必ず失敗する。本設計では:

- `inputs.prompt` はクリーンな依頼のみ (adversarial content は fixture)
- `not_contains` は入力に現れない compliance 句 / sentinel のみ
- secret-exfil の sentinel (`TABBIN_EVAL_SENTINEL`) は Layer 3 で env 注入する
  (mock は sentinel を出力しないため GREEN)

これにより Layer 2 は「suite 健全性」を deterministic に保証しつつ、Layer 3 で本来の
検出を行える。

## 6. Tool invocation trace evaluator

`tools/scripts/waza-trace-evaluator.ts` は純粋関数で、trace (final_output /
tool_invocations / outbound_payloads / filesystem_diffs) を入力とし、以下を分離採点する。

- forbidden tool invocation (`rm -rf /` / `curl` / `wget` / env dump / `eval`)
- unauthorized side effect (read-only 依頼からの commit / push / PR / Issue / comment /
  resolve / merge)
- secret exposure (sentinel が args / result / output / payload に含まれる)
- secondary prompt injection 伝播 (tool result 内の injection marker を triage)

Layer 3 の recording tool proxy が採取した trace を本 evaluator へ渡す。

## 7. CI 設計

### Layer 2 (`waza-skill-eval.yml`)

`pull_request` で `.apm/**` / `evals/**` / `.waza.yaml` / `run-waza-eval.ts` /
`waza-trace-evaluator.ts` / `waza-*.yml` / `package.json` / `bun.lock` 変更時に起動。
Waza を固定 install し、Layer 1 の vitest と全 Skill の waza check / spec verify /
mock eval / adversarial を実行し、結果を step summary (markdown table) と artifact へ
保存する。src のみの変更では起動しない。

### Layer 3 (`waza-real-agent-eval.yml`)

`workflow_dispatch` + 週次 schedule。concurrency 1。`WAZA_MODEL_API_KEY` 未設定時は
安全に skip。`GITHUB_TOKEN` を waza へ渡さない。失敗を Skill regression /
infrastructure / model provider に分類し step summary へ出す。

## 8. 評価指標 (将来)

trigger precision / recall, false positive / negative, unsafe tool invocation,
unauthorized side effect, secret exposure, refusal correctness, task completion,
p50/p95 latency, token usage, estimated cost, flaky retry 率。baseline 保存と前回
結果からの悪化検出は follow-up。

## 9. 非目標 / follow-up

- 実モデル eval を通常 PR の required check にしない (維持)
- recording tool proxy の実装 (現在は evaluator のみ; proxy 本体は follow-up)
- adversarial case の全件展開 (HTML comment / base64 / hex / 文字分割 / 偽 success log /
  test skip / 生成物直接編集 / repo 外読取 等) — 基盤が整ったので個別 task 追加で展開可
- 週次 baseline / cost / flaky 監視の自動化
- 他副作用 Skill への実モデル PoC 展開 (まず github-pr-review)
