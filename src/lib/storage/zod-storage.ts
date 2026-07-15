import { z } from 'zod'

export const aiSystemPromptPresetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  template: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
})

export function fromStorageChange<T extends z.ZodType>(
  schema: T,
  value: unknown,
) {
  return schema.parse(value)
}

/**
 * chrome.storage.onChanged のように 1 件壊れた要素で配列全体が破棄されると困る場面で
 * 要素単位で safeParse し、成功したものだけ返す。失敗した要素はコンソールに警告を出す。
 */
export function safeParseArrayFromStorage<T extends z.ZodType>(
  schema: T,
  value: unknown,
): z.output<T>[] {
  if (!Array.isArray(value)) {
    return []
  }
  const results: z.output<T>[] = []
  for (let i = 0; i < value.length; i += 1) {
    const item: unknown = value[i]
    const result = schema.safeParse(item)
    if (result.success) {
      results.push(result.data)
      continue
    }
    console.warn(
      `[storage] 配列要素 ${i} のパースに失敗したためスキップしました`,
      result.error.issues,
    )
  }
  return results
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

const autoDeletePeriodField = z
  .string()
  .refine((val) => AUTO_DELETE_PERIOD_VALUES.has(val), {
    message: 'Invalid auto delete period',
  })
  .optional()

/**
 * `UserSettings` の canonical Zod schema。
 *
 * 各 field の型・enum を検証する。`autoDeletePeriod` は有効な値のみ許可し、
 * `aiSystemPrompts` の各 preset は id / name が空文字でないことを確認する。
 * 出力型は `UserSettings` と構造完全一致するため、`z.infer` で型を導出できる。
 */
export const UserSettingsSchema = z.object({
  language: z.enum(['system', 'ja', 'en']).optional(),
  removeTabAfterOpen: z.boolean(),
  removeTabAfterExternalDrop: z.boolean(),
  excludePatterns: z.array(z.string()),
  enableCategories: z.boolean(),
  autoDeletePeriod: autoDeletePeriodField,
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
  aiSystemPrompts: z.array(aiSystemPromptPresetSchema).optional(),
  activeAiSystemPromptId: z.string().optional(),
})

/**
 * `chrome.storage.local` / import から読み込んだ unknown 値を安全に検証する
 * stored variant。全 field を optional + `.catch(undefined)` とし、
 * 型不正や enum 外れの値は undefined へ fallback する。
 *
 * `parseStoredUserSettings` が undefined 値を取り除いて `Partial<UserSettings>`
 * を返すため、merge 先の default が上書きされない。
 */
/* eslint-disable unicorn/prefer-top-level-await -- Zod .catch() not Promise .catch() */
export const storedUserSettingsSchema = z.object({
  language: z.enum(['system', 'ja', 'en']).optional().catch(undefined),
  removeTabAfterOpen: z.boolean().optional().catch(undefined),
  removeTabAfterExternalDrop: z.boolean().optional().catch(undefined),
  excludePatterns: z
    .preprocess(
      (val) =>
        Array.isArray(val)
          ? val.filter((v): v is string => typeof v === 'string')
          : undefined,
      z.array(z.string()).optional(),
    )
    .catch(undefined),
  enableCategories: z.boolean().optional().catch(undefined),
  autoDeletePeriod: autoDeletePeriodField.catch(undefined),
  showSavedTime: z.boolean().optional().catch(undefined),
  clickBehavior: z
    .enum([
      'saveCurrentTab',
      'saveWindowTabs',
      'saveSameDomainTabs',
      'saveAllWindowsTabs',
    ])
    .optional()
    .catch(undefined),
  excludePinnedTabs: z.boolean().optional().catch(undefined),
  openUrlInBackground: z.boolean().optional().catch(undefined),
  openAllInNewWindow: z.boolean().optional().catch(undefined),
  confirmDeleteAll: z.boolean().optional().catch(undefined),
  confirmDeleteEach: z.boolean().optional().catch(undefined),
  fontSizePercent: z.number().optional().catch(undefined),
  colors: z.record(z.string(), z.string()).optional().catch(undefined),
  ollamaModel: z.string().optional().catch(undefined),
  aiSystemPrompts: z
    .preprocess((val) => {
      if (!Array.isArray(val)) {
        return undefined
      }
      const filtered = val.filter(
        (item): item is z.infer<typeof aiSystemPromptPresetSchema> =>
          aiSystemPromptPresetSchema.safeParse(item).success,
      )
      return filtered.length > 0 ? filtered : undefined
    }, z.array(aiSystemPromptPresetSchema).optional())
    .catch(undefined),
  activeAiSystemPromptId: z.string().optional().catch(undefined),
})
/* eslint-enable unicorn/prefer-top-level-await */

/**
 * unknown 値を `storedUserSettingsSchema` で safeParse し、
 * 有効な field だけを抽出した `Partial<UserSettings>` を返す。
 *
 * 型不正・enum 外れの field は除外され、呼び出し側で default と merge される。
 * parse 全体が失敗した場合は空 object を返す。
 */
export const parseStoredUserSettings = (
  input: unknown,
): Partial<z.infer<typeof UserSettingsSchema>> => {
  if (typeof input !== 'object' || input === null) {
    return {}
  }
  let data: z.infer<typeof storedUserSettingsSchema>
  try {
    data = storedUserSettingsSchema.parse(input)
  } catch {
    return {}
  }
  const filtered: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    // eslint-disable-next-line typescript/no-unnecessary-condition -- .catch(undefined) が undefined を含むため実行時に必要
    if (value !== undefined) {
      filtered[key] = value
    }
  }
  // eslint-disable-next-line typescript/no-unnecessary-type-assertion, typescript/consistent-type-assertions -- Zod 検証済みの Record を Partial<UserSettings> へ変換
  return filtered as Partial<z.infer<typeof UserSettingsSchema>>
}

export const ParentCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  domains: z.array(z.string()),
  domainNames: z.array(z.string()),
})
