# PR 自動更新 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** `develop` 更新時に open PR を自動で最新化し、既存 CI を再実行できるようにする

**Architecture:** `develop` への `push` を契機に専用 GitHub Actions workflow を起動し、
GitHub REST API の `update-branch` を使って対象 PR を順次更新する。
既存の `CI` workflow はそのまま使い、branch 更新による `pull_request.synchronize`
を再実行トリガーにする。

**Tech Stack:** GitHub Actions YAML, `actions/github-script`, GitHub REST API

---

### Task 1: workflow の追加

**Files:**
- Create: `.github/workflows/update-pr-branches.yml`
- Reference: `.github/workflows/ci.yml`
- Doc: `docs/plans/2026-05-31-pr-auto-update-design.md`

**Step 1: 条件を固定する**

- 対象を `base=develop`, `open`, same-repo, non-draft に固定する
- skip 条件を `fork`, `head=develop`, `already up to date`, `update failure` に固定する

**Step 2: 最小 workflow を書く**

- `push` on `develop`
- `permissions` を最小化する
- `actions/github-script` で PR 列挙と `update-branch` を実装する

**Step 3: summary 出力を入れる**

- 更新件数
- スキップ件数
- 失敗件数
- PR 番号と理由

**Step 4: YAML を見直す**

- 既存 `ci.yml` と命名・indent・job 構造を揃える

### Task 2: 検証

**Files:**
- Verify: `.github/workflows/update-pr-branches.yml`

**Step 1: 構文確認**

Run: `ruby -e "require 'yaml'; YAML.load_file('.github/workflows/update-pr-branches.yml'); puts 'ok'"`
Expected: `ok`

**Step 2: 差分確認**

Run: `git diff -- .github/workflows/update-pr-branches.yml docs/plans/2026-05-31-pr-auto-update-design.md docs/plans/2026-05-31-pr-auto-update.md`
Expected: 新規 workflow と plan/design doc だけが出る

**Step 3: 運用確認項目を明示**

- 次回 `develop` push 時に workflow が起動する
- open PR の branch が更新された場合だけ既存 `CI` が再実行される
- conflict PR は summary に失敗理由が残る
