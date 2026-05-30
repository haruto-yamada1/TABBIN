---
name: check
description: "$check に対応する品質チェック実行スキル。npm run quality を実行し、format/lint/type/test の失敗を自動修正ループで解消する。品質ゲート実行、CI失敗修正、lint/type/test エラーの自動修正を求められたときに使用する。"
---

# 品質チェック

`$check` で `npm run quality` を実行し、失敗時はログを読んで修正し、再実行して収束させる。

## 実行

1. この skill ディレクトリ配下のスクリプトを実行する
   `.agents` が現在の worktree に無い場合でも、skill ファイル基準で
   `scripts/run_quality.sh` を解決して使う:

```bash
bash scripts/run_quality.sh
```

2. スクリプトの出力から `CHECK_RESULT` と `CHECK_LOG` を読む。
3. `status=OK` なら成功として日本語で短く報告して終了する。
4. `status=ERROR` ならログファイルを対象に自動修正ループに入る。

## 自動修正ループ

1. まずログから高シグナルの失敗を抽出する:

```bash
grep -nE "error TS[0-9]+|^FAIL\\b|Error:|AssertionError|TypeError|ReferenceError|SyntaxError" <log_file> | head -n 40
```

2. 失敗原因に直接関係するファイルだけを読む。
3. 一度に広範囲を触らず、原因に近い修正を行う。
4. 修正後に再度 `run_quality.sh` を実行する。
5. 最大 5 反復で打ち切る。未解決なら残件と次のアクションを提示する。

## 出力方針

- 通常は詳細ログ全文を貼らない。
- 共有するのは以下のみ:
  - 1行サマリー (`✅` / `❌`)
  - 主要失敗 1〜5 件
  - 変更したファイル
- 詳細が必要なときだけ `--verbose` を使う:

```bash
bash scripts/run_quality.sh --verbose
```

## ガードレール

- `eval` を使わない。
- 無関係ファイルをまとめて変更しない。
- 失敗時は「ログ抽出 → 修正 → 再実行」の順を守る。
- 自動修正で収束しない場合は、その時点のブロッカーを明確に報告する。
