import { useCallback } from 'react'
import type { MouseEvent } from 'react'

import { useI18n } from '@/features/i18n/context/I18nProvider'
import { SettingsCrossLink } from '@/features/navigation/components/SettingsCrossLink'
import { OPTIONS_SECTION_IDS } from '@/features/options/optionsSectionIds'

const OPTIONS_TOC_SECTIONS = [
  { id: OPTIONS_SECTION_IDS.backup, labelKey: 'options.backupRestore' },
  { id: OPTIONS_SECTION_IDS.ollama, labelKey: 'options.ollama.title' },
  { id: OPTIONS_SECTION_IDS.pageAccess, labelKey: 'options.toc.pageAccess' },
  { id: OPTIONS_SECTION_IDS.behavior, labelKey: 'options.behaviorSettings' },
  {
    id: OPTIONS_SECTION_IDS.excludePatterns,
    labelKey: 'options.excludePatterns.title',
  },
  {
    id: OPTIONS_SECTION_IDS.fontSize,
    labelKey: 'options.previewFontSizeCustomization',
  },
  {
    id: OPTIONS_SECTION_IDS.colors,
    labelKey: 'options.previewColorCustomization',
  },
] as const

type OptionsTocLinkProps = {
  sectionId: string
  label: string
}

const OptionsTocLink = ({ sectionId, label }: OptionsTocLinkProps) => {
  // アプリは HashRouter のため、通常のアンカー遷移はルートと競合する。
  // クリック時に該当セクションへスクロールして画面内遷移を実現する。
  const handleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault()
      document
        .querySelector(`#${sectionId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    },
    [sectionId],
  )

  return (
    <a
      className='font-medium text-primary underline underline-offset-4 hover:text-primary/80'
      href={`#${sectionId}`}
      onClick={handleClick}
    >
      {label}
    </a>
  )
}

export const OptionsTableOfContents = () => {
  const { t } = useI18n()

  return (
    <nav
      aria-label={t('options.toc.title')}
      className='mb-8 rounded-lg border border-border bg-card p-6 shadow-md'
    >
      <h2 className='mb-4 text-xl font-semibold text-foreground'>
        {t('options.toc.title')}
      </h2>
      <ul className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
        {OPTIONS_TOC_SECTIONS.map(({ id, labelKey }) => (
          <li key={id}>
            <OptionsTocLink sectionId={id} label={t(labelKey)} />
          </li>
        ))}
        <li>
          <SettingsCrossLink
            item='periodic-execution'
            label={t('periodicExecution.title')}
          />
        </li>
      </ul>
    </nav>
  )
}

export { OPTIONS_SECTION_IDS } from '@/features/options/optionsSectionIds'
export { SettingsCrossLink } from '@/features/navigation/components/SettingsCrossLink'
