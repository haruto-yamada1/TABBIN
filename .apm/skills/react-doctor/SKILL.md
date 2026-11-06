---
name: react-doctor
description: React の変更後に問題を早期検出するために実行します。React project の code review、feature 完了、bug fix 時に使います。
version: 1.0.0
---

# React Doctor

React codebase を走査し、security、performance、correctness、architecture の問題を
検出します。0-100 の score と、対応可能な diagnostic を出力します。

## 使い方

Socket.dev への送信が未許可の場合やオフライン実行では、各コマンドに
`--no-supply-chain` も指定し、供給網診断を省いた結果として報告してください。

```bash
# 開発中: 既存の追跡ファイルの差分を確認
bun run doctor . --verbose --scope changed --no-score

# commit / PR 前: 新規ファイルを含む全体診断（score API は省略、Socket.dev 通信は残る）
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
`--no-score` は score API・共有 URL・クラッシュ報告を停止する指定であり、
すべての通信を停止するものではありません。現行の `doctor.config.ts` は供給網診断を
無効化していないため、`--scope full` では直接依存の名前・バージョン
（devDependencies を含む）を Socket.dev API に問い合わせます
（有効なキャッシュがあれば再利用）。通信失敗などで個別の供給網診断が省略されるため、
診断が0件でも全診断完了とは扱いません。`--no-supply-chain` を指定した場合も、
全体スコープで供給網診断を省いた検査です。
CIの100点ゲートと既存の security gate は維持し、部分診断で代替しません。
外部送信の許可境界も維持します。診断が0件でも、
外部 score API に接続できない場合は100点と報告せず、数値の確認はCI結果と区別します。
承認期限切れや LICENSE 変更で拒否された場合は、
検査を無効化せず原文・用途を再確認してください。
