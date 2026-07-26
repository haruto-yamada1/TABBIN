---
description: ローカル開発時の Vitest 実行コマンド使い分けの指針。
applyTo: "**/*"
---

# テスト実行の指針

コードを変更した場合は、変更に最も近いテストから検証を開始してください。

- ロジックだけ触った → `bun run test:node`（約 1.8 秒）
- React コンポーネント / DOM を触った → `bun run test:dom`（約 17.8 秒）
- commit / PR 前 → `bun run test`（全テスト、約 18 秒）
- カバレッジ確認 → `bun run test:coverage`

コマンドの詳細な使い分け、単一ファイル実行、node / dom project の判別、coverage の扱いは `$test-selection` Skill を参照してください。
