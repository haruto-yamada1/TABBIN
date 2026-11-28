import { useCallback } from 'react'

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
  // アプリは HashRouter のため、href を持つ a 要素は通常クリックだけでなく
  // 中クリック (auxclick) でもハッシュを書き換え、ルートと競合する。
  // 画面内スクロール専用の操作のため button にし、クリック時に該当セクションへ
  // スクロールしたうえでキーボードフォーカスも移動先へ渡す。
  const handleClick = useCallback(() => {
    const target = document.querySelector(`#${sectionId}`)
    if (!(target instanceof HTMLElement)) {
      return
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // tabIndex -1 は Tab 順序に入れず、プログラムからのフォーカスだけ可能にする。
    target.tabIndex = -1
    target.focus({ preventScroll: true })
  }, [sectionId])

  return (
    <button
      type='button'
      className='cursor-pointer font-medium text-primary underline underline-offset-4 hover:text-primary/80'
      onClick={handleClick}
    >
      {label}
    </button>
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
