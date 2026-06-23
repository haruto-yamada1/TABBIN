import { normalizeDomainString } from '@/contexts/saved-tabs/public-api'
import {
  getBrowserUiLocale,
  getMessage,
  resolveLanguage,
} from '@/features/i18n/lib/language'
import { redactUrlForLog } from '@/lib/logging/redact-url'
import { createOrUpdateUrlRecord } from '@/lib/storage/urls'
import type { TabGroup, UrlRecord, UserSettings } from '@/types/storage'

import type {
  ConvertedUrlData,
  ImportedTabData,
  ImportedUrlData,
  ImportedUrlRecordData,
} from './schemas'

const IMPORT_URL_RECORD_OPTIONS = {
  preserveExistingOnDuplicate: true,
} as const

const getUrlRecordTitle = (record: Partial<Pick<UrlRecord, 'title'>>): string =>
  record.title ?? ''

const isExportTabUrl = (
  value: unknown,
): value is NonNullable<TabGroup['urls']>[number] =>
  typeof value === 'object' &&
  value !== null &&
  'url' in value &&
  typeof value.url === 'string' &&
  value.url.length > 0

const resolveCurrentLanguage = (settings: Pick<UserSettings, 'language'>) =>
  resolveLanguage(settings.language ?? 'system', getBrowserUiLocale('ja'))

const getPlaceholderUrlTitle = (
  language: UserSettings['language'] | undefined,
): string =>
  resolveCurrentLanguage({ language }) === 'en'
    ? 'Recovered data (missing original URL)'
    : '復元データ（元URL欠損）'

export const CUSTOM_UNCATEGORIZED_PROJECT_ID = 'custom-uncategorized'

const getUncategorizedProjectName = (
  language: UserSettings['language'] | undefined,
) => getMessage(resolveCurrentLanguage({ language }), 'savedTabs.uncategorized')

const normalizeUrlKey = (url: string): string => url.trim()

/**
 * ドメイン文字列からプレースホルダー URL のベースを構築する。
 * hostname 単位のドメイン（`example.com`）には `https://` を付与し、
 * URL 形式のドメイン（`https://example.com`）はそのまま使う。
 */
const toPlaceholderBaseUrl = (domain: string): string => {
  const stripped = domain.replace(/\/+$/, '')
  if (stripped.includes('://')) {
    return stripped
  }
  return `https://${stripped}`
}

const buildConvertedUrlData = (
  urls: ImportedUrlData[],
  resolveRecord: (urlData: ImportedUrlData) => UrlRecord | undefined,
): ConvertedUrlData => {
  const urlIds: string[] = []
  const urlSubCategories: Record<string, string> = {}
  for (const urlData of urls) {
    const urlRecord = resolveRecord(urlData)
    if (!urlRecord) {
      continue
    }
    urlIds.push(urlRecord.id)
    if (urlData.subCategory) {
      urlSubCategories[urlRecord.id] = urlData.subCategory
    }
  }
  return {
    urlIds,
    urlSubCategories:
      Object.keys(urlSubCategories).length > 0 ? urlSubCategories : undefined,
  }
}

const convertImportedUrlsWithPreloadedMap = (
  urls: ImportedUrlData[],
  urlRecordMapByUrl: Map<string, UrlRecord>,
): ConvertedUrlData =>
  buildConvertedUrlData(urls, (urlData) =>
    urlRecordMapByUrl.get(normalizeUrlKey(urlData.url)),
  )

/**
 * インポートされたURLデータを新形式に変換する
 * @param urls インポートされたURL配列
 * @returns 新形式のTabGroup（urlIdsとurlSubCategoriesを含む）
 */
const convertImportedUrlsToNewFormat = async (
  urls: ImportedUrlData[],
  urlRecordMapByUrl?: Map<string, UrlRecord>,
): Promise<ConvertedUrlData> => {
  if (urlRecordMapByUrl) {
    return convertImportedUrlsWithPreloadedMap(urls, urlRecordMapByUrl)
  }

  const urlRecordMapByUrlFromSingleUpdate = new Map<string, UrlRecord>()
  const urlRecordEntries = await Promise.all(
    urls.map(async (urlData) => {
      try {
        const urlRecord = await createOrUpdateUrlRecord(
          urlData.url,
          urlData.title ?? '',
          urlData.favIconUrl,
          IMPORT_URL_RECORD_OPTIONS,
        )
        console.log(
          `URL変換完了: ${redactUrlForLog(urlData.url)} -> ${urlRecord.id}`,
        )
        return [normalizeUrlKey(urlData.url), urlRecord] as const
      } catch (error) {
        console.error(`URL変換エラー: ${redactUrlForLog(urlData.url)}`, error)
        return null
      }
    }),
  )
  for (const entry of urlRecordEntries) {
    if (entry) {
      urlRecordMapByUrlFromSingleUpdate.set(entry[0], entry[1])
    }
  }
  return convertImportedUrlsWithPreloadedMap(
    urls,
    urlRecordMapByUrlFromSingleUpdate,
  )
}

/**
 * UrlIds形式のタブデータをURL配列に復元する
 */
const restoreImportedUrlsFromIds = (
  tab: ImportedTabData,
  importedUrlRecordMap: Map<string, ImportedUrlRecordData>,
  currentUrlRecordMap: Map<string, UrlRecord>,
): ImportedUrlData[] => {
  if (!Array.isArray(tab.urlIds) || tab.urlIds.length === 0) {
    return []
  }
  const restoredUrls: ImportedUrlData[] = []
  for (const urlId of tab.urlIds) {
    const urlRecord =
      // `||` needed: importedUrlRecordMap.get() could return empty string
      // eslint-disable-next-line typescript/prefer-nullish-coalescing
      importedUrlRecordMap.get(urlId) || currentUrlRecordMap.get(urlId)
    if (!urlRecord) {
      continue
    }
    restoredUrls.push({
      favIconUrl: urlRecord.favIconUrl,
      savedAt: urlRecord.savedAt,
      subCategory: tab.urlSubCategories?.[urlId],
      title: urlRecord.title ?? '',
      url: urlRecord.url,
    })
  }
  return restoredUrls
}

const normalizeImportedTabsForImport = (
  importedTabs: ImportedTabData[],
  importedUrlRecordMap: Map<string, ImportedUrlRecordData>,
  currentUrlRecordMap: Map<string, UrlRecord>,
): {
  normalizedImportedTabs: (ImportedTabData & {
    urls: ImportedUrlData[]
  })[]
  unresolvedTabs: {
    domain: string
    urlIds: string[]
    savedAt?: number
  }[]
} => {
  const unresolvedTabs: {
    domain: string
    urlIds: string[]
    savedAt?: number
  }[] = []
  const normalizedImportedTabs: (ImportedTabData & {
    urls: ImportedUrlData[]
  })[] = importedTabs.map((tab) => {
    const normalizedDomain = normalizeDomainString(tab.domain)
    if (Array.isArray(tab.urls)) {
      return {
        ...tab,
        domain: normalizedDomain,
        urls: tab.urls,
      }
    }
    const restoredUrls = restoreImportedUrlsFromIds(
      tab,
      importedUrlRecordMap,
      currentUrlRecordMap,
    )
    if (
      Array.isArray(tab.urlIds) &&
      tab.urlIds.length > 0 &&
      restoredUrls.length === 0
    ) {
      unresolvedTabs.push({
        domain: normalizedDomain,
        savedAt: tab.savedAt,
        urlIds: Array.from(new Set(tab.urlIds)),
      })
    }
    return {
      ...tab,
      domain: normalizedDomain,
      urls: restoredUrls,
    }
  })
  return {
    normalizedImportedTabs,
    unresolvedTabs,
  }
}

/**
 * 変換結果が空のときは、インポート元のurlIdsをそのまま保持して復元性を高める
 */
const resolveUrlDataForStorage = (
  tab: ImportedTabData & {
    urls: ImportedUrlData[]
  },
  convertedUrlData: {
    urlIds: string[]
    urlSubCategories?: Record<string, string>
  },
): {
  urlIds: string[]
  urlSubCategories?: Record<string, string>
} => {
  if (convertedUrlData.urlIds.length > 0) {
    return convertedUrlData
  }
  if (
    tab.urls.length > 0 ||
    !Array.isArray(tab.urlIds) ||
    tab.urlIds.length === 0
  ) {
    return convertedUrlData
  }
  const rawUrlIds = [...new Set(tab.urlIds)]
  const rawSubCategories = tab.urlSubCategories
    ? Object.fromEntries(
        Object.entries(tab.urlSubCategories).filter(([urlId]) =>
          rawUrlIds.includes(urlId),
        ),
      )
    : undefined
  return {
    urlIds: rawUrlIds,
    urlSubCategories:
      rawSubCategories && Object.keys(rawSubCategories).length > 0
        ? rawSubCategories
        : undefined,
  }
}

/**
 * バックアップ内にURL実体が無いurlIdsに対して、代替URLレコードを生成する
 */
const ensurePlaceholderUrlRecords = async (
  unresolvedTabs: {
    domain: string
    urlIds: string[]
    savedAt?: number
  }[],
  placeholderUrlTitle: string,
): Promise<number> => {
  if (unresolvedTabs.length === 0) {
    return 0
  }
  const urlsData = await chrome.storage.local.get({
    urls: [],
  })
  // eslint-disable-next-line typescript/no-unsafe-assignment
  const currentUrlRecords: UrlRecord[] = Array.isArray(urlsData.urls)
    ? urlsData.urls
    : []
  const existingIdSet = new Set(currentUrlRecords.map((record) => record.id))
  const newRecords: UrlRecord[] = []
  let offset = 0
  for (const tab of unresolvedTabs) {
    const baseDomain = toPlaceholderBaseUrl(tab.domain)
    for (const urlId of tab.urlIds) {
      if (existingIdSet.has(urlId)) {
        continue
      }
      existingIdSet.add(urlId)
      newRecords.push({
        id: urlId,
        // 元URLが欠損しているため、ドメインに一意アンカーを付けて代替URLを生成
        url: `${baseDomain}/#tabbin-restored-${urlId}`,
        title: placeholderUrlTitle,
        // eslint-disable-next-line typescript/prefer-nullish-coalescing -- 0 (epoch) should fall through
        savedAt: tab.savedAt || Date.now() + offset,
      })
      offset += 1
    }
  }
  if (newRecords.length === 0) {
    return 0
  }
  await chrome.storage.local.set({
    urls: [...currentUrlRecords, ...newRecords],
  })
  return newRecords.length
}

/**
 * TabGroupのURL情報をエクスポート用の旧形式配列に変換する
 */
// eslint-disable-next-line eslint/complexity
const convertTabGroupToExportUrls = (
  tab: TabGroup,
  urlRecordMap: Map<string, UrlRecord>,
  placeholderUrlRecordMap: Map<string, UrlRecord>,
  placeholderUrlTitle: string,
): NonNullable<TabGroup['urls']> => {
  if (Array.isArray(tab.urls) && tab.urls.length > 0) {
    const legacyUrls: unknown[] = tab.urls
    return legacyUrls.filter(isExportTabUrl)
  }
  if (!Array.isArray(tab.urlIds) || tab.urlIds.length === 0) {
    return []
  }
  const exportedUrls: NonNullable<TabGroup['urls']> = []
  const baseDomain = toPlaceholderBaseUrl(tab.domain)
  let offset = 0
  for (const urlId of tab.urlIds) {
    const urlRecord =
      // `||` needed: urlRecordMap.get() could return empty string
      // eslint-disable-next-line typescript/prefer-nullish-coalescing
      urlRecordMap.get(urlId) || placeholderUrlRecordMap.get(urlId)
    // `||` needed: urlRecord could be falsey (empty object)
    // eslint-disable-next-line typescript/prefer-nullish-coalescing
    const resolvedUrlRecord = urlRecord || {
      id: urlId,
      savedAt:
        typeof tab.savedAt === 'number'
          ? tab.savedAt + offset
          : Date.now() + offset,
      title: placeholderUrlTitle,
      url: `${baseDomain}/#tabbin-export-missing-${urlId}`,
    }
    if (!(urlRecord || placeholderUrlRecordMap.has(urlId))) {
      placeholderUrlRecordMap.set(urlId, resolvedUrlRecord)
    }
    offset += 1
    exportedUrls.push({
      savedAt: resolvedUrlRecord.savedAt,
      subCategory: tab.urlSubCategories?.[urlId],
      title: getUrlRecordTitle(resolvedUrlRecord),
      url: resolvedUrlRecord.url,
    })
  }
  return exportedUrls
}

export {
  buildConvertedUrlData,
  convertImportedUrlsToNewFormat,
  convertImportedUrlsWithPreloadedMap,
  convertTabGroupToExportUrls,
  ensurePlaceholderUrlRecords,
  getPlaceholderUrlTitle,
  getUncategorizedProjectName,
  IMPORT_URL_RECORD_OPTIONS,
  normalizeImportedTabsForImport,
  normalizeUrlKey,
  resolveCurrentLanguage,
  resolveUrlDataForStorage,
  restoreImportedUrlsFromIds,
}
