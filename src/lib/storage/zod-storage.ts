import { z } from 'zod'

const AiSystemPromptPresetSchema = z.object({
  id: z.string(),
  name: z.string(),
  template: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
})

export function fromStorage<T extends z.ZodType>(schema: T, key: string) {
  return chrome.storage.local
    .get(key)
    .then((r) => schema.parse(r[key])) as Promise<z.output<T>>
}

export function fromStorageChange<T extends z.ZodType>(
  schema: T,
  value: unknown,
) {
  return schema.parse(value) as z.output<T>
}

const SubCategoryKeywordSchema = z.object({
  categoryName: z.string(),
  keywords: z.array(z.string()),
})

const UrlEntrySchema = z.object({
  id: z.string().optional(),
  url: z.string(),
  title: z.string(),
  subCategory: z.string().optional(),
  savedAt: z.number().optional(),
})

const UrlMetadataSchema = z.record(
  z.string(),
  z.object({
    notes: z.string().optional(),
    category: z.string().optional(),
  }),
)

export const TabGroupSchema = z.object({
  id: z.string(),
  domain: z.string(),
  parentCategoryId: z.string().optional(),
  urlIds: z.array(z.string()).optional(),
  urls: z.array(UrlEntrySchema).optional(),
  urlSubCategories: z.record(z.string(), z.string()).optional(),
  subCategories: z.array(z.string()).optional(),
  categoryKeywords: z.array(SubCategoryKeywordSchema).optional(),
  subCategoryOrder: z.array(z.string()).optional(),
  subCategoryOrderWithUncategorized: z.array(z.string()).optional(),
  savedAt: z.number().optional(),
})

export const CustomProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  projectKeywords: z
    .object({
      titleKeywords: z.array(z.string()),
      urlKeywords: z.array(z.string()),
      domainKeywords: z.array(z.string()),
    })
    .optional(),
  urlIds: z.array(z.string()).optional(),
  urls: z
    .array(
      z.object({
        url: z.string(),
        title: z.string(),
        notes: z.string().optional(),
        savedAt: z.number().optional(),
        category: z.string().optional(),
      }),
    )
    .optional(),
  urlMetadata: UrlMetadataSchema.optional(),
  categories: z.array(z.string()).optional(),
  categoryOrder: z.array(z.string()).optional(),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
})

export const UserSettingsSchema = z.object({
  language: z.enum(['system', 'ja', 'en']).optional(),
  removeTabAfterOpen: z.boolean(),
  removeTabAfterExternalDrop: z.boolean(),
  excludePatterns: z.array(z.string()),
  enableCategories: z.boolean(),
  autoDeletePeriod: z.string().optional(),
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
  aiSystemPrompts: z.array(AiSystemPromptPresetSchema).optional(),
  activeAiSystemPromptId: z.string().optional(),
})

export const ParentCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  domains: z.array(z.string()),
  domainNames: z.array(z.string()),
})
