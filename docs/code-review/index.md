# Code Review Decision Index

GitHub Pull Request の review 対応から得た、検証済みで再利用可能な判断だけを一覧化します。
review comment の履歴置き場ではありません。新規記録より、型、schema、lint、architecture rule、
regression test、CI などの機械的 enforcement を優先します。

## 検索

```bash
rtk rg -n "id:|status:|category:|source_pr:|scope:|enforcement:" docs/code-review
rtk rg -n "<root cause or symbol>" docs/code-review .apm src tools
```

新規記録を作る前に同じ根本原因、symbol、scope、enforcement を検索してください。同じ判断があれば
既存 record の `occurrences`、根拠、適用範囲、`last_reviewed_at` を更新します。

## Decisions

| ID     | Status | Category | Severity | Scope | Summary | Enforcement | Decision |
| ------ | ------ | -------- | -------- | ----- | ------- | ----------- | -------- |
| _none_ |        |          |          |       |         |             |          |

記録は [decision-template.md](./decision-template.md) から作成します。取得できない PR number、
comment URL、author type、日付、enforcement を捏造しません。
