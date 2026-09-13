---
name: using-git-worktrees
description: 現在の workspace から隔離した機能作業を始めるとき、または実装計画を実行する前に使います。スマートなディレクトリ選択と安全検証付きで隔離 git worktree を作成します。
---

# git worktree の利用

## 概要

git worktree は同一リポジトリを共有する隔離 workspace を作り、ブランチ切り替えなしに複数ブランチを同時作業できる。

**中核原則:** 体系的なディレクトリ選択 + 安全検証 = 信頼できる隔離。

**開始時に宣言:** 「using-git-worktrees skill を使って隔離 workspace をセットアップします。」

## ディレクトリ選択プロセス

ユーザーが場所や既存 checkout の利用を指定した場合はその指定を優先する。
それ以外は次の優先順位に従う:

### 1. 既存ディレクトリの確認

```bash
# Check in priority order
ls -d .worktrees 2>/dev/null     # Preferred (hidden)
ls -d worktrees 2>/dev/null      # Alternative
```

**見つかった場合:** そのディレクトリを使う。両方ある場合 `.worktrees` が優先。

### 2. CLAUDE.md の確認

```bash
grep -i "worktree.*director" CLAUDE.md 2>/dev/null
```

**設定があれば:** 質問せずそれを使う。

### 3. 既定の場所を使う

ディレクトリも既存設定もない場合は、プロジェクト内の `.worktrees/` を選び、
下記の ignore 検証を行う。ユーザー指定の場所が使えない、権限がない、
既存作業と衝突する場合は、その問題を解消してから作成する。

## 安全検証

### プロジェクトローカル（.worktrees または worktrees）

**worktree 作成前にディレクトリが ignore されていることを MUST 検証:**

```bash
# Check if directory is ignored (respects local, global, and system gitignore)
git check-ignore -q .worktrees 2>/dev/null || git check-ignore -q worktrees 2>/dev/null
```

**ignore されていない場合:**

1. 適切な行を .gitignore に追加
2. ignore が有効になったことを確認して worktree 作成を続行
3. commit はリポジトリの許可境界と完了ゲートを満たす場合だけ行う

**なぜ重要:** worktree 内容の誤 commit を防ぐ。

### グローバル（~/.config/worktrees）

プロジェクト外のため .gitignore 検証不要。

## 作成手順

### 1. プロジェクト名の検出

```bash
project=$(basename "$(git rev-parse --show-toplevel)")
```

### 2. worktree の作成

```bash
# Determine full path
case $LOCATION in
  .worktrees|worktrees)
    path="$LOCATION/$BRANCH_NAME"
    ;;
  ~/.config/worktrees/*)
    path="$HOME/.config/worktrees/$project/$BRANCH_NAME"
    ;;
esac

# Create worktree with new branch
git worktree add "$path" -b "$BRANCH_NAME"
cd "$path"
```

### 3. プロジェクトセットアップの実行

適切なセットアップを自動検出して実行:

```bash
# Node.js
if [ -f package.json ]; then npm install; fi

# Rust
if [ -f Cargo.toml ]; then cargo build; fi

# Python
if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
if [ -f pyproject.toml ]; then poetry install; fi

# Go
if [ -f go.mod ]; then go mod download; fi
```

### 4. クリーン baseline の検証

worktree がクリーンに始まることをテストで確認:

```bash
# Examples - use project-appropriate command
npm test
cargo test
pytest
go test ./...
```

**テスト失敗:** 原因を調べ、既存不具合・環境・今回の変更を区別する。許可範囲内で解消し、判断や権限が不足する場合だけ確認する。

**テスト通過:** 準備完了と報告。

### 5. 場所の報告

```
Worktree ready at <full-path>
Tests passing (<N> tests, 0 failures)
Ready to implement <feature-name>
```

## クイックリファレンス

| 状況                         | アクション                               |
| ---------------------------- | ---------------------------------------- |
| `.worktrees/` 存在           | 使う（ignore 検証）                      |
| `worktrees/` 存在            | 使う（ignore 検証）                      |
| 両方存在                     | `.worktrees/` を使う                     |
| どちらもなし                 | 既存設定を確認し、未指定なら .worktrees/ |
| ディレクトリ未 ignore        | .gitignore 追加 + ignore 再確認          |
| baseline テスト失敗          | 原因調査。必要な判断だけ確認             |
| package.json/Cargo.toml なし | 依存インストール省略                     |

## よくある間違い

### ignore 検証の省略

- **問題:** worktree 内容が追跡され git status を汚染
- **修正:** プロジェクトローカル worktree 前に常に `git check-ignore`

### ディレクトリ場所の仮定

- **問題:** 不整合、プロジェクト慣習違反
- **修正:** 優先順位に従う: ユーザー指定 > 既存ディレクトリ > 既存設定 > .worktrees/

### 失敗テストのまま続行

- **問題:** 新バグと既存問題の区別不可
- **修正:** 原因を調べて既存不具合と今回の変更を区別する。許可範囲内で解消し、必要な判断だけ確認する

### セットアップコマンドのハードコード

- **問題:** 異なるツールのプロジェクトで壊れる
- **修正:** プロジェクトファイルから自動検出（package.json など）

## 例ワークフロー

```
You: using-git-worktrees skill を使って隔離 workspace をセットアップします。

[.worktrees/ を確認 — 存在]
[ignore 検証 — git check-ignore で .worktrees/ が ignore されていることを確認]
[worktree 作成: git worktree add .worktrees/auth -b feature/auth]
[npm install 実行]
[npm test 実行 — 47 passing]

Worktree ready at /Users/<user>/myproject/.worktrees/auth
Tests passing (47 tests, 0 failures)
Ready to implement auth feature
```

## 危険信号

**Never:**

- ignore 未検証で worktree 作成（プロジェクトローカル）
- baseline テスト検証の省略
- 失敗テストを未調査のまま成功と扱う
- ユーザー指定や既存設定を無視して場所を選ぶ
- CLAUDE.md 確認の省略

**Always:**

- ディレクトリ優先順位: ユーザー指定 > 既存ディレクトリ > 既存設定 > .worktrees/
- プロジェクトローカルでは ignore 検証
- プロジェクトセットアップの自動検出と実行
- クリーンなテスト baseline の検証

## 連携

**呼び出し元:**

- **brainstorming** — 実装まで依頼され、隔離が必要になった場合
- **subagent-driven-development** — 担当作業の隔離が必要な場合
- **executing-plans** — 計画の実行に隔離が必要な場合
- 隔離 workspace が必要な任意の skill

**ペア:**

- **finishing-a-development-branch** — 依頼された統合・保持・cleanupを処理する。作業完了だけでworktreeを削除しない
