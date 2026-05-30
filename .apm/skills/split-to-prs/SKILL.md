---
name: split-to-prs
description: 現在の作業を小さく review しやすい PR に分割するときに使います。チャット、変更セット、branch、PR の分割依頼時に発火します。
---
# PR への分割

1 つの作業 pile を、review しやすい小さな PR に分割します。

## 厳守ルール

- split plan の承認前に branch 作成、commit、push、PR 作成を行いません。
- ユーザーの作業を破棄しません。明示的な承認なしに destructive git コマンド（`reset --hard`、`clean -fdx`、branch 削除、force-push、history rewrite）は使いません。
- 作業を移す前に必ず復元可能な snapshot を保存します。`main` 上の dirty work から始まることが多いため、すでに安全な branch があると仮定しません。
- 指定された file または hunk のみ stage します。`git add .` / `git add -A` は使いません。

## 1. 状態を確認

default branch との差分（committed と uncommitted の両方）を比較します。実際の slice を要約し、チャット履歴から intent を復元します。

## 2. split を提案

詳細度は状況判断します。通常は PR タイトルで十分です。タイトルだけでは不明な場合のみ 1 行の scope note を追加します。複数 slice がある場合は Mermaid 図を示します。

既定は default branch からの独立 PR です。dependency が本当にある場合のみ PR を stack します。

開始前に承認を求めます。

## 3. split を実行

- uncommitted work がある場合、working tree を変えずに復元可能な snapshot を保存します:

  ```bash
  SHA=$(git stash create "pre-split")
  if [ -n "$SHA" ]; then
    git update-ref "refs/backup/pre-split-$(date +%s)" "$SHA"
  fi
  ```

- 承認された各 slice について、適切な base から branch を作成し、計画された file または hunk のみ stage して commit し、push して PR を開きます。

## 4. 報告

短く報告します: PR タイトルと URL、開始 branch または working tree に残ったもの。ユーザーが求めない限り backup ref や元 branch は削除しません。
