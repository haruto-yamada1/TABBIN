import { Check } from 'lucide-react'
import type React from 'react'

import { ThemeProvider } from '@/components/ThemeProvider'
import { Card } from '@/components/ui/card'
import { DocumentTitleSync } from '@/features/i18n/components/DocumentTitleSync'
import { I18nProvider, useI18n } from '@/features/i18n/context/I18nProvider'
import { formatLocalizedDate } from '@/features/i18n/lib/date-format'
import { getChangelogItems } from '@/features/i18n/messages'
import type { AppLanguage } from '@/features/i18n/messages'
import { mountToElement } from '@/lib/react/render-root'

import { getChangelogFeatureClassName } from './main.styles'

// eslint-disable-next-line import/no-unassigned-import
import '@/assets/global.css'

const App: React.FC = () => (
  <I18nProvider>
    <DocumentTitleSync page='changelog' />
    <div className='min-h-screen bg-background px-4 py-16 sm:px-6 lg:px-8'>
      <ChangelogContent />
    </div>
  </I18nProvider>
)

const FeatureItem = ({
  version,
  feature,
}: {
  version: string
  feature: { text: string; highlight?: boolean }
}) => (
  <li
    key={`${version}-${feature.text}`}
    className='group flex items-start rounded-lg p-3 transition-colors duration-200 hover:bg-accent/10'
  >
    <div className='shrink-0'>
      <Check
        aria-hidden='true'
        className='size-6 text-chart-1 transition-colors duration-200 group-hover:text-chart-4'
      />
    </div>
    <p className={getChangelogFeatureClassName(feature.highlight)}>
      {feature.text}
    </p>
  </li>
)

const VersionCard = ({
  item,
  language,
}: {
  item: {
    version: string
    date: string
    features: { text: string; highlight?: boolean }[]
  }
  language: AppLanguage
}) => (
  <Card className='overflow-hidden rounded-xl border-t-4 border-primary shadow-xl transition-shadow duration-300 hover:shadow-2xl'>
    <div className='px-8 py-10 sm:p-12'>
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between'>
        <h2 className='text-3xl font-semibold text-primary'>v{item.version}</h2>
        <div className='mt-2 inline-flex rounded-full bg-secondary px-5 py-2 text-sm font-semibold text-secondary-foreground sm:mt-0'>
          {formatLocalizedDate(language, item.date)}
        </div>
      </div>

      <div className='mt-10'>
        <ul className='gap-y-6'>
          {item.features.map((feature) => (
            <FeatureItem
              key={`${item.version}-${feature.text}`}
              version={item.version}
              feature={feature}
            />
          ))}
        </ul>
      </div>
    </div>
  </Card>
)

const ChangelogContent: React.FC = () => {
  const { language, t } = useI18n()
  const changelog = getChangelogItems(language)

  return (
    <div className='mx-auto max-w-4xl'>
      <div className='mb-16 text-center'>
        <h1 className='text-5xl font-semibold text-primary sm:text-6xl sm:tracking-tight'>
          <span className='block'>
            {t('changelog.heading', 'Release Notes')}
          </span>
        </h1>
      </div>
      <div className='gap-y-12'>
        {changelog.map((item) => (
          <VersionCard key={item.version} item={item} language={language} />
        ))}
      </div>
    </div>
  )
}

document.addEventListener('DOMContentLoaded', () => {
  mountToElement(
    'app',
    <ThemeProvider defaultTheme='system' storageKey='tab-manager-theme'>
      <App />
    </ThemeProvider>,
    'Failed to find the app container',
  )
})

export { App }
