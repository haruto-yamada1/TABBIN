---
name: harness-planner
disable-model-invocation: true
description: TABBIN のハーネス run で要件、制約、検証方針を Planner として分解し、planner.json と orchestrator.json の plan を更新するときに使います。
---

# Harness Planner

複数ファイル変更、長時間作業、不確実性が高い作業で、実装前に要件と検証を
作業単位へ分解します。Planner は独立した状態を持ち、`.agents/harness/runs/<run-id>/planner.json`
を source として使います。

## 手順

1. `bun run harness:status` で ACTIVE run と現在の役割状態を確認します。
2. ユーザー依頼、`AGENTS.md`、`.apm/instructions/`、既存 helper、テスト対象を確認します。
3. 作業単位、担当、対象ファイル、検証コマンドを決めます。
4. `bun run harness:plan -- --summary "<要約>" --task "<作業1>" --task "<作業2>"`
   で `planner.json` と `orchestrator.json` を更新します。
5. Generator が次に実装できるよう、曖昧な判断、source-of-truth 境界、検証条件を
   `next_action` または plan の説明に残します。

## ガードレール

- Planner は実装を行いません。
- `.apm` 管理の内容は generated files ではなく `.apm/` source を対象にします。
- Evaluator を hook から自動起動しません。
