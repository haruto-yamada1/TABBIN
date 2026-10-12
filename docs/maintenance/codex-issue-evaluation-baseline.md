# Codex Issue baseline (2026-10-12)

Node 24.17.0 / Bun 1.3.14 / Codex CLI 0.160.1、model `gpt-6.1-sol`、effort `high`。
現在のAGENTS/APM/Skillsを実worktreeへ配置し、開始時に入力を固定した。
実モデルは1題300秒、input+output上限2,000,000 token、ChatGPT subscriptionのみ。

| 課題                  | Reference hidden / regression | 実Codex結果       | モデル時間 | Input / Cached / Output     | Tool calls |
| --------------------- | ----------------------------- | ----------------- | ---------: | --------------------------- | ---------: |
| #675 default-language | 23 / 39, all passed           | passed            |   223.586s | 549493 / 472704 / 6108      |         29 |
| #671 ollama-host      | 16 / 115, all passed          | timeout           |   300.255s | unknown / unknown / unknown |         31 |
| #717 render-recovery  | 7 / 16, all passed            | usage_unavailable |   158.888s | unknown / unknown / unknown |         13 |

Reference の3題は修正前の実 assertion RED と、gold の hidden / 固定既存回帰 /
compile / DDD の4 gate GREEN を確認した。hidden/回帰のskipは0。実モデルを
呼ぶ前に、各candidate権限で指定した公開回帰テストが実行できることも確認した。

実Codexは3題を実際に起動し、独立採点で1題合格、Ollamaは時間上限で不合格、
描画回復は完了usageを取得できず不合格になった。取得できないtoken/cacheは
unknownのまま記録し、0で補完しない。batch内の未実行を成功にせず、描画回復を
別runで個別測定した。モデルが全課題に合格したという記録ではない。

完全な機械可読記録は [baseline JSON](./codex-issue-evaluation-baseline.json)、
再実行・予算・権限・失敗・rollbackは [runbook](./codex-issue-evaluation.md) を参照。
Raw traceは公開しない。API従量課金への切替はない。

PR #950 のレビュー修正後は Codex CLI 0.162.1 でモデル推論を行わず、同じ3題の
reference baseline を再採点した。RED は3/16/7件で、全題の hidden / 既存回帰 /
compile / DDD は合格し、RED の診断はすべて `test_failure` と記録された。
再採点は JSON の `reviewReferenceBaseline` に保存する。元の測定は当時の
runner hash と診断を保持し、実Codexの結果を再測定値で置き換えない。
