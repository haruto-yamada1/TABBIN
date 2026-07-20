---
name: finishing-a-development-branch
disable-model-invocation: true
description: 実装完了、全テスト通過後、作業の統合方法を決めるときに使います。merge、PR、クリーンアップの構造化された選択肢を提示して開発完了を導きます。
---

# 開発ブランチの完了

## 概要

明確な選択肢を提示し、選ばれたワークフローを処理して開発作業の完了を導く。

**中核原則:** テスト検証 → 選択肢提示 → 選択実行 → クリーンアップ。

**開始時に宣言:** 「finishing-a-development-branch skill を使ってこの作業を完了します。」

## プロセス

### ステップ 1: テストの検証

**選択肢を提示する前に、テスト通過を検証:**

```bash
# Run project's test suite
npm test / cargo test / pytest / go test ./...
```

**テスト失敗時:**
```
Tests failing (<N> failures). Must fix before completing:

[Show failures]

Cannot proceed with merge/PR until tests pass.
```

停止。ステップ 2 に進まない。

**テスト通過時:** ステップ 2 へ。

### ステップ 2: ベースブランチの特定

```bash
# Try common base branches
git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null
```

または確認: 「このブランチは main から分岐 — 合っていますか？」

### ステップ 3: 選択肢の提示

次の 4 択を正確に提示:

```
Implementation complete. What would you like to do?

1. Merge back to <base-branch> locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)
4. Discard this work

Which option?
```

**説明は追加しない** — 選択肢は簡潔に。

### ステップ 4: 選択の実行

#### オプション 1: ローカル merge

```bash
# Switch to base branch
git checkout <base-branch>

# Pull latest
git pull

# Merge feature branch
git merge <feature-branch>

# Verify tests on merged result
<test command>

# If tests pass
git branch -d <feature-branch>
```

その後: worktree クリーンアップ（ステップ 5）

#### オプション 2: push して PR 作成

```bash
# Push branch
git push -u origin <feature-branch>

# Create PR
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary
<2-3 bullets of what changed>

## Test Plan
- [ ] <verification steps>
EOF
)"
```

その後: worktree クリーンアップ（ステップ 5）

#### オプション 3: そのまま保持

報告: 「ブランチ <name> を保持。worktree は <path> に保存。」

**worktree はクリーンアップしない。**

#### オプション 4: 破棄

**先に確認:**
```
This will permanently delete:
- Branch <name>
- All commits: <commit-list>
- Worktree at <path>

Type 'discard' to confirm.
```

正確な確認を待つ。

確認後:
```bash
git checkout <base-branch>
git branch -D <feature-branch>
```

その後: worktree クリーンアップ（ステップ 5）

### ステップ 5: worktree クリーンアップ

**オプション 1、2、4 の場合:**

worktree 内か確認:
```bash
git worktree list | grep $(git branch --show-current)
```

該当する場合:
```bash
git worktree remove <worktree-path>
```

**オプション 3:** worktree を保持。

## クイックリファレンス

| オプション | Merge | Push | Worktree 保持 | ブランチ削除 |
|--------|-------|------|---------------|----------------|
| 1. ローカル merge | ✓ | - | - | ✓ |
| 2. PR 作成 | - | ✓ | ✓ | - |
| 3. そのまま | - | - | ✓ | - |
| 4. 破棄 | - | - | - | ✓ (force) |

## よくある間違い

**テスト検証の省略**
- **問題:** 壊れたコードを merge、失敗 PR
- **修正:** 選択肢提示前に常にテスト検証

**オープンエンドな質問**
- **問題:** 「次に何を？」→ 曖昧
- **修正:** 正確に 4 つの構造化選択肢を提示

**自動 worktree クリーンアップ**
- **問題:** 必要なとき（オプション 2、3）に worktree 削除
- **修正:** オプション 1 と 4 のみクリーンアップ

**破棄時の確認なし**
- **問題:** 誤って作業削除
- **修正:** 「discard」の入力確認を必須

## 危険信号

**Never:**
- 失敗テストのまま続行
- 結果のテスト検証なし merge
- 確認なしで作業削除
- 明示的依頼なし force-push

**Always:**
- 選択肢提示前にテスト検証
- 正確に 4 選択肢を提示
- オプション 4 は入力確認
- オプション 1 と 4 のみ worktree クリーンアップ

## 連携

**呼び出し元:**
- **subagent-driven-development**（ステップ 7）— 全タスク完了後
- **executing-plans**（ステップ 5）— 全バッチ完了後

**ペア:**
- **using-git-worktrees** — その skill が作成した worktree をクリーンアップ
