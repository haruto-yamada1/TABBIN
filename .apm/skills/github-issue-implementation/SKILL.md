---
name: github-issue-implementation
description: Use when a GitHub Issue URL or number is the implementation contract and the repository, worktree, root cause, tests, or related Issue and pull request context must be investigated before publication.
---

# GitHub Issue Implementation

GitHub Issue を live contract として intake し、隔離された branch / worktree で根本原因を
修正して検証する implementation phase です。commit、push、PR 作成は行わず、caller が
publish を安全に続けられる構造化された結果を返します。

## Input contract

必要な入力は Issue URL または `<owner>/<repo>#<number>` と、その repository を読める
GitHub CLI 認証です。caller がすでに branch、worktree、既存変更を持つ場合は、開始時の
`HEAD`、branch、status、staged / unstaged path を含む baseline 証跡も受け取ります。

Issue を取得できない、URL が別 repository を指す、Issue が要求する repository を特定
できない場合は、実装を推測せず停止します。

## 1. Issue を live intake する

`gh issue view` で少なくとも title、body、state、labels、comments、URL を取得します。
本文やコメントが参照する関連 Issue、PR、ADR、CI failure、外部仕様を必要な範囲で確認します。
関連 PR の review が要件に影響する場合は、flat comment だけでなく live review thread 状態を
確認します。

Issue から次を明示します。

- 再現条件または現在の問題
- 期待する状態と acceptance criteria
- 明示された制約、非目標、関連 decision
- Issue の解決案と、検証が必要な仮説

GitHub 認証や network が必要な command は、利用環境で必要なら escalated permission を
使い、intake 前に `gh auth status` を確認します。未認証でも git credential helper が
利用できる場合は、token を file や stdout に出さず、同じ shell invocation 内だけの
`GH_TOKEN` で read command を再試行します。利用可能な認証を確立できなければ、取得できない
contract と試した command を具体的な blocker として返します。取得に失敗したまま repository
調査や実装へ進みません。

## 2. Workspace を隔離する

1. `git status --short --branch` と staged / unstaged の `--name-status` を baseline と比較します。
2. `git fetch origin develop` で起点を更新します。
3. `git worktree list` と branch 一覧から同じ Issue の作業場所を探します。
4. 安全な既存 worktree が一意なら再利用します。安全とは、同じ Issue の branch が一つだけで、
   dirty file がないか、開始前の全差分がその Issue の commit / checkpoint と対応付けられる
   状態です。元 checkout に既存変更がある場合や、同一 path の変更を Issue 作業と分離できない
   場合は再利用せず、`origin/develop` の clean checkpoint から
   `fix/issue-<number>-<slug>` または変更種別に合う branch と専用 worktree を作ります。

他者変更を stash、reset、checkout、revert しません。複数の候補があり安全な続行先を
決められない場合だけ人間へ確認します。worktree 作成後は、必ずその path で調査、実装、
検証を続けます。

## 3. 根本原因を調査する

Issue の解決案をそのまま実装する前に、次を確認します。

- 関連する production code、test、fixture、既存 helper / type / component
- architecture / dependency rule、lint / type / build / CI 設定
- storage、browser API、permission、user data、public behavior の境界
- `.apm` や code generation が関係する場合の source of truth
- framework / library の挙動が争点なら installed source、type、公式資料

再現可能な bug や失敗には `systematic-debugging` を使い、因果経路を特定します。複数ファイル、
長時間、高不確実性、設計判断を含む場合は `harness-orchestrate` を使います。

## 4. 実装する

挙動変更では **REQUIRED SUB-SKILL:** Use `test-driven-development`.

regression test を先に追加し、期待する理由で RED になることを確認してから最小の実装で
GREEN にします。設定や文書だけの変更でも、変更前の failure を再現できる pressure scenario、
validator、または検査 command を先に定義します。この場合は production code の TDD 例外を
人間へ確認せず、skill 文書の RED/GREEN または検証 command を test-first の証拠とします。

禁止:

- wrapper / adapter / fallback で誤った責務境界を温存する
- Issue を通すだけの条件分岐、error suppression、unsafe type escape
- rule 緩和、test skip / 削除、根拠のない timeout / retry 増加
- unrelated refactor、生成先だけの直接編集

user data、permission、public behavior、security に関わる変更は migration、compatibility、
rollback を検討します。重大な仕様判断が必要な場合だけ blocker として返します。

## 5. 検証する

変更に最も近い test から開始し、関連する主要 flow と acceptance criteria へ広げます。

- logic: `test:node` または対象 Vitest
- React / DOM: `test:dom`、必要に応じて React Doctor
- extension flow: `e2e-testing` と Playwright
- permission、storage、user content: `security-review`
- UI: browser / screenshot / Storybook で実動確認

caller が `commit-push-pr` の場合、publish 前に必要な repository-wide gate は caller が実行します。
この phase でも、変更に直結する regression test と runtime behavior の証拠を省略しません。

## Return contract

caller へ次を返します。

- Issue number、title、URL、acceptance criteria
- worktree path と branch 名
- 開始 baseline と、そこから生じた Issue-owned path / commit の対応
- 特定した根本原因
- 採用した解決と主要変更ファイル
- acceptance criteria と変更 / test の対応
- 実行した command、結果、runtime 確認
- regression / migration / security risk
- `ready_for_publish: true` または具体的 blocker

acceptance criteria が既に満たされ差分が不要な場合は、根拠と
`already_satisfied: true` を返し、empty commit / PR を要求しません。

`commit-push-pr` から呼ばれた場合は publish skill を再帰的に呼ばず、caller へ戻ります。
standalone で使われた場合も、publish を要求されていなければ実装と検証の結果だけを返します。
