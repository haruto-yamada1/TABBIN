# Silent Migration Preflight Implementation Plan

**Goal:** Remove the non-actionable migration preflight UI while preserving a
best-effort preflight run on app startup.

**Architecture:** Start the migration preflight from the app bootstrap instead
of a React notice. Reduce the composition controller to a run-only internal
boundary: reuse a persisted healthy result, rerun any non-healthy result once
per page launch, and let the app render even when the internal check rejects.

---

## Task 1: Lock the silent startup contract with tests

**目的:** preflight が画面を生成せず起動時に走り、失敗してもアプリ描画を妨げない
ことを regression test にする。

**対象ファイル候補:**

- Modify: `src/entrypoints/app/main.test.tsx`
- Modify: `src/app/composition/createMigrationPreflightController.test.ts`

**守る契約:**

- healthy の再解析は不要。
- not-run / blocked / stale は次回ページ起動時に再解析する。
- raw error、診断JSON、raw backupを通常UIへ出さない。

**Acceptance criteria:**

- [ ] DOMContentLoaded で内部preflightを一度開始する。
- [ ] preflight失敗時もアプリをmountする。
- [ ] healthy は保存済み結果を再利用する。
- [ ] not-run / blocked / stale は再解析する。
- [ ] 同一ページ起動中に重複実行しない。

**検証方法:**

- `bun run test:dom -- src/entrypoints/app/main.test.tsx` が成功する。
- `bun run test:node -- src/app/composition/createMigrationPreflightController.test.ts`
  が成功する。

**リスク / rollback:**

- React Strict Modeや重複eventで二重実行しないよう、controller側でpage-lifetimeの
  once guardを持つ。

## Task 2: Remove the user-facing diagnostic surface

**目的:** ユーザーが完了できないnotice、diagnostic copy、raw downloadを通常画面から
撤去する。

**対象ファイル候補:**

- Modify: `src/entrypoints/app/main.tsx`
- Modify: `src/app/composition/createMigrationPreflightController.ts`
- Delete: `src/app/composition/MigrationPreflightNotice.tsx`
- Delete: `src/app/composition/MigrationPreflightNotice.test.tsx`
- Delete: `src/components/MigrationPreflightNotice.stories.tsx`

**守る契約:**

- preflight service・control-plane status・migration gateは維持する。
- 通常利用を内部preflightの成功待ちにしない。
- failure detailsをログ、toast、clipboard、downloadへ出さない。

**Acceptance criteria:**

- [ ] app treeにmigration preflight UIが存在しない。
- [ ] clipboard/download用controller APIが存在しない。
- [ ] app bootstrapから内部runだけを開始する。
- [ ] preflight rejectionをUIへ伝播しない。

**検証方法:**

- Task 1のtargeted testがすべて成功する。
- `rg 'MigrationPreflightNotice|copyDiagnostic|downloadTextFile' src` が該当なし。

**リスク / rollback:**

- silent failureで状態が失われないよう、service側の既存control-plane保存契約は
  変更しない。

## Task 3: Run repository completion gates

**目的:** UI撤去、起動処理、coverage、repository policyの回帰がないことを確認する。

**守る契約:**

- `$test-selection`、`$react-doctor`、`$verification-before-completion` に従う。
- coverage thresholdは変更しない。

**Acceptance criteria:**

- [ ] targeted node / DOM testsが通る。
- [ ] React Doctorが新規問題を報告しない。
- [ ] `bun run e2e:a11y` が通る。
- [ ] `bun run agent:check` がOKになる。
- [ ] `bun run test:coverage` が全thresholdを満たす。

**検証方法:**

- 上記コマンドがexit code 0で完了する。

**リスク / rollback:**

- browser sandbox起因のE2E失敗はproduct regressionと切り分ける。
