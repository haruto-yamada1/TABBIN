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

次の優先順位に従う:

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

### 3. ユーザーに確認

ディレクトリも CLAUDE.md の設定もない場合:

```
worktree ディレクトリが見つかりません。どこに作成しますか？

1. .worktrees/（プロジェクトローカル、非表示）
2. ~/.config/worktrees/<project-name>/（グローバル）

どちらにしますか？
```

## 安全検証

### プロジェクトローカル（.worktrees または worktrees）

**worktree 作成前にディレクトリが ignore されていることを MUST 検証:**

```bash
# Check if directory is ignored (respects local, global, and system gitignore)
git check-ignore -q .worktrees 2>/dev/null || git check-ignore -q worktrees 2>/dev/null
```

**ignore されていない場合:**

Jesse のルール「壊れているものは即修正」に従い:
1. 適切な行を .gitignore に追加
2. 変更を commit
3. worktree 作成を続行

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
    path="~/.config/worktrees/$project/$BRANCH_NAME"
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

**テスト失敗:** 失敗を報告し、続行するか調査するか確認。

**テスト通過:** 準備完了と報告。

### 5. 場所の報告

```
Worktree ready at <full-path>
Tests passing (<N> tests, 0 failures)
Ready to implement <feature-name>
```

## クイックリファレンス

| 状況 | アクション |
|-----------|--------|
| `.worktrees/` 存在 | 使う（ignore 検証） |
| `worktrees/` 存在 | 使う（ignore 検証） |
| 両方存在 | `.worktrees/` を使う |
| どちらもなし | CLAUDE.md 確認 → ユーザーに確認 |
| ディレクトリ未 ignore | .gitignore 追加 + commit |
| baseline テスト失敗 | 失敗報告 + 確認 |
| package.json/Cargo.toml なし | 依存インストール省略 |

## よくある間違い

### ignore 検証の省略

- **問題:** worktree 内容が追跡され git status を汚染
- **修正:** プロジェクトローカル worktree 前に常に `git check-ignore`

### ディレクトリ場所の仮定

- **問題:** 不整合、プロジェクト慣習違反
- **修正:** 優先順位に従う: 既存 > CLAUDE.md > 確認

### 失敗テストのまま続行

- **問題:** 新バグと既存問題の区別不可
- **修正:** 失敗を報告し、明示的許可を得る

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
- 確認なしで失敗テストのまま続行
- 曖昧なときにディレクトリ場所を仮定
- CLAUDE.md 確認の省略

**Always:**
- ディレクトリ優先順位: 既存 > CLAUDE.md > 確認
- プロジェクトローカルでは ignore 検証
- プロジェクトセットアップの自動検出と実行
- クリーンなテスト baseline の検証

## 連携

**呼び出し元:**
- **brainstorming**（フェーズ 4）— 設計承認後、実装に続く場合 MUST
- **subagent-driven-development** — タスク実行前 MUST
- **executing-plans** — タスク実行前 MUST
- 隔離 workspace が必要な任意の skill

**ペア:**
- **finishing-a-development-branch** — 作業完了後のクリーンアップ MUST
