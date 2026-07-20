---
name: rtk
description: shell コマンドを実行するとき。RTK (Rust Token Killer) で Codex CLI の shell 出力を圧縮するルーティング規則。git / rg / find / test / build などの出力を圧縮するラッパー。
---

# RTK — shell 出力圧縮ラッパー

RTK (Rust Token Killer) は Codex CLI の shell 出力を圧縮する CLI proxy である。
shell コマンドが適切な場面では RTK を使ってください。

## 基本ルール

shell コマンドの先頭に `rtk` を付ける。

```bash
rtk git status
rtk git diff
rtk rg
rtk find
rtk bun run test
rtk cargo test
rtk npm run build
rtk pytest -q
```

## メタコマンド

```bash
rtk gain              # Token 削減効果の確認
rtk gain --history     # 最近の削減履歴
rtk proxy <cmd>       # フィルタなしの生出力
rtk --version         # バージョン確認
```

## このリポジトリでの RTK 利用

- `rtk git status`、`rtk git diff`、`rtk rg`、`rtk find`、`rtk bun run test` などの圧縮ラッパーを優先してください。
- `context-mode` のルーティング規則をより高い優先度で扱ってください。RTK を使っても、生の `curl` / `wget`、インライン HTTP 取得、大量出力の直接投入といった禁止コマンドは許可されません。
- コマンド結果を分析、集計、フィルタリング、比較、検索、解析、変換する必要がある場合は、引き続き `ctx_execute` / `ctx_batch_execute` を使い、答えだけを出力するコードを書いてください。
- RTK が失敗調査に必要な詳細を隠す場合は、`rtk proxy <cmd>` や、必要な証拠だけを出力する targeted な `ctx_execute` スクリプトなど、適切な非フィルタ経路を意図的に使ってください。

## 事前確認とフォールバック

- `rtk` が PATH にない場合は RTK 未導入環境として扱い、`rtk` ラッパーを使わずに生コマンドをそのまま使ってください。ただし `context-mode` の禁止事項（生 `curl` / `wget`、インライン HTTP、大量出力の直投入）は RTK の有無にかかわらず守ってください。
- `rtk` は出力を圧縮しますが、圧縮結果が空または不自然的に短い場合は `rtk proxy <cmd>` で生出力を確認するか、`exec_command` で絞り込み付きの生コマンドに切り替えてください。
