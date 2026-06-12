---
description: ハーネス run の完了前品質ゲートを実行し、証跡を状態ファイルへ反映する。
---

# ハーネス品質ゲート

現在の変更内容に対して必要な品質ゲートを実行してください。コード変更がある場合は、
原則として次を確認します。

```bash
bun run compile
bun run quality
bun run test:coverage
bun run harness:validate
bun run harness:audit
bun run harness:surface-audit
bun run harness:security-audit
bun run harness:repo-status
```

## 方針

- 失敗した場合は原因を直し、再実行してください。
- 成功した検証は `generator.json` または `orchestrator.json` の `verification` に記録してください。
- 既存の Stop hook と矛盾する重い自動実行は追加しません。これは手動 command として使います。

## 出力

実行したコマンド、結果、残るリスクを日本語で短く報告してください。
