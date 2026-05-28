---
name: github-issue-implementation
description: GitHub issue URL を渡され、issue の内容を起点に repository 確認、作業ブランチ作成、実装、検証、完了報告まで進める依頼で使います。issue 番号だけでなく URL、関連 PR、コメント確認、develop ベースの修正開始が必要なときに発火します。
---

# GitHub Issue 実装

GitHub issue URL から作業対象を特定し、`origin/develop` ベースの専用ブランチで実装します。人間や他エージェントの未コミット変更を上書きせず、不明点や権限不足があれば実装前に止めます。

## 使う場面

- ユーザーが GitHub issue URL を渡して「対応して」「実装して」「直して」と依頼したとき。
- issue 本文、コメント、関連 PR を確認してから作業ブランチを作る必要があるとき。
- `develop` を最新化して issue ごとのブランチで実装を始めるとき。

使わない場面:

- issue とは無関係な通常のバグ修正や小さな質問。
- すでに作業ブランチが明示され、そのブランチ上で続行するよう依頼されているとき。
- GitHub ではない tracker や Beads issue だけが対象のとき。

## 手順

1. issue URL から repository と issue 番号を確認します。
   - URL 形式なら `<owner>/<repo>` と `<number>` を取り出します。
   - URL が曖昧なら、実装前に人間へ確認します。

2. `gh` で issue 情報を確認します。
   - URL をそのまま使える場合: `gh issue view <url> --comments`
   - 番号と repository を使う場合: `gh issue view <number> --repo <owner>/<repo> --comments`
   - 関連 PR や linked issue が本文・コメントにある場合は、必要な範囲で確認します。
   - `gh` が未認証、権限不足、network failure の場合は、実装前に人間へ報告して指示を待ちます。

3. 作業前に worktree を確認します。
   - `git status --short` で未コミット変更を確認します。
   - 既存変更がある場合は、対象ファイルと今回の作業範囲を比較します。
   - 他者変更や無関係な変更を退避、上書き、revert しません。
   - 変更が衝突しそうなら、branch 作成や実装前に人間へ確認します。

4. `develop` を最新化します。
   - `git fetch origin develop`
   - `git switch develop`
   - `git pull --ff-only origin develop` または `git reset --hard origin/develop`
   - `git reset --hard` は破壊的操作なので、人間が明示許可した場合だけ使います。通常は `git pull --ff-only` を優先します。

5. issue 用ブランチを作成します。
   - branch 名は `issue-<number>-<slug>` にします。
   - `<slug>` は issue title を短く kebab-case 化し、意味が残る範囲で簡潔にします。
   - 例: `issue-123-fix-tab-restore`
   - 作成コマンド例: `git switch -c issue-123-fix-tab-restore`
   - 既存 branch と衝突する場合は、現在の branch 一覧を確認してから人間へ確認します。

6. 実装前に止める条件を確認します。
   - 要件が不明、複数解釈できる、または acceptance criteria が不足している。
   - 破壊的変更、データ削除、permission 追加、security risk、UX 方針変更を含む。
   - 認証、権限、外部 API、secret、production data が必要。
   - 既存の未コミット変更と作業範囲が重なる。

7. 実装します。
   - issue の再現条件、期待結果、関連コメントを要件として扱います。
   - 既存 helper、型、component、test fixture を探してから追加します。
   - 変更は issue 対応に必要な範囲へ絞ります。
   - `.apm` 管理対象や生成物が関係する場合は、source of truth 側を編集してから同期します。

8. 検証します。
   - まず変更範囲に最も近い対象テストを実行します。
   - 必要に応じて `bun run compile`、`bun run test`、`bun run test:coverage`、`bun run e2e` を実行します。
   - UI 変更では可能な範囲で browser / screenshot / Storybook / Playwright などの実動確認を行います。
   - 失敗や警告が残る場合は、原因と未解決理由を完了報告に含めます。

9. 完了報告を短くまとめます。
   - branch 名。
   - 変更概要。
   - 実行した検証コマンドと結果。
   - 未解決事項、確認が必要な点、実行できなかった検証。

## ブランチ名の作り方

- `issue-<number>-<slug>` を固定形式にします。
- `<slug>` は英小文字、数字、hyphen のみを使います。
- issue title から不要語を落とし、長すぎる場合は 3-6 語程度にします。
- 日本語 title の場合は、意味を保った短い英語 slug にします。
- issue URL がある場合は、`gh issue view <url> --comments` で title を確認してから slug を決めます。

## よくあるミス

- `develop` へ移動する前に未コミット変更を確認しない。
- 他者変更を `stash`、`checkout`、`reset` で勝手に退避または破棄する。
- `gh` の認証失敗を無視して、issue 内容を推測で実装する。
- branch 名に issue 番号を入れ忘れる。
- 検証結果を「テストしました」だけで報告し、コマンド名と結果を残さない。
