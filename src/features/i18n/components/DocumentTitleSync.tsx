import { useEffect } from 'react'

import { useI18n } from '@/features/i18n/context/I18nProvider'
import { syncDocumentLanguage } from '@/features/i18n/lib/language'
import type { TitlePageKey } from '@/features/i18n/lib/title'
import { getDocumentTitle } from '@/features/i18n/lib/title'

type DocumentTitleSyncProps = {
  page: TitlePageKey
}

export const DocumentTitleSync = ({ page }: DocumentTitleSyncProps) => {
  const { language } = useI18n()

  // lang は I18nProvider でも追随させるが、タイトルと合わせてここでも同期し、
  // Provider 単体では描画されない画面でも表示言語と一致させる
  useEffect(() => {
    document.title = getDocumentTitle(language, page)
    syncDocumentLanguage(language)
  }, [language, page])

  return null
}
