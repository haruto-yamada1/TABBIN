---
name: commit-push-pr
description: Use when a GitHub Issue URL is provided with a request to complete the work through an Open pull request, or when verified local changes need to be committed, pushed, and published.
---

# Commit Push PR

ユーザーが呼び出す Issue-to-PR の入口です。Issue URL があれば調査と実装から開始し、
URL がなければ検証済み変更の publish から開始します。明確な blocker がない限り、
途中確認で止まらず、同じ作業内で `develop` 向け Open PR まで完了します。

## 最初に mode を決める

| 入力と状態 | mode |
| --- | --- |
| GitHub Issue URL がある | Issue mode |
| Issue URL はなく、未 publish の変更がある | Publish-only mode |
| どちらもない | 状態を証拠付きで報告して停止 |

Issue URL がある場合、ローカル変更がまだなくても停止してはいけません。

Issue mode へ入る前に、元 checkout の `HEAD`、branch、status、unstaged / staged の
`--name-status` を baseline 証跡として記録します。既存変更が一つでもある場合、原則として
元 checkout を実装場所にせず、`origin/develop` の clean checkpoint から専用 worktree を
作ります。既存の Issue worktree を再利用できるのは、開始前の全差分がその Issue の commit、
harness checkpoint、または同等の証拠と対応付けられる場合だけです。同一 path の差分を含め、
帰属を分離できない変更があれば実装や publish を開始せず blocker として停止します。

## Issue mode

**REQUIRED SUB-SKILL:** Use `github-issue-implementation`.

1. sub-skill に Issue URL と baseline 証跡を渡し、Issue 本文、コメント、関連 Issue / PR、
   現在の repository を acceptance contract として調査させます。
2. sub-skill の worktree / branch で根本原因の修正と検証を完了させます。
3. sub-skill が返す原因、変更、acceptance criteria 対応、検証証跡を受け取ります。
4. そのまま下記 Publish phase を続行します。publish を別依頼に分けません。

live 調査で acceptance criteria が既に満たされ、正当な差分が不要と判明した場合は、
証拠を報告して終了します。empty commit や empty PR を作りません。

複数ファイル、長時間、高い不確実性、設計判断を含む Issue では
`harness-orchestrate` を使います。小さく明確な Issue へ一律に harness を要求しません。

### 根本修正のガードレール

Issue に書かれた解決案は仮説です。現在のコード、テスト、architecture、lint / CI、
framework source を確認し、要求との差分と根本原因を特定してから変更します。

禁止:

- 問題を隠す wrapper / adapter / fallback、局所条件、error suppression
- lint / type / architecture rule の緩和、test の skip / 削除 / 不適切な期待値変更
- 根拠のない timeout / retry 増加、`any`、不要な type assertion
- legacy を残すためだけの二重実装、Issue と無関係な大規模 refactor

user data、permission、public behavior を変える場合は migration と compatibility を検討します。
ただし、誤った責務境界を温存する compatibility layer は追加しません。

### 止めてよい blocker

- Issue 本文や必要な関連情報を取得できず、要件を推測するしかない
- 要求同士が矛盾し、選択で public behavior が変わる
- user data 消失、permission 追加、重大な security / privacy risk がある
- 同じ Issue の branch / worktree が複数あり、安全な続行先を特定できない
- baseline と Issue 作業後の差分を比較しても、変更の帰属を一意に説明できない

認証や sandbox の失敗は、下記の既知の回避を試してから blocker と判断します。
blocker 報告には、試した command、exit status、error の要約、取得できなかった contract、
実装を開始していないか停止した地点を含めます。

## Verification phase

変更に最も近い regression test から始め、Issue の acceptance criteria と実際の runtime
behavior を確認します。挙動変更では `test-driven-development` に従い RED を確認します。
UI / browser flow は必要に応じて Storybook、browser、Playwright で実動確認します。

TABBIN では次を必須とします。

```bash
bun run test:coverage
bun run quality:check
```

coverage は 100% を確認します。失敗は suppression せず原因を修正し、同じ command を
再実行します。`release:check` は clean tree gate のため、publish 用 commit 後に実行します。

`.apm/**` を変更した場合は publish 前に次を実行し、source と tracked / runtime 生成物の
同期を必須条件にします。

```bash
bun run apm:sync
bun run apm:check
```

target は `apm.yml` だけを source of truth とし、通常運用で raw の `apm install`、
`apm compile`、または command line の `--target` を使いません。`apm:check` は tracked 生成物、
必須 skill、二回同期の冪等性を scratch 再生成結果と比較します。`.gitignore` や
`apm.lock.yaml` の差分も確認し、source 変更または正規同期で説明できるものだけを残します。

## Publish phase

### 1. 差分と branch を確認する

```bash
git status --short --branch
git diff --stat
git diff origin/develop...HEAD --stat
```

他者や無関係な変更を stash、revert、stage しません。生成物がある場合は source of truth
から正規手順で生成されたものだけを含めます。

### 2. 対象ファイルだけ commit する

`git add .` は使わず、今回変更した path だけを stage します。commit message は簡潔な
日本語の命令形にします。commit 前に `git diff --cached --stat` と staged diff を確認します。
commit 後、次を実行します。

```bash
bun run release:check
git status --short --branch
```

無関係な tracked 変更が元 worktree に残る場合、そこでは clean-tree gate を実行できません。
対象変更を commit した HEAD から一時的な detached verification worktree を作り、依存関係を
準備して `release:check` を実行します。元 worktree の無関係な変更を copy、stash、revert、
commit しません。作成した verification worktree は結果を記録した後だけ削除します。

失敗した場合は原因を直して再検証し、追加 commit または適切な amend 後に
`release:check` を clean tree で再実行します。

### 3. push と Open PR を作成する

branch を push し、同じ repository / head branch の PR を全 state で確認します。既存 PR を
再利用する場合は、head、Issue mode では closing Issue、state、Draft 状態、base を取得し、
今回の作業と同一であることを証明します。安全に修正できる Draft と base のみ `ready` / `edit`
で Open（非 Draft）・`develop` へ正規化します。Closed、別 Issue、別 repository、別 head の
PR は再利用しません。候補との帰属を安全に分けられない場合は blocker として停止します。
該当 PR がなければ、必ず `develop` base、Open（非 Draft）で新規作成します。
ユーザーが明示的に要求しない限り force-push しません。

PR 本文には次を含めます。

- 問題の原因
- 採用した解決方法と主要変更
- regression risk と確認内容
- 実行した test / quality / release command と結果
- acceptance criteria と、それを満たす変更の対応
- `Closes #<issue-number>`（Issue mode の場合）

作成後、PR が `OPEN`、`isDraft: false`、base が `develop` であることと、local branch が
origin と同期済みであることを確認します。

## sandbox と GitHub 認証

`.git` 書き込み、network、GitHub API、port が必要な command は、利用環境で必要なら
`sandbox_permissions: "require_escalated"` を使います。sandbox 失敗後に同じ command を
権限なしで反復しません。

`gh auth status` が失敗しても直ちに諦めません。git credential helper が利用できる場合は、
token を file や stdout に出さず、同じ shell invocation 内だけで `GH_TOKEN` に渡します。
永続的な `gh auth login` は要求しません。

## 完了報告

- branch 名と commit hash
- Open PR URL、base、Draft 状態
- 原因と主要変更
- 実行した検証 command と結果
- 実行できなかった項目または残る blocker

push、PR 状態、branch 同期を確認するまで完了と報告しません。
