# Codex セッションの選択

これは Codex CLI 用の参照です。Headroom は Skill 呼び出しのたびに起動する
ツールではなく、検証済み端末でセッション開始時に使う透過プロキシです。

1. 認証・モデル・effort・CODEX_HOME と既存 hook/MCP を確認する。
2. 個人設定を backup し、専用 loopback proxy を cache + lossless で起動する。
   初回は `--code-memory none --no-mcp`、Beacon/telemetry/update check は off。
3. 合成 prompt の前後で proxy request 増分、failure 数、モデルを照合する。
   doctor や Codex の応答だけで通過と判定しない。
4. 短い観測・正確な source/diff・編集は native。長い CLI 出力だけ明示 RTK。
   大量集計・FTS5 検索・必要な履歴復旧だけ context-mode。
5. proxy 障害は通常 Codex で再開する。権限・認証・品質ゲートを維持する。

Codex 0.160.1 の `wrap ... exec` では、`-c` を `exec` の前後に分けると
経路を bypass した実機例があります。全設定引数を `exec` 前に揃えて計測します。
現在値を API キーや別モデルへ自動変更しません。未導入ツールはセットアップせず
native を使います。他クライアントの hook はそのクライアントの設定に従います。

起動例、比較、保存先、権限、復旧、実測値は
[runbook](../../../../docs/maintenance/codex-context-optimization.md) を参照します。
