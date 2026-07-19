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

## 事前確認とフォールバック

- 先頭の `@/Users/tarou/.codex/RTK.md` は include 参照です。このパスは現在のユーザー環境に依存するため、他マシン・CI・他ユーザーでは解決できない場合があります。include が解決できなかった場合は本セクション以降を唯一のソースとして進め、不足分は `rtk --help` で補ってください。
- `rtk` が PATH にない場合は RTK 未導入環境として扱い、`rtk` ラッパーを使わずに生コマンドをそのまま使ってください。ただし `context-mode` の禁止事項（生 `curl` / `wget`、インライン HTTP、大量出力の直投入）は RTK の有無にかかわらず守ってください。
- `rtk` は出力を圧縮しますが、圧縮結果が空または不自然に短い場合は `rtk proxy <cmd>` で生出力を確認するか、`exec_command` で絞り込み付きの生コマンドに切り替えてください。
