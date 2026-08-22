# IndexedDB Keyword Reclassification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 子カテゴリキーワード保存時に、IndexedDB上の既存タブmembershipを旧経路と同じ規則で再分類する。

**Architecture:** `SetCategoryKeywordsUseCase`の既存contractは維持し、IndexedDB側 `setCategoryKeywordsPort` のatomic mutationを補完する。カテゴリ保存後のordered categoryとURLタイトルから最初の一致を求め、対象collectionのmembershipだけをimmutable更新する。

**Tech Stack:** TypeScript、Vitest、fake-indexeddb、Persistence V2 IndexedDB Unit of Work

---

### Task 1: 実利用経路の回帰テストをREDにする

**Files:**

- Modify: `src/contexts/saved-tabs/infrastructure/composition/createIndexedDbSavedTabsUseCases.integration.test.ts`

**Step 1: IndexedDBへdomain collection、categories、URLs、membershipsをseedする**

次の状態を `IndexedDbPersistenceUnitOfWork.commit` で作る。

```ts
const targetCollection = 'domain-example'
const matchingCategory = 'category-members'

// titleに「member」を含む未分類membership
// 一致しない既存分類membership
// 別collectionのmembership
```

**Step 2: キーワード保存use-caseを呼ぶ**

```ts
await useCases.setCategoryKeywords({
  tabGroupId: targetCollection,
  categoryName: 'Members',
  keywords: ['member'],
})
```

**Step 3: reload snapshotで実利用結果をassertする**

```ts
const snapshot = await snapshotReader.readVerifiedSavedTabsSnapshot()
expect(targetMembership.categoryId).toBe(matchingCategory)
expect(unmatchedMembership).toMatchObject({
  categoryId: existingCategory,
  notes: 'keep',
  sortOrder: 1,
})
expect(otherCollectionMembership).toStrictEqual(originalOtherMembership)
```

カテゴリのキーワード保存と、matching membershipの `updatedAt` 更新も確認する。

**Step 4: REDを確認する**

Run:

```bash
bun run test:node -- src/contexts/saved-tabs/infrastructure/composition/createIndexedDbSavedTabsUseCases.integration.test.ts
```

Expected: matching membershipの `categoryId` が `undefined` のためFAIL。

### Task 2: IndexedDBのatomic再分類を最小実装する

**Files:**

- Modify: `src/contexts/saved-tabs/infrastructure/composition/NativeSavedTabsPersistenceAdapters.ts`
- Test: `src/contexts/saved-tabs/infrastructure/composition/createIndexedDbSavedTabsUseCases.integration.test.ts`

**Step 1: 最初に一致するcategoryを返すpure helperを追加する**

```ts
const findCategoryMatchingTitle = (
  title: string,
  categories: readonly PersistenceV2CollectionCategory[],
): PersistenceV2CollectionCategory | undefined => {
  const normalizedTitle = title.toLowerCase()
  return categories.find(({ keywords }) =>
    keywords.some(
      (keyword) =>
        keyword.length > 0 && normalizedTitle.includes(keyword.toLowerCase()),
    ),
  )
}
```

`categoriesFor`のsortOrder順をそのまま優先順位として使う。

**Step 2: `setCategoryKeywordsPort`でカテゴリ保存後にmembershipを再分類する**

```ts
saveDomainCategories(...)
const categories = categoriesFor(state, collection.id)
const urlsById = new Map(state.urls.map((url) => [url.id, url]))
const timestamp = now()

state.memberships = state.memberships.map((membership) => {
  if (membership.collectionId !== collection.id) return membership
  const url = urlsById.get(membership.urlId)
  const category = url
    ? findCategoryMatchingTitle(url.title, categories)
    : undefined
  if (!category || membership.categoryId === category.id) return membership
  return { ...membership, categoryId: category.id, updatedAt: timestamp }
})
```

**Step 3: GREENを確認する**

Run:

```bash
bun run test:node -- src/contexts/saved-tabs/infrastructure/composition/createIndexedDbSavedTabsUseCases.integration.test.ts
```

Expected: PASS。

**Step 4: 優先順位を同じテストへ追加する**

同じタイトルに2カテゴリが一致するfixtureを追加し、sortOrderが先のcategory IDを選ぶことを確認する。

**Step 5: focused regressionを実行する**

Run:

```bash
bun run test:node -- src/contexts/saved-tabs/infrastructure/composition/createIndexedDbSavedTabsUseCases.integration.test.ts src/contexts/saved-tabs/infrastructure/composition/NativeSavedTabsPersistenceAdapters.test.ts src/lib/storage/tabs.test.ts
```

Expected: PASS。

### Task 3: 全体検証とレビューを行う

**Files:**

- Verify: all changed files

**Step 1: 静的検査と全テストを実行する**

```bash
bun run compile
bun run quality:check
bun run test:coverage
git diff --check
```

Expected: 全てexit 0。coverage thresholdを維持。

**Step 2: 独立コードレビューを実施する**

確認項目:

- legacyと同じtitle-only／first-match semantics
- 一致しない既存割当を解除しない
- target collection外を変更しない
- 同一session／Unit of Workでatomic commit
- JSON-safe／exact optional契約を維持

**Step 3: implementation commitを作る**

```bash
git add src/contexts/saved-tabs/infrastructure/composition/NativeSavedTabsPersistenceAdapters.ts \
  src/contexts/saved-tabs/infrastructure/composition/createIndexedDbSavedTabsUseCases.integration.test.ts \
  docs/plans/2026-08-23-indexeddb-keyword-reclassification.md
git commit -m "IndexedDBの子カテゴリキーワード再分類を修正"
```

### Task 4: pushしてPRを作成する

**Step 1: branchをpushする**

```bash
git push -u origin codex/indexeddb-keyword-reclassification
```

**Step 2: `develop`向け非Draft PRを作成する**

PR本文にroot cause、atomic再分類、RED→GREENテスト、quality／coverage結果を記載する。
