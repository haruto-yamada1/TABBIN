---
name: agent-automation-recommender
description: >-
  リポジトリを読み取り専用で分析し、Codex、Cursor、Claude などのエージェントで
  使うべき skill、prompt、hook、MCP、subagent、設定改善を提案するときに使います。
---

# エージェント自動化レコメンダー

この skill は、リポジトリの構成と既存のエージェント設定を読み取り専用で調査し、
Codex、Cursor、Claude などで使える自動化を提案します。ファイルは作成・変更
しません。ユーザーが実装を求めた場合は、別途計画を立ててから実装してください。

## 目的

- 既存の `.apm/`、`.agents/`、`.cursor/`、`.codex/`、`.claude/`、MCP
  設定、hook、skill、prompt を把握する。
- 追加すると効果が高い自動化を、カテゴリごとに 1-2 件へ絞って提案する。
- すでに存在する仕組み、重複しそうな提案、過剰な orchestration を避ける。
- APM が source of truth のリポジトリでは、生成先ではなく `.apm/` 側の変更を
  推奨する。

## 調査方針

最初に、読み取り専用で次の情報を確認してください。

- プロジェクト種別: `package.json`、`pyproject.toml`、`Cargo.toml`、
  `go.mod`、`pom.xml`、主要な entrypoint。
- フレームワークと依存関係: React、Next.js、WXT、Playwright、Vitest、
  Prisma、Supabase、Stripe、OpenAI SDK、AWS SDK など。
- 既存のエージェント設定: `AGENTS.md`、`CLAUDE.md`、`.apm/`、`.agents/`、
  `.cursor/`、`.codex/`、`.claude/`、`.github/instructions/`。
- 自動化の既存資産: skill、prompt、hook、MCP、CI、テスト、品質チェック、
  issue tracker。
- 制約: 日本語運用、source-of-truth 境界、生成 artifact、承認が必要な操作、
  セキュリティや secret への配慮。

大量の出力を直接読み込まず、利用できる場合は context-mode、RTK、検索ツール、
構造化された summary コマンドを使ってください。調査は読み取り専用に限定します。

## 推奨カテゴリ

必要なカテゴリだけを出してください。全カテゴリを埋める必要はありません。

### MCP

外部情報や外部システムが必要な場合に提案します。

- ライブラリや SDK の最新仕様が重要: `context7` や公式 docs 参照用 MCP。
- ブラウザ操作、UI 検証、スクリーンショットが重要: Browser / Playwright 系 MCP。
- GitHub issue、PR、CI を扱う: GitHub MCP。
- Sentry、Datadog、Linear、Slack、DB、クラウドなどを日常的に使う:
  対応する MCP。

### Skills

繰り返し使う判断、手順、レビュー観点、プロジェクト固有知識をまとめる場合に
提案します。

- 既存 skill がある場合は、まずそれを使う提案にする。
- 新規 skill は、明確な発火条件と再利用価値がある場合だけ提案する。
- TABBIN のように APM 管理の場合、作成先は `.apm/skills/<name>/SKILL.md`
  を推奨する。
- 副作用が大きい workflow は、ユーザー起動前提の skill として提案する。

### Prompts / Commands

短い定型依頼、レビュー、診断、レポート生成に向いている場合に提案します。

- APM 管理の場合、作成先は `.apm/prompts/*.prompt.md` を推奨する。
- 実装ではなく評価や診断を起動するものに向いています。
- 長い運用手順や判断規則は prompt ではなく skill に寄せます。

### Hooks

人間が毎回忘れやすい検査、危険操作の警告、完了時の状態表示に向いている場合に
提案します。

- 編集後 format / lint / 型チェックの誘導。
- secret、`.env`、lockfile、生成 artifact などの危険な編集への警告。
- stop / pre-compact 時の状態確認。
- APM 管理の場合、作成先は `.apm/hooks/` を推奨する。
- hook は軽く保ち、長時間の実装や複雑な orchestration は載せません。

### Subagents

独立した観点で並列レビューや fresh-context 評価が有効な場合に提案します。

- セキュリティ、性能、アクセシビリティ、テスト、仕様準拠など。
- 大きい変更の fresh-context review。
- TABBIN では、Generator/Evaluator ハーネスの方針を尊重し、Planner や
  Orchestrator レイヤーを増やさない提案にします。

### 設定と運用

既存の設定だけで改善できる場合に提案します。

- `AGENTS.md` や `.apm/instructions/` のルール整理。
- `apm compile --validate`、`apm install`、`apm compile` の運用確認。
- `bun run quality`、`bun run test:coverage` などの完了ゲート明確化。

## 出力形式

次の形式で簡潔に出力してください。

```markdown
## 自動化診断

### リポジトリ概要
- 種別:
- 主な技術:
- 既存のエージェント資産:

### 優先提案
1. **[カテゴリ] 提案名**
   - 理由:
   - 追加または利用する場所:
   - 実装の重さ:

2. **[カテゴリ] 提案名**
   - 理由:
   - 追加または利用する場所:
   - 実装の重さ:

### 見送る提案
- **提案名**: 見送る理由。

### 次の一手
- 実装するなら最初に触る source:
- 検証コマンド:
```

## 判断基準

- 価値が高い順に並べ、カテゴリごとの網羅よりも上位 1-2 件の精度を優先する。
- 既存の source-of-truth を壊す提案はしない。
- 生成済みファイルだけを直接編集する提案は避ける。
- ユーザーが求めていない限り、調査結果から勝手に実装へ進まない。
- 不明点が実装判断に直結する場合だけ質問し、それ以外は明示した仮定で進める。
