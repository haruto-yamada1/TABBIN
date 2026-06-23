import { describe, expect, it } from 'vitest'

import { UNCATEGORIZED_PROJECT_ID } from '@/contexts/saved-tabs/domain/entities/UncategorizedProject'
import { defaultUserSettings } from '@/contexts/saved-tabs/domain/services/UserSettingsDefaults'

import {
  savedTabsDefaultUserSettings,
  savedTabsUncategorizedProjectId,
} from './SavedTabsPresentationDefaults'

describe('SavedTabsPresentationDefaults', () => {
  it('domain defaultをplain application valueへコピーする', () => {
    expect(savedTabsDefaultUserSettings).toStrictEqual(defaultUserSettings)
    expect(savedTabsDefaultUserSettings).not.toBe(defaultUserSettings)
    expect(savedTabsDefaultUserSettings.excludePatterns).not.toBe(
      defaultUserSettings.excludePatterns,
    )
  })

  it('未分類project IDをprimitive stringとして公開する', () => {
    expect(savedTabsUncategorizedProjectId).toBe(UNCATEGORIZED_PROJECT_ID)
    expect(savedTabsUncategorizedProjectId).toBeTypeOf('string')
  })
})
