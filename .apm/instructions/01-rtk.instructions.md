---
description: shell コマンド出力を圧縮するための RTK ルーティング規則。
applyTo: "**/*"
---

@/Users/tarou/.codex/RTK.md

# このリポジトリでの RTK 利用

RTK は Codex の shell 出力を圧縮するためにインストールされています。shell コマンドが適切な場面では RTK を使ってください。

- `rtk git status`、`rtk git diff`、`rtk rg`、`rtk find`、`rtk bun run test` などの圧縮ラッパーを優先してください。
- `context-mode` のルーティング規則をより高い優先度で扱ってください。RTK を使っても、生の `curl` / `wget`、インライン HTTP 取得、大量出力の直接投入といった禁止コマンドは許可されません。
- コマンド結果を分析、集計、フィルタリング、比較、検索、解析、変換する必要がある場合は、引き続き `ctx_execute` / `ctx_batch_execute` を使い、答えだけを出力するコードを書いてください。
- RTK が失敗調査に必要な詳細を隠す場合は、`rtk proxy <cmd>` や、必要な証拠だけを出力する targeted な `ctx_execute` スクリプトなど、適切な非フィルタ経路を意図的に使ってください。
