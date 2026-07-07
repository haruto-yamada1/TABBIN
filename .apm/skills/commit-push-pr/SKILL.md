---
name: commit-push-pr
description: 実装完了後の commit、push、PR 作成まで一貫して進めるときに使います。ユーザーが「PR作成までお願いします」「developに対してPRを作って」「commitしてpushしてPRを開いて」と依頼したときに発火します。sandbox の .git 読み取り専用・ネットワーク遮断・gh 未認証の三重ブロックを回避する知識を含みます。
---

# commit push PR

実装完了後、変更を commit して push し、`develop` を target に PR を開くまでを一貫して行います。
この skill の最も重要な知識は sandbox 制限の回避です。

## sandbox 制限と回避

この環境の `exec_command` はデフォルトで sandbox 内で実行され、以下が制限されます:

- `.git` ディレクトリが読み取り専用（branch 作成、commit が失敗する）
- ネットワークが遮断される（DNS が解決できず、push や GitHub API が届かない）
- macOS キーチェーンへのアクセスが制限される（`gh` の認証に失敗する）

これらを回避するには、該当する `exec_command` の呼び出しで
`sandbox_permissions: "require_escalated"` を指定します。
sandbox の外で実行され、`.git` 書き込み、ネットワーク、キーチェーンが使えるようになります。

**escalation が必要な操作**: `git branch`, `git checkout`, `git add`, `git commit`,
`git push`, `git fetch`, `git worktree`, `gh issue view`, `gh pr create`,
`bun run build`, `bun run test`（network や port を使う場合）。

**escalation が不要な操作**: `cat`, `ls`, `rg`, `sed`, `node -e`（ファイル読み取りのみ）など
`.git` に書き込まず、ネットワークも使わないコマンド。

## gh 認証

`gh` が未認証の場合、git credential helper から token を取り出して `GH_TOKEN` 環境変数経由で
`gh` コマンドに渡します。token を file や stdout に出さないため、1 回の `exec_command`
（`require_escalated`）で完結させます:

```bash
GH_TOKEN=$(printf "protocol=https\nhost=github.com\n\n" | git credential fill 2>/dev/null | rg '^password=' | sed 's/password=//') gh pr create ...
```

`gh auth login --with-token` で永続認証しようとすると、token に `read:org` scope がない場合
失敗することがあります。`GH_TOKEN` を inline で渡す方式なら scope の一部が足りなくても
PR 作成に必要な API 呼び出しは成功します。

## 手順

### 1. 変更を確認する

```bash
git status --short --branch
git diff --stat
```

escalation 不要（読み取りのみ）。

- 変更がない場合は停止して報告します。
- 他者の未コミット変更が混ざっている場合は、勝手に stage せず、対象ファイルのみを扱います。

### 2. ブランチを確認・作成する

現在の branch が作業 branch でない場合、`develop` から新規 branch を作成します。

```bash
git branch --show-current          # escalation 不要
git fetch origin develop            # require_escalated
git checkout -b <branch-name> develop  # require_escalated
```

branch 名は `chore/issue-<number>-<slug>` または `fix/issue-<number>-<slug>` など、
issue 番号と内容が分かる形式にします。すでに適切な branch にいる場合はスキップします。

### 3. 変更を stage する

実装で変更したファイルのみを stage します。`git add .` は使いません。

```bash
git add <file1> <file2> ...   # require_escalated
```

- 生成物（`.output/`, `coverage/` 等）が混入していないか `git status` で確認します。
- `.apm` 管理ファイルの変更がある場合は、source 側を編集してから生成先を同期します。

### 4. commit する

```bash
git commit -m "<message>"   # require_escalated
```

- commit message は日本語で、短い命令形にします。
- 1 つの変更を説明する件名にします。
- body は必要な場合だけ入れます。

### 5. push する

```bash
git push -u origin <branch-name>   # require_escalated
```

- push が失敗した場合は、失敗理由を報告します。
- 認証エラーの場合は、gh 認証セクションの方法を試します。

### 6. PR を作成する

`develop` を base に PR を開きます。

```bash
GH_TOKEN=$(printf "protocol=https\nhost=github.com\n\n" | git credential fill 2>/dev/null | rg '^password=' | sed 's/password=//') gh pr create \
  --base develop \
  --head <branch-name> \
  --title "<title>" \
  --body "<body>"   # require_escalated
```

PR 本文はリポジトリガイドラインに従い、以下の構造にします:

```markdown
## 変更内容

- <変更点を箇条書きで>

## ローカル検証

- [x] `bun run lint`
- [x] `bun run compile`
- [x] `bun run test`（または `bun run test:node` / `bun run test:dom`）
- [ ] `bun run quality`（環境制限で実行できない場合はその旨を明記）

closes #<issue-number>
```

### 7. 報告する

完了時は短く報告します:

- 作成した branch 名
- commit hash
- PR URL
- 実行した検証コマンドと結果
- 実行できなかった手順があればその理由

## 前提知識

- `gh` が未認証でも git credential helper に token があれば PR 作成できます。
- `gh auth status` で認証済みか確認できます（escalation 不要）。
- 認証済みの場合は `GH_TOKEN=...` の前置きなしで `gh pr create` を直接使います。
- PR base は原則 `develop` です。ユーザーが別 branch を指定した場合のみ従います。
- commit message と PR title は日本語で作成します。

## よくあるミス

- sandbox 内で `git commit` や `git push` を実行して `.git` 読み取り専用エラーになる。
- sandbox 内で `gh pr create` を実行して DNS 解決失敗になる。
- `gh` が未認証の場合に諦めて人間へ報告する（git credential helper で認証できる）。
- `gh auth login --with-token` で永続認証を試みて scope 不足で失敗し、そこで諦める。
  `GH_TOKEN` inline 方式なら回避できる。
- 生成物（`.output/` 等）を commit に混ぜる。
- PR base を `main` にする（TABBIN は `develop` が基本）。
