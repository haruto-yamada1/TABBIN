import { useI18n } from '@/features/i18n/context/I18nProvider'
import { getScopedNounActionLabel } from '@/features/saved-tabs/lib/accessibility'

import { CardGroupActions } from '../shared/CardGroupActions'
import { useCategoryGroup } from './CategoryGroupContext'

const getVisibleUrls = (group: {
  urls?: {
    url: string
  }[]
// eslint-disable-next-line typescript/prefer-nullish-coalescing
}): string[] => (group.urls || []).map((item) => item.url)

const deleteVisibleUrlsByGroup = async (
  groups: {
    id: string
// eslint-disable-next-line typescript/array-type
    urls?: Array<{
      url: string
    }>
  }[],
  handleDeleteUrls: (groupId: string, urls: string[]) => Promise<void>,
): Promise<void> => {
  await Promise.all(
    groups.map(async (group) => {
      const visibleUrls = getVisibleUrls(group)
      if (visibleUrls.length === 0) {
        return
      }
      await handleDeleteUrls(group.id, visibleUrls)
    }),
  )
}

/**
 * CategoryGroup の操作ボタン群
 * 親カテゴリ管理、すべて開く、すべて削除を含む
 */
export const CategoryGroupActions = () => {
  const { t } = useI18n()
  const { state, category, domains, settings, searchQuery, handlers } =
    useCategoryGroup()
  const { modal, reorder } = state

  const domainsToUse = reorder.isReorderMode ? reorder.tempDomainOrder : domains
// eslint-disable-next-line typescript/prefer-nullish-coalescing
  const urlsToOpen = domainsToUse.flatMap((group) => group.urls || [])
  const hasSearchQuery = searchQuery.trim().length > 0
  const targetName = category.name

  /** カテゴリ内の全ドメインを削除する処理（確認済みの場合） */
  const executeDeleteAll = async () => {
    if (hasSearchQuery && handlers.handleDeleteUrls) {
      await deleteVisibleUrlsByGroup(domainsToUse, handlers.handleDeleteUrls)
      return
    }

    const domainsToDelete = reorder.isReorderMode
      ? reorder.tempDomainOrder
      : domains

    if (handlers.handleDeleteGroups) {
// eslint-disable-next-line typescript/no-confusing-void-expression
      await handlers.handleDeleteGroups(domainsToDelete.map((d) => d.id))
    } else {
      await Promise.all(
// eslint-disable-next-line typescript/no-confusing-void-expression
        domainsToDelete.map(({ id }) => handlers.handleDeleteGroup(id)),
      )
    }
    if (reorder.isReorderMode) {
      console.log(
        `並び替えモード中にカテゴリ ${category.name} のすべてのドメインを削除しました`,
      )
    }
  }

  const handleOpenAll = () => {
    handlers.handleOpenAllTabs(urlsToOpen)
    if (reorder.isReorderMode) {
      console.log(
        `並び替えモード中にカテゴリ ${category.name} のタブをすべて開きました`,
      )
    }
  }

  return (
    <CardGroupActions
// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
      onManage={() => modal.setIsModalOpen(true)}
      manageLabel={t('savedTabs.manageParentCategories')}
      manageAriaLabel={getScopedNounActionLabel(
        t,
        targetName,
        t('savedTabs.manageParentCategories'),
      )}
      manageTooltip={getScopedNounActionLabel(
        t,
        targetName,
        t('savedTabs.manageParentCategories'),
      )}
      onOpenAll={urlsToOpen.length > 0 ? handleOpenAll : undefined}
      openAllAriaLabel={getScopedNounActionLabel(
        t,
        targetName,
        t('savedTabs.openAllTabs'),
      )}
      openAllTooltip={getScopedNounActionLabel(
        t,
        targetName,
        t('savedTabs.openAllTabs'),
      )}
// eslint-disable-next-line typescript/no-misused-promises
      onDeleteAll={domainsToUse.length > 0 ? executeDeleteAll : undefined}
      deleteAllAriaLabel={getScopedNounActionLabel(
        t,
        targetName,
        t('savedTabs.deleteAllTabs'),
      )}
      deleteAllTooltip={getScopedNounActionLabel(
        t,
        targetName,
        t('savedTabs.deleteAllTabs'),
      )}
// eslint-disable-next-line eslint/no-magic-numbers
      onConfirmOpenAll={urlsToOpen.length >= 10}
// eslint-disable-next-line react/jsx-handler-names
      onConfirmDeleteAll={settings.confirmDeleteAll}
      openAllThreshold={10}
      openAllCount={urlsToOpen.length}
      openAllConfirmDescription={t(
        'savedTabs.openAllConfirmDescriptionWithName',
        undefined,
        {
          count: String(urlsToOpen.length),
          name: targetName,
        },
      )}
      itemName={t('savedTabs.category.deleteAllItemName')}
      warningMessage={t('savedTabs.category.deleteAllWarning')}
      deleteAllConfirmDescription={t(
        'savedTabs.deleteAllConfirmDescriptionWithCount',
        undefined,
        {
          categoryName: targetName,
          count: String(urlsToOpen.length),
        },
      )}
    />
  )
}
