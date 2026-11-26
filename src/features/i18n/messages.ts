import { changelogItemsEn } from './changelogItems.en'
import { changelogItemsJa } from './changelogItems.ja'
import type { ChangelogFeature, ChangelogItem } from './changelogTypes'
import { messagesEn } from './messages.en'
import { messagesJa } from './messages.ja'

const messages = {
  en: messagesEn,
  ja: messagesJa,
} as const satisfies Record<AppLanguage, Record<string, string>>

const getMessages = (language: AppLanguage) => messages[language]
type AppLanguage = 'ja' | 'en'
type LanguageSetting = 'system' | AppLanguage

const changelogItems: Record<AppLanguage, ChangelogItem[]> = {
  en: changelogItemsEn,
  ja: changelogItemsJa,
}

const getChangelogItems = (language: AppLanguage) => changelogItems[language]

export type { AppLanguage, ChangelogFeature, ChangelogItem, LanguageSetting }
export { getChangelogItems, getMessages }
