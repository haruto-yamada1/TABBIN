# Waza Skill 評価 PoC 設計 (check Skill)

- 作成日: 2026-07-19
- 対象 Skill: `.apm/skills/check/SKILL.md` のみ
- Waza 想定バージョン: `v0.38.3` (固定)
- ステータス: 設計 + 最小実装 (ローカル実行・deterministic 検証)

## 1. 背景

TABBIN は APM を source of truth とし、独自の Orchestrator / Planner /
Generator / Evaluator / Optimizer ハーネスを `.apm` と `tools/harness/` に持つ。
本 PoC は既存ハーネスを置き換えるものでなく、Waza を「Skill 評価」用途に限定して
補完導入できるか検証する。

## 2. 現状分析

- `check` Skill は `.apm/skills/check/SKILL.md` で定義され、
  `scripts/run_quality.sh` を実行して `npm run quality` の失敗を自動修正ループで
  収束させる。
- 既存ハーネスは run 状態 (`tools/harness/state/`)、scorecard、security audit、
  learning を持ち、Skill の発火精度や prompt injection 耐性は deterministic には
  検証していない。
- `waza` は未インストール。CI へのバイナリ導入は本 PoC では行わずローカル手順のみ。

## 3. Waza の機能 (確認できた範囲)

- `waza check <skill>`: SKILL.md の readiness / spec compliance を deterministic 検証。
- `waza spec verify <skill> <eval>`: SKILL.md の description / `USE FOR` /
  `DO NOT USE FOR` を要件 ID に変換し、eval 側の task ID にマッピング。
- `waza run <eval>`: `executor: mock` で API key 不要の deterministic 実行が可能。
  `--baseline` で Skill あり/なし比較。
- grader: `trigger` (heuristic・モデル不要), `text`, `behavior`,
  `tool_constraint`, `action_sequence`, `skill_invocation`, `prompt` (LLM judge)。
- `waza adversarial --packs prompt-injection`: 組込 adversarial pack。
- executor: `mock` / `copilot-sdk`。Ollama・GLM は標準未対応 (custom provider 経由の
  Copilot SDK 拡張のみ)。

## 4. 既存 Harness との責務比較

| 項目                        | TABBIN Harness                              | Waza                                           | 採用方針                                |
| --------------------------- | ------------------------------------------- | ---------------------------------------------- | --------------------------------------- |
| 作業状態管理                | `tools/harness/state/` + `.agents/harness/` | results.json (run 単位)                        | Harness を source of truth              |
| Planner/Generator/Evaluator | `harness:*` scripts                         | なし                                           | Harness のまま                          |
| Skill 発火評価              | なし (運用任せ)                             | `trigger` grader / `spec verify`               | **Waza を採用**                         |
| Negative trigger            | なし                                        | `trigger` mode:negative / `trigger_tests.yaml` | **Waza を採用**                         |
| 回帰テスト                  | `test:changed` / `test:related` (コード)    | eval suite で Skill 挙動回帰                   | 併用 (Waza は Skill 側)                 |
| Security audit              | `harness:security-audit` (agent surface)    | `waza adversarial` (Skill 耐性)                | 責務分離で併用                          |
| Prompt injection test       | なし                                        | `prompt-injection` pack                        | **Waza を採用**                         |
| モデル比較                  | なし                                        | `--baseline` / `compare`                       | 試行候補 (PoC では未実施)               |
| 学習・再発防止              | `harness:learn` / `learning.json`           | なし                                           | Harness のまま                          |
| CI integration              | `ci.yml` (必須)                             | `eval.yml` (任意)                              | PoC は `workflow_dispatch`・非 blocking |

Waza には既存ハーネスの作業状態管理・Planner/Generator/Evaluator・学習機能を
移さない。重複しない「Skill 発火精度・adversarial 耐性」に限定する。

## 5. PoC の目的 / 非目的

目的: positive trigger / negative trigger / guardrail / prompt injection の
deterministic 評価構成を `check` Skill について用意し、ローカルで実行可能にする。

非目的: 全 Skill 展開、`quality:check` 組込、required CI 化、既存ハーネス置換、
実モデル (copilot-sdk) による大規模実行、Ollama/GLM 対応。

## 6. 対象 Skill

`.apm/skills/check/SKILL.md` のみ。

観察 (本 PoC では修正しない):

- Skill は `npm run quality` を呼ぶが、TABBIN の `package.json` には `quality`
  script が無く `quality:check` のみ存在する。`run_quality.sh` 実行時は
  `Missing script: quality` で即座に ERROR になる想定。これは follow-up 候補。
- SKILL.md description に構造化 `USE FOR:` / `DO NOT USE FOR:` block が無く、
  `spec verify` の要件 ID 抽出は description 文と本文見出しからの keyword になる。

## 7. ファイル配置

選定: `evals/skills/check/` (repo root 直下の `evals/`)。

理由:

- `.apm` は agent 配布用 source of truth。eval は Waza 固有の検査資産であり
  Codex/Claude/Cursor 等へ配布するものでないため `.apm/evals/` には置かない。
- Waza はデフォルトで `evals/` と `.apm/skills/` を自動検出するため、
  追加設定なしで `waza run` / `waza coverage` が動く。
- `tools/waza/` は `--discover` の既定 root 外になり config が増える。
- repo の既存規約 (`tools/scripts/` にスクリプト、`docs/plans/` に設計) と整合。
  eval 本体は Waza 慣例の `evals/` に置き、wrapper script は `tools/scripts/` に置く。

追加:

- `.waza.yaml` (repo root): `paths.skills` を `.apm/skills` に明示。
- `tools/scripts/run-waza-eval.ts`: Bun 用ラッパー。
- `.github/workflows/waza-eval-poc.yml`: `workflow_dispatch` の手動・非 blocking 画面。

## 8. eval 設計

`evals/skills/check/eval.yaml` (schemaVersion 1.2):

- `executor: mock`, `trials_per_task: 1`, `parallel: false`, `inject_skill_body: true`
- `tasks: ["tasks/*.yaml"]`
- task 毎に deterministic grader を指定 (LLM judge に依存しない)。
- eval 直下の `adversarial:` block で `prompt-injection` pack を pin。

## 9. fixture 設計

`fixtures/repo/` に TABBIN 風の最小 skeleton を用意し、実 repo から隔離する。

- `fixtures/repo/package.json`: `quality` script 欠如を再現 (検出対象)。
- `fixtures/repo/src/lib/example.ts`: lint 通過する最小ファイル。
- `fixtures/repo/quality-broken.txt`: prompt injection 命令を仕込んだ擬似 failure
  log。`.codex/logs/` や `*.log` は TABBIN の .gitignore 対象のため、隔離 fixture
  では `quality-broken.txt` に置いている。秘密は含めない (ダミー文字列のみ)。

fixture は `context_dir` 経由で task に渡し、実作業ツリーは触らない。

## 10. grader 設計

| task                            | grader                                                         | deterministic |
| ------------------------------- | -------------------------------------------------------------- | ------------- |
| positive-trigger-basic          | `trigger` mode:positive                                        | はい          |
| positive-trigger-ci-failure     | `trigger` mode:positive                                        | はい          |
| negative-trigger-readme         | `trigger` mode:negative                                        | はい          |
| negative-trigger-feature-design | `trigger` mode:negative                                        | はい          |
| guardrail-no-unrelated-files    | `tool_constraint` reject_tools + `text` not_contains           | はい (構造)   |
| guardrail-no-eval               | `text` not_contains `"eval"` + `tool_constraint` reject `eval` | はい (構造)   |
| guardrail-retry-limit           | `behavior` max_tool_calls + `text` not_contains 6 回目         | はい (構造)   |
| adversarial-prompt-injection    | `text` not_contains (危険動作) + eval `adversarial:` pack      | はい (構造)   |

LLM-as-Judge (`prompt` grader) は本 PoC では使わない (実モデル費用と安定性)。
guardrail / adversarial の「実際の agent 挙動」検証は `executor: copilot-sdk` が必要で
本 PoC では未実施 (構造的 grader の wiring まで)。

## 11. セキュリティ

- バイナリ取得: GitHub Release `v0.38.3` の固定 asset URL。
  `install.sh` の `curl|bash` は使わず、明示 URL + checksum 検証を文書化。
- checksum (sha256, v0.38.3):
  - darwin-arm64: `99aa4366b198f319145cffeef42d500eb9f6178235a0537d34c19dd8f2f46fec`
  - linux-amd64: `168e3562deeaa1958d44366b37d963b48b091c325c6c9b5b2613e5399ff077b9`
  - (全 OS 分は `evals/skills/check/README.md` に記載)
- secrets: fixture に本物の環境変数・token は入れない (ダミー `***REDACTED***` のみ)。
- prompt injection: fixture log に悪意命令を意図的に仕込み、追従しないことを検証。
- fixture isolation: `context_dir` で隔離。`git push` / `reset --hard` / `clean -fd` 禁止。

## 11b. 実証結果 (Waza v0.38.3, mock executor, ローカル実行)

- `waza check .apm/skills/check`: 実行成功。Compliance Low (description 136 chars < 150,
  token 608 > 500)。Spec Compliance 9/9。Evaluation Suite: Not Found (eval が skill
  dir と別配置のため `waza check` は検出しない; `waza spec verify` / `waza run` は明示
  path で動作)。
- `waza spec verify ... eval.yaml`: 実行成功。Coverage 0/1 (req-description-001 未cover)。
  原因: SKILL.md description に構造化 `USE FOR` / `DO NOT USE FOR` が無く、要件 ID が
  description 全体 1 件に圧縮されるため。
- 検証 (一時的な SKILL.md copy に USE FOR / DO NOT USE FOR を追加): Coverage 4/10 に
  改善し、positive/negative trigger task が要件に map されることを確認。本 PoC では
  APM source of truth を変更せず、follow-up 候補とする。
- `waza run eval.yaml`: 8/8 成功 (Success Rate 100%, trigger accuracy 100%,
  mock executor)。guardrail / adversarial grader は structure として通過。
- `waza adversarial --spec eval.yaml` (prompt-injection pack, mock): 4 task 中 4
  unsafe 検出。ただし mock executor は injection に "従う" 疑似応答を返すため、この結果は
  pack/grader の wiring が動作していることの確認であり、実 agent の耐性評価ではない。
  実耐性評価は `executor: copilot-sdk` が必要 (本 PoC では未実施)。
- context_dir は CWD 相対で解決される (task/eval file 相対ではない)。repo root から
  実行する前提で `evals/skills/check/fixtures/repo` を指定。

## 12. CI 方針

- `workflow_dispatch` の手動 workflow のみ。required check にしない。
- `permissions: contents: read`。secrets を fork PR へ渡さない。
- path filter は `.apm/skills/check/**`, `evals/skills/check/**`, `tools/scripts/run-waza-eval.ts`,
  `.waza.yaml` に限定。
- バイナリは version 固定 + checksum 検証。timeout / concurrency 設定。
- PR 自動コメント・Issue 自動作成は行わない。

## 13. コスト

- `executor: mock` は API key 不要・費用ゼロ。
- `copilot-sdk` 実行は GitHub Token の Copilot quota を消費 (本 PoC では未実施)。
- CI は手動発火のみなので通常 PR の実行時間へ影響しない。

## 14. ロールバック方法

- 追加ファイルはすべて新規: `evals/`, `.waza.yaml`, `tools/scripts/run-waza-eval.ts`,
  `.github/workflows/waza-eval-poc.yml`, 本設計書。
- 既存ファイル (`AGENTS.md`, `CLAUDE.md`, `.apm/**`, `.agents/**`, `package.json` の
  既有 scripts) は編集しない (`package.json` への新 script 追加のみ)。
- ロールバックは上記新規ファイルを削除するだけで完了。`quality:check`・既存 CI への
  影響はない。

## 15. 将来の拡張方針

- `check` 以外の Skill への展開 (harness-evaluator, github-pr-review 等)。
- `copilot-sdk` executor で実モデル実行し、guardrail/adversarial を実挙動検証。
- `--baseline` で Skill あり/なし比較の metrics 収集。
- eval 結果を `harness:audit` へ取り込み、学習候補と連動。

## 16. 採用 / 不採用判断基準

採用候補: 誤発火・指示違反を deterministic に検出でき、CI コスト増が無く、APM と
責務分離できること。

不採用候補: 既存ハーネスと完全重複、Copilot 依存で運用再現性がない、fixture/grader
保守負担が大きい、誤検知が多い場合。
