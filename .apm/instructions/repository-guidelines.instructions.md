---
description: TABBIN リポジトリ全体の構成・ビルド・コーディングスタイル・テスト・タスク管理・Commit/PR のガイドライン。
applyTo: "**/*"
---

# リポジトリガイドライン

## プロジェクト構成とモジュール整理
このリポジトリは WXT ベースのブラウザ拡張機能（TABBIN）です。アプリ本体は `src/` 配下に集約されています。主要なエントリポイントは `src/entrypoints/`（`background.ts`、`options/`、`saved-tabs/`、`changelog/`）にあります。ドメイン機能は `src/features/` 配下にまとまっています（例: `src/features/options`、`src/features/saved-tabs`）。再利用可能な UI と共通 React コンポーネントは `src/components/` と `src/components/ui/` にあります。横断的なロジックは `src/lib/`（background helper、storage、browser wrapper）にあり、共通型は `src/types/`、定数は `src/constants/`、ユーティリティは `src/utils/` にあります。

テストは多くの場合 `*.test.ts` / `*.test.tsx` として対象コードの近くに置かれます。E2E テストは `e2e/`（`*.spec.ts`）にあります。Storybook の story と Storybook 用の補助 assets は `src/` 配下に置きます。ローカル検査や保守用スクリプトは `tools/scripts/` にあります。`.output/`、`coverage/`、`playwright-report/`、`test-results/` などの生成出力ディレクトリは手動編集しないでください。

### DDD 移行先（`src/contexts/*`）
`src/features/` 配下のドメイン機能を、段階的に `src/contexts/<context>/` の DDD レイヤ構成へ移行します（全体方針は Issue #454、最初の一手は Issue #455）。WXT の `src/entrypoints/` は維持し、UI からの依存方向は次のとおりです。

```
entrypoints → app/composition → contexts/*/presentation
                                  → contexts/*/application
                                  → contexts/*/domain
```

`infrastructure` は `domain/repositories` と `application/ports` の interface を実装します。最初に着手するのは `src/contexts/saved-tabs/` のみで、`ai-chat` / `analytics` / `settings` / `extension-runtime` は後続 Issue で扱います。`src/features/saved-tabs` の既存ロジックは段階的に薄くし、一括移動はしません。

`src/contexts/saved-tabs/` の DDD レイヤ構成と各層の責務は `docs/architecture/ddd.md` を参照してください。AI / Codex / Claude Code は `saved-tabs` 周りの実装や修正を依頼されたとき、まず `docs/architecture/ddd.md` と既存の `src/features/saved-tabs/` を比較し、移行先と既存コードの責務境界を確認してから編集してください。

## ビルド、テスト、開発コマンド
- `bun install`: 依存関係をインストールします（CI / local の Node / Bun runtime version は `.node-version` / `.bun-version` を参照してください）。
- `bun run dev` / `bun run dev:firefox`: Chrome / Firefox 向けに WXT dev mode を起動します。
- `bun run build` / `bun run build:firefox`: 本番用の拡張機能をビルドします。
- `bun run zip` / `bun run zip:firefox`: 拡張機能の zip 成果物を作成します。
- `bun run compile`: TypeScript の型チェックを実行します（`tsgo --noEmit`）。
- `bun run test` / `bun run test:coverage`: Vitest テストを実行します（coverage は任意）。
- `bun run e2e`: Playwright のブラウザテストを実行します。
- `bun run quality:check`: format、lint、test、Knip、重複チェックを実行します。

テスト実行コマンドの使い分け（`test:node` / `test:dom` / `test:changed` / `test:related` / `test:coverage`）の詳細は `02-vitest-local-development` を参照してください。本ファイルではビルド・開発・品質ゲートの主要コマンドだけ列挙し、テスト実行コマンドの使い分けはそちらへ委ねます。

## コーディングスタイルと命名規則
TypeScript + React を ES modules で使います。format は oxfmt（`.oxfmtrc.json`）、lint は Oxlint（`.oxlintrc.json`）で強制されます。2 スペースインデント、80 文字幅、シングルクォート、セミコロンなしです。import 整理は oxfmt の `sortImports` に任せてください。

React コンポーネントは `PascalCase.tsx`（例: `ImportExportSettings.tsx`）、ユーティリティや定数は `camelCase.ts`（例: `autoDeleteOptions.ts`）を使います。現実的な範囲で、テストは検証対象のコードの近くに置いてください。

実装前に既存の helper、型、wrapper、コンポーネント、テスト fixture を探してください。探索には context-mode の `ctx_batch_execute` / `ctx_search`、`rg`、Serena の symbol search を優先し、既存の source of truth を確認してから新しい抽象を追加します。KISS / DRY / YAGNI は守りますが、TABBIN 固有の WXT、APM、完了ゲートの規則を汎用ルールで置き換えないでください。

## テストガイドライン
主要なテストランナーは Vitest（`vitest.ci.config.ts`）、E2E は `e2e/` の Playwright（`*.spec.ts`）。unit / integration テストには `*.test.ts(x)` を使います。ローカルでの script 使い分けや node / dom project の判別は `02-vitest-local-development` を参照してください。

完了ゲート（AI / Codex が完了を報告するための必須条件）は次の 1 箇所に集約します。コードが変わった場合は `bun run quality:check` を実行し、自明でない変更では `bun run test:coverage` が coverage 100% を報告することを確認してください。PR 前に regression test を追加または調整してください。

coverage 100% は `vitest.ci.config.ts` の coverage threshold 設定に基づきます。docs・E2E (`e2e/**`)・Storybook story・生成物ディレクトリは coverage 対象外として設定されています。新規に対象外にしたいディレクトリがある場合は `vitest.ci.config.ts` の `coverage.exclude` を更新するのが正しい対応で、しきい値を下げて逃げることはしないでください。

## タスク管理
永続的なタスク管理は GitHub issue などリポジトリ外の issue tracker を使ってください。ローカルの Markdown TODO リストや生成 artifact を source of truth にしないでください。

作業セッションを終えるときは、残った follow-up 作業を issue として残し、上記完了ゲート（`bun run quality:check`、必要に応じて `bun run test:coverage`）を実行して、完了したブランチを push してください。commit / push / PR 作成の許可境界は下記「Commit / Push / PR 許可境界」セクションに統一されています。

## Commit / Push / PR 許可境界
commit、push、PR 作成は以下の条件を全て満たす場合のみ実行します。この境界は `commit-push-pr` / `github-issue-implementation` / `github-pr-review` / `finishing-a-development-branch` 等、副作用を持つ全ての Skill に共通する唯一のルールです。

- ユーザーが明示的に依頼した作業フロー内、または依頼に含まれる通常の実装ステップであること
- stage するのは当該 Issue / タスクが所有する path だけ（他者変更を含まないこと）
- commit 前に `bun run quality:check`（release-sensitive なら `bun run release:check`）が通っていること
- commit 後の working tree が clean であること
- force-push はユーザーが明示しない限り行わない
- base branch (`develop` / `main` / `release/*`) への直接 push はしない
- PR は原則 `develop` を target とし、ユーザーが Draft を指定しない限り Open で作成する（hotfix は例外）
- merge、close、approve はユーザーが明示しない限り行わない
- PR 本文に原因、主要変更、検証結果、regression risk、acceptance criteria 対応、`Closes #<issue>` を含める
- UI 変更では screenshot / GIF を含める
- `.apm/` を編集した場合は `bun run apm:sync` で生成先を更新し、`bun run apm:check` で一致を確認する
- generated files だけの手編集を PR の根拠にしない
- commit 件名は日本語で書く（英語不可ではないが、リポジトリ慣習に合わせる）
- `git push` が成功し、`git status` で origin と同期済みであることを確認するまで作業は完了ではない
- issue tracker 操作や push がローカルツールや認証情報でブロックされた場合は、ブロッカーを明示的に報告する
