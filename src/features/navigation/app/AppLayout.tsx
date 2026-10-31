import { lazy, Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { exportRenderRecoveryBackup } from '@/app/composition/renderRecoveryExport'
import { hasAcademyScreenGuide } from '@/features/academy/application/use-cases/RecordGuideViewedUseCase'
import { AcademyWelcome } from '@/features/academy/presentation/AcademyWelcome'
import { DocumentTitleSync } from '@/features/i18n/components/DocumentTitleSync'
import { resolveTitlePageKeyFromPathname } from '@/features/i18n/lib/title'
import { ExtensionPageShell } from '@/features/navigation/components/ExtensionPageShell'
import { RenderErrorBoundary } from '@/lib/react/RenderErrorBoundary'

const ScreenGuide = lazy(async () =>
  import('@/features/academy/presentation/AcademyScreenGuide').then(
    ({ AcademyScreenGuide }) => ({ default: AcademyScreenGuide }),
  ),
)

export const AppLayout = () => {
  const location = useLocation()
  const guide = new URLSearchParams(location.search).get('guide')
  const guideLesson =
    location.pathname === '/saved-tabs' && guide && hasAcademyScreenGuide(guide)
      ? guide
      : null
  const titlePage = resolveTitlePageKeyFromPathname(location.pathname)

  return (
    <ExtensionPageShell pathname={location.pathname} search={location.search}>
      <DocumentTitleSync page={titlePage} />
      <AcademyWelcome />
      {guideLesson ? (
        <RenderErrorBoundary key={guideLesson} fallback={null}>
          <Suspense fallback={null}>
            <ScreenGuide lessonId={guideLesson} />
          </Suspense>
        </RenderErrorBoundary>
      ) : null}
      <div
        className='flex min-h-0 flex-1 flex-col overflow-hidden'
        data-testid='app-layout'
      >
        <RenderErrorBoundary
          key={location.pathname}
          onExport={exportRenderRecoveryBackup}
        >
          <Outlet />
        </RenderErrorBoundary>
      </div>
    </ExtensionPageShell>
  )
}
