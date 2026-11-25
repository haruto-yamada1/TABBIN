import { useCallback } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import {
  formatLinkCaptureShortcut,
  validateLinkCaptureShortcut,
  validateLinkClickShortcut,
} from '@/lib/link-capture/shortcut'
import { DEFAULT_LINK_CAPTURE_SETTINGS } from '@/lib/storage/link-capture-settings'

import { useLinkCaptureRecorder } from './useLinkCaptureRecorder'
import { useLinkCaptureSetting } from './useLinkCaptureSetting'

export const LinkCaptureSettings = ({
  mode = 'rectangle',
}: {
  mode?: 'rectangle' | 'click'
}) => {
  const clickMode = mode === 'click'
  const id = clickMode ? 'link-click-capture' : 'link-capture'
  const { t } = useI18n()
  const setting = useLinkCaptureSetting(mode)
  const recorder = useLinkCaptureRecorder(
    clickMode ? validateLinkClickShortcut : validateLinkCaptureShortcut,
  )
  const error = recorder.error ?? setting.error
  const label = (key: string) =>
    t(
      `options.${clickMode && ['title', 'enable', 'instructions', 'reserved'].includes(key) ? 'linkClickCapture' : 'linkCapture'}.${key}`,
    )
  const saveCandidate = useCallback(async () => {
    if (
      recorder.candidate &&
      (await setting.save({
        ...setting.settings,
        shortcut: recorder.candidate,
      }))
    ) {
      recorder.clear()
    }
  }, [recorder, setting])
  const reset = useCallback(async () => {
    if (
      await setting.save({
        ...setting.settings,
        shortcut: clickMode
          ? DEFAULT_LINK_CAPTURE_SETTINGS.clickShortcut
          : DEFAULT_LINK_CAPTURE_SETTINGS.shortcut,
      })
    ) {
      recorder.cancel()
    }
  }, [clickMode, recorder, setting])
  const handleCheckedChange = useCallback(
    (checked: boolean | 'indeterminate') => {
      void setting.toggle(checked === true)
    },
    [setting],
  )
  const handleSaveCandidate = useCallback(() => {
    void saveCandidate()
  }, [saveCandidate])
  const handleReset = useCallback(() => {
    void reset()
  }, [reset])
  const handleStart = recorder.start
  const handleCancel = recorder.cancel
  return (
    <section
      aria-labelledby={`${id}-title`}
      className='mb-8 rounded-lg border border-border bg-card p-6 shadow-md'
    >
      <h2
        id={`${id}-title`}
        className='mb-4 text-xl font-semibold text-foreground'
      >
        {label('title')}
      </h2>
      <div className='flex items-center gap-x-2'>
        <Checkbox
          id={`${id}-enabled`}
          checked={setting.enabled}
          disabled={setting.disabled || recorder.recording}
          aria-describedby={`${id}-description`}
          onCheckedChange={handleCheckedChange}
        />
        <Label htmlFor={`${id}-enabled`}>{label('enable')}</Label>
      </div>
      <p
        id={`${id}-description`}
        className='mt-2 text-sm text-muted-foreground'
      >
        {label('description')}
      </p>
      <p className='mt-2 text-sm text-muted-foreground'>
        {label('instructions')}
      </p>
      <p className='mt-2 text-sm text-muted-foreground'>{label('physical')}</p>
      <output
        aria-live='polite'
        className='my-3 block rounded border border-border px-3 py-2 font-mono text-sm text-foreground'
      >
        {formatLinkCaptureShortcut(recorder.candidate ?? setting.shortcut)}
      </output>
      {recorder.recording && (
        <output className='mb-3 block text-sm text-muted-foreground'>
          {label('recording')}
        </output>
      )}
      <div className='flex flex-wrap gap-2'>
        <Button
          type='button'
          variant='outline'
          disabled={setting.disabled || recorder.recording}
          onClick={handleStart}
        >
          {label('change')}
        </Button>
        {recorder.candidate && (
          <Button
            type='button'
            disabled={setting.disabled}
            onClick={handleSaveCandidate}
          >
            {label('save')}
          </Button>
        )}
        {(recorder.recording || recorder.candidate) && (
          <Button type='button' variant='outline' onClick={handleCancel}>
            {label('cancel')}
          </Button>
        )}
        <Button
          type='button'
          variant='outline'
          disabled={setting.disabled || recorder.recording}
          onClick={handleReset}
        >
          {label('reset')}
        </Button>
      </div>
      {error && (
        <p role='alert' className='mt-2 text-sm text-destructive'>
          {label(error)}
        </p>
      )}
    </section>
  )
}
