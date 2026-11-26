import { savedTabsUncategorizedProjectId } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDefaultsDto'

/**
 * 既定プロジェクト（予約 ID `custom-uncategorized`）の初期名。
 * データ層が seed する素の値で、ユーザーがリネームすると別の値になる。
 */
const SEEDED_UNCATEGORIZED_PROJECT_NAME = '未分類'

type TranslateFn = (
  key: string,
  fallback?: string,
  values?: Record<string, string>,
) => string

/**
 * 既定プロジェクトの表示名を UI 言語で返す (#1114)。
 *
 * 予約 ID かつ初期名のままの場合だけ辞書名に置き換える。ユーザーが
 * リネームした既定プロジェクトや、通常プロジェクトがたまたま同じ
 * 名前でも、保存されている名前をそのまま表示する（データ移行なし）。
 */
const resolveCustomProjectDisplayName = (
  project: { id: string; name: string },
  t: TranslateFn,
): string =>
  project.id === savedTabsUncategorizedProjectId &&
  project.name === SEEDED_UNCATEGORIZED_PROJECT_NAME
    ? t('savedTabs.uncategorized')
    : project.name

export { resolveCustomProjectDisplayName, SEEDED_UNCATEGORIZED_PROJECT_NAME }
