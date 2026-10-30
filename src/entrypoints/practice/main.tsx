import { PracticePage } from '@/app/composition/PracticePage'
import { TooltipProvider } from '@/components/ui/tooltip'
import { MemoryI18nProvider } from '@/features/i18n/context/MemoryI18nProvider'
import { mountToElement } from '@/lib/react/render-root'

// eslint-disable-next-line import/no-unassigned-import
import '@/assets/global.css'

const params = new URLSearchParams(window.location.search)
const language = params.get('lang') === 'ja' ? 'ja' : 'en'
document.documentElement.lang = language
document.documentElement.classList.toggle(
  'dark',
  window.matchMedia('(prefers-color-scheme: dark)').matches,
)
const lessonId = params.get('lessonId') ?? ''

// No persistence bootstrap, production settings, AI widget or recovery export.
mountToElement(
  'practice',
  <MemoryI18nProvider initialLanguage={language}>
    <TooltipProvider>
      <PracticePage lessonId={lessonId} />
    </TooltipProvider>
  </MemoryI18nProvider>,
  'Practice container is missing',
)
