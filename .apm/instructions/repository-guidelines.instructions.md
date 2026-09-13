---
description: TABBIN リポジトリ全体の構成・ビルド・コーディングスタイル・テスト・タスク管理・Commit/PR のガイドライン。
applyTo: '**/*'
---

# リポジトリガイドライン

## エージェントの進め方

- 依頼と会話から目的、対象範囲、完了条件を確認し、許可済みの調査・編集・検証を完了まで進める。既存パターンで決められる可逆な実装判断は、仮定を短く伝えて進める。
- 質問は結果や許可範囲を変える不足情報がある場合に限る。回答に依存しない作業は続ける。ユーザーが段階ごとの承認を指定した場合は、その境界で待つ。
- skill の定型的な質問・手順だけを理由に、許可済みの作業を止めたり再承認を求めたりしない。公開操作の許可は下記「Commit / Push / PR 許可境界」で判断する。
- 調査は対象の source of truth、呼び出し元、関連テストから始め、証拠が必要な範囲へ広げる。同じセッションで確認済みの文書を、毎回全文読み直さない。
- skill は依頼の目的と発火条件が合うものだけを選ぶ。入口を読み、参照資料は必要時だけ開く。ハーネスの計画がある場合は、brainstorming / writing-plans の計画を重ねない。
- サブエージェントは、独立した調査・担当ファイルが分離した実装・fresh-context 評価に使う。主作業が直ちに結果を必要とする作業はメインで進める。委任には目的、担当範囲、守る契約、必要な参照先と検証条件だけを渡す。
- 途中の質問には短く答えて元の作業を続ける。ユーザーの中止・方向転換は反映し、既に完了した作業や検証結果を引き継ぐ。
- 報告は日本語で、結果、変更理由、検証、残る問題を簡潔に示す。内部の検討過程や定型の見出しを必要以上に列挙しない。

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

実装前に既存の helper、型、wrapper、コンポーネント、テスト fixture を探してください。探索には `rg` と Serena の symbol search を優先し、既存の source of truth を確認してから新しい抽象を追加します。KISS / DRY / YAGNI は守りますが、TABBIN 固有の WXT、APM、完了ゲートの規則を汎用ルールで置き換えないでください。

## ツールルーティング（Codex CLI）

shell コマンド実行・ファイル分析・Web 取得・コンテキスト管理では、コンテキストウィンドウの過剰消費を防ぐため `$context-mode` skill のルーティング規則に従ってください。shell 出力を圧縮するときは `$rtk` skill を使います。これらは常時注入ではなく用途別 skill です。

## テストガイドライン

主要なテストランナーは Vitest（`vitest.ci.config.ts`）、E2E は `e2e/` の Playwright（`*.spec.ts`）。unit / integration テストには `*.test.ts(x)` を使います。ローカルでの script 使い分けや node / dom project の判別は `02-vitest-local-development` を参照してください。

完了ゲート（AI / Codex が完了を報告するための必須条件）は次の 1 箇所に集約します。コードが変わった場合は `bun run quality:check` を実行し、自明でない変更では `bun run test:coverage` を実行し、`vitest.ci.config.ts` に定義された global / per-glob threshold をすべて満たしていることを確認してください。PR 前に regression test を追加または調整してください。

検証は変更に近いものから始め、必要な完了ゲートまで実行します。現在の差分・環境に対して成功した検証は、その証拠を再利用してください。コード・依存・設定の変更、失敗、未解決の懸念がなければ、報告や skill の切り替えだけを理由に同じ検証を繰り返しません。文書や挙動に影響しない軽微な変更には、実装をなぞるだけのテストを増やさず、対応する構文・参照・生成同期の検査を選びます。この判断で上記の必須ゲートやデータ・権限境界の回帰検証を省略しないでください。

coverage threshold の source of truth は `vitest.ci.config.ts` です。global threshold と critical domain ごとの per-glob threshold が定義されています。docs・E2E (`e2e/**`)・Storybook story・生成物ディレクトリは coverage 対象外として設定されています。新規に対象外にしたいディレクトリがある場合は `vitest.ci.config.ts` の `coverage.exclude` を更新するのが正しい対応で、しきい値を下げて逃げることはしないでください。

## タスク管理

永続的なタスク管理は GitHub issue などリポジトリ外の issue tracker を使ってください。ローカルの Markdown TODO リストや生成 artifact を source of truth にしないでください。

作業セッションを終えるときは、残った follow-up 作業は issue 候補として報告し（ユーザーの明示依頼がない限り Issue を自動作成しない）、上記完了ゲート（`bun run quality:check`、必要に応じて `bun run test:coverage`）を実行してください。push はユーザーの明示依頼時のみ行います。commit / push / PR 作成の許可境界は下記「Commit / Push / PR 許可境界」セクションに統一されています。

## Commit / Push / PR 許可境界

commit、push、PR 作成は以下の条件を全て満たす場合のみ実行します。この境界は `commit-push-pr` / `github-issue-implementation` / `github-pr-review` / `finishing-a-development-branch` 等、副作用を持つ全ての Skill に共通する唯一のルールです。

- 許可境界は操作単位で分ける。実装・修正依頼だけでは commit / push / PR / Issue 作成へ暗黙に遷移しない。「確認」「調査」「レビュー」の依頼でこれらの書き込みを行わない。

| 操作                    | 許可条件                                           |
| ----------------------- | -------------------------------------------------- |
| local edit / test       | 実装・修正依頼で許可                               |
| commit                  | 明示的な実装・publish workflow、または commit 依頼 |
| push                    | push・PR 作成・review 対応などの明示依頼           |
| PR 作成                 | PR 作成または Issue 実装 workflow の明示依頼       |
| Issue 作成              | ユーザーの明示依頼                                 |
| merge / close / approve | 常に個別の明示依頼                                 |

- stage するのは当該 Issue / タスクが所有する path だけ（他者変更を含まないこと）
- commit 前に `bun run quality:check`（release-sensitive なら `bun run release:check`）が通っていること
- commit 後の working tree が clean であること
- force-push はユーザーが明示しない限り行わない
- base branch (`develop` / `main` / `release/*`) への直接 push はしない
- PR は原則 `develop` を target とし、ユーザーが Draft を指定しない限り Open で作成する（hotfix は例外）
- merge、close、approve はユーザーが明示しない限り行わない
- PR 本文に原因、採用した解決、主要変更、検証結果、regression risk、acceptance criteria 対応、`Closes #<issue>` を含める
- UI 変更では screenshot / GIF を含める
- `.apm/` を編集した場合は `bun run apm:sync` で生成先を更新し、`bun run apm:check` で一致を確認する
- generated files だけの手編集を PR の根拠にしない
- commit 件名は日本語で書く（英語不可ではないが、リポジトリ慣習に合わせる）
- push を依頼された作業は、`git push` が成功し、`git status` で origin と同期済みであることを確認するまで完了ではない
- issue tracker 操作や push がローカルツールや認証情報でブロックされた場合は、ブロッカーを明示的に報告する
