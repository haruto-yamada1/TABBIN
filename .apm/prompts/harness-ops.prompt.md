---
description: ハーネス run の状態確認、監査、品質ゲート、学習候補抽出、model routing など完了前後の運用操作をまとめた入口。
---

# ハーネス運用操作 (harness-ops)

この prompt は、完了前後のハーネス運用コマンドを 1 つにまとめた入口です。
必要な section を実行し、結果を日本語で簡潔に報告してください。
各操作の詳細仕様は `bun run harness:<subcommand> --help` と
`.apm/instructions/harness.instructions.md` を参照してください。

## status — 状態確認

`bun run harness:status` を実行し、ACTIVE run の状態を確認してください。
必要なら `bun run harness:status -- --write` で `.agents/harness/status.md` に
portable handoff を書き出してください。

確認観点: Orchestrator / Generator / Evaluator / Decision の状態、未完了 plan、
未解決 findings、次アクション、検証証跡と現在の変更の対応。

## loop-status — 進捗確認

ACTIVE run の `orchestrator.json` を確認し、plan と agents の進捗を整理してください。

確認観点: `plan[].status` と現実の作業状態の一致、`agents[].status` の未更新残り、
blocking task のメインセッション / 並列 Worker 振り分け、Evaluator 起動条件。

## model-route — 実行主体の振り分け

ユーザー依頼または ACTIVE run の plan を見て、どの作業をどの実行主体に渡すか判断してください。

- **main session**: 次の一手が blocking、統合判断、ユーザー会話が必要な作業。
- **Explorer**: 読み取り専用の調査、影響範囲確認、既存設計の把握。
- **Worker**: write set が明確で、他の作業と衝突しない実装。
- **Evaluator**: 完了前の fresh-context review。
- **human grader**: UI、運用ポリシー、仕様判断などユーザー判断が必要なもの。

担当、理由、write set、依存関係、完了条件を簡潔に提案してください。

## audit — 完了前監査

```bash
bun run harness:audit
bun run harness:validate
bun run harness:surface-audit
bun run harness:security-audit   # 必要に応じて
bun run harness:repo-status      # 必要に応じて
```

確認観点: schema 通過、Orchestrator plan と実際の変更ファイルの対応、
Generator の検証証跡の十分さ、Evaluator が必要な作業で `evaluator.json` が
`approved` でない状態になっていないか、`changes_requested` / `blocked` の
再発防止候補の扱い、deterministic scorecard の `overall_score` / failed category /
Top 3 actions の妥当性、agent surface security finding の扱い。

完了可否、足りない証跡、次に実行すべきコマンドを簡潔に報告してください。

## quality-gate — 品質ゲート

現在の変更内容に対して必要な品質ゲートを実行してください。コード変更がある場合は
原則として次を確認します。

```bash
bun run compile
bun run quality:check
bun run test:coverage
bun run harness:validate
bun run harness:audit
bun run harness:surface-audit
bun run harness:security-audit
bun run harness:repo-status
```

方針: 失敗した場合は原因を直して再実行。成功した検証は `generator.json` または
`orchestrator.json` の `verification` に記録。既存の Stop hook と矛盾する重い自動実行は
追加せず、手動 command として使います。

## security-audit — agent surface 監査

`bun run harness:security-audit` を実行し、agent surface に危険な設定や prompt が
残っていないか確認してください。

確認観点: `.apm/hooks/scripts` に `curl` / `wget`、inline eval、secret らしき値がないか、
`.apm/skills` と `.apm/prompts` に prompt injection リスクがないか、finding が
source-of-truth 側修正か follow-up 分離か。

finding の有無、重大度、直すべきファイル、完了可否を日本語で短く報告してください。

## repo-status — repo readiness 確認

`bun run harness:repo-status` を実行し、ACTIVE run の有無に関係なく repo readiness を
確認してください。

確認観点: ACTIVE run がある場合は schema と次アクションの妥当性、ない場合でも
surface score / security finding 数 / Top actions から repo-level の不足が分かるか、
完了前に `harness:surface-audit` / `harness:security-audit` / `harness:validate` の
どれを追加すべきか。

## learn — 学習候補抽出

ACTIVE run の `evaluator.json`、`decision.json`、`governance.jsonl`、`events.jsonl` を確認し、
再発防止として残すべき候補を抽出してください。

方針: 自動で follow-up issue や `.apm/instructions` に追記しない。繰り返し起きそうな
問題だけ候補にする。一時的失敗、環境依存、既に修正済みの単発ミスは候補から外す。

候補ごとに、残す場所、理由、最初に触る source を日本語で短く示してください。

## 出力

共通ルール: 実行したコマンド、結果、残るリスク、次アクションだけを簡潔に報告し、
長い JSON やログはインラインにしないでください。
