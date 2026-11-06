---
name: react-doctor
description: React の変更後に問題を早期検出するために実行します。React project の code review、feature 完了、bug fix 時に使います。
version: 1.0.0
---

# React Doctor

React codebase を走査し、security、performance、correctness、architecture の問題を
検出します。0-100 の score と、対応可能な diagnostic を出力します。

## 使い方

```bash
# 開発中: 既存の追跡ファイルの差分を確認
bun run doctor . --verbose --scope changed --no-score

# commit / PR 前: 新規ファイルを含む全体診断（外部スコア送信なし）
bun run doctor . --scope full --blocking error --no-score --json --json-compact
```

## ワークフロー

`bun install --frozen-lockfile` 後、上記のプロジェクト用コマンドを使います。
実行前に、解決済み version と配布物の LICENSE が承認済み条件に一致することを検証します。
`npx` / `bunx` の `@latest` や直接の CLI 実行で検証を迂回しないでください。

用途は TABBIN のコード品質検査だけです。診断に従って製品コードを修正し、再検査する
通常の開発支援に使います。React Doctor 本体・ソース・出力をモデル、prompt、skill、
エージェント自体の学習・比較評価・改善用データや benchmark に使わないでください。
その用途は別途の許諾確認が必要で、プロジェクト内の例外承認では許可されません。

変更後に実行し、まず error を修正します。`--scope changed` は未追跡の新規ファイルを
取りこぼすため、commit / PR 前は必ず `--scope full --no-score` でも確認します。
これは診断をすべて実行し、外部APIへのスコア送信だけを省くローカル検査です。
CIの100点ゲートは維持し、外部送信の許可境界も維持します。診断が0件でも、
外部 score API に接続できない場合は100点と報告せず、数値の確認はCI結果と区別します。
承認期限切れや LICENSE 変更で拒否された場合は、
検査を無効化せず原文・用途を再確認してください。
