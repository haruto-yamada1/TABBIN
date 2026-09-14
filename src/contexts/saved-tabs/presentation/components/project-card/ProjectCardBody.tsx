import type { ReactNode } from 'react'

import { Spinner } from '@/components/ui/spinner'
import { useI18n } from '@/features/i18n/context/I18nProvider'

type ProjectCardBodyProps = {
  children: ReactNode
  isLoading: boolean
  isEmpty: boolean
  isExternalItemOver: boolean
}

export const ProjectCardBody = ({
  children,
  isLoading,
  isEmpty,
  isExternalItemOver,
}: ProjectCardBodyProps) => {
  const { t } = useI18n()
  return (
    <>
      {children}
      {isLoading && (
        <div className='flex justify-center py-4 text-muted-foreground'>
          <Spinner className='size-5' />
        </div>
      )}
      {isEmpty && !isExternalItemOver && !isLoading && (
        <div
          className='py-4 text-center text-muted-foreground'
          data-testid='project-empty-state'
        >
          {t('savedTabs.project.emptyTitle')}
          <br />
          {t('savedTabs.project.emptyDescription')}
          <br />
          {t('savedTabs.project.emptyDragHint')}
        </div>
      )}
    </>
  )
}
