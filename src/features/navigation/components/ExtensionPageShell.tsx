import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { ExtensionSidebar } from '@/features/navigation/components/ExtensionSidebar'
import { getSidebarStateFromLocation } from '@/features/navigation/lib/pageNavigation'

interface ExtensionPageShellProps {
  children: React.ReactNode
  pathname?: string
  search?: string
}

export const ExtensionPageShell = ({
  children,
  pathname = window.location.pathname,
  search = window.location.search,
}: ExtensionPageShellProps) => {
  const state = getSidebarStateFromLocation(pathname, search)

  return (
    <SidebarProvider defaultOpen>
      <ExtensionSidebar state={state} />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  )
}
