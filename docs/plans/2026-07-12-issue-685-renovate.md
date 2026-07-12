# Issue #685 Renovate Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Renovate を手動 review 前提の安全な依存更新基盤として TABBIN に導入する。

**Architecture:** Renovate policy を `.github/renovate.json` に集約し、CI、workflow、
package lifecycle allowlist、運用文書を静的テストで拘束する。Renovate、OSV、GitHub
vulnerability alerts、Bun audit を多層化し、自動 merge と lifecycle script 実行は許可しない。

**Tech Stack:** Renovate, Bun 1.3.14, GitHub Actions, Vitest, TypeScript

---

### Task 1: Policy regression test

**Files:**

- Create: `tools/renovate-policy.test.ts`

1. `.github/renovate.json` が存在し、manager、schedule、approval、separation、limits、
   vulnerability、script、preset、preview rule、lockfile policy を満たすテストを書く。
2. package/CI の security audit、full SHA、Renovate PR 除外を検証するテストを書く。
3. `rtk bunx vitest run tools/renovate-policy.test.ts` を実行し、必要ファイル・設定の欠如で
   FAIL することを確認する。

### Task 2: Renovate policy

**Files:**

- Create: `.github/renovate.json`

1. Issue の設定案を基礎に、`config:recommended`、Action digest pin、config migration、
   abandonments、Bun/GitHub Actions manager、weekly/preview schedule を追加する。
2. npm の14日待機、major/preview approval、manual merge、OSV/GitHub vulnerability policy、
   PR checklist を設定する。
3. テストを再実行し、Renovate policy 部分が PASS することを確認する。
4. 公式 validator で config schema と preset を検証する。

### Task 3: Bun audit and lifecycle allowlist

**Files:**

- Modify: `package.json`
- Modify: `bun.lock` only if Bun updates lock metadata
- Modify: `.github/workflows/ci.yml`

1. `bun pm ls --trusted` と `bun pm untrusted` を記録し、必要 package を特定する。
2. `security:audit: bun audit --audit-level=high` と最小 `trustedDependencies` を追加する。
3. CI install 後に `bun run security:audit` を実行する blocking step を追加する。
4. policy test と `rtk bun run security:audit` を実行して PASS を確認する。

### Task 4: Immutable Actions and lifecycle ownership

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/react-doctor.yml`
- Modify: `.github/workflows/update-pr-branches.yml`

1. 全 external Action を現在 tag の full commit SHA と可読性コメントへ置き換える。
2. `update-pr-branches.yml` で `renovate[bot]` と `renovate/` branch を除外する。
3. policy test を実行し、tag reference と二重 branch update が無いことを確認する。

### Task 5: Review policy documentation

**Files:**

- Create: `docs/maintenance/dependency-updates.md`

1. Dashboard approval、pin migration、CI、upstream change、supply-chain、behavior review、
   CVE ignore の期限/理由、trustedDependencies 変更手順を記載する。
2. 初回 Renovate PR は pin migration 専用にし、通常 update と混在させない手順を記載する。
3. formatter と secretlint で文書を検証する。

### Task 6: Full verification and evaluation

**Files:**

- Review all modified files

1. `rtk bunx vitest run tools/renovate-policy.test.ts` を実行する。
2. Renovate config validator と `rtk bun run security:audit` を実行する。
3. `rtk bun run test:coverage` で 100% coverage を確認する。
4. `rtk bun run quality` と `rtk bun run release:check` を実行する。
5. security review で Action permission、script trust、vulnerability path を確認する。
6. `rtk bun run harness:validate`、`harness:audit`、fresh-context evaluator を実行する。
7. Issue の受け入れ条件を差分、コマンド、外部 Interactive job に対応付ける。
