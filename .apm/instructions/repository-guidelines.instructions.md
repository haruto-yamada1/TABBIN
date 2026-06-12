---
description: TABBIN エージェント向けのリポジトリ構成、コマンド、スタイル、テスト、完了ゲート。
applyTo: "**/*"
---

# リポジトリガイドライン

## プロジェクト構成とモジュール整理
このリポジトリは WXT ベースのブラウザ拡張機能（TABBIN）です。アプリ本体は `src/` 配下に集約されています。主要なエントリポイントは `src/entrypoints/`（`background.ts`、`options/`、`saved-tabs/`、`changelog/`）にあります。ドメイン機能は `src/features/` 配下にまとまっています（例: `src/features/options`、`src/features/saved-tabs`）。再利用可能な UI と共通 React コンポーネントは `src/components/` と `src/components/ui/` にあります。横断的なロジックは `src/lib/`（background helper、storage、browser wrapper）にあり、共通型は `src/types/`、定数は `src/constants/`、ユーティリティは `src/utils/` にあります。

テストは多くの場合 `*.test.ts` / `*.test.tsx` として対象コードの近くに置かれます。E2E テストは `e2e/`（`*.spec.ts`）にあります。Storybook の story と Storybook 用の補助 assets は `src/` 配下に置きます。ローカル検査や保守用スクリプトは `tools/scripts/` にあります。`.output/`、`coverage/`、`playwright-report/`、`test-results/` などの生成出力ディレクトリは手動編集しないでください。

## ビルド、テスト、開発コマンド
- `bun install`: 依存関係をインストールします（CI は Node `22` と Bun `1.2.8` を使用）。
- `bun run dev` / `bun run dev:firefox`: Chrome / Firefox 向けに WXT dev mode を起動します。
- `bun run build` / `bun run build:firefox`: 本番用の拡張機能をビルドします。
- `bun run zip` / `bun run zip:firefox`: 拡張機能の zip 成果物を作成します。
- `bun run compile`: TypeScript の型チェックを実行します（`tsgo --noEmit`）。
- `bun run test` / `bun run test:coverage`: Vitest テストを実行します（coverage は任意）。
- `bun run e2e`: Playwright のブラウザテストを実行します。
- `bun run quality`: format、lint、test、Knip、重複チェックを実行します。

## コーディングスタイルと命名規則
TypeScript + React を ES modules で使います。format は oxfmt（`.oxfmtrc.json`）、lint は Oxlint（`.oxlintrc.json`）で強制されます。2 スペースインデント、80 文字幅、シングルクォート、セミコロンなしです。import 整理は oxfmt の `sortImports` に任せてください。

React コンポーネントは `PascalCase.tsx`（例: `ImportExportSettings.tsx`）、ユーティリティや定数は `camelCase.ts`（例: `autoDeleteOptions.ts`）を使います。現実的な範囲で、テストは検証対象のコードの近くに置いてください。

実装前に既存の helper、型、wrapper、コンポーネント、テスト fixture を探してください。探索には context-mode の `ctx_batch_execute` / `ctx_search`、`rg`、Serena の symbol search を優先し、既存の source of truth を確認してから新しい抽象を追加します。KISS / DRY / YAGNI は守りますが、TABBIN 固有の WXT、APM、完了ゲートの規則を汎用ルールで置き換えないでください。

## テストガイドライン
主要なテストランナーは Vitest（`vitest.ci.config.ts`）です。E2E フローは `e2e/` の Playwright が担当します。unit / integration テストには `*.test.ts(x)`、Playwright テストには `*.spec.ts` を使います。Vitest 設定上の明示的な coverage 閾値はありませんが、このリポジトリで AI / Codex が完了を報告するには、`bun run test:coverage` が coverage 100% を報告する必要があります。自明でない変更では、PR を開く前に regression test を追加または調整してください。

## タスク管理
永続的なタスク管理は GitHub issue などリポジトリ外の issue tracker を使ってください。ローカルの Markdown TODO リストや生成 artifact を source of truth にしないでください。

作業セッションを終えるときは、残った follow-up 作業を issue として残し、コードが変わった場合は必須 quality gate を実行し、完了したブランチを push してください。`git push` が成功し、`git status` でブランチが origin と同期済みであることを確認するまで、作業は完了ではありません。issue tracker 操作や push がローカルツールや認証情報でブロックされた場合は、そのブロッカーを明示的に報告してください。

## Commit と Pull Request のガイドライン
最近の履歴では、簡潔な件名（日本語が多い）と merge commit が使われています。1 つの変更を説明する、短く命令形の commit message を優先してください。PR は `main` を target にし、`変更内容` に変更点をまとめ、チェックリストでローカル検証（`ローカル環境でエラーになっていない`）を確認してください。関連 issue をリンクし、UI 変更では screenshot / GIF を含めてください。

PR 作成前には、base branch との差分、直近の関連 commit、生成 artifact の混入有無を確認してください。`.apm` で管理される内容は source 側の変更と生成先の同期が揃っていることを確認し、generated files だけの手編集を PR の根拠にしないでください。
