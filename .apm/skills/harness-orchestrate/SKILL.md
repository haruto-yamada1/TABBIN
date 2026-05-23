---
name: harness-orchestrate
description: TABBIN の複雑な作業を Harness Orchestrator として開始し、Planner / Generator / Evaluator / Optimizer の流れを管理するときに使います。
---

# Harness Orchestrate

この skill は、`$harness` の skill selector からハーネス全体の入口を選べるようにする
ための Orchestrator alias です。内容は `.apm/prompts/harness-orchestrate.prompt.md` と
同じ意図で使います。

## 発火条件

次のいずれかに当てはまる場合に使います。

- 新機能、複数ファイル変更、長時間作業、設計判断が必要な作業。
- サブエージェントで調査、実装、レビューを分担できる作業。
- 完了判断に `bun run quality`、`bun run test:coverage`、Evaluator review が必要な作業。
- ユーザーが `harness`、`orchestrate`、`ECC っぽく`、`サブエージェント` と言及した作業。

小さい一問一答、単発の読み取り、明確な 1 ファイル修正では使わなくて構いません。

## 手順

1. 既存の `.agents/harness/ACTIVE` を確認します。
2. 新規 run が必要なら、次を実行します。

```bash
bun run harness:start -- --task "<ユーザー依頼の要約>"
```

3. `bun run harness:status` で状態を確認します。
4. Planner として、実装順、ファイル候補、テスト戦略、rollback 条件を決めます。
5. 必要に応じて `bun run harness:plan` で `planner.json` と `orchestrator.json` を更新します。
6. Generator に実装させ、`bun run harness:checkpoint` で検証証跡を残します。
7. fresh-context 評価が必要なら `bun run harness:evaluate` の後に Evaluator を起動します。
8. 最後に `bun run harness:validate` と `bun run harness:audit` を確認します。

## ガードレール

- hook から Orchestrator や Evaluator を自動起動しません。
- `.apm` 管理の内容は generated files ではなく `.apm/` source を編集します。
- サブエージェントを使う場合は、担当ファイル、責任範囲、他者変更を戻さないことを明示します。
- ユーザーには run id、計画、次アクション、検証結果だけを簡潔に報告します。
