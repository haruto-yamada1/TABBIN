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

小さい一問一答や明確な 1 ファイル修正では、通常のメインセッションだけで進めて構いません。
大きい作業全体を入口で進めたい場合は `.apm/prompts/harness-orchestrate.prompt.md`
または `$harness-orchestrate` skill を使ってください。コマンド一覧と依頼例は
`.apm/SKILLS.md` を参照してください。

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

## 状態ファイル

ハーネスの状態は `.agents/harness/` 配下に置きます。

- `.agents/harness/ACTIVE`: run id または run ディレクトリパスを入れる任意のテキストファイル。
- `.agents/harness/runs/<run-id>/task.md`: 元タスクまたは実装ブリーフ。
- `.agents/harness/runs/<run-id>/orchestrator.json`: Orchestrator の分担、plan 集約、検証、次アクション。
- `.agents/harness/runs/<run-id>/planner.json`: Planner の作業分解、検証方針、実装前の判断。
- `.agents/harness/runs/<run-id>/generator.json`: Generator の実装状態と checkpoint。
- `.agents/harness/runs/<run-id>/evaluator.json`: Evaluator の checklist、findings、評価判断。
- `.agents/harness/runs/<run-id>/decision.json`: 必要な場合の最終レビュー判断。
- `.agents/harness/runs/<run-id>/scorecard.json`: deterministic surface audit のカテゴリ別結果。
- `.agents/harness/runs/<run-id>/learning.json`: follow-up issue、`.apm/instructions` 追記候補。

JSON ファイルは小さく保ち、`status`、`summary`、`updated_at`、`next_action`
フィールドを明示してください。有効な `status` 値は `pending`、`running`、`done`、
`approved`、`changes_requested`、`blocked` です。

状態ファイルの schema は `.apm/harness/schemas/` に置きます。状態を書いた後は
`bun run harness:validate` で ACTIVE run を検証してください。特定 run を見る場合は
`bun tools/scripts/harness.ts validate --run <run-id>` を使います。

コマンド一覧、依頼例、prompt / skill の対応は `.apm/SKILLS.md` を参照してください。

## 評価観点

Evaluator は、実装量やテスト成功だけを完了判断にしません。ユーザー依頼の
明示要件、Planner の plan、変更ファイル、生成 artifact、検証証跡を対応付け、
抜け・弱い検証・source-of-truth 逸脱を確認します。詳細な評価手順と
`evaluator.json` の形は `.apm/prompts/harness-evaluator.prompt.md` を参照してください。

大きい変更では、必要に応じて以下を区別して評価してください。

- capability eval: 依頼された能力やワークフローが実際に成立しているか。
- regression eval: 元の不具合や失敗パターンが再発しないか。
- code-based grader: テスト、型チェック、lint、coverage、静的検査。
- model-based grader: 実装意図、指示遵守、運用リスクの fresh-context レビュー。
- human grader: ユーザー判断が必要な設計、UI、運用ポリシー。

Evaluator が `changes_requested` または `blocked` を出した場合、
`bun run harness:audit` で再発防止候補を確認します。自動で follow-up issue や
`.apm/instructions` へ追記せず、必要なものだけユーザー判断または後続作業で
source of truth に反映してください。

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
- event capture: Bash / Edit / Write / MultiEdit の実行概要 (tool, command, event, profile) を `events.jsonl` 1 ファイルに記録します。旧 `activity.jsonl` と `events.jsonl` は統合済みです。

通常は警告と記録だけです。`TABBIN_HARNESS_STRICT=1` を指定した環境では、
config protection と first edit gate が `exit 2` でブロックできます。設定編集が
本当に必要な場合は `TABBIN_HARNESS_ALLOW_CONFIG_EDIT=1` を明示します。

リポジトリの完了ゲートは、既存の Stop 検証フローを維持します。Stop hook に
repo-wide `bun run quality:check` は追加しません。
