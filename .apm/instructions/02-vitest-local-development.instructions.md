---
description: ローカル開発時の Vitest 実行コマンド使い分けと推奨ワークフロー。
applyTo: "**/*"
---

# ローカル Vitest 実行ガイド

TABBIN の Vitest は `vitest.ci.config.ts` で `projects` 構成 (node / dom) を
採用し、`pool: 'threads'` と `isolate: false` で高速化しています。
ローカル開発では用途別に scripts を分けると、体感速度が大きく変わいます。

## scripts 一覧 (package.json)

| scripts | 用途 | 実測時間の目安 |
| --- | --- | --- |
| `bun run test` | 全テスト実行 (CI と同じ) | 約 18 秒 |
| `bun run test:node` | DOM 不要なロジック・hook テスト | 約 1.8 秒 |
| `bun run test:dom` | DOM 必要 (React コンポーネント、entrypoint) | 約 17.8 秒 |
| `bun run test:changed` | git HEAD との diff ベースのテスト | 規模依存 |
| `bun run test:related` | 指定ファイル依存のテスト一覧を実行 | 規模依存 |
| `bun run test:coverage` | カバレッジ計測 | 約 45 秒 |

> 上記の実測時間は 2026-07 時点・手元の環境での目安です。テスト本数 (~170 files / ~1408 tests) と実行時間は環境・時期で変わるため、大幅にずれた場合は本表を更新してください。

## 推奨の使い分け

### 開発中のサイクル

- `src/lib/**` や `src/utils/**`、pure な hook を触った → `bun run test:node`
- `src/components/**` や `src/features/**/components/**`、`src/features/saved-tabs/app/**` を触った → `bun run test:dom`
- 単一ファイルだけ検証したい → `bunx vitest run <path>`
- 単一ファイルを watch → `bunx vitest <path>`

### commit / PR 前

- ローカルで全テスト走らせる → `bun run test`
- カバレッジも検証する → `bun run test:coverage`

## test:changed / test:related の使い方

- `bun run test:changed` は `vitest run --changed` を走らせ、**git HEAD との差分** に基づいて関連テストを抽出・実行します。未コミットの変更と最終コミットの差分を検知するため、commit 前の最終確認に便利です。base branch (`origin/develop` 等) との差分ベースにしたい場合は、事前に `git merge-base` 等で HEAD を詰めるか、素直に `bun run test` を使ってください。
- `bun run test:related` は `vitest related --run` を走らせ、指定したソースファイルが依存されているテストを抽出・実行します。ファイル引数はスクリプトに含まれていないため、`bun run test:related -- src/lib/foo.ts` のように `--` 経由で対象ファイルを渡してください。実行結果は該当ファイルに連なるテストのみになるため、影響範囲の sanity check 向きです。
- いずれも `vitest.ci.config.ts` の `projects` 構成 (node / dom) を跨いで実行されるため、プロジェクト別の速度優位性は崩れます。純粋に node project だけ検証したい場合は `bun run test:node` を優先してください。

## 速度の根拠

`bun run test` で全テスト (~170 files / ~1408 tests) を走らせると約 18 秒かかります。
このうち大半 (~17.8 秒) は DOM project (happy-dom + React component) で、node project
は ~1.8 秒で完了します。**ロジックだけ触っているのに毎回 18 秒待つのは無駄** なので、
`test:node` だけで済むケースを判別して使ってください。

## 単一ファイル実行のパターン

- そのファイルだけ走らせる:
  `bunx vitest run src/features/options/ImportExportSettings.test.tsx`
- watch モードで開発する:
  `bunx vitest src/features/options/ImportExportSettings.test.tsx`
- ファイル内の特定テストだけ:
  `bunx vitest run -t "clickBehavior の select を変更できる"`

## node / dom project の判別

- `src/lib/**` `src/utils/**` `src/constants/**` → 基本 node
- `src/features/**/lib/**` `src/features/i18n/lib/**` `src/features/analytics/**` → 基本 node
- `**/*.test.tsx` `src/components/**` `src/entrypoints/**` `src/features/saved-tabs/app/**`
  `src/features/options/ImportFileDialog.test.ts` `src/features/ai-chat/hooks/useSharedAiChatHistory.test.ts`
  → 基本 dom
- 不明なファイルは `vitest.ci.config.ts` の `include` / `exclude` で確認する

## 注意事項

- CI と同じ結果を得たい場合は `bun run test` を使う (matrix shard ではなく全体)。
- 単一ファイル実行 (`bunx vitest run <path>`) は projects を跨ぐ判定が無効になる
  ことがあるため、可能なら `test:node` / `test:dom` を使う。
- happy-dom は jsdom より速いが、API 互換性リスクのあるテスト (Radix UI portal
  など) では `vitest.config.ts` 側の jsdom 環境が必要になるケースが残る。
  もし互換性問題が出たら該当ファイルだけ `// @vitest-environment jsdom` を
  ファイル先頭に付けて個別切替する。

## coverage 100% の扱い

完了ゲートで `bun run test:coverage` が coverage 100% を報告することを確認する前提です。これは `vitest.ci.config.ts` の coverage 設定で 100% threshold が指定されているためです。docs や E2E (`e2e/**`)、Storybook story、生成物ディレクトリ (`.output/` / `coverage/` / `playwright-report/` / `test-results/`) は coverage 対象外として設定されている前提で運用します。新規ディレクトリを coverage 対象外にしたい場合は、設定側 (`vitest.ci.config.ts` の `coverage.exclude`) を更新することが正しい対応で、しきい値を下げて逃げることはしないでください。詳細は `repository-guidelines` の完了ゲートを参照してください。
