---
name: github-pr-review
description: Use when an open GitHub pull request has review feedback to triage, validate, fix, push, or answer, regardless of whether the reviewer is human, CodeRabbit, or another service.
---

# GitHub PR Review

Open PR の review feedback を、投稿者ではなく現在の技術的根拠で処理します。
`receiving-code-review` を妥当性検証の必須原則として併用し、この skill では GitHub 上の live state、
修正、検証、commit、push、許可された thread reply、学びの昇格までを管理します。

## 使用条件

次のいずれかを依頼されたときに使います。

- Open PR の未対応 review comment を確認する。
- Open PR の「レビュー対応」「address review」を行う。
- 妥当な指摘を修正して PR branch へ push する。
- 妥当でない指摘へ根拠を返信する。
- review 対応から再利用可能な学びを抽出する。

reviewer は人間、CodeRabbit、その他の bot / service のどれでも構いません。

次の場合は使いません。

- PR がない、Closed、Merged、または review feedback がない。
- 実装前や local diff の review を依頼された。`requesting-code-review` を使います。
- feedback の技術的な読み解きだけで GitHub 操作が不要。`receiving-code-review` を使います。
- CI failure だけを直す、merge conflict だけを解消する、PR 全体を継続監視する。

## 権限境界を先に確定する

ユーザーの依頼から、この run で許可された副作用を明示します。

- 「確認」「triage」だけなら read-only です。
- 「レビュー対応」「address review」は、live triage、妥当な修正、test、scoped commit、
  対象 PR branch への通常 push、同じ thread への返信、対応済み thread の resolve までを許可します。
- 「修正して push」まで明示されていれば、対象 PR branch の scoped commit と通常 push が可能です。
- 人間 reviewer への返信は、ユーザーが返信を明示した場合だけ可能です。
- 学びの永続化は、この PR の scope に収まり、下記基準を満たす場合だけ行います。

次は常に禁止します。

- base branch への直接 push、force push、履歴破壊
- PR の merge、close、approve、request changes
- 新しい PR / Issue の自動作成
- ユーザーの未commit変更の破棄、無関係な変更のstage
- generated artifact の直接編集、品質 gate の緩和、test skip、error suppression

## Workflow

### 1. PR と repository を確定する

1. `gh auth status` と `gh repo view --json nameWithOwner` を確認します。
2. PR URL / number がなければ、current branch に対応する Open PR を一意に特定します。
3. `state=OPEN`、repository、base、head branch、head repository、`headRefOid`、Draft 状態を記録します。
4. dirty worktree と既存 branch / worktree を確認し、ユーザー変更を上書きしない作業場所を選びます。
5. remote PR HEAD を fetch し、local HEAD と `headRefOid` が一致してから評価します。

PR や安全な作業場所を一意に特定できなければ、推測せず blocker を報告します。

### 2. live review state を取得する

flat comment 一覧だけで判断しません。GitHub GraphQL API の `reviewThreads` を pagination し、
各 thread の全 comment、`isResolved`、`isOutdated`、path、line、author、URL を取得します。
併せて review summaries と PR issue comments を確認し、inline thread 外の actionable feedback も
取りこぼさないようにします。

次は code change 対象から除外しますが、final response の thread 表には分類と理由を記録します。

- resolved、outdated、最新 HEAD ですでに修正済み
- duplicate、情報提供だけ、明確な action を要求していない
- 別 Issue / PR が source of truth で、この PR scope では扱わない

push 前と返信前に `headRefOid` と thread state を再取得します。HEAD が動いていた場合は、
新しい HEAD で再評価し、古い状態を push しません。

### 3. 各指摘を分類して検証する

各 actionable feedback は、4つの親分類と詳細分類を分けて記録します。

- `adopt`: 詳細分類は `adopt` または `already-fixed`。指摘は妥当で、後者は latest HEAD で
  修正済みのため追加変更が不要。
- `partially-adopt`: 詳細分類は `partially-adopt`。問題は妥当だが、提案された解決の一部は
  repository contract と合わない。
- `reject`: 詳細分類は `reject-false-positive`、`reject-context-mismatch`、
  `reject-already-enforced`、`reject-preference-only`、`reject-speculative` のいずれか。
- `defer`: 詳細分類は `defer`。scope 外、競合する要求、外部 owner 判断が必要で、
  この PR では安全に決められない。

`duplicate` は親分類ではなく処理状態です。canonical thread の親分類と詳細分類を継承し、
同じ根本原因へ二重対応しません。latest HEAD で問題が見つからない場合は、修正済みの証拠が
あれば `adopt` / `already-fixed`、なければ `reject` / `reject-false-positive` とします。

詳細分類の意味は次のとおりです。

- `adopt`: 最新 HEAD に問題があり、提案の方向も妥当。
- `partially-adopt`: 問題は妥当だが、提案された解決の一部は repository contract と合わない。
- `reject-false-positive`: 指摘された問題を latest HEAD で再現できない。
- `reject-context-mismatch`: repository contract、runtime、または PR scope と前提が合わない。
- `reject-already-enforced`: 既存の型、schema、lint、test、CI などが同じ問題をすでに防いでいる。
- `reject-preference-only`: correctness や保守性の改善ではなく、根拠のない好みだけである。
- `reject-speculative`: 対応環境で未確認の仮説で、変更が回帰や過剰実装を生む。
- `already-fixed`: latest HEAD または別の scoped commit ですでに修正済みである。

最低限、次を現在の checkout で確認します。

- 指摘箇所と実際に到達する runtime path
- Issue / PR body、acceptance criteria、既存の design / ADR
- TypeScript 型、runtime schema、API / browser compatibility
- 既存 helper、source-of-truth、architecture boundary、generated boundary
- regression test と repository の正式な quality / release gate
- 指摘がすでに別の guard で防止されていないか

reviewer の説明を実装事実として扱いません。分からない場合は、まず code と実行証拠を調べます。

### 4. 妥当な指摘を修正する

`adopt` / `adopt` と `partially-adopt` / `partially-adopt` では次を行います。
`adopt` / `already-fixed` は追加修正しません。

1. 回帰を再現する test を追加または特定し、挙動変更では RED を確認します。
2. wrapper、adapter、fallback、局所条件、設定弱体化ではなく根本原因を修正します。
3. 変更に最も近い test から broad gate へ広げます。
4. source-of-truth を編集し、generated artifact は正規 command で同期します。
5. 対象ファイルだけを stage し、簡潔な日本語 message で commit します。
6. remote HEAD が変わっていないことを確認して、対象 PR branch へ通常 push します。
7. 同じ thread へ commit SHA、修正内容、検証 command と結果を返信し、thread を resolve します。
   人間 reviewer への返信は、ユーザーが返信を明示した場合だけ行い、許可されていなければ
   final response に返信案と resolve の可否を示します。

### 5. 妥当でない指摘を扱う

`reject-*` では code を変更しません。同じ thread へ次を簡潔に返信し、thread を resolve します。
人間 reviewer への返信は、ユーザーが返信を明示した場合だけ行い、許可されていなければ
同じ内容の返信案を final response に示します。

- 対応しない判断
- latest HEAD の具体的な code / type / test / runtime / contract 根拠
- 指摘のどの前提が現在の実装と一致しないか
- 再評価が必要になる条件

`defer` では、未確定事項、scope、必要な owner 判断を示します。技術的根拠のない迎合や、
防御的な長文は避けます。同じ thread で返信し、thread を resolve します。
人間 reviewer への返信は、ユーザーが返信を明示した場合だけ行います。

各 thread の URL / identifier、分類、根拠、対応、検証、返信有無を final response の表へ記録します。
永続的な decision record は、次節の昇格基準を満たす再利用可能な学びだけに限定します。

### 6. 検証済みの学びだけを昇格する

すべての review comment を保存しません。次をすべて満たす学びだけを候補にします。

- latest HEAD、型、test、runtime、contract のいずれかで検証済み。
- 同じ根本原因が再発する可能性があり、別の場所でも再利用できる。
- 一時的な SHA、reviewer 固有表現、secret、個人情報を含まない。
- 既存 docs、skill、APM instruction、lint / architecture rule、test と重複しない。

再発防止は、強い enforcement から順に選びます。

1. TypeScript 型 / domain model
2. runtime schema / validation
3. lint / dependency / architecture rule
4. regression test
5. CI verifier
6. lightweight hook
7. specialized skill
8. short APM common instruction
9. `docs/code-review/` decision record

一度限りの typo、既存 lint が検出する軽微なミス、未検証の意見、outdated feedback は記録しません。
新規 decision record の前に `docs/code-review/index.md` と repository 全体を検索します。同じ根本原因が
あれば既存 record を更新し、なければ template から作成して index へ追加します。

## 完了チェック

- 対象 PR は Open のまま、remote head と local head が一致している。
- 全 actionable feedback が final response の表にあり、分類、根拠、対応、検証、返信有無が分かる。
- 妥当な修正は regression test と fresh gate evidence を持つ。
- push / reply / resolve は許可された範囲だけで、同じ thread に行われた。
- merge、approve、close、force push を行っていない。
- 永続化した学びは検証済みで、最小かつ検索可能な enforcement / record になっている。
- 実行できなかった操作と残る blocker を明示した。
