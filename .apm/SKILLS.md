# TABBIN エージェント skill / harness 利用ガイド

この文書は、TABBIN の `.apm/skills/` とハーネスをどう使うかの一覧です。
`.apm` が source of truth なので、skill や prompt の運用を変える場合は
生成先の `.agents/`、`.cursor/`、`.claude/` ではなく `.apm/` を更新します。

## ハーネスの頼み方

通常は、ユーザーが `bun run harness:start` を手で打つ必要はありません。
AI に次のように依頼してください。

```text
ハーネスでこの作業を開始して: <やりたいこと>
```

大きめの作業全体を Orchestrator 入口で進めたい場合は、次のように依頼します。

```text
$harness-orchestrate で <やりたいこと> を進めて
```

役割を明示したい場合は、次のように依頼します。

```text
$harness-planner でこの作業を分解して
$harness-generator で実装して
$harness-evaluator で評価して
$harness-optimizer で学習候補を整理して
```

AI は必要に応じて、内部で次の低レベルコマンドを実行します。

```bash
bun run harness:start -- --task "<依頼要約>"
bun run harness:plan -- --summary "<要約>" --task "<作業1>" --task "<作業2>"
bun run harness:checkpoint -- --command "<検証コマンド>" --status passed --notes "<証跡>"
bun run harness:evaluate
bun run harness:validate
bun run harness:audit
```

`harness:evaluate` は Evaluator を自動起動するコマンドではありません。
fresh-context Evaluator を起動するための `evaluator.json` を準備するだけです。
hook も Evaluator や Orchestrator を自動起動せず、状態表示、警告、記録、軽量検証だけを行います。

## ハーネス関連 command

| command | 用途 |
| --- | --- |
| `bun run harness:start` | ACTIVE run、`task.md`、初期状態ファイルを作成します。 |
| `bun run harness:plan` | `planner.json` と `orchestrator.json` に作業分解を記録します。 |
| `bun run harness:checkpoint` | `generator.json` に実装・検証 checkpoint を追記します。 |
| `bun run harness:evaluate` | Evaluator 起動前の `evaluator.json` を準備します。 |
| `bun run harness:status` | ACTIVE run の handoff を表示します。 |
| `bun run harness:audit` | schema、変更ファイル、証跡、follow-up 候補を確認します。 |
| `bun run harness:surface-audit` | skill、hook、品質ゲート、APM 同期の deterministic scorecard を確認します。 |
| `bun run harness:learn` | Evaluator 指摘や governance event から `learning.json` を作ります。 |
| `bun run harness:profile` | Planner / Generator / Evaluator / Optimizer の運用面を確認します。 |
| `bun run harness:validate` | ACTIVE run の JSON 状態を schema 検証します。 |
| `bun run harness:schemas` | `.apm/harness/schemas/` を再生成します。 |

## よく使う依頼例

| やりたいこと | 依頼例 |
| --- | --- |
| 複雑な実装を始める | `ハーネスでこの作業を開始して: <内容>` |
| 計画だけ分解する | `$harness-planner でこの作業を分解して` |
| 計画に沿って実装する | `$harness-generator で実装して` |
| 完了前レビューをする | `$harness-evaluator で評価して` |
| 再発防止候補を整理する | `$harness-optimizer で学習候補を整理して` |
| 全体の品質ゲートを走らせる | `$check` または `品質チェックを実行して` |
| React 変更後の静的チェックをする | `$react-doctor で確認して` |

## skill 一覧

### ハーネス / エージェント運用

| skill | 使う場面 |
| --- | --- |
| `harness-orchestrate` | ハーネス全体の入口です。複雑な作業を開始し、Planner / Generator / Evaluator / Optimizer の流れを管理します。 |
| `harness-planner` | ハーネス run の要件、制約、検証方針を分解し、`planner.json` と `orchestrator.json` を更新します。 |
| `harness-generator` | Planner の plan に沿って実装し、checkpoint と検証証跡を `generator.json` に残します。 |
| `harness-evaluator` | fresh-context で成果物、証跡、source-of-truth を評価し、`evaluator.json` に判断を書きます。 |
| `harness-optimizer` | Evaluator 指摘や governance event から `learning.json` に再発防止候補を整理します。 |
| `agent-automation-recommender` | Codex、Cursor、Claude などの automation 改善候補を repo 固有に監査します。 |
| `agent-introspection-debugging` | エージェントがループ、矛盾、source-of-truth 逸脱、tool/context 起因の失敗を起こすときに使います。 |
| `dispatching-parallel-agents` | 共有状態に依存しない 2 つ以上の独立タスクを並列 agent に分担します。 |
| `subagent-driven-development` | 実装計画を複数サブエージェントで進めるときに使います。 |
| `babysit` | PR を merge-ready に保つため、コメント、競合、CI を継続的に処理します。 |

### 計画 / 実装プロセス

| skill | 使う場面 |
| --- | --- |
| `using-superpowers` | 会話開始時に、適用すべき skill を必ず確認する基本ルールです。 |
| `brainstorming` | 新機能、挙動変更、設計が必要な作業の前に、目的と設計を固めます。 |
| `writing-plans` | 仕様や要件から、実装可能な手順書を作るときに使います。 |
| `executing-plans` | 既存の実装計画を、検証 checkpoint 付きで実行します。 |
| `test-driven-development` | 機能追加、bugfix、refactor の前に failing test を作り、red-green で進めます。 |
| `systematic-debugging` | test failure、bug、予期しない挙動の root cause を調べるときに使います。 |
| `verification-before-completion` | 完了報告、PR、commit 前に fresh verification を必ず確認します。 |
| `using-git-worktrees` | 大きな feature work や計画実行を、隔離 worktree で始めるときに使います。 |
| `finishing-a-development-branch` | 実装完了後、merge、PR、保持、破棄の選択肢を整理します。 |

### 品質チェック / レビュー

| skill | 使う場面 |
| --- | --- |
| `check` | `$check` 相当。`bun run quality:check` を実行し、失敗を修正して再実行します。 |
| `react-doctor` | React 変更後、早い段階で問題を検出します。 |
| `requesting-code-review` | 実装完了後や merge 前にレビューを依頼するときに使います。 |
| `receiving-code-review` | review feedback を受け取り、妥当性を確認して対応します。 |
| `github-pr-review` | Open GitHub PR の review feedback を投稿者に依存せず検証し、修正、push、thread reply、resolve、学びの昇格まで行います。 |
| `security-review` | Browser extension の権限、storage、user content、依存関係、release-sensitive code を確認します。 |
| `web-design-guidelines` | UI、UX、accessibility、visual quality をレビューします。 |
| `e2e-testing` | TABBIN の WXT browser extension flow に Playwright E2E を追加・修正・調査します。 |

### プロジェクト管理 / Git / PR

| skill | 使う場面 |
| --- | --- |
| `github-issue-implementation` | GitHub Issue を live contract として確認し、隔離 worktree で根本原因の修正と検証を行う implementation phase です。 |
| `split-to-prs` | 現在の変更や大きな作業を、小さく review しやすい PR に分割します。 |
| `git-staged-branch-commit-push` | staged changes を確認し、現在の branch から新しい branch を作成して commit と push まで進めます。 |
| `commit-push-pr` | Issue URL だけで調査・実装・検証から `develop` 向け Open PR まで進める入口です。実装済み変更の publish-only にも使います。 |

### APM / Cursor / 設定作成

| skill | 使う場面 |
| --- | --- |
| `create-hook` | Cursor hook や hook script を作成・更新します。 |
| `create-rule` | Cursor rule、`AGENTS.md`、`.cursor/rules/` などの永続 AI guidance を作ります。 |
| `create-skill` | Cursor Agent Skill を新規作成します。 |
| `create-subagent` | 専用 subagent の prompt や設定を作ります。 |
| `migrate-to-skills` | Cursor rule や slash command を Agent Skill へ移行します。 |
| `writing-skills` | skill の作成、編集、検証を行います。 |
| `find-skills` | 目的に合う既存 skill や install 可能な skill を探します。 |
| `update-cli-config` | Cursor CLI 設定、permission、sandbox、表示設定などを変更します。 |
| `update-cursor-settings` | Cursor / VSCode の user settings を変更します。 |
| `statusline` | CLI status line / prompt footer をカスタマイズします。 |
| `cursor-sdk` | `@cursor/sdk` を使った自動化、CI、bot、backend integration を作ります。 |
| `shell` | `/shell` と明示された literal shell command を実行します。 |

### UI / React / Frontend

| skill | 使う場面 |
| --- | --- |
| `animation-best-practices` | hover、tooltip、button feedback、transition、flicker 対策など CSS animation を扱います。 |
| `canvas` | 分析結果、監査、timeline、chart、table などを standalone canvas として作るときに使います。 |
| `vercel-composition-patterns` | React component composition、compound components、boolean props 解消、API 設計を扱います。 |
| `vercel-react-best-practices` | React / Next.js の performance、rendering、data fetching、bundle 最適化を扱います。 |
| `vercel-react-native-skills` | React Native / Expo の performance、list、animation、native platform API を扱います。 |

### コンテンツ / メディア

| skill | 使う場面 |
| --- | --- |
| `remotion-best-practices` | Remotion で動画、composition、caption、audio、asset、animation を扱うときに使います。 |

### トークン圧縮 / Caveman

caveman 系 skill は出力・入力 token を圧縮しつつ技術的正確さを保つためのものです。
`JuliusBrussee/caveman` 由来で `.apm/skills/` から APM 配布しています。

| skill | 使う場面 |
| --- | --- |
| `caveman` | caveman mode で出力 token を圧縮します。`/caveman`、caveman mode、token 効率化の依頼で使います。lite / full / ultra / wenyan-* の強度があります。 |
| `cavecrew` | caveman 圧縮された subagent へ作業を委譲する判断軸です。investigator / builder / reviewer の使い分けと tool-result 圧縮を扱います。 |
| `caveman-commit` | commit message を conventional commits で圧縮生成します。`/caveman-commit`、staging 時に自動起動します。 |
| `caveman-compress` | `CLAUDE.md` など memory file を caveman 形式へ圧縮します。`/caveman-compress FILEPATH` で実行し、backup を `.original.md` に残します。 |
| `caveman-review` | PR / diff review comment を 1 行圧縮で出します。`/caveman-review`、PR review 時に使います。 |
| `caveman-stats` | session log から実 token 使用量と推定削減効果を出します。`/caveman-stats` で起動します。 |
| `caveman-help` | caveman 系 skill / mode / command の quick-reference を 1 shot で表示します。`/caveman-help` で使います。 |

## 使い分けの目安

- 「作業全体を任せたい」なら `harness-orchestrate` または `ハーネスで開始して`。
- 「GitHub Issue URL から Open PR まで任せたい」なら `commit-push-pr` と URL だけを渡します。
- 「品質ゲートを通して」なら `check`。
- 「原因が分からない失敗」なら `systematic-debugging`。
- 「新しい挙動を作る」なら `brainstorming` と `test-driven-development`。
- 「PR 前に不安」なら `requesting-code-review`、React 変更なら追加で `react-doctor`。
- 「永続タスクや follow-up を残す」なら issue tracker に残します。
- 「AI 向け資産を変える」なら `.apm/` を編集し、`bun run apm:sync` で configured target を
  同期した後、`bun run apm:check` で tracked 生成物、必須 skill、二回同期の冪等性を検証。

## 役割が被って見える skill の整理

TABBIN の skill は、意図的に「workflow の入口」と「専門補助」に分かれています。
完全重複として削るより、入口を 1 つ決めて、必要に応じて専門 skill を併用する運用にします。

### 優先ルール

| 状況 | 最初に使う skill | 必要に応じて併用する skill |
| --- | --- | --- |
| 複雑な作業全体を任せる | `harness-orchestrate` | `harness-planner`、`harness-generator`、`harness-evaluator`、`harness-optimizer` |
| GitHub Issue URL から Open PR まで | `commit-push-pr` | `github-issue-implementation`、必要なら `harness-orchestrate` |
| Open PR の review feedback 対応 | `github-pr-review` | `receiving-code-review`、必要なら `check` |
| まだ設計が固まっていない | `brainstorming` | `writing-plans`、`harness-planner` |
| 実装計画がすでにある | `executing-plans` | `harness-generator`、`subagent-driven-development` |
| 複数 agent に分担できる | `subagent-driven-development` | `dispatching-parallel-agents`、`harness-generator` |
| 不具合や test failure の原因調査 | `systematic-debugging` | `test-driven-development`、`check` |
| 完了前の品質確認 | `verification-before-completion` | `check`、`react-doctor`、`requesting-code-review` |
| UI の品質確認 | `web-design-guidelines` | `animation-best-practices`、`vercel-react-best-practices` |
| React 実装の性能や構成確認 | `vercel-react-best-practices` | `vercel-composition-patterns`、`react-doctor` |
| セキュリティ観点の確認 | `security-review` | `harness-evaluator`、`requesting-code-review` |
| skill を探す / 作る / 整える | `find-skills` | `create-skill`、`writing-skills`、`migrate-to-skills` |
| AI 運用そのものの改善 | `agent-automation-recommender` | `agent-introspection-debugging`、`harness-optimizer` |

### 被りやすい組み合わせ

| 組み合わせ | 整理 |
| --- | --- |
| `harness-planner` / `brainstorming` / `writing-plans` | `brainstorming` は設計相談、`writing-plans` は実装計画書、`harness-planner` は ACTIVE run の `planner.json` に記録する運用役です。 |
| `harness-generator` / `executing-plans` / `subagent-driven-development` | `executing-plans` は計画実行の汎用手順、`subagent-driven-development` は分担実行、`harness-generator` はハーネス run の実装担当です。 |
| `harness-evaluator` / `requesting-code-review` / `react-doctor` / `security-review` / `web-design-guidelines` | `harness-evaluator` は全体評価の器です。React、security、UI などの専門観点は必要に応じて専門 skill を併用します。 |
| `check` / `verification-before-completion` / `react-doctor` | `check` は実コマンド実行、`verification-before-completion` は完了報告前の規律、`react-doctor` は React 専用の追加検査です。 |
| `github-pr-review` / `receiving-code-review` / `babysit` | `github-pr-review` は Open PR の live thread から修正・push・返信までの workflow、`receiving-code-review` は指摘の技術的検証原則、`babysit` は PR 全体の継続監視です。 |
| `create-skill` / `writing-skills` / `find-skills` / `migrate-to-skills` | `find-skills` は探す、`create-skill` は作る、`writing-skills` は品質よく書く、`migrate-to-skills` は既存 rule / command から移行する役割です。 |
| `agent-automation-recommender` / `harness-optimizer` / `agent-introspection-debugging` | `agent-automation-recommender` は repo 全体の自動化提案、`harness-optimizer` は harness run 後の学習候補整理、`agent-introspection-debugging` は agent の失敗原因調査です。 |
| `animation-best-practices` / `web-design-guidelines` / `vercel-react-best-practices` | `animation-best-practices` は動き、`web-design-guidelines` は UX / accessibility / visual quality、`vercel-react-best-practices` は React 性能と実装品質です。 |

### 削除ではなく残す理由

- workflow skill は「いつ、どの順番で進めるか」を決めます。
- specialist skill は「特定観点で何を見るか」を深くします。
- ハーネス系 skill は `.agents/harness/` の状態ファイルへ証跡を残す運用役です。
- 汎用 skill はハーネス外の小さな作業や、他クライアントでも使いやすい入口として残します。

迷った場合は、まず workflow の入口を 1 つ選びます。Issue URL から PR までなら
`commit-push-pr`、大きい作業なら `$harness-orchestrate`、不具合なら
`systematic-debugging`、品質確認なら `check`、UI なら `web-design-guidelines` を最初に使い、
足りない専門観点を後から足してください。
