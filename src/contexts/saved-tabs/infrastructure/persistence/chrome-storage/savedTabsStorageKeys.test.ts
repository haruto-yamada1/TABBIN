import { describe, expect, it } from 'vitest'

import {
  CUSTOM_PROJECTS_KEY,
  PARENT_CATEGORIES_KEY,
  SAVED_TABS_KEY,
  SAVED_TABS_STORAGE_KEYS,
  URLS_KEY,
} from './savedTabsStorageKeys'

describe('savedTabsStorageKeys', () => {
  it('既存 chrome.storage.local と互換の key 名を公開する', () => {
    expect(SAVED_TABS_KEY).toBe('savedTabs')
    expect(URLS_KEY).toBe('urls')
    expect(PARENT_CATEGORIES_KEY).toBe('parentCategories')
    expect(CUSTOM_PROJECTS_KEY).toBe('customProjects')
  })

  it('4 つのメイン key を配列で列挙できる', () => {
    expect(SAVED_TABS_STORAGE_KEYS).toStrictEqual([
      'savedTabs',
      'urls',
      'parentCategories',
      'customProjects',
    ])
  })
})
