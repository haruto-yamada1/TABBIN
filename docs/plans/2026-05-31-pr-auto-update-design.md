# PR 自動更新設計

## 目的

`develop` に別 PR がマージされたあと、`develop` を base にする open PR を自動で最新化し、
既存の `CI` workflow を `pull_request.synchronize` で再実行させる。

## 背景

現在の [`CI`](/Users/tarou/Desktop/TABBIN/.github/workflows/ci.yml:1) は
`pull_request` と `push` でのみ起動する。別 PR が `develop` にマージされても、
既存 open PR の head branch には変更が入らないため、CI は自動再実行されない。

## 方針

`develop` への `push` を契機に、GitHub Actions から
`pulls/{pull_number}/update-branch` API を呼ぶ専用 workflow を追加する。
これにより GitHub の `Update branch` と同等の更新を行い、更新された PR だけが
`pull_request.synchronize` を受けて既存 CI を再実行する。

## 対象

- base branch が `develop`
- state が `open`
- same-repo PR
- `draft == false`

## 除外

- fork 由来 PR
- head branch が `develop` の PR
- すでに最新の PR
- merge conflict などで `update-branch` に失敗する PR

## 実装案

新規 workflow `.github/workflows/update-pr-branches.yml` を追加する。

- trigger: `push` on `develop`
- permissions:
  - `contents: read`
  - `pull-requests: write`
- 実装手段:
  - `actions/github-script` で open PR を列挙
  - 条件に合う PR ごとに `repos.updateBranch` を順次実行
  - 更新・スキップ・失敗を `GITHUB_STEP_SUMMARY` に出力

## 失敗時の扱い

- 個別 PR の更新失敗で workflow 全体を即失敗にはしない
- 失敗は summary に残し、他 PR の更新は継続する
- ただし API 呼び出し全体が成立しない場合は job を失敗させる

## 検証

- YAML 構文が壊れていないこと
- 条件分岐が意図どおりであること
- `develop` への次回 push 後、対象 PR で branch update が入り、
  既存 `CI` が再実行されることを GitHub 上で確認する
