---
description: ECC に近い高忠実度ハーネスのワークフロー概要と routing。
applyTo: "**/*"
---

# ハーネス

TABBIN は複雑なエージェント作業に Orchestrator / Planner / Generator / Evaluator /
Optimizer ハーネスを使います。`.apm` が source of truth で、実行状態は
`.agents/harness/` に保存します。

## いつ使うか

小さい一問一答や明確な 1 ファイル修正では通常のメインセッションだけで進めてください。
複数ファイル、長時間、高不確実性、設計判断を含む場合は `$harness-orchestrate` Skill
を使います。

## 役割

- **Orchestrator**: ユーザー依頼を受けて run を作成し、分担と最終判断を管理する
- **Planner**: 要件、制約、作業単位、検証方針を `planner.json` に記録する
- **Generator**: 実装し、checkpoint と検証証跡を `generator.json` に残す
- **Evaluator**: fresh-context で成果物をレビューし `approved` / `changes_requested` /
  `blocked` を `evaluator.json` に書く
- **Optimizer**: 再発防止候補を `learning.json` に整理する

## 状態ファイル

`.agents/harness/` 配下に置きます。ACTIVE run は `.agents/harness/ACTIVE` に記録します。
schema は `.apm/harness/schemas/` にあり、`bun run harness:schemas` で再生成、
`bun run harness:validate` で検証します。

## hook

hook は Orchestrator や Evaluator を自動起動しません。状態表示、警告、記録のみを行います。
`TABBIN_HARNESS_STRICT=1` で config protection と first edit gate がブロックできます。

詳細な評価観点、状態ファイルの schema、hook lifecycle、コマンド一覧は
`$harness-orchestrate` Skill と `.apm/SKILLS.md` を参照してください。
