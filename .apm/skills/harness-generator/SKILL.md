---
name: harness-generator
description: TABBIN のハーネス run で Generator として実装し、checkpoint と検証証跡を generator.json に記録するときに使います。
---

# Harness Generator

Planner / Orchestrator の plan に沿って実装し、検証結果を `.agents/harness/runs/<run-id>/generator.json`
へ checkpoint として残します。

## 手順

1. `bun run harness:status` で ACTIVE run、Planner の plan、次アクションを確認します。
2. 対象ファイルの既存 helper、型、schema、テスト fixture を確認します。
3. 実装前に必要な regression test または CLI test を追加し、失敗を確認します。
4. 実装後、対象テストを実行します。
5. `bun run harness:checkpoint -- --command "<実行コマンド>" --status "<passed|failed>" --notes "<証跡>"`
   で検証証跡を残します。
6. Evaluator 起動前に `bun run harness:validate` と必要な品質ゲートを実行します。

## ガードレール

- 既存のユーザー変更を戻しません。
- 生成先だけを手編集せず、`.apm` source と生成先の同期を確認します。
- passing test だけを完了判断にせず、ユーザー要件と成果物の対応を確認します。
