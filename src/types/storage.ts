import type { z } from 'zod'

import type {
  UserSettingsSchema,
  aiSystemPromptPresetSchema,
} from '@/lib/storage/zod-storage'

/**
 * `UserSettings` の runtime schema から導出する型 (issue #672)。
 *
 * `z.infer<typeof UserSettingsSchema>` と構造一致するため、schema と
 * TypeScript interface の二重管理を回避できる。
 */
export type UserSettings = z.infer<typeof UserSettingsSchema>

/**
 * AI system prompt preset の runtime schema から導出する型 (issue #672)。
 */
export type AiSystemPromptPreset = z.infer<typeof aiSystemPromptPresetSchema>

// ビューモード（表示モード）の型定義
export type ViewMode = 'domain' | 'custom'
