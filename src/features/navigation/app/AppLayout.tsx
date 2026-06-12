import { Outlet, useLocation } from 'react-router-dom'

import { DocumentTitleSync } from '@/features/i18n/components/DocumentTitleSync'
import { resolveTitlePageKeyFromPathname } from '@/features/i18n/lib/title'
import { ExtensionPageShell } from '@/features/navigation/components/ExtensionPageShell'

export const AppLayout = () => {
  const location = useLocation()
  const titlePage = resolveTitlePageKeyFromPathname(location.pathname)

  return (
    <ExtensionPageShell pathname={location.pathname} search={location.search}>
      <DocumentTitleSync page={titlePage} />
      <div
        className='flex min-h-0 flex-1 flex-col overflow-hidden'
        data-testid='app-layout'
      >
        <Outlet />
      </div>
    </ExtensionPageShell>
  )
}
