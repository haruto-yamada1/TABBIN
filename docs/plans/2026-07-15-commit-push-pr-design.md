# Commit Push PR Issue-to-PR Design

## Goal

`commit-push-pr` と GitHub Issue URL だけを入力すれば、Issue の確認から
根本原因の修正、検証、commit、push、`develop` 向け Open PR 作成までを
一度の作業で完了できるようにする。

## Current Problem

現在の `commit-push-pr` は実装済み変更の公開だけを担当し、Issue の intake、
worktree、実装、regression test、runtime 確認は
`github-issue-implementation` に分離されている。そのため利用者が毎回、二つの
skill をつなぐ長い prompt と品質条件を再記述している。

加えて、repository instructions には PR base が `main` と書かれている一方、
Issue workflow と実運用は `develop` を前提にしている。また prompt で指定されていた
`bun run quality` は現在の script 名と一致せず、実際の broad gate は
`bun run quality:check` である。

## Chosen Architecture

`commit-push-pr` を薄い orchestration entrypoint と publish phase の二役にする。

- Issue URL が入力された場合は、`github-issue-implementation` を必須 sub-skill として
  intake、隔離 worktree、実装、検証まで進め、そのまま publish phase へ継続する。
- Issue URL がなく実装済み変更がある場合は、従来どおり publish phase だけを行う。
- `github-issue-implementation` は再利用可能な implementation phase とし、
  `commit-push-pr` への循環 handoff を削除する。
- 複雑な Issue だけ harness を開始し、小さな変更へ一律の運用負荷を課さない。

Issue 本文、コメント、関連 Issue / PR を acceptance contract とする。取得できない場合は
推測で実装せず止める。解決策の記述は参考として扱い、repository の現在の設計と証拠から
根本原因を判断する。

## Safety and Quality

- wrapper、局所 fallback、rule 緩和、test skip、error suppression、unsafe type escape を
  品質ゲート通過の手段にしない。
- user data、permission、public behavior、security boundary に重大な不明点がある場合だけ
  人間へ確認する。
- 変更前に回帰を再現し、可能な場合は RED/GREEN で regression test を追加する。
- 変更に近い検証から `bun run quality:check` へ広げる。
- `bun run release:check` は clean tree を要求するため、変更を commit した後に実行し、
  gate による生成差分が残らないことを確認してから push する。
- publish-only worktree に無関係な tracked 変更が残る場合は、その変更へ触れず、commit 済み
  HEAD の detached verification worktree で `release:check` を実行する。

## Pull Request Contract

- base は `develop`、Draft ではなく Open。
- Issue を close する参照を含める。
- 原因、採用した解決、主要変更、regression risk、検証コマンド、acceptance criteria との
  対応を本文へ記載する。
- 対象ファイルだけを stage し、生成物や無関係な変更を含めない。

## Source of Truth

編集対象は `.apm/` 配下とします。`.agents/skills`、`AGENTS.md` などの生成先は
直接編集しません。`apm compile --validate` で source を検証し、
`apm compile --target codex` で tracked な Codex instructions を同期します。
ignored な `.agents/skills` deployment は隔離 worktree で source との一致を確認し、
PR の source of truth にはしません。hooks は orchestration を自動起動せず、機械的に
検出できる安全ガードが必要な場合だけ変更します。

## Verification

skill 文書には pressure scenario を用いた RED/GREEN/REFACTOR を適用する。

1. 現行 skill と Issue URL だけを与え、実装前 intake や品質条件が欠落することを記録する。
2. 更新後 skill で同じ scenario を実行し、Issue intake から Open PR までの一貫した計画、
   blocker 境界、quality gate、PR 本文要件を満たすことを確認する。
3. fresh-context review、APM validation、repository quality / release gate を実行する。
