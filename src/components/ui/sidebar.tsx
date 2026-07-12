import { Slot } from '@radix-ui/react-slot'
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'
import { PanelLeft } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useI18nText } from '@/features/i18n/lib/useI18nText'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  readLocalStorage,
  writeLocalStorage,
} from '@/lib/storage/local-storage-adapter'
import { cn } from '@/lib/utils'

const SECONDS_IN_MINUTE_SB = 60
const MINUTES_IN_HOUR_SB = 60
const HOURS_IN_DAY_SB = 24
const DAYS_IN_WEEK_SB = 7
const SIDEBAR_COOKIE_NAME = 'sidebar_state'
const SIDEBAR_COOKIE_MAX_AGE =
  SECONDS_IN_MINUTE_SB * MINUTES_IN_HOUR_SB * HOURS_IN_DAY_SB * DAYS_IN_WEEK_SB
const SIDEBAR_WIDTH = 256
const SIDEBAR_WIDTH_ICON = '3rem'
const SIDEBAR_WIDTH_ICON_PX = 48
const SIDEBAR_KEYBOARD_SHORTCUT = 'b'
const SIDEBAR_WIDTH_STORAGE_KEY = 'tabbin-extension-sidebar-width'
const MAX_SIDEBAR_WIDTH = 420
const SIDEBAR_VIEWPORT_GUTTER = 96

const getMaxSidebarWidth = (): number => {
  if (typeof window === 'undefined') {
    return MAX_SIDEBAR_WIDTH
  }

  return Math.max(
    SIDEBAR_WIDTH_ICON_PX,
    Math.min(MAX_SIDEBAR_WIDTH, window.innerWidth - SIDEBAR_VIEWPORT_GUTTER),
  )
}

const clampSidebarWidth = (width: number): number =>
  Math.min(Math.max(width, SIDEBAR_WIDTH_ICON_PX), getMaxSidebarWidth())

const loadSidebarWidth = (): number => {
  if (typeof window === 'undefined') {
    return SIDEBAR_WIDTH_ICON_PX
  }

  const storedWidth = readLocalStorage(SIDEBAR_WIDTH_STORAGE_KEY)
  if (!storedWidth) {
    return clampSidebarWidth(SIDEBAR_WIDTH_ICON_PX)
  }

  const savedWidth = Number(storedWidth)

  return Number.isFinite(savedWidth)
    ? clampSidebarWidth(savedWidth)
    : clampSidebarWidth(SIDEBAR_WIDTH)
}

const persistSidebarWidth = (width: number): void => {
  if (typeof window === 'undefined') {
    return
  }

  writeLocalStorage(SIDEBAR_WIDTH_STORAGE_KEY, String(clampSidebarWidth(width)))
}

type SidebarContextProps = {
  state: 'expanded' | 'collapsed'
  open: boolean
  setOpen: (open: boolean) => void
  sidebarWidth: number
  setSidebarWidth: React.Dispatch<React.SetStateAction<number>>
  isMobile: boolean
  toggleSidebar: () => void
}

const SidebarContext = React.createContext<SidebarContextProps | null>(null)

function useSidebar() {
  const context = React.use(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider.')
  }

  return context
}

const SidebarProvider = ({
  children,
  className,
  defaultOpen = true,
  onOpenChange: setOpenProp,
  open: openProp,
  ref,
  style,
  ...props
}: React.ComponentProps<'div'> & {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) => {
  const isMobile = useIsMobile()
  const [sidebarWidth, setSidebarWidth] = React.useState(loadSidebarWidth)

  // This is the internal state of the sidebar.
  // We use openProp and setOpenProp for control from outside the component.
  const [internalOpen, setInternalOpen] = React.useReducer(
    (_state: boolean, nextOpen: boolean) => nextOpen,
    defaultOpen,
  )
  const open = openProp ?? internalOpen
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === 'function' ? value(open) : value
      if (setOpenProp) {
        setOpenProp(openState)
      } else {
        setInternalOpen(openState)
      }

      // This sets the cookie to keep the sidebar state.
      document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
    },
    [setOpenProp, open],
  )

  // Helper to toggle the sidebar.
  const toggleSidebar = React.useCallback(() => {
    setOpen((open) => !open)
  }, [setOpen])

  // Adds a keyboard shortcut to toggle the sidebar.
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault()
        toggleSidebar()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [toggleSidebar])

  React.useEffect(() => {
    const handleWindowResize = () => {
      setSidebarWidth((currentWidth) => {
        const nextWidth = clampSidebarWidth(currentWidth)
        if (nextWidth === currentWidth) {
          return currentWidth
        }
        persistSidebarWidth(nextWidth)
        return nextWidth
      })
    }

    window.addEventListener('resize', handleWindowResize)

    return () => {
      window.removeEventListener('resize', handleWindowResize)
    }
  }, [])

  // We add a state so that we can do data-state="expanded" or "collapsed".
  // This makes it easier to style the sidebar with Tailwind classes.
  const state = open ? 'expanded' : 'collapsed'

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({
      isMobile,
      open,
      setOpen,
      setSidebarWidth,
      sidebarWidth,
      state,
      toggleSidebar,
    }),
    [state, open, setOpen, sidebarWidth, isMobile, toggleSidebar],
  )

  const sidebarStyle = React.useMemo(
    () =>
      ({
        '--sidebar-width': `${sidebarWidth}px`,
        '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
        ...style,
      }) as React.CSSProperties,
    [sidebarWidth, style],
  )

  return (
    <SidebarContext.Provider value={contextValue}>
      <TooltipProvider delayDuration={0}>
        <div
          style={sidebarStyle}
          className={cn(
            'group/sidebar-wrapper flex h-svh min-h-0 w-full overflow-hidden has-data-[variant=inset]:bg-sidebar',
            className,
          )}
          ref={ref}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  )
}
SidebarProvider.displayName = 'SidebarProvider'

const Sidebar = ({
  children,
  className,
  collapsible = 'offcanvas',
  ref,
  side = 'left',
  variant = 'sidebar',
  ...props
}: React.ComponentProps<'div'> & {
  side?: 'left' | 'right'
  variant?: 'sidebar' | 'floating' | 'inset'
  collapsible?: 'offcanvas' | 'icon' | 'none'
}) => {
  const { open, setSidebarWidth, sidebarWidth } = useSidebar()
  const t = useI18nText()
  const sidebarResizeLabel = t('sidebar.resize')
  const resizeCleanupRef = React.useRef<(() => void) | null>(null)
  const sidebarWidthRef = React.useRef(sidebarWidth)
  const isIconCollapsed = open && sidebarWidth <= SIDEBAR_WIDTH_ICON_PX
  const state = open && !isIconCollapsed ? 'expanded' : 'collapsed'
  let collapsibleState = ''
  if (state === 'collapsed') {
    collapsibleState = open ? 'icon' : collapsible
  }

  React.useEffect(() => {
    sidebarWidthRef.current = sidebarWidth
  }, [sidebarWidth])

  React.useEffect(
    () => () => {
      resizeCleanupRef.current?.()
      resizeCleanupRef.current = null
    },
    [],
  )

  const stopResize = React.useCallback(() => {
    resizeCleanupRef.current?.()
    resizeCleanupRef.current = null
  }, [])

  const handleResizeStart = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!open) {
        return
      }

      event.preventDefault()
      stopResize()

      const previousBodyStyle = document.body.style.cssText
      const handlePointerMove = (moveEvent: PointerEvent) => {
        const nextWidth =
          side === 'left'
            ? clampSidebarWidth(moveEvent.clientX)
            : clampSidebarWidth(window.innerWidth - moveEvent.clientX)
        sidebarWidthRef.current = nextWidth
        setSidebarWidth(nextWidth)
      }
      const handlePointerUp = () => {
        persistSidebarWidth(sidebarWidthRef.current)
        stopResize()
      }

      document.body.style.cssText = `${previousBodyStyle}; cursor: col-resize; user-select: none;`
      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp)

      resizeCleanupRef.current = () => {
        document.body.style.cssText = previousBodyStyle
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', handlePointerUp)
      }
    },
    [open, side, stopResize, setSidebarWidth],
  )

  if (collapsible === 'none') {
    return (
      <div
        className={cn(
          'flex h-full w-[--sidebar-width] flex-col bg-sidebar text-sidebar-foreground',
          className,
        )}
        ref={ref}
        {...props}
      >
        {children}
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className='group peer flex shrink-0 overflow-hidden text-sidebar-foreground transition-[width] duration-200 ease-linear'
      data-state={state}
      data-collapsible={collapsibleState}
      data-variant={variant}
      data-side={side}
      {...props}
    >
      <div
        className={cn(
          'flex h-svh w-[--sidebar-width] shrink-0 overflow-hidden bg-transparent transition-[width] duration-200 ease-linear',
          'group-data-[collapsible=offcanvas]:w-0',
          variant === 'floating' || variant === 'inset'
            ? 'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]'
            : 'group-data-[collapsible=icon]:w-[--sidebar-width-icon]',
          variant === 'floating' || variant === 'inset'
            ? 'p-2'
            : 'group-data-[collapsible=icon]:w-[--sidebar-width-icon] group-data-[side=left]:border-r group-data-[side=right]:border-l',
          className,
        )}
      >
        <div
          data-sidebar='sidebar'
          className='flex h-full w-[--sidebar-width] min-w-0 flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:shadow'
        >
          {children}
        </div>
      </div>
      <button
        type='button'
        aria-label={sidebarResizeLabel}
        className={cn(
          'relative shrink-0 touch-none',
          side === 'left' ? 'cursor-col-resize' : 'cursor-col-resize',
          !open ? 'pointer-events-none opacity-0' : 'bg-transparent',
        )}
        onPointerDown={handleResizeStart}
      >
        <span
          aria-hidden='true'
          className='absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border/80'
        />
      </button>
    </div>
  )
}
Sidebar.displayName = 'Sidebar'

const SidebarTrigger = ({
  className,
  onClick,
  ref,
  ...props
}: React.ComponentProps<typeof Button>) => {
  const { toggleSidebar } = useSidebar()
  const t = useI18nText()
  const sidebarToggleLabel = t('common.toggleSidebar')

  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(event)
      toggleSidebar()
    },
    [onClick, toggleSidebar],
  )

  return (
    <Button
      ref={ref}
      data-sidebar='trigger'
      variant='ghost'
      size='icon'
      className={cn('h-7 w-7', className)}
      onClick={handleClick}
      {...props}
    >
      <PanelLeft />
      <span className='sr-only'>{sidebarToggleLabel}</span>
    </Button>
  )
}
SidebarTrigger.displayName = 'SidebarTrigger'

const SidebarRail = ({
  className,
  ref,
  ...props
}: React.ComponentProps<'button'>) => {
  const { toggleSidebar } = useSidebar()
  const t = useI18nText()
  const sidebarToggleLabel = t('common.toggleSidebar')

  return (
    <button
      ref={ref}
      type='button'
      data-sidebar='rail'
      aria-label={sidebarToggleLabel}
      tabIndex={-1}
      onClick={toggleSidebar}
      title={sidebarToggleLabel}
      className={cn(
        'absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] hover:after:bg-sidebar-border sm:flex',
        'in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize',
        '[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize',
        'group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full group-data-[collapsible=offcanvas]:hover:bg-sidebar',
        '[[data-side=left][data-collapsible=offcanvas]_&]:-right-2',
        '[[data-side=right][data-collapsible=offcanvas]_&]:-left-2',
        className,
      )}
      {...props}
    />
  )
}
SidebarRail.displayName = 'SidebarRail'

const SidebarInset = ({
  className,
  ref,
  ...props
}: React.ComponentProps<'main'>) => (
  <main
    ref={ref}
    className={cn(
      'relative flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-background',
      'peer-data-[variant=inset]:m-2 peer-data-[variant=inset]:ml-0 peer-data-[variant=inset]:rounded-xl peer-data-[variant=inset]:shadow peer-data-[state=collapsed]:peer-data-[variant=inset]:ml-2',
      className,
    )}
    {...props}
  />
)
SidebarInset.displayName = 'SidebarInset'

const SidebarInput = ({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof Input>) => (
  <Input
    ref={ref}
    data-sidebar='input'
    className={cn(
      'h-8 w-full bg-background shadow-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
      className,
    )}
    {...props}
  />
)
SidebarInput.displayName = 'SidebarInput'

const SidebarHeader = ({
  className,
  ref,
  ...props
}: React.ComponentProps<'div'>) => (
  <div
    ref={ref}
    data-sidebar='header'
    className={cn('flex flex-col gap-2 p-2', className)}
    {...props}
  />
)
SidebarHeader.displayName = 'SidebarHeader'

const SidebarFooter = ({
  className,
  ref,
  ...props
}: React.ComponentProps<'div'>) => (
  <div
    ref={ref}
    data-sidebar='footer'
    className={cn('flex flex-col gap-2 p-2', className)}
    {...props}
  />
)
SidebarFooter.displayName = 'SidebarFooter'

const SidebarSeparator = ({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof Separator>) => (
  <Separator
    ref={ref}
    data-sidebar='separator'
    className={cn('mx-2 w-auto bg-sidebar-border', className)}
    {...props}
  />
)
SidebarSeparator.displayName = 'SidebarSeparator'

const SidebarContent = ({
  className,
  ref,
  ...props
}: React.ComponentProps<'div'>) => (
  <div
    ref={ref}
    data-sidebar='content'
    className={cn(
      'flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-x-hidden',
      className,
    )}
    {...props}
  />
)
SidebarContent.displayName = 'SidebarContent'

const SidebarGroup = ({
  className,
  ref,
  ...props
}: React.ComponentProps<'div'>) => (
  <div
    ref={ref}
    data-sidebar='group'
    className={cn('relative flex w-full min-w-0 flex-col p-2', className)}
    {...props}
  />
)
SidebarGroup.displayName = 'SidebarGroup'

const SidebarGroupLabel = ({
  asChild = false,
  className,
  ref,
  ...props
}: React.ComponentProps<'div'> & { asChild?: boolean }) => {
  const Comp = asChild ? Slot : 'div'

  return (
    <Comp
      ref={ref}
      data-sidebar='group-label'
      className={cn(
        'flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 ring-sidebar-ring transition-[margin,opacity] duration-200 ease-linear outline-none focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0',
        'group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0',
        className,
      )}
      {...props}
    />
  )
}
SidebarGroupLabel.displayName = 'SidebarGroupLabel'

const SidebarGroupAction = ({
  asChild = false,
  className,
  ref,
  ...props
}: React.ComponentProps<'button'> & { asChild?: boolean }) => {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      ref={ref}
      data-sidebar='group-action'
      className={cn(
        'absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring transition-transform outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0',
        // Increases the hit area of the button on mobile.
        'after:absolute after:-inset-2 after:md:hidden',
        'group-data-[collapsible=icon]:hidden',
        className,
      )}
      {...props}
    />
  )
}
SidebarGroupAction.displayName = 'SidebarGroupAction'

const SidebarGroupContent = ({
  className,
  ref,
  ...props
}: React.ComponentProps<'div'>) => (
  <div
    ref={ref}
    data-sidebar='group-content'
    className={cn('w-full text-sm', className)}
    {...props}
  />
)
SidebarGroupContent.displayName = 'SidebarGroupContent'

const SidebarMenu = ({
  className,
  ref,
  ...props
}: React.ComponentProps<'ul'>) => (
  <ul
    ref={ref}
    data-sidebar='menu'
    className={cn('flex w-full min-w-0 flex-col gap-1', className)}
    {...props}
  />
)
SidebarMenu.displayName = 'SidebarMenu'

const SidebarMenuItem = ({
  className,
  ref,
  ...props
}: React.ComponentProps<'li'>) => (
  <li
    ref={ref}
    data-sidebar='menu-item'
    className={cn('group/menu-item relative', className)}
    {...props}
  />
)
SidebarMenuItem.displayName = 'SidebarMenuItem'

const sidebarMenuButtonVariants = cva(
  'peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm ring-sidebar-ring transition-[width,height,padding] outline-none group-has-[[data-sidebar=menu-action]]/menu-item:pr-8 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0',
  {
    defaultVariants: {
      size: 'default',
      variant: 'default',
    },
    variants: {
      size: {
        default: 'h-8 text-sm',
        lg: 'h-12 text-sm',
        sm: 'h-7 text-xs',
      },
      variant: {
        default: 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        outline:
          'bg-background shadow-[0_0_0_1px_hsl(var(--sidebar-border))] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_hsl(var(--sidebar-accent))]',
      },
    },
  },
)

const SidebarMenuButton = ({
  asChild = false,
  className,
  isActive = false,
  ref,
  size = 'default',
  tooltip,
  variant = 'default',
  ...props
}: React.ComponentProps<'button'> & {
  asChild?: boolean
  isActive?: boolean
  tooltip?: string | React.ComponentProps<typeof TooltipContent>
} & VariantProps<typeof sidebarMenuButtonVariants>) => {
  const Comp = asChild ? Slot : 'button'
  const { isMobile, state } = useSidebar()

  const button = (
    <Comp
      ref={ref}
      data-sidebar='menu-button'
      data-size={size}
      data-active={isActive}
      className={cn(sidebarMenuButtonVariants({ size, variant }), className)}
      {...props}
    />
  )

  if (!tooltip) {
    return button
  }

  if (typeof tooltip === 'string') {
    tooltip = {
      children: tooltip,
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent
        side='right'
        align='center'
        hidden={state !== 'collapsed' || isMobile}
        {...tooltip}
      />
    </Tooltip>
  )
}
SidebarMenuButton.displayName = 'SidebarMenuButton'

const SidebarMenuAction = ({
  asChild = false,
  className,
  ref,
  showOnHover = false,
  ...props
}: React.ComponentProps<'button'> & {
  asChild?: boolean
  showOnHover?: boolean
}) => {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      ref={ref}
      data-sidebar='menu-action'
      className={cn(
        'absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring transition-transform outline-none peer-hover/menu-button:text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0',
        // Increases the hit area of the button on mobile.
        'after:absolute after:-inset-2 after:md:hidden',
        'peer-data-[size=sm]/menu-button:top-1',
        'peer-data-[size=default]/menu-button:top-1.5',
        'peer-data-[size=lg]/menu-button:top-2.5',
        'group-data-[collapsible=icon]:hidden',
        showOnHover &&
          'group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 peer-data-[active=true]/menu-button:text-sidebar-accent-foreground data-[state=open]:opacity-100 md:opacity-0',
        className,
      )}
      {...props}
    />
  )
}
SidebarMenuAction.displayName = 'SidebarMenuAction'

const SidebarMenuBadge = ({
  className,
  ref,
  ...props
}: React.ComponentProps<'div'>) => (
  <div
    ref={ref}
    data-sidebar='menu-badge'
    className={cn(
      'pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium text-sidebar-foreground tabular-nums select-none',
      'peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-accent-foreground',
      'peer-data-[size=sm]/menu-button:top-1',
      'peer-data-[size=default]/menu-button:top-1.5',
      'peer-data-[size=lg]/menu-button:top-2.5',
      'group-data-[collapsible=icon]:hidden',
      className,
    )}
    {...props}
  />
)
SidebarMenuBadge.displayName = 'SidebarMenuBadge'

const SidebarMenuSkeleton = ({
  className,
  ref,
  showIcon = false,
  ...props
}: React.ComponentProps<'div'> & {
  showIcon?: boolean
}) => {
  const SKELETON_WIDTH_RANGE = 40
  const SKELETON_WIDTH_MIN = 50

  // Random width between 50 to 90%.
  const [width] = React.useState(
    () =>
      `${Math.floor(Math.random() * SKELETON_WIDTH_RANGE) + SKELETON_WIDTH_MIN}%`,
  )
  const skeletonStyle: React.CSSProperties & { '--skeleton-width': string } =
    React.useMemo(() => ({ '--skeleton-width': width }), [width])

  return (
    <div
      ref={ref}
      data-sidebar='menu-skeleton'
      className={cn('flex h-8 items-center gap-2 rounded-md px-2', className)}
      {...props}
    >
      {showIcon && (
        <Skeleton
          className='size-4 rounded-md'
          data-sidebar='menu-skeleton-icon'
        />
      )}
      <Skeleton
        className='h-4 max-w-[--skeleton-width] flex-1'
        data-sidebar='menu-skeleton-text'
        style={skeletonStyle}
      />
    </div>
  )
}
SidebarMenuSkeleton.displayName = 'SidebarMenuSkeleton'

const SidebarMenuSub = ({
  className,
  ref,
  ...props
}: React.ComponentProps<'ul'>) => (
  <ul
    ref={ref}
    data-sidebar='menu-sub'
    className={cn(
      'mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5',
      'group-data-[collapsible=icon]:hidden',
      className,
    )}
    {...props}
  />
)
SidebarMenuSub.displayName = 'SidebarMenuSub'

const SidebarMenuSubItem = ({ ref, ...props }: React.ComponentProps<'li'>) => (
  <li ref={ref} {...props} />
)
SidebarMenuSubItem.displayName = 'SidebarMenuSubItem'

const SidebarMenuSubButton = ({
  asChild = false,
  className,
  isActive,
  ref,
  size = 'md',
  ...props
}: React.ComponentProps<'a'> & {
  asChild?: boolean
  size?: 'sm' | 'md'
  isActive?: boolean
}) => {
  const Comp = asChild ? Slot : 'a'

  return (
    <Comp
      ref={ref}
      data-sidebar='menu-sub-button'
      data-size={size}
      data-active={isActive}
      className={cn(
        'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-accent-foreground',
        'data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground',
        size === 'sm' && 'text-xs',
        size === 'md' && 'text-sm',
        'group-data-[collapsible=icon]:hidden',
        className,
      )}
      {...props}
    />
  )
}
SidebarMenuSubButton.displayName = 'SidebarMenuSubButton'

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
}
