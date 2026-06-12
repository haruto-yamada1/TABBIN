import { useEffect } from 'react'

import { useI18n } from '@/features/i18n/context/I18nProvider'
import type { TitlePageKey } from '@/features/i18n/lib/title'
import { getDocumentTitle } from '@/features/i18n/lib/title'

interface DocumentTitleSyncProps {
  page: TitlePageKey
}

export const DocumentTitleSync = ({ page }: DocumentTitleSyncProps) => {
  const { language } = useI18n()

  useEffect(() => {
    document.title = getDocumentTitle(language, page)
    document.documentElement.lang = language
  }, [language, page])

  return null
}
