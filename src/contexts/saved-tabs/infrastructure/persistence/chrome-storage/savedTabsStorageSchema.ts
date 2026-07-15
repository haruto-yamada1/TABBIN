import { z } from 'zod'

/**
 * `saved-tabs` 機能の `chrome.storage.local` 永続化データ用 Zod schema。
 *
 * 旧 `src/lib/storage/zod-storage.ts` の schema と互換の形で定義しているが、
 * DDD の infrastructure 層から `@/lib/storage/*` 経由で参照するのは依存方向が
 * 逆転するため、schema 定義そのものを contexts 側に複製している。
 *
 * 役割:
 * - chrome.storage.local からの生データをパースし、想定外のフィールド混入を弾く。
 * - mapper (`ChromeSavedTabsStorageMapper`) がパース済みデータを domain entity
 *   に変換する前に、安全な `unknown` 境界を提供する。
 *
 * 注意:
 * - これらの schema は「過去フォーマット → 将来フォーマット」を吸収するための
 *   互換点。新規フィールドは optional、後方互換を壊す変更は別 issue で
 *   migration を用意する。
 * - マイグレーション（`urlsMigrationCompleted` など）は別 issue で
 *   `infrastructure/persistence/migrations/` に切り出す。
 */

const subCategoryKeywordSchema = z.object({
  categoryName: z.string(),
  keywords: z.array(z.string()),
})

const savedTabUrlEntrySchema = z.object({
  id: z.string().optional(),
  url: z.string(),
  title: z.string(),
  subCategory: z.string().optional(),
  savedAt: z.number().optional(),
})

export const SavedTabRawSchema = z.object({
  id: z.string(),
  domain: z.string(),
  parentCategoryId: z.string().optional(),
  urlIds: z.array(z.string()).optional(),
  urls: z.array(savedTabUrlEntrySchema).optional(),
  urlSubCategories: z.record(z.string(), z.string()).optional(),
  subCategories: z.array(z.string()).optional(),
  categoryKeywords: z.array(subCategoryKeywordSchema).optional(),
  subCategoryOrder: z.array(z.string()).optional(),
  subCategoryOrderWithUncategorized: z.array(z.string()).optional(),
  savedAt: z.number().optional(),
})

export const UrlRecordRawSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string(),
  savedAt: z.number(),
  favIconUrl: z.string().optional(),
})

export const ParentCategoryRawSchema = z.object({
  id: z.string(),
  name: z.string(),
  domains: z.array(z.string()),
  domainNames: z.array(z.string()),
})

export const DomainCategoryMappingRawSchema = z.object({
  domain: z.string(),
  categoryId: z.string(),
})

export const DomainCategorySettingsRawSchema = z.object({
  domain: z.string(),
  subCategories: z.array(z.string()),
  categoryKeywords: z.array(subCategoryKeywordSchema),
})

const AUTO_DELETE_PERIOD_VALUES = new Set([
  'never',
  '30sec',
  '1min',
  '1hour',
  '1day',
  '7days',
  '14days',
  '30days',
  '180days',
  '365days',
])

export const UserSettingsRawSchema = z.object({
  language: z
    .union([z.literal('system'), z.literal('ja'), z.literal('en')])
    .optional(),
  removeTabAfterOpen: z.boolean(),
  removeTabAfterExternalDrop: z.boolean(),
  excludePatterns: z.array(z.string()),
  enableCategories: z.boolean(),
  autoDeletePeriod: z
    .string()
    .refine((val) => AUTO_DELETE_PERIOD_VALUES.has(val), {
      message: 'Invalid auto delete period',
    })
    .optional(),
  showSavedTime: z.boolean(),
  clickBehavior: z.enum([
    'saveCurrentTab',
    'saveWindowTabs',
    'saveSameDomainTabs',
    'saveAllWindowsTabs',
  ]),
  excludePinnedTabs: z.boolean(),
  openUrlInBackground: z.boolean(),
  openAllInNewWindow: z.boolean(),
  confirmDeleteAll: z.boolean(),
  confirmDeleteEach: z.boolean(),
  fontSizePercent: z.number().optional(),
  colors: z.record(z.string(), z.string()).optional(),
  ollamaModel: z.string().optional(),
  aiSystemPrompts: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        template: z.string(),
        createdAt: z.number(),
        updatedAt: z.number(),
      }),
    )
    .optional(),
  activeAiSystemPromptId: z.string().optional(),
})

const customProjectUrlEntrySchema = z.object({
  url: z.string(),
  title: z.string(),
  notes: z.string().optional(),
  savedAt: z.number().optional(),
  category: z.string().optional(),
})

const urlMetadataEntrySchema = z.object({
  notes: z.string().optional(),
  category: z.string().optional(),
})

const projectKeywordsSchema = z.object({
  titleKeywords: z.array(z.string()),
  urlKeywords: z.array(z.string()),
  domainKeywords: z.array(z.string()),
})

export const CustomProjectRawSchema = z.object({
  id: z.string(),
  name: z.string(),
  projectKeywords: projectKeywordsSchema.optional(),
  urlIds: z.array(z.string()).optional(),
  urls: z.array(customProjectUrlEntrySchema).optional(),
  urlMetadata: z.record(z.string(), urlMetadataEntrySchema).optional(),
  // 旧バージョンの chrome.storage では `categories` / `createdAt` /
  // `updatedAt` が未保存のままのエントリが残っている可能性があるため、
  // raw 境界では optional として受け付け、entity 化段階で default を
  // 入れる。必須化すると旧ユーザーデータがスキップされ、次の save で
  // 該当プロジェクトが消失する（issue #530 review P1 指摘）。
  categories: z.array(z.string()).optional(),
  categoryOrder: z.array(z.string()).optional(),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
})

export const SavedTabRawArraySchema = z.array(SavedTabRawSchema)
export const UrlRecordRawArraySchema = z.array(UrlRecordRawSchema)
export const CustomProjectRawArraySchema = z.array(CustomProjectRawSchema)

export type SavedTabRaw = z.infer<typeof SavedTabRawSchema>
export type UrlRecordRaw = z.infer<typeof UrlRecordRawSchema>
export type ParentCategoryRaw = z.infer<typeof ParentCategoryRawSchema>
export type CustomProjectRaw = z.infer<typeof CustomProjectRawSchema>
