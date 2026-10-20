import type { Active, DndContext, Over } from '@dnd-kit/core'
import { useMemo } from 'react'
import type { ComponentProps } from 'react'

import { useI18n } from '@/features/i18n/context/I18nProvider'

type Item = Active | Over
type SaveMode = 'confirm' | 'immediate' | 'custom'

const itemName = (item: Item): string => {
  const name: unknown = item.data.current?.name
  return typeof name === 'string' ? name : String(item.id)
}

/** Share localized instructions and announcements across sortable hierarchies. */
export const useDndAccessibility = (mode: SaveMode = 'confirm') => {
  const { t } = useI18n()
  return useMemo<
    NonNullable<ComponentProps<typeof DndContext>['accessibility']>
  >(() => {
    const label = (item: Item): string => {
      const name = itemName(item)
      return name === '__uncategorized' ? t('savedTabs.uncategorized') : name
    }
    const position = (item: Item): string => {
      const sortable: unknown = item.data.current?.sortable
      if (
        typeof sortable !== 'object' ||
        sortable === null ||
        !('index' in sortable) ||
        !('items' in sortable) ||
        typeof sortable.index !== 'number' ||
        !Array.isArray(sortable.items) ||
        sortable.index < 0
      ) {
        return ''
      }
      return t('savedTabs.dnd.position', undefined, {
        position: String(sortable.index + 1),
        count: String(sortable.items.length),
      })
    }
    const hint = () =>
      t(
        mode === 'confirm'
          ? 'savedTabs.dnd.confirmHint'
          : 'savedTabs.dnd.saveHint',
      )
    return {
      screenReaderInstructions: {
        draggable: [
          t('savedTabs.dnd.instructions'),
          mode === 'custom' ? t('savedTabs.dnd.customInstructions') : '',
          mode === 'confirm'
            ? t('savedTabs.dnd.confirmHint')
            : t('savedTabs.dnd.saveHint'),
        ]
          .filter(Boolean)
          .join(' '),
      },
      announcements: {
        onDragStart: ({ active }) =>
          [
            t('savedTabs.dnd.pickedUp', undefined, { name: label(active) }),
            position(active),
          ].join(' '),
        onDragOver: ({ active, over }) =>
          over
            ? [
                t('savedTabs.dnd.over', undefined, {
                  name: label(active),
                  target: label(over),
                }),
                position(over),
              ].join(' ')
            : t('savedTabs.dnd.noTarget', undefined, {
                name: label(active),
              }),
        onDragEnd: ({ active, over }) =>
          !over || active.id === over.id
            ? t('savedTabs.dnd.canceled', undefined, { name: label(active) })
            : [
                t('savedTabs.dnd.dropped', undefined, {
                  name: label(active),
                  target: label(over),
                }),
                position(over),
                hint(),
              ].join(' '),
        onDragCancel: ({ active }) =>
          t('savedTabs.dnd.canceled', undefined, { name: label(active) }),
      },
    }
  }, [mode, t])
}
