'use client'

import { useControllableState } from '@radix-ui/react-use-controllable-state'
import { ChevronsUpDownIcon } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useI18nText } from '@/features/i18n/lib/useI18nText'
import { cn } from '@/lib/utils'

const DEFAULT_MIC_SELECTOR_WIDTH = 200

const deviceIdRegex = /\(([\da-fA-F]{4}:[\da-fA-F]{4})\)$/

interface MicSelectorContextType {
  data: MediaDeviceInfo[]
  value: string | undefined
  onValueChange?: (value: string) => void
  open: boolean
  onOpenChange?: (open: boolean) => void
  width: number
  setWidth?: (width: number) => void
}

const MicSelectorContext = createContext<MicSelectorContextType>({
  data: [],
  onOpenChange: undefined,
  onValueChange: undefined,
  open: false,
  setWidth: undefined,
  value: undefined,
  width: 200,
})

export type MicSelectorProps = ComponentProps<typeof Popover> & {
  defaultValue?: string
  value?: string | undefined
  onValueChange?: (value: string | undefined) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export const MicSelector = ({
  defaultValue,
  value: controlledValue,
  onValueChange: controlledOnValueChange,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  ...props
}: MicSelectorProps) => {
  const [value, onValueChange] = useControllableState<string | undefined>({
    defaultProp: defaultValue,
    onChange: controlledOnValueChange,
    prop: controlledValue,
  })
  const [open, onOpenChange] = useControllableState({
    defaultProp: defaultOpen,
    onChange: controlledOnOpenChange,
    prop: controlledOpen,
  })
  const [width, setWidth] = useState(DEFAULT_MIC_SELECTOR_WIDTH)
  const { devices, loading, hasPermission, loadDevices } = useAudioDevices()

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen)
    },
    [onOpenChange],
  )

  // popover が `open` になったとき (制御モード / `defaultOpen` 含む)、
  // 初回マウント時 `loading=true` の場合でも `loading` が `false` に
  // 切り替わったタイミングで `loadDevices()` を実行する。
  // 旧 `useEffect` 実装と同等の reactive 挙動を維持する
  // (Codex review P2)。
  useEffect(() => {
    if (open && !hasPermission && !loading) {
      void loadDevices()
    }
  }, [open, hasPermission, loading, loadDevices])

  const contextValue = useMemo(
    () => ({
      data: devices,
      onOpenChange: handleOpenChange,
      onValueChange,
      open,
      setWidth,
      value,
      width,
    }),
    [devices, handleOpenChange, onValueChange, open, setWidth, value, width],
  )

  return (
    <MicSelectorContext.Provider value={contextValue}>
      <Popover {...props} onOpenChange={handleOpenChange} open={open} />
    </MicSelectorContext.Provider>
  )
}

export type MicSelectorTriggerProps = ComponentProps<typeof Button>

export const MicSelectorTrigger = ({
  children,
  ...props
}: MicSelectorTriggerProps) => {
  const { setWidth } = use(MicSelectorContext)
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // Create a ResizeObserver to detect width changes
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (!(entry.target instanceof HTMLElement)) {
          continue
        }
        const newWidth = entry.target.offsetWidth
        if (newWidth) {
          setWidth?.(newWidth)
        }
      }
    })

    if (ref.current) {
      resizeObserver.observe(ref.current)
    }

    // Clean up the observer when component unmounts
    return () => {
      resizeObserver.disconnect()
    }
  }, [setWidth])

  return (
    <PopoverTrigger asChild>
      <Button variant='outline' {...props} ref={ref}>
        {children}
        <ChevronsUpDownIcon
          className='shrink-0 text-muted-foreground'
          size={16}
        />
      </Button>
    </PopoverTrigger>
  )
}

export type MicSelectorContentProps = ComponentProps<typeof Command> & {
  popoverOptions?: ComponentProps<typeof PopoverContent>
}

export const MicSelectorContent = ({
  className,
  popoverOptions,
  ...props
}: MicSelectorContentProps) => {
  const { width, onValueChange, value } = use(MicSelectorContext)

  return (
    <PopoverContent
      className={cn('p-0', className)}
      style={{ width }}
      {...popoverOptions}
    >
      <Command onValueChange={onValueChange} value={value} {...props} />
    </PopoverContent>
  )
}

export type MicSelectorInputProps = ComponentProps<typeof CommandInput> & {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
}

export const MicSelectorInput = ({ ...props }: MicSelectorInputProps) => {
  const t = useI18nText()

  return <CommandInput placeholder={t('common.searchMicrophones')} {...props} />
}

export type MicSelectorListProps = Omit<
  ComponentProps<typeof CommandList>,
  'children'
> & {
  children: (devices: MediaDeviceInfo[]) => ReactNode
}

export const MicSelectorList = ({
  children,
  ...props
}: MicSelectorListProps) => {
  const { data } = use(MicSelectorContext)

  return <CommandList {...props}>{children(data)}</CommandList>
}

export type MicSelectorEmptyProps = ComponentProps<typeof CommandEmpty>

export const MicSelectorEmpty = ({
  children = 'No microphone found.',
  ...props
}: MicSelectorEmptyProps) => <CommandEmpty {...props}>{children}</CommandEmpty>

export type MicSelectorItemProps = ComponentProps<typeof CommandItem>

export const MicSelectorItem = (props: MicSelectorItemProps) => {
  const { onValueChange, onOpenChange } = use(MicSelectorContext)

  const handleSelect = useCallback(
    (currentValue: string) => {
      onValueChange?.(currentValue)
      onOpenChange?.(false)
    },
    [onValueChange, onOpenChange],
  )

  return <CommandItem onSelect={handleSelect} {...props} />
}

export type MicSelectorLabelProps = ComponentProps<'span'> & {
  device: MediaDeviceInfo
}

export const MicSelectorLabel = ({
  device,
  className,
  ...props
}: MicSelectorLabelProps) => {
  const matches = deviceIdRegex.exec(device.label)

  if (!matches) {
    return (
      <span className={className} {...props}>
        {device.label}
      </span>
    )
  }

  const [, deviceId] = matches
  const name = device.label.replace(deviceIdRegex, '')

  return (
    <span className={className} {...props}>
      <span>{name}</span>
      <span className='text-muted-foreground'> ({deviceId})</span>
    </span>
  )
}

export type MicSelectorValueProps = ComponentProps<'span'>

export const MicSelectorValue = ({
  className,
  ...props
}: MicSelectorValueProps) => {
  const { data, value } = use(MicSelectorContext)
  const currentDevice = data.find((d) => d.deviceId === value)

  if (!currentDevice) {
    return (
      <span className={cn('flex-1 text-left', className)} {...props}>
        Select microphone…
      </span>
    )
  }

  return (
    <MicSelectorLabel
      className={cn('flex-1 text-left', className)}
      device={currentDevice}
      {...props}
    />
  )
}

const useAudioDevices = () => {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasPermission, setHasPermission] = useState(false)

  const loadDevicesWithoutPermission = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const deviceList = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = deviceList.filter(
        (device) => device.kind === 'audioinput',
      )

      setDevices(audioInputs)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to get audio devices'

      setError(message)
      console.error('Error getting audio devices:', message)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadDevicesWithPermission = useCallback(async () => {
    if (loading) {
      return
    }

    try {
      setLoading(true)
      setError(null)

      const tempStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      })

      for (const track of tempStream.getTracks()) {
        track.stop()
      }

      const deviceList = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = deviceList.filter(
        (device) => device.kind === 'audioinput',
      )

      setDevices(audioInputs)
      setHasPermission(true)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to get audio devices'

      setError(message)
      console.error('Error getting audio devices:', message)
    } finally {
      setLoading(false)
    }
  }, [loading])

  useEffect(() => {
    void loadDevicesWithoutPermission()
  }, [loadDevicesWithoutPermission])

  useEffect(() => {
    const handleDeviceChange = () => {
      if (hasPermission) {
        void loadDevicesWithPermission()
      } else {
        void loadDevicesWithoutPermission()
      }
    }

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange)

    return () => {
      navigator.mediaDevices.removeEventListener(
        'devicechange',
        handleDeviceChange,
      )
    }
  }, [hasPermission, loadDevicesWithPermission, loadDevicesWithoutPermission])

  return {
    devices,
    error,
    hasPermission,
    loadDevices: loadDevicesWithPermission,
    loading,
  }
}
