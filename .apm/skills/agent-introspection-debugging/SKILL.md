---
name: agent-introspection-debugging
description: エージェント workflow がループ、過去判断と矛盾、source-of-truth 境界の喪失、またはプロダクトコードではなく tool/context 挙動で失敗しているときに使います。
---

# エージェント自己診断デバッグ

失敗がエージェントプロセス自体にあるときにこの skill を使います: 同じ失敗コマンドの繰り返し、compaction 後の古い前提、無視された repo 指示、tool 出力の flood、source-of-truth の drift、根拠のない完了報告。

ユーザーの指摘や振り返り依頼を待たず、作業中にこれらを観測した時点で使います。
原因が分かり、現在の作業に関係する可逆なローカル改善なら、
[harness-optimizer](../harness-optimizer/SKILL.md) に従って修正と検証まで進めます。
原因が未確定なら候補と不足証拠を残し、同じ失敗の反復や根拠のないルール追加を止めます。

## まずコード失敗とエージェント失敗を分ける

どの層が壊れているか確認:

- Product code: test、build、runtime、UI フローの失敗。
- Agent workflow: 作業の繰り返し、誤ファイル読み取り、生成 artifact の編集、必須ゲートの省略、コンテキスト喪失、根拠なしの status 報告。
- Tooling/environment: sandbox、network、permissions、missing binary、生成出力の所有権によるブロック。

product code の根本原因分析には `systematic-debugging` を使う。この skill は agent/tool/process 層向け。

## ワークフロー

1. 現在の目的を具体的な deliverable として言い換える。
2. ユーザーに履歴を聞く前に、現在と過去のコンテキストを検索。
3. prompt-to-artifact チェックリストを作り、各要件を証拠に対応付ける:
   files、commands、generated artifacts、tests、gates、issue tracker state、PR state。
4. 乖離を特定:
   - 生成ファイルだけへの source-of-truth 編集
   - 要件をカバーしない passing test
   - 隠れた失敗を伴う繰り返しコマンド
   - 過去 run からの古い前提
   - context-mode / RTK / Serena ルーティング違反
5. 保存済みの原文ログと終了コードから原因を特定し、次の 1 つの corrective action を
   選んで検証。圧縮ログの不足だけを理由に高コストの command を繰り返さない。
6. harness や status ファイルの更新は、アクティブタスクの一部の場合のみ。

## TABBIN ガードレール

- 永続的な APM 変更は `.apm/instructions`、`.apm/prompts`、
  `.apm/hooks`、または `.apm/skills` に置き、生成出力は refresh する。
- Generator/Evaluator ハーネスに Planner や Orchestrator 層を足さない。
- Evaluator は fresh-context review であり、auto-started hook loop ではない。
- コード変更の完了報告には `bun run quality:check` と `bun run test:coverage` を実行し、
  `vitest.ci.config.ts` の global / per-glob threshold を満たした証拠が必要。
  現在の成果物に対する成功証拠は再利用し、文書・軽微な設定はリポジトリ指示に従い
  対応する検査を選ぶ。
- tool が必要な失敗詳細を隠す場合は、意図的に targeted な
  non-filtered 経路へ切り替え、判断に必要な証拠だけを出力する。
- browser 起動の権限失敗、binary 不足、test assertion failure を混同しない。
  同一 command の権限付き再実行、実行前の `--list`、必要な Firefox 環境確認は
  [e2e-testing](../e2e-testing/SKILL.md)、argv と原文ログ保持は [rtk](../rtk/SKILL.md) に従う。
- 実装修正が不要という review 結果と、必須 gate 成功・release-ready の判断を分ける。
  環境不足で gate が未完了なら、その blocker を残して報告し、全体を `approved` や
  検証完了と表現しない。
