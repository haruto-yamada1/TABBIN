import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { SavedTabsApp } from '@/contexts/saved-tabs/presentation/app/SavedTabsApp'
import {
  useSavedTabsLeftPaneWidth,
  LEFT_PANE_COMPACT_BREAKPOINT_PX,
} from '@/contexts/saved-tabs/presentation/components/savedTabsPresentationLayout.helpers'
import { SavedTabsResponsiveLayoutProvider } from '@/contexts/saved-tabs/presentation/components/SavedTabsResponsiveLayoutContext'
import { SavedTabsUseCasesProvider } from '@/contexts/saved-tabs/presentation/controllers/SavedTabsUseCasesContext'
import { useSavedTabsController } from '@/contexts/saved-tabs/presentation/controllers/useSavedTabsController'
import type { ViewMode } from '@/contexts/saved-tabs/presentation/types/mode'
import { ACADEMY_LESSONS } from '@/features/academy/domain/academyCatalog'
import { practiceMessages } from '@/features/academy/presentation/practiceMessages'
import { useI18n } from '@/features/i18n/context/I18nContext'
import { RenderErrorBoundary } from '@/lib/react/RenderErrorBoundary'

import { createPracticeComposition } from './createPracticeComposition'

type PracticeComposition = ReturnType<typeof createPracticeComposition>

const PracticeSavedTabs = ({
  composition,
}: {
  composition: PracticeComposition
}) => {
  const { attachLeftPaneRef, leftPaneWidth } = useSavedTabsLeftPaneWidth()
  const [mode, setMode] = useState<ViewMode>('domain')
  const resolveActiveRef = useRef(() => true)
  const controller = useSavedTabsController(composition)
  const value = useMemo(
    () => ({
      deps: composition.deps,
      useCases: composition.useCases,
      interactionMode: 'practice' as const,
    }),
    [composition],
  )
  return (
    <SavedTabsUseCasesProvider value={value}>
      <SavedTabsResponsiveLayoutProvider
        isCompactLayout={leftPaneWidth < LEFT_PANE_COMPACT_BREAKPOINT_PX}
      >
        <div ref={attachLeftPaneRef} className='min-w-0'>
          <SavedTabsApp
            controller={controller}
            deps={composition.deps}
            useCases={composition.useCases}
            initialViewMode={mode}
            onViewModeNavigate={setMode}
            resolveActiveRef={resolveActiveRef}
          />
        </div>
      </SavedTabsResponsiveLayoutProvider>
    </SavedTabsUseCasesProvider>
  )
}

export const PracticePage = ({
  lessonId = 'domain-mode',
  createComposition = createPracticeComposition,
}: {
  lessonId?: string
  createComposition?: typeof createPracticeComposition
}) => {
  const { language, setLanguageSetting } = useI18n()
  const text = practiceMessages[language]
  const [composition, setComposition] = useState(() => createComposition())
  const [revision, setRevision] = useState(0)
  const [failed, setFailed] = useState(false)
  const [actionCount, setActionCount] = useState(0)
  const validLesson = ACADEMY_LESSONS.find(
    (lesson) => lesson.lessonId === lessonId,
  )
  const backHref = `app.html#/academy/${validLesson?.lessonId ?? ''}`

  useEffect(
    () => () => {
      composition.dispose()
    },
    [composition],
  )
  useEffect(() => {
    const update = () => {
      setActionCount(composition.getBrowserActions().length)
    }
    update()
    return composition.subscribe(update)
  }, [composition])
  useEffect(() => {
    document.documentElement.lang = language
    document.title = `TABBIN Academy · ${text.title}`
  }, [language, text.title])

  const reset = useCallback(() => {
    composition.dispose()
    setComposition(createComposition('saved'))
    setRevision((current) => current + 1)
    setFailed(false)
  }, [composition, createComposition])
  const startEmpty = useCallback(() => {
    composition.dispose()
    setComposition(createComposition('empty'))
    setRevision((current) => current + 1)
    setFailed(false)
  }, [composition, createComposition])
  const save = useCallback(() => {
    void composition
      .saveDemoTabs()
      .then(() => {
        setRevision((current) => current + 1)
      })
      .catch(() => {
        setFailed(true)
      })
  }, [composition])
  const changeLanguage = useCallback(() => {
    void setLanguageSetting(language === 'en' ? 'ja' : 'en')
  }, [language, setLanguageSetting])
  const exit = useCallback(() => {
    composition.dispose()
  }, [composition])

  return (
    <main className='min-h-screen min-w-0 bg-amber-50 text-foreground dark:bg-amber-950/30'>
      <header className='sticky top-0 z-[60] space-y-3 border-b-2 border-amber-600 bg-amber-100 px-4 py-4 text-amber-950 shadow-sm dark:border-amber-400 dark:bg-amber-950 dark:text-amber-50'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <h1 className='text-xl font-bold'>TABBIN Academy · {text.title}</h1>
          <Button
            variant='outline'
            onClick={changeLanguage}
            aria-label={text.language}
          >
            {language === 'en' ? '日本語' : 'English'}
          </Button>
        </div>
        <p className='max-w-4xl text-sm'>{text.description}</p>
        <output className='block text-sm' aria-live='polite'>
          {text.actions}: {actionCount}
        </output>
        <nav className='flex flex-wrap gap-2' aria-label={text.title}>
          <Button variant='outline' onClick={reset}>
            {text.reset}
          </Button>
          <Button variant='outline' onClick={startEmpty}>
            {text.empty}
          </Button>
          <Button variant='outline' onClick={save}>
            {text.save}
          </Button>
          <Button variant='outline' asChild>
            <a href={backHref} onClick={exit}>
              {text.exit}
            </a>
          </Button>
        </nav>
      </header>
      {failed ? (
        <p role='alert' className='p-4 text-destructive'>
          {text.failed}
        </p>
      ) : null}
      <RenderErrorBoundary key={revision}>
        <PracticeSavedTabs composition={composition} />
      </RenderErrorBoundary>
    </main>
  )
}
