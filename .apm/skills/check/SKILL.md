---
name: check
description: "品質チェックを実行し、format/lint/type/test の失敗を自動修正ループで収束させる。USE FOR: 品質チェックを実行して, quality check を 実行 して, CI の quality check 失敗を修正して. DO NOT USE FOR: README を要約して, 新機能の設計案を考えて, GitHub Issue を作成して."
---

# 品質チェック

## 実行

1. `bun run agent:check` を実行する。これが唯一の実行入口である。
2. `CHECK_RESULT` と `CHECK_LOG` を読む。`OK` なら短く報告して終了、`ERROR` なら修正ループへ。

## 自動修正ループ

1. ログから `error TS\d+`/`FAIL`/`AssertionError`/`TypeError`/`SyntaxError` を抽出（40 行）。
2. 原因のファイルだけ読み、広範囲を触らない。
3. 修正後に再実行。最大 5 反復で打ち切り、未解決なら残件と次アクションを提示。

## 出力方針

- ログ全文は貼らない。1 行サマリー（`✅`/`❌`）、主要失敗 1〜5 件、変更ファイルのみ。

## Example / 例

例:

```text
❌ error TS2322: Type 'string' is not assignable to type 'number' (src/lib/a.ts:3)
→ 該当ファイルのみ修正して再実行し、✅ になるまで繰り返す。
```

## トラブルシューティング

- `Missing script: quality` → `bun run agent:check` を使う。`quality` は存在しない。
- 反復が止まらない → 5 回で打ち切りブロッカー明示。

## ガードレール

- `eval` 禁止。無関係ファイルを変更しない。「ログ抽出 → 修正 → 再実行」の順。収束しない場合はブロッカーを報告。
