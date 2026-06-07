import {
  BarChart3,
  Clock3,
  Folder,
  FolderTree,
  Globe,
  MessageCircleMore,
  PanelLeft,
  Wrench,
} from 'lucide-react'
import { Link, useInRouterContext } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/sidebar'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import {
  getAppEntryHref,
  getAppRoute,
  getSavedTabsEntryRoute,
} from '@/features/navigation/lib/pageNavigation'
import type {
  SidebarItemId,
  SidebarState,
} from '@/features/navigation/lib/pageNavigation'
import { cn } from '@/lib/utils'

interface ExtensionSidebarProps {
  state: SidebarState
}

const LinkLabel = ({
  to,
  isActive,
  label,
  children,
}: {
  to: string
  isActive: boolean
  label: string
  children: React.ReactNode
}) => {
  const isInRouterContext = useInRouterContext()

  if (isInRouterContext) {
    return (
      <Link
        aria-current={isActive ? 'page' : undefined}
        aria-label={label}
        className={cn(
          expandedNavLinkClass,
          isActive && expandedNavLinkActiveClass,
        )}
        to={to}
      >
        {children}
      </Link>
    )
  }

  return (
    <a
      aria-current={isActive ? 'page' : undefined}
      aria-label={label}
      className={cn(
        expandedNavLinkClass,
        isActive && expandedNavLinkActiveClass,
      )}
      href={getAppEntryHref(to)}
    >
      {children}
    </a>
  )
}

const topLevelItems: {
  icon: React.ComponentType<{ className?: string }>
  id: SidebarItemId
  labelKey: string
}[] = [
  {
    icon: MessageCircleMore,
    id: 'ai-chat',
    labelKey: 'sidebar.chat',
  },
  {
    icon: BarChart3,
    id: 'analytics',
    labelKey: 'sidebar.analytics',
  },
  {
    icon: Clock3,
    id: 'periodic-execution',
    labelKey: 'sidebar.periodicExecution',
  },
]

const tabListItems: {
  icon: React.ComponentType<{ className?: string }>
  id: SidebarItemId
  labelKey: string
}[] = [
  {
    icon: Globe,
    id: 'saved-tabs-domain',
    labelKey: 'savedTabs.viewMode.domain',
  },
  {
    icon: Folder,
    id: 'saved-tabs-custom',
    labelKey: 'savedTabs.viewMode.custom',
  },
]

const expandedPrimaryButtonClass = 'rounded-xl p-0'
const expandedNavLinkClass =
  'flex min-h-11 w-full min-w-0 items-center justify-start gap-3 rounded-xl px-4 text-base font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
const expandedNavLinkActiveClass =
  'bg-sidebar-accent text-sidebar-accent-foreground'
const expandedSubmenuClass =
  'mx-0 mt-1 ml-4 gap-1.5 border-sidebar-border/70 px-0 py-0 pl-4'
const iconRailLinkClass =
  'flex size-11 items-center justify-center rounded-2xl text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer'
const ICON_RAIL_WIDTH_PX = 48
const EXPANDED_SIDEBAR_WIDTH_PX = 256
const SIDEBAR_WIDTH_STORAGE_KEY = 'tabbin-extension-sidebar-width'

interface RailItem {
  icon: React.ComponentType<{ className?: string }>
  isActive: boolean
  label: string
  to?: string
  href?: string
  rel?: string
  target?: string
}

const IconRailLink = ({
  icon: Icon,
  isActive,
  label,
  to,
  href,
  rel,
  target,
}: RailItem) => {
  const isInRouterContext = useInRouterContext()
  const className = cn(
    iconRailLinkClass,
    isActive
      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
      : 'bg-transparent',
  )

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {to && isInRouterContext ? (
          <Link
            aria-current={isActive ? 'page' : undefined}
            aria-label={label}
            className={className}
            data-active={isActive}
            to={to}
          >
            <Icon className='size-5 shrink-0' />
          </Link>
        ) : (
          <a
            aria-current={isActive ? 'page' : undefined}
            aria-label={label}
            className={className}
            data-active={isActive}
            href={to ? getAppEntryHref(to) : href}
            rel={rel}
            target={target}
          >
            <Icon className='size-5 shrink-0' />
          </a>
        )}
      </TooltipTrigger>
      <TooltipContent side='right' align='center'>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export const ExtensionSidebar = ({ state }: ExtensionSidebarProps) => { // eslint-disable-line eslint/max-lines-per-function
  const { t } = useI18n()
  const { open, setOpen, setSidebarWidth, sidebarWidth } = useSidebar()
  const isIconCollapsed = open && sidebarWidth <= ICON_RAIL_WIDTH_PX
  // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
  const handleCollapseSidebar = () => {
    setOpen(true)
    setSidebarWidth(ICON_RAIL_WIDTH_PX)

    try {
      window.localStorage.setItem(
        SIDEBAR_WIDTH_STORAGE_KEY,
        String(ICON_RAIL_WIDTH_PX),
      )
    } catch {
      // LocalStorage が使えない環境では保持をスキップする
    }
  }
  // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
  const handleExpandSidebar = () => {
    setOpen(true)
    setSidebarWidth(EXPANDED_SIDEBAR_WIDTH_PX)

    try {
      window.localStorage.setItem(
        SIDEBAR_WIDTH_STORAGE_KEY,
        String(EXPANDED_SIDEBAR_WIDTH_PX),
      )
    } catch {
      // LocalStorage が使えない環境では保持をスキップする
    }
  }
  const savedTabsHref = getSavedTabsEntryRoute()
  const railItems: RailItem[] = [
    {
      icon: FolderTree,
      isActive: state.item.startsWith('saved-tabs-'),
      label: t('sidebar.tabList'),
      to: savedTabsHref,
    },
    ...topLevelItems.map((item) => ({
      icon: item.icon,
      isActive: state.item === item.id,
      label: t(item.labelKey),
      to: getAppRoute(item.id),
    })),
  ]
  const optionItem = {
    icon: Wrench,
    id: 'options' as const,
    label: t('sidebar.options'),
  }

  return (
    <Sidebar>
      <SidebarHeader
        className={cn('gap-1 px-3 py-3', isIconCollapsed && 'px-0 py-2')}
      >
        <div className='flex items-center justify-between gap-2 rounded-lg py-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0'>
          {isIconCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={t('sidebar.open')}
                  className={iconRailLinkClass}
                  onClick={handleExpandSidebar}
                  size='icon'
                  type='button'
                  variant='ghost'
                >
                  <PanelLeft className='size-5 shrink-0' />
                </Button>
              </TooltipTrigger>
              <TooltipContent side='right' align='center'>
                {t('sidebar.open')}
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className='flex items-center gap-2'>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label={t('sidebar.collapse')}
                    className={iconRailLinkClass}
                    onClick={handleCollapseSidebar}
                    size='icon'
                    type='button'
                    variant='ghost'
                  >
                    <PanelLeft className='size-5 shrink-0' />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side='right' align='center'>
                  {t('sidebar.collapse')}
                </TooltipContent>
              </Tooltip>
              <div className='min-w-0 group-data-[collapsible=icon]:hidden'>
                <p className='text-3xl leading-none font-semibold'>TABBIN</p>
              </div>
            </div>
          )}
          {!isIconCollapsed ? (
            <div aria-hidden='true' className='size-11 shrink-0' />
          ) : null}
        </div>
      </SidebarHeader>

      <SidebarContent className={cn(isIconCollapsed && 'items-center')}>
        <SidebarGroup className={cn(isIconCollapsed && 'w-full px-0 py-2')}>
          <SidebarGroupContent>
            {isIconCollapsed ? (
              <div className='flex h-full flex-col items-center'>
                <div className='flex flex-col items-center gap-3 pt-2'>
                  {railItems.map((item) => (
                    <IconRailLink key={item.label} {...item} />
                  ))}
                </div>
              </div>
            ) : (
              <SidebarMenu className='gap-1.5'>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={state.item.startsWith('saved-tabs-')}
                    className={expandedPrimaryButtonClass}
                    size='lg'
                    tooltip={t('sidebar.tabList')}
                    asChild
                  >
                    <LinkLabel
                      to={savedTabsHref}
                      isActive={state.item.startsWith('saved-tabs-')}
                      label={t('sidebar.tabList')}
                    >
                      <FolderTree className='size-5 shrink-0' />
                      <span className='group-data-[collapsible=icon]:hidden'>
                        {t('sidebar.tabList')}
                      </span>
                    </LinkLabel>
                  </SidebarMenuButton>
                  <SidebarMenuSub className={expandedSubmenuClass}>
                    {tabListItems.map((item) => (
                      <SidebarMenuSubItem key={item.id}>
                        {(() => {
                          const label = t(item.labelKey)

                          return (
                            <SidebarMenuSubButton
                              asChild
                              className='h-11 gap-3 rounded-xl px-4 text-base'
                              isActive={state.item === item.id}
                            >
                              <LinkLabel
                                to={getAppRoute(item.id)}
                                isActive={state.item === item.id}
                                label={label}
                              >
                                <item.icon className='size-4' />
                                <span>{label}</span>
                              </LinkLabel>
                            </SidebarMenuSubButton>
                          )
                        })()}
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </SidebarMenuItem>
                {topLevelItems.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    {(() => {
                      const label = t(item.labelKey)

                      return (
                        <SidebarMenuButton
                          isActive={state.item === item.id}
                          className={expandedPrimaryButtonClass}
                          size='lg'
                          tooltip={label}
                          asChild
                        >
                          <LinkLabel
                            to={getAppRoute(item.id)}
                            isActive={state.item === item.id}
                            label={label}
                          >
                            <item.icon className='size-5 shrink-0' />
                            <span className='group-data-[collapsible=icon]:hidden'>
                              {label}
                            </span>
                          </LinkLabel>
                        </SidebarMenuButton>
                      )
                    })()}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter
        className={cn(
          'border-t border-sidebar-border p-3',
          isIconCollapsed && 'items-center px-0 py-3',
        )}
      >
        {isIconCollapsed ? (
          <IconRailLink
            icon={optionItem.icon}
            isActive={state.item === optionItem.id}
            label={optionItem.label}
            to={getAppRoute(optionItem.id)}
          />
        ) : (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                className='rounded-xl p-0'
                tooltip={optionItem.label}
                asChild
              >
                <LinkLabel
                  to={getAppRoute(optionItem.id)}
                  isActive={state.item === optionItem.id}
                  label={optionItem.label}
                >
                  <optionItem.icon className='size-5 shrink-0' />
                  <span className='group-data-[collapsible=icon]:hidden'>
                    {optionItem.label}
                  </span>
                </LinkLabel>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarFooter>
    </Sidebar>
  )
}
