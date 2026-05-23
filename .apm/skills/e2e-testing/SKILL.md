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
2. E2E 全体の gate には `bun run e2e` を使います。iteration 中だけ狭い
   Playwright command を実行し、E2E が scope に入る作業は最後に repo command で
   仕上げます。
3. screenshot、trace、video は debugging artifact として扱います。失敗箇所の特定に
   使い、生成 report は commit しません。
4. extension 固有 flow では、安定した `baseURL` などの一般的な web app 前提を
   置きません。この repo の WXT / extension loading pattern を優先します。
5. selector は可能な限り user-facing にします。安定した accessible target が UI に
   無い場合だけ test id を追加します。
6. flaky failure では固定 sleep を足すのではなく、待つべき browser state または
   storage state を特定します。

## 完了条件

- E2E test が user-visible または browser-lifecycle の挙動を覆っている。
- 実用的に確認できる場合、元の regression で test が失敗することを確認している。
- 最終的な関連 command と exit status を報告している。
- repo 全体の完了報告では、引き続き `bun run quality` と
  `bun run test:coverage` 100% の gate に従う。
