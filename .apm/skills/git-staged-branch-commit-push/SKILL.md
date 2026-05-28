---
name: git-staged-branch-commit-push
description: >-
  git で staged changes を確認し、現在の branch から新しい branch を作成して
  commit、push まで進めるときに使います。ユーザーが staged diff の確認、
  branch 作成、commit、push、または一連の Git publish workflow を依頼したときに使います。
disable-model-invocation: true
---

# Staged Branch Commit Push

## 目的

staged changes を起点に、現在いる branch から新しい作業 branch を作成し、
commit と push まで一貫して進めます。未 stage の変更やユーザーの別作業を
混ぜないことを最優先にします。

## 手順

1. 現在地を確認します。
   - `git status --short --branch`
   - `git branch --show-current`
   - staged changes がない場合は停止し、stage すべきファイルを勝手に追加しません。
2. staged diff を確認します。
   - `git diff --cached --stat`
   - 必要なら `git diff --cached -- <path>` で内容を確認します。
   - staged 以外の変更があっても戻さず、commit 対象に含めません。
3. branch 名を決めます。
   - ユーザー指定があればそれを使います。
   - 指定がなければ staged diff の内容から短い `type/summary` 形式を作ります。
   - 既存 branch と衝突する場合は停止して別名を決めます。
4. 現在の branch から新しい branch を作成します。
   - `git switch -c <new-branch>`
5. commit message を作ります。
   - staged diff の内容に基づく短い命令形の件名を使います。
   - コミット名（件名）は日本語で作成します。
   - 必要な場合だけ body に検証内容や補足を入れます。
6. staged changes だけを commit します。
   - `git commit -m "<message>"`
   - commit 前後で `git status --short --branch` を確認します。
7. remote へ push します。
   - `git push -u origin <new-branch>`
   - push が認証や network で失敗した場合は、commit hash と失敗理由を報告します。

## 安全ルール

- `git add`、`git restore`、`git reset`、`git checkout --` は、ユーザーが明示しない限り実行しません。
- staged diff に secret、credential、巨大な生成物、意図しない binary が含まれる疑いがある場合は停止して報告します。
- branch 作成後に commit が失敗した場合、勝手に元 branch へ戻ったり branch を削除したりしません。
- push 前に remote 名を推測しすぎません。通常は `origin` を使い、存在しない場合は停止します。

## 報告

完了時は次を短く報告します。

- 作成した branch
- commit hash と commit message
- push 先
- 残っている未 stage / untracked changes の有無
