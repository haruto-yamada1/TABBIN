---
description: ECC に近い高忠実度ハーネスのワークフローと状態ファイル規約。
applyTo: "**/*"
---

# Orchestrator/Planner/Generator/Evaluator ハーネス

このリポジトリは、複雑なエージェント作業に ECC に近い厚めの
Orchestrator / Planner / Generator / Evaluator / Audit / Learning ハーネスを使います。
TABBIN では `.apm` を source of truth とし、実行状態は `.agents/harness/` に保存します。

hook は状態表示、警告、記録、軽量検証だけを行います。Evaluator や Orchestrator を
hook から自動起動しません。

## 役割

- **Orchestrator**: ユーザー依頼を受けて run を作成し、Planner / Generator /
  Evaluator / Optimizer の分担、検証、最終判断を管理します。
- **Planner**: 独立した状態ファイルを持ち、要件、制約、作業単位、担当、検証方針を
  `planner.json` と `orchestrator.json` の `plan` に記録します。
- **Generator**: メインセッションまたは Worker サブエージェントとして実装し、
  checkpoint と検証証跡を `generator.json` に残します。
- **Evaluator**: 完了した Generator の成果物を fresh-context でレビューし、
  `approved`、`changes_requested`、`blocked` のいずれかを `evaluator.json` に書きます。
- **Optimizer**: Evaluator の指摘、`governance.jsonl`、surface audit から
  再発防止候補を `learning.json` に整理します。

複数ファイル変更、新機能、長時間作業、不確実性が高い作業では
`.apm/prompts/harness-orchestrate.prompt.md` を入口にしてください。小さい一問一答や
明確な 1 ファイル修正では、通常のメインセッションだけで進めて構いません。

## 状態ファイル

ハーネスの状態は `.agents/harness/` 配下に置きます。

- `.agents/harness/ACTIVE`: run id または run ディレクトリパスを入れる任意の
  テキストファイル。
- `.agents/harness/runs/<run-id>/task.md`: 元タスクまたは実装ブリーフ。
- `.agents/harness/runs/<run-id>/orchestrator.json`: Orchestrator の分担、
  plan 集約、検証、次アクション。
- `.agents/harness/runs/<run-id>/planner.json`: Planner の作業分解、検証方針、
  実装前の判断。
- `.agents/harness/runs/<run-id>/generator.json`: Generator の実装状態と checkpoint。
- `.agents/harness/runs/<run-id>/evaluator.json`: Evaluator の checklist、findings、
  評価判断。
- `.agents/harness/runs/<run-id>/decision.json`: 必要な場合の最終レビュー判断。
- `.agents/harness/runs/<run-id>/scorecard.json`: deterministic surface audit の
  カテゴリ別結果。
- `.agents/harness/runs/<run-id>/learning.json`: follow-up issue、
  `.apm/instructions` 追記候補。

JSON ファイルは小さく保ち、`status`、`summary`、`updated_at`、`next_action`
フィールドを明示してください。有効な `status` 値は `pending`、`running`、`done`、
`approved`、`changes_requested`、`blocked` です。

状態ファイルの schema は `.apm/harness/schemas/` に置きます。状態を書いた後は
`bun run harness:validate` で ACTIVE run を検証してください。特定 run を見る場合は
`bun tools/scripts/harness.ts validate --run <run-id>` を使います。

## 手動コマンド

- `bun run harness:start -- --task "<依頼要約>"`: run を作成し、`ACTIVE`、
  `task.md`、`orchestrator.json`、`planner.json`、`generator.json`、`scorecard.json`、
  `learning.json` を初期化します。
- `bun run harness:plan -- --summary "<要約>" --task "<作業>"`: Planner の作業分解を
  `planner.json` と `orchestrator.json` へ記録します。
- `bun run harness:checkpoint -- --command "<検証コマンド>" --status "<状態>" --notes "<証跡>"`:
  Generator の checkpoint を `generator.json` に追記します。
- `bun run harness:evaluate`: fresh-context Evaluator を手動起動する前に
  `evaluator.json` を起動待ち状態にします。
- `bun run harness:validate`: ACTIVE run の JSON 状態を schema 検証します。
- `bun run harness:status`: ACTIVE run の portable handoff を Markdown で出力します。
- `bun run harness:status -- --write`: `.agents/harness/status.md` に handoff を書き出します。
- `bun run harness:audit`: 変更ファイル、schema、検証証跡、Evaluator 状態、
  follow-up 候補を一覧化します。
- `bun run harness:surface-audit`: Tool Coverage、Context Efficiency、Quality Gates、
  Memory Persistence、Eval Coverage、Security Guardrails、Source-of-truth Sync、
  Cost Efficiency、GitHub Integration の score 付き deterministic scorecard と
  Top 3 actions を確認します。
- `bun run harness:security-audit`: `.apm/hooks`、`.apm/skills`、`.apm/prompts` の
  agent surface を静的検査し、直接 HTTP 取得、inline eval、prompt injection リスク、
  secret らしき値を確認します。
- `bun run harness:repo-status`: ACTIVE run がない状態でも repo readiness、
  surface score、security finding 数、次アクションを表示します。
- `bun run harness:learn`: Evaluator の指摘や governance event から `learning.json` を
  更新し、候補ごとに follow-up issue、`.apm/hooks`、`.apm/skills`、`.apm/prompts`、
  `.apm/instructions` などの手動昇格先を明示します。
- `bun run harness:profile`: agent / hook / command surface の現在の運用 profile を表示します。
- `bun run harness:governance -- --kind <kind> --severity <level> --message <text>`:
  判断、警告、再発防止候補を `governance.jsonl` に記録します。
- `bun run harness:schemas`: `.apm/harness/schemas/` を現在の実装から再生成します。

## ハーネス command catalog

APM prompt として次の入口を提供します。`/plan` とは衝突させません。

- `harness-orchestrate`: ECC の workflow command に相当する主入口です。
- `harness-status`: ACTIVE run の状態と handoff を確認します。
- `harness-audit`: 完了前に schema、変更ファイル、証跡、follow-up 候補を監査します。
- `harness-security-audit`: agent surface の security guardrails を手動監査します。
- `harness-repo-status`: ACTIVE run の有無に関係なく repo readiness を確認します。
- `harness-quality-gate`: 完了前の品質ゲートを手動実行し、証跡を状態へ反映します。
- `harness-loop-status`: Orchestrator / Planner / Generator / Evaluator の進捗を確認します。
- `harness-model-route`: main session / Planner / Explorer / Worker / Evaluator /
  human grader の分担を決めます。
- `harness-learn`: Evaluator の指摘や governance event から再発防止候補を抽出します。

APM skill として `harness-planner`、`harness-generator`、`harness-evaluator`、
`harness-optimizer` を配布します。対応クライアントが agent metadata を扱える場合は
各 skill の `agents/openai.yaml` を使います。

## ワークフロー

1. Orchestrator が `bun run harness:start -- --task "<依頼要約>"` で run を作成します。
2. Planner が `bun run harness:plan` で作業単位、担当、検証方針を記録します。
3. 必要に応じて Explorer / Worker サブエージェントを起動します。各サブエージェントには
   担当ファイル、責任範囲、他者変更を戻さないことを明示します。
4. Generator が実装と検証を行い、`bun run harness:checkpoint` で証跡を残します。
5. Generator は `bun run harness:validate`、対象テスト、必要な品質ゲートを実行します。
   完了前には必要に応じて `bun run harness:surface-audit`、
   `bun run harness:security-audit`、`bun run harness:repo-status` も確認します。
6. Evaluator を新しいコンテキストで起動するときは、`bun run harness:evaluate` の後に
   `.apm/prompts/harness-evaluator.prompt.md` を使います。
7. Evaluator は `approved`、`changes_requested`、`blocked` のいずれかを
   `evaluator.json` に書きます。
8. `approved` の場合、Orchestrator は必要に応じて `decision.json` に最終判断を書き、
   完了ゲートへ進みます。変更要求がある場合は Generator が対応します。
9. Optimizer は必要に応じて `bun run harness:learn` と `bun run harness:surface-audit`
   を実行し、永続化すべき候補だけを後続作業へ渡します。

## 評価観点

Evaluator は、実装量やテスト成功だけを完了判断にしません。ユーザー依頼の
明示要件、Planner の plan、変更ファイル、生成 artifact、検証証跡を対応付け、
抜け・弱い検証・source-of-truth 逸脱を確認します。

大きい変更では、必要に応じて以下を区別して評価してください。

- capability eval: 依頼された能力やワークフローが実際に成立しているか。
- regression eval: 元の不具合や失敗パターンが再発しないか。
- code-based grader: テスト、型チェック、lint、coverage、静的検査。
- model-based grader: 実装意図、指示遵守、運用リスクの fresh-context レビュー。
- human grader: ユーザー判断が必要な設計、UI、運用ポリシー。

## hook と lifecycle

hook は Orchestrator や Evaluator を自動起動しません。hook は `.agents/harness/ACTIVE` と
JSON 状態ファイルから推測した現在のハーネス状態、次アクション、警告、記録だけを扱います。

`SessionStart` は ACTIVE run がある場合だけ状態と次アクションを表示します。profile gating は
`TABBIN_HARNESS_PROFILE` と `TABBIN_HARNESS_DISABLED_HOOKS` を読み、hook を止めるのではなく
運用 profile を記録・表示します。

`PreCompact` は `.agents/harness/LAST_COMPACT.md` に ACTIVE run、Orchestrator summary、
Planner summary、Generator summary、Evaluator summary、未解決 findings を保存します。
作業再開や Evaluator 起動は自動では行いません。

`PreToolUse` の safety hook は warn-only です。破壊的操作、外部 download、inline HTTP、
生成先ファイルの直接編集らしき入力を検出して警告するだけで、判断やブロックは行いません。

ECC に近い厚い hook として、次も APM 管理で配布します。

- config protection: lint / format / test / coverage 設定の編集を検出し、設定を弱める前に
  コード側の修正を促します。
- first edit gate: ACTIVE run がある場合、ファイル初回編集時に import 元、既存 helper、
  schema、テスト、ユーザー要件の確認を促します。
- postflight capture: Bash / Edit / Write / MultiEdit の概要を `events.jsonl` に記録します。
- activity tracking: lifecycle hook の実行を `activity.jsonl` に軽量記録します。

通常は警告と記録だけです。`TABBIN_HARNESS_STRICT=1` を指定した環境では、
config protection と first edit gate が `exit 2` でブロックできます。設定編集が
本当に必要な場合は `TABBIN_HARNESS_ALLOW_CONFIG_EDIT=1` を明示します。

Evaluator が `changes_requested` または `blocked` を出した場合、
`bun run harness:audit` で再発防止候補を確認します。自動で follow-up issue や
`.apm/instructions` へ追記せず、必要なものだけユーザー判断または後続作業で
source of truth に反映してください。

リポジトリの完了ゲートは、既存の Stop 検証フローを維持します。Stop hook に
repo-wide `bun run quality:check` は追加しません。
