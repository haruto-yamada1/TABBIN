import { useCallback, useEffect, useMemo, useState } from 'react'

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  SAVED_TAB_TITLE_ENABLED_KEY,
  SAVED_TAB_TITLE_ORIGINS,
} from '@/constants/savedTabTitleIndicator'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { getChromeStorageOnChanged } from '@/lib/browser/chrome-storage'
import { getSavedTabTitlePermissions } from '@/lib/browser/saved-tab-title-permissions'
import type { SavedTabTitlePermissions } from '@/lib/browser/saved-tab-title-permissions'
import {
  readSavedTabTitleEnabled,
  setSavedTabTitleEnabled,
} from '@/lib/storage/saved-tab-title-indicator'

const requestedAccess = {
  permissions: ['scripting' as const],
  origins: [...SAVED_TAB_TITLE_ORIGINS],
}

const requestTitleAccess = async (
  permissions: SavedTabTitlePermissions,
): Promise<boolean> => {
  try {
    // Keep request() in the click's user gesture, before any awaited read.
    const granted = await permissions.request(requestedAccess)
    return granted && (await permissions.contains(requestedAccess))
  } catch {
    return false
  }
}

const useSavedTabTitleSetting = () => {
  const permissions = useMemo(() => getSavedTabTitlePermissions(), [])
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [errorKey, setErrorKey] = useState<string | null>(
    permissions ? null : 'options.savedTabTitle.loadError',
  )

  useEffect(() => {
    if (!permissions) {
      return undefined
    }
    let active = true
    let refreshVersion = 0
    const refresh = async () => {
      const version = ++refreshVersion
      try {
        const [preference, granted] = await Promise.all([
          readSavedTabTitleEnabled(),
          permissions.contains(requestedAccess),
        ])
        if (active && version === refreshVersion) {
          setEnabled(preference && granted)
          setLoading(false)
        }
      } catch {
        if (active && version === refreshVersion) {
          setEnabled(false)
          setLoading(false)
          setErrorKey('options.savedTabTitle.loadError')
        }
      }
    }
    const onPermissionChanged = () => {
      void refresh()
    }
    const onStorageChanged = (
      changes: Record<string, unknown>,
      areaName: string,
    ) => {
      if (areaName === 'local' && SAVED_TAB_TITLE_ENABLED_KEY in changes) {
        void refresh()
      }
    }
    void refresh()
    permissions.onAdded.addListener(onPermissionChanged)
    permissions.onRemoved.addListener(onPermissionChanged)
    const storageChanges = getChromeStorageOnChanged()
    storageChanges?.addListener(onStorageChanged)
    return () => {
      active = false
      permissions.onAdded.removeListener(onPermissionChanged)
      permissions.onRemoved.removeListener(onPermissionChanged)
      storageChanges?.removeListener(onStorageChanged)
    }
  }, [permissions])

  const changeEnabled = useCallback(
    async (nextEnabled: boolean) => {
      if (!permissions) {
        return
      }
      setPending(true)
      setErrorKey(null)
      try {
        if (nextEnabled && !(await requestTitleAccess(permissions))) {
          setErrorKey('options.savedTabTitle.permissionError')
          return
        }
        setEnabled(await setSavedTabTitleEnabled(nextEnabled))
      } catch {
        setErrorKey('options.savedTabTitle.storageError')
      } finally {
        setPending(false)
      }
    },
    [permissions],
  )
  return {
    enabled,
    disabled: !permissions || loading || pending,
    errorKey,
    changeEnabled,
  }
}

export const SavedTabTitleSettings = () => {
  const { t } = useI18n()
  const { enabled, disabled, errorKey, changeEnabled } =
    useSavedTabTitleSetting()
  const handleCheckedChange = useCallback(
    (checked: boolean | 'indeterminate') => {
      void changeEnabled(checked === true)
    },
    [changeEnabled],
  )
  return (
    <section className='mb-8 rounded-lg border border-border bg-card p-6 shadow-md'>
      <h2 className='mb-4 text-xl font-semibold text-foreground'>
        {t('options.savedTabTitle.title')}
      </h2>
      <div className='flex items-center gap-x-2'>
        <Checkbox
          id='saved-tab-title-indicator'
          checked={enabled}
          disabled={disabled}
          aria-describedby='saved-tab-title-description'
          onCheckedChange={handleCheckedChange}
        />
        <Label htmlFor='saved-tab-title-indicator'>
          {t('options.savedTabTitle.enable')}
        </Label>
      </div>
      <p
        id='saved-tab-title-description'
        className='mt-2 text-sm text-muted-foreground'
      >
        {t('options.savedTabTitle.description')}
      </p>
      {errorKey && (
        <p role='alert' className='mt-2 text-sm text-destructive'>
          {t(errorKey)}
        </p>
      )}
    </section>
  )
}
