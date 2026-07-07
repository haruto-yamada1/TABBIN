---
name: github-issue-implementation
description: GitHub issue URL を渡され、issue の内容を起点に repository 確認、専用 worktree 作成、実装、検証、commit / push / PR 作成まで進める依頼で使います。issue 番号だけでなく URL、関連 PR、コメント確認、並行作業用の隔離 worktree が必要なときに発火します。ユーザーが「PR作成までお願いします」と依頼した場合は commit-push-pr skill に引き継ぎます。
---

# GitHub Issue 実装

GitHub issue URL から作業対象を特定し、issue ごとの専用 worktree と branch で実装します。人間や他エージェントの未コミット変更を上書きせず、不明点や権限不足があれば実装前に止めます。この skill の責務は実装と検証、次の publish 手順への handoff までです。`commit` / `push` / PR 作成は `commit-push-pr` skill に委譲します。

## sandbox 制限と回避

この環境の `exec_command` はデフォルトで sandbox 内で実行され、`.git` が読み取り専用、ネットワークが遮断、`gh` が未認証になります。 `gh issue view`、`git fetch`、`git worktree add` など .git 書き込み・ネットワーク・GitHub 認証が必要なコマンドは、`exec_command` で `sandbox_permissions: "require_escalated"` を指定して実行してください。 `gh` が未認証の場合は git credential helper から token を取り出せます（詳細は `commit-push-pr` skill 参照）。

## 使う場面

- ユーザーが GitHub issue URL を渡して「対応して」「実装して」「直して」と依頼したとき。
- issue 本文、コメント、関連 PR を確認してから作業用 worktree を作る必要があるとき。
- issue ごとに隔離された worktree と branch で、複数 AI が同時並行に作業できる状態を作るとき。

使わない場面:

- issue とは無関係な通常のバグ修正や小さな質問。
- すでに作業 branch や worktree が明示され、その場所で続行するよう依頼されているとき。
- GitHub ではない tracker やローカル issue メモだけが対象のとき。

## 手順

1. issue URL から repository と issue 番号を確認します。
   - URL 形式なら `<owner>/<repo>` と `<number>` を取り出します。
   - URL が曖昧なら、実装前に人間へ確認します。

2. `gh` で issue 情報を確認します。
   - URL をそのまま使える場合: `gh issue view <url> --comments`
   - 番号と repository を使う場合: `gh issue view <number> --repo <owner>/<repo> --comments`
   - 関連 PR や linked issue が本文・コメントにある場合は、必要な範囲で確認します。
   - `gh` が未認証の場合は、git credential helper から token を取り出して認証を試みます:
     `GH_TOKEN=$(printf "protocol=https\nhost=github.com\n\n" | git credential fill 2>/dev/null | rg '^password=' | sed 's/password=//') gh issue view <url> --comments`
   - このコマンドは `require_escalated` で実行します。
   - それでも失敗する場合は、実装前に人間へ報告して指示を待ちます。

3. 現在の worktree を確認します。
   - `git status --short` で未コミット変更を確認します。
   - 既存変更がある場合は、対象ファイルと今回の作業範囲を比較します。
   - 他者変更や無関係な変更を退避、上書き、revert しません。
   - 変更が衝突しそうでも、勝手に `stash` せず、専用 worktree を作って隔離します。

4. 起点 branch と既存 worktree を確認します。
   - 原則として `origin/develop` を起点にします。
   - `git fetch origin develop` で起点を更新します（`require_escalated`）。
   - `git worktree list` と branch 一覧で、同じ issue 番号の worktree / branch がないか確認します。
   - 既存 worktree / branch がある場合は、新規作成せず、再利用するか人間へ確認します。

5. issue 用 worktree と branch を作成します。
   - branch 名は `issue-<number>-<slug>` にします。
   - `<slug>` は issue title を短く kebab-case 化し、意味が残る範囲で簡潔にします。
   - 例: `issue-123-fix-tab-restore`
   - worktree path は `../TABBIN-issue-<number>-<slug>` を基本にします。
   - 作成コマンド例:
     `git worktree add -b issue-123-fix-tab-restore ../TABBIN-issue-123-fix-tab-restore origin/develop`（`require_escalated`）
   - 作成後は、その worktree に移動して以後の実装と検証を行います。
   - 既存 branch や path と衝突する場合は、一覧を確認してから人間へ確認します。

6. 実装前に止める条件を確認します。
   - 要件が不明、複数解釈できる、または acceptance criteria が不足している。
   - 破壊的変更、データ削除、permission 追加、security risk、UX 方針変更を含む。
   - 認証、権限、外部 API、secret、production data が必要。
   - 既存の同一 issue worktree があり、続行すべき場所が判断できない。

7. 実装します。
   - issue の再現条件、期待結果、関連コメントを要件として扱います。
   - 既存 helper、型、component、test fixture を探してから追加します。
   - 変更は issue 対応に必要な範囲へ絞ります。
   - `.apm` 管理対象や生成物が関係する場合は、source of truth 側を編集してから同期します。

8. 検証します。
   - まず変更範囲に最も近い対象テストを実行します。
   - 必要に応じて `bun run compile`、`bun run test`、`bun run test:coverage`、`bun run e2e` を実行します（network や port を使う場合は `require_escalated`）。
   - UI 変更では可能な範囲で browser / screenshot / Storybook / Playwright などの実動確認を行います。
   - 失敗や警告が残る場合は、原因と未解決理由を完了報告に含めます。

9. 完了報告と handoff を短くまとめます。
   - worktree path。
   - branch 名。
   - 変更概要。
   - 実行した検証コマンドと結果。
   - 次に使う skill: `commit-push-pr`（commit / push / PR 作成を一貫して行う）。
   - 未解決事項、確認が必要な点、実行できなかった検証。

## ブランチ名の作り方

- `issue-<number>-<slug>` を固定形式にします。
- `<slug>` は英小文字、数字、hyphen のみを使います。
- issue title から不要語を落とし、長すぎる場合は 3-6 語程度にします。
- 日本語 title の場合は、意味を保った短い英語 slug にします。
- issue URL がある場合は、`gh issue view <url> --comments` で title を確認してから slug を決めます。

## Worktree の作り方

- 1 issue につき 1 worktree / 1 branch を原則にします。
- 起点は原則 `origin/develop` です。ユーザーが別の起点 branch を明示した場合だけ従います。
- worktree path は repository の親ディレクトリに `TABBIN-issue-<number>-<slug>` 形式で作ります。
- 同じ issue 番号の worktree または branch が存在する場合は、二重作成せず再利用可否を確認します。
- メイン worktree の未コミット変更を、issue worktree へ持ち込んだり退避したりしません。
- 完了後の worktree 削除は、merge / close / ユーザー確認後に行います。

## よくあるミス

- 起点ブランチを確認する前に未コミット変更を確認しない。
- 他者変更を `stash`、`checkout`、`reset` で勝手に退避または破棄する。
- `gh` の認証失敗を無視して、issue 内容を推測で実装する。
- branch 名に issue 番号を入れ忘れる。
- 既存の issue worktree があるのに、同じ issue の branch / worktree を二重作成する。
- worktree を作った後も元の repository directory で実装や検証を続ける。
- 検証結果を「テストしました」だけで報告し、コマンド名と結果を残さない。
