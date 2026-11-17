import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  LINK_CAPTURE_ORIGINS,
  LINK_CAPTURE_PERMISSIONS,
  LINK_CAPTURE_SETTINGS_KEY,
} from '@/constants/linkCapture'
import { getChromeStorageOnChanged } from '@/lib/browser/chrome-storage'
import { getSavedTabTitlePermissions } from '@/lib/browser/saved-tab-title-permissions'
import {
  DEFAULT_LINK_CAPTURE_SETTINGS,
  readLinkCaptureSettings,
  writeLinkCaptureSettings,
} from '@/lib/storage/link-capture-settings'
import type { LinkCaptureSettings } from '@/lib/storage/link-capture-settings'

const access = {
  permissions: [...LINK_CAPTURE_PERMISSIONS],
  origins: [...LINK_CAPTURE_ORIGINS],
}

export const useLinkCaptureSetting = () => {
  const permissions = useMemo(() => getSavedTabTitlePermissions(), [])
  const [settings, setSettings] = useState(DEFAULT_LINK_CAPTURE_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [granted, setGranted] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(
    permissions ? null : 'loadError',
  )
  const revision = useRef(0)
  useEffect(() => {
    if (!permissions) {
      return undefined
    }
    let active = true
    const refresh = async () => {
      const version = ++revision.current
      try {
        const [value, allowed] = await Promise.all([
          readLinkCaptureSettings(),
          permissions.contains(access),
        ])
        if (active && version === revision.current) {
          setSettings(value)
          setGranted(allowed)
          setLoaded(true)
          setError(null)
        }
      } catch {
        if (active && version === revision.current) {
          setLoaded(false)
          setError('loadError')
        }
      }
    }
    const refreshPermissions = () => {
      void refresh()
    }
    const changed = (changes: Record<string, unknown>, area: string) => {
      if (
        area === 'local' &&
        Object.hasOwn(changes, LINK_CAPTURE_SETTINGS_KEY)
      ) {
        void refresh()
      }
    }
    const storage = getChromeStorageOnChanged()
    permissions.onAdded.addListener(refreshPermissions)
    permissions.onRemoved.addListener(refreshPermissions)
    storage?.addListener(changed)
    void refresh()
    return () => {
      active = false
      permissions.onAdded.removeListener(refreshPermissions)
      permissions.onRemoved.removeListener(refreshPermissions)
      storage?.removeListener(changed)
    }
  }, [permissions])
  const save = useCallback(async (next: LinkCaptureSettings) => {
    const version = ++revision.current
    setPending(true)
    setError(null)
    try {
      const value = await writeLinkCaptureSettings(next)
      if (version === revision.current) {
        setSettings(value)
      }
      return true
    } catch {
      setError('storageError')
      return false
    } finally {
      setPending(false)
    }
  }, [])
  const toggle = useCallback(
    async (enabled: boolean) => {
      if (!permissions) {
        return
      }
      setPending(true)
      setError(null)
      try {
        if (enabled) {
          // This must be the first awaited browser call in the user's click.
          const allowed = await permissions.request(access)
          if (!allowed || !(await permissions.contains(access))) {
            setGranted(false)
            setError('permissionError')
            return
          }
          setGranted(true)
        }
        await save({ ...settings, enabled })
      } catch {
        setError('permissionError')
      } finally {
        setPending(false)
      }
    },
    [permissions, save, settings],
  )
  return {
    settings,
    enabled: settings.enabled && granted,
    disabled: !permissions || !loaded || pending,
    error,
    toggle,
    save,
  }
}
