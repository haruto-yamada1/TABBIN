---
name: e2e-testing
description: TABBIN の WXT ブラウザ拡張フローに対する Playwright E2E カバレッジを追加、変更、デバッグ、レビューするときに使います。
---

# E2E テスト

ブラウザ拡張 UI、background の挙動、storage、entrypoint をまたぐ
ワークフローについて、end-to-end の確信が必要な変更でこの skill を使います。

## E2E に含めるもの

unit test だけでは十分に覆えない重要なユーザーフローを優先します。

- 拡張機能の entrypoint を読み込み、主要 view 間を移動する流れ。
- タブやプロジェクトの保存、復元、削除、import、export。
- 実際のタブ、window、通知、storage に影響する background action。
- popup / options / saved-tabs の状態を一貫させる必要がある流れ。
- browser API や実ルーティングでしか再現しない不具合の regression test。

純粋な data transform、小さな UI state、storage helper の edge case は、
browser lifecycle が本質でない限り Vitest 側に置きます。

## TABBIN の Playwright ワークフロー

1. 新しい pattern を作る前に `e2e/` 配下の既存 test を確認し、local fixture /
   helper を再利用します。
2. E2E 全体には `bun run e2e`、対象ファイルには
   `bun run e2e e2e/options.extension.spec.ts --project=extension --workers=1`
   のように repo command へ対象を渡します。実行前に同じ引数へ `--list` を付け、
   意図したファイル・件数だけが選ばれることを確認します。
3. screenshot、trace、video は debugging artifact として扱います。失敗箇所の特定に
   使い、生成 report は commit しません。
4. extension 固有 flow では、安定した `baseURL` などの一般的な web app 前提を
   置きません。この repo の WXT / extension loading pattern を優先します。
5. selector は可能な限り user-facing にします。安定した accessible target が UI に
   無い場合だけ test id を追加します。
6. flaky failure では固定 sleep を足すのではなく、待つべき browser state または
   storage state を特定します。

## 実行範囲・権限・前提環境

- Playwright の複数の位置引数は OR 条件です。script 側の `e2e` ディレクトリ指定へ
  対象ファイルを追加すると全体が選ばれ得るため、`--list` の結果を根拠にします。
  `--grep` に空白や `|` を含む場合は native tool で引用付き引数を保持します。
  RTK の扱いと raw log の保存は [rtk](../rtk/SKILL.md) に従います。
- Chromium 起動前の `EPERM`、`Operation not permitted`、sandbox の permission denial は、
  assertion failure と分けて調べます。実行 tool が escalation を提供していれば、
  同じ command を必要な権限付きで一度再実行します。別 browser への切替、
  `--no-sandbox`、保護設定の無効化、timeout 増加で回避しません。
  自動承認 review が拒否した場合は、拒否された操作と理由を報告します。
- executable が見つからない場合は、その binary と既存の設定先を確認します。
  起動権限の失敗だけを根拠に「Chrome が未導入」と判断しません。
  事前確認では自動 download やインストールを行いません。
- native Firefox smoke / release check が必要なときは、高コストの build や全体検証の前に
  `bun run verify:firefox-smoke-environment` を実行します。失敗は環境 blocker として扱い、
  skip や成功扱いへ変換しません。実行ファイルの存在確認と、実際の起動・smoke 成功は
  別の証拠です。
- 全体実行で失敗したら保存したログを先に読み、失敗した対象だけを同条件で切り分けます。
  既存不具合と判断するには変更前の baseline と比較し、単独再実行の成功だけで
  全体の green を主張しません。無関係な失敗を理由に広い suite を繰り返しません。

## 完了条件

- E2E test が user-visible または browser-lifecycle の挙動を覆っている。
- 実用的に確認できる場合、元の regression で test が失敗することを確認している。
- 最終的な関連 command と exit status を報告している。
- repo 全体の完了報告では `bun run quality:check` と `bun run test:coverage` を実行し、
  `vitest.ci.config.ts` の global / per-glob threshold を満たす。
- 実装 review の結果、実行できた gate、環境不足で未完了の gate を分けて報告する。
  必須 gate が未完了なら release-ready や全 gate 成功を主張しない。
