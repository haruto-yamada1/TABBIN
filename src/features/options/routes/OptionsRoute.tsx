import { Plus, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'

import { ModeToggle } from '@/components/mode-toggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Toaster } from '@/components/ui/sonner'
import { clickBehaviorOptions } from '@/constants/clickBehaviorOptions'
import { colorOptions } from '@/constants/colorOptions'
import { getDefaultColor } from '@/constants/defaultColors'
import {
  DEFAULT_FONT_SIZE_PERCENT,
  FONT_SIZE_PERCENT_STEP,
  MAX_FONT_SIZE_PERCENT,
  MIN_FONT_SIZE_PERCENT,
  normalizeFontSizePercent,
} from '@/constants/fontSize'
import { LanguageSelect } from '@/features/i18n/components/LanguageSelect'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { useColorSettings } from '@/features/options/hooks/useColorSettings'
import { useSettings } from '@/features/options/hooks/useSettings'
import { ImportExportSettings } from '@/features/options/ImportExportSettings'
import type { UserSettings } from '@/types/storage'

import { resetFontSizeInputState } from './optionsRoute.helpers'

const createThemeColorChangeHandler =
  (
    key: keyof NonNullable<UserSettings['colors']>,
    handleColorChange: (
      key: keyof NonNullable<UserSettings['colors']>,
      value: string,
    ) => void,
  ) =>
  (event: React.ChangeEvent<HTMLInputElement>) => {
    handleColorChange(key, event.target.value)
  }

const FONT_SIZE_PERCENT_DIVISOR = 100

const applyFontSizePreview = (value: number) => {
  document.documentElement.style.setProperty(
    '--app-font-scale',
    String(normalizeFontSizePercent(value) / FONT_SIZE_PERCENT_DIVISOR),
  )
}

interface ClickBehaviorSelectProps {
  value: string
  onValueChange: (value: string) => void
}

const ClickBehaviorSelect: React.FC<ClickBehaviorSelectProps> = ({
  value,
  onValueChange,
}) => {
  const { t } = useI18n()

  return (
    <div className='mb-6'>
      <Label
        htmlFor='click-behavior'
        className='mb-2 block font-medium text-foreground'
      >
        {t('options.clickBehaviorLabel')}
      </Label>
      <div className='gap-y-2'>
        <Select value={value} onValueChange={onValueChange}>
          <SelectTrigger
            id='click-behavior'
            className='w-full cursor-pointer bg-background'
          >
            <SelectValue placeholder={t('options.clickBehaviorPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {clickBehaviorOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(option.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

interface ExcludePatternBadgeProps {
  pattern: string
  onRemove: (pattern: string) => void
}

const ExcludePatternBadge: React.FC<ExcludePatternBadgeProps> = ({
  pattern,
  onRemove,
}) => {
  const { t } = useI18n()
  const handleRemove = useCallback(() => {
    onRemove(pattern)
  }, [onRemove, pattern])

  return (
    <Badge
      variant='outline'
      className='flex max-w-full items-center gap-1 pr-1'
    >
      <span className='max-w-[240px] truncate' title={pattern}>
        {pattern}
      </span>
      <Button
        type='button'
        variant='ghost'
        size='icon-sm'
        className='size-5 rounded-full'
        onClick={handleRemove}
        aria-label={t('options.excludePatterns.removeAria', undefined, {
          pattern,
        })}
      >
        <X size={12} />
      </Button>
    </Badge>
  )
}

interface ColorPickerRowProps {
  colorKey: keyof NonNullable<UserSettings['colors']>
  color: string
  label: string
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
}

const ColorPickerRow: React.FC<ColorPickerRowProps> = ({
  colorKey,
  color,
  label,
  onChange,
}) => {
  const { t } = useI18n()

  return (
    <div className='flex flex-col'>
      <Label
        htmlFor={`${colorKey}-picker`}
        className='mb-2 block break-all whitespace-normal text-foreground'
      >
        {label}
      </Label>
      <div className='flex items-center gap-x-4'>
        <input
          aria-label={label}
          id={`${colorKey}-picker`}
          type='color'
          value={color}
          onChange={onChange}
          className='size-8 shrink-0 cursor-pointer border-0 p-0'
        />
        <div className='min-w-0 flex-1'>
          <Input
            id={`${colorKey}-hex`}
            type='text'
            value={color}
            onChange={onChange}
            className='w-full bg-background text-foreground'
            placeholder={t('options.color.hexPlaceholder')}
          />
        </div>
      </div>
    </div>
  )
}

interface FontSizeInputColumnProps {
  value: string
  onValueChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  onBlur: () => void
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
}

const FontSizeInputColumn: React.FC<FontSizeInputColumnProps> = ({
  value,
  onValueChange,
  onBlur,
  onKeyDown,
}) => {
  const { t } = useI18n()

  return (
    <div>
      <Label htmlFor='font-size-percent' className='mb-2 block text-foreground'>
        {t('options.fontSize.inputLabel')}
      </Label>
      <div className='flex items-center gap-2'>
        <Input
          id='font-size-percent'
          type='number'
          inputMode='numeric'
          min={MIN_FONT_SIZE_PERCENT}
          max={MAX_FONT_SIZE_PERCENT}
          step={FONT_SIZE_PERCENT_STEP}
          value={value}
          onChange={onValueChange}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          className='bg-background text-foreground'
        />
        <span className='text-sm text-muted-foreground'>%</span>
      </div>
    </div>
  )
}

interface ExcludePatternInputRowProps {
  excludePatternInput: string
  onInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  onBlur: () => void
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
  onAdd: () => void
}

const ExcludePatternInputRow: React.FC<ExcludePatternInputRowProps> = ({
  excludePatternInput,
  onInputChange,
  onBlur,
  onKeyDown,
  onAdd,
}) => {
  const { t } = useI18n()

  return (
    <div className='flex gap-2'>
      <Input
        id='excludePatterns'
        value={excludePatternInput}
        onChange={onInputChange}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className='bg-background text-foreground'
        placeholder={t('options.excludePatterns.placeholder')}
      />
      <Button
        type='button'
        onClick={onAdd}
        variant='secondary'
        aria-label={t('options.excludePatterns.add')}
      >
        <Plus size={16} />
        {t('options.excludePatterns.add')}
      </Button>
    </div>
  )
}

// eslint-disable-next-line eslint/max-lines-per-function -- JSX heavy settings page
const useOptionsRouteView = () => {
  const { t } = useI18n()
  const {
    addExcludePattern,
    excludePatternInput,
    handleExcludePatternInputChange,
    settings,
    setSettings,
    isLoading,
    removeExcludePattern,
    updateSetting,
  } = useSettings()

  const { handleColorChange, handleResetColors } = useColorSettings(
    settings,
    setSettings,
  )
  const fontSizePercent = normalizeFontSizePercent(settings.fontSizePercent)
  const [fontSizeValues, setFontSizeValues] = useState({
    fontSizeInputValue: String(fontSizePercent),
    fontSizeSliderValue: String(fontSizePercent),
  })
  const { fontSizeInputValue, fontSizeSliderValue } = fontSizeValues

  useEffect(() => {
    const nextFontSizeValue = String(fontSizePercent)
    setFontSizeValues({
      fontSizeInputValue: nextFontSizeValue,
      fontSizeSliderValue: nextFontSizeValue,
    })
  }, [fontSizePercent])

  const updateFontSizePercent = useCallback(
    async (value: number) => {
      const normalizedValue = normalizeFontSizePercent(value)
      setFontSizeValues((prev) => ({
        ...prev,
        fontSizeInputValue: String(normalizedValue),
      }))
      applyFontSizePreview(normalizedValue)
      await updateSetting('fontSizePercent', normalizedValue)
    },
    [updateSetting],
  )

  const handleFontSizeSliderChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setFontSizeValues({
        fontSizeInputValue: event.target.value,
        fontSizeSliderValue: event.target.value,
      })
    },
    [],
  )

  const commitFontSizeSliderValue = useCallback(async () => {
    await updateFontSizePercent(Number(fontSizeSliderValue))
  }, [fontSizeSliderValue, updateFontSizePercent])

  const handleFontSizeInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setFontSizeValues((prev) => ({
        ...prev,
        fontSizeInputValue: event.target.value,
      }))
    },
    [],
  )

  const commitFontSizeInputValue = useCallback(async () => {
    const trimmedValue = fontSizeInputValue.trim()
    if (!trimmedValue) {
      resetFontSizeInputState(setFontSizeValues, fontSizePercent)
      return
    }

    const nextValue = Number(trimmedValue)
    await updateFontSizePercent(nextValue)
  }, [fontSizeInputValue, fontSizePercent, updateFontSizePercent])

  const handleResetFontSize = useCallback(async () => {
    await updateFontSizePercent(DEFAULT_FONT_SIZE_PERCENT)
  }, [updateFontSizePercent])

  const handleClickBehaviorChange = useCallback(
    async (value: string) => {
      await updateSetting(
        'clickBehavior',
        z
          .enum([
            'saveCurrentTab',
            'saveWindowTabs',
            'saveSameDomainTabs',
            'saveAllWindowsTabs',
          ])
          .parse(value),
      )
    },
    [updateSetting],
  )

  const handleToggleRemoveAfterOpen = useCallback(
    async (checked: boolean) => {
      await updateSetting('removeTabAfterOpen', checked)
    },
    [updateSetting],
  )

  const handleToggleRemoveAfterExternalDrop = useCallback(
    async (checked: boolean) => {
      await updateSetting('removeTabAfterExternalDrop', checked)
    },
    [updateSetting],
  )

  const handleToggleExcludePinnedTabs = useCallback(
    async (checked: boolean) => {
      await updateSetting('excludePinnedTabs', checked)
    },
    [updateSetting],
  )

  const handleToggleShowSavedTime = useCallback(
    async (checked: boolean) => {
      await updateSetting('showSavedTime', checked)
    },
    [updateSetting],
  )

  const handleToggleOpenUrlInBackground = useCallback(
    async (checked: boolean) => {
      await updateSetting('openUrlInBackground', checked)
    },
    [updateSetting],
  )

  const handleToggleOpenAllInNewWindow = useCallback(
    async (checked: boolean) => {
      await updateSetting('openAllInNewWindow', checked)
    },
    [updateSetting],
  )

  const handleToggleConfirmDeleteEach = useCallback(
    async (checked: boolean) => {
      await updateSetting('confirmDeleteEach', checked)
    },
    [updateSetting],
  )

  const handleToggleConfirmDeleteAll = useCallback(
    async (checked: boolean) => {
      await updateSetting('confirmDeleteAll', checked)
    },
    [updateSetting],
  )

  const handleExcludePatternKeyDown = useCallback(
    async (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') {
        return
      }

      event.preventDefault()
      await addExcludePattern()
    },
    [addExcludePattern],
  )

  const handleBlurExcludePattern = useCallback(() => {
    void addExcludePattern()
  }, [addExcludePattern])

  const handleClickAddExcludePattern = useCallback(() => {
    void addExcludePattern()
  }, [addExcludePattern])

  const handleCommitFontSizeSlider = useCallback(() => {
    void commitFontSizeSliderValue()
  }, [commitFontSizeSliderValue])

  const handleKeyUpFontSizeSlider = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (
        ![
          'ArrowLeft',
          'ArrowRight',
          'ArrowUp',
          'ArrowDown',
          'Home',
          'End',
          'PageUp',
          'PageDown',
        ].includes(event.key)
      ) {
        return
      }

      void commitFontSizeSliderValue()
    },
    [commitFontSizeSliderValue],
  )

  const handleBlurFontSizeInput = useCallback(() => {
    void commitFontSizeInputValue()
  }, [commitFontSizeInputValue])

  const handleKeyDownFontSizeInput = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') {
        return
      }

      event.preventDefault()
      void commitFontSizeInputValue()
    },
    [commitFontSizeInputValue],
  )

  const handleClickContact = useCallback(() => {
    window.open(
      'https://forms.gle/c9gBiF2TmgXaeU7J6',
      '_blank',
      'noopener,noreferrer',
    )
  }, [])

  const handleClickReleaseNotes = useCallback(() => {
    window.open(
      chrome.runtime.getURL('changelog.html'),
      '_blank',
      'noopener,noreferrer',
    )
  }, [])

  if (isLoading) {
    return <LoadingState minHeightClassName='min-h-[300px]' />
  }
  const activeExcludePatterns = settings.excludePatterns.filter((pattern) =>
    pattern.trim(),
  )

  return (
    <div className='flex h-screen items-stretch overflow-hidden p-4'>
      <div className='min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain'>
        <Toaster position='top-right' />

        <header className='mb-8 flex items-center justify-between gap-4'>
          <h1 className='text-3xl font-semibold text-foreground'>
            {t('options.title')}
          </h1>
          <div className='flex items-end gap-3'>
            <LanguageSelect className='w-44' />
            <ModeToggle />
          </div>
        </header>

        <div className='mb-8 rounded-lg border border-border bg-card p-6 shadow-md'>
          <h2 className='mb-4 text-xl font-semibold text-foreground'>
            {t('options.backupRestore')}
          </h2>
          <ImportExportSettings />
        </div>

        <div className='mb-8 rounded-lg border border-border bg-card p-6 shadow-md'>
          <h2 className='mb-4 text-xl font-semibold text-foreground'>
            {t('options.behaviorSettings')}
          </h2>

          <ClickBehaviorSelect
            value={settings.clickBehavior || 'saveWindowTabs'}
            // eslint-disable-next-line typescript/no-misused-promises
            onValueChange={handleClickBehaviorChange}
          />

          <div className='mb-4 flex items-center gap-x-2'>
            <Checkbox
              id='remove-after-open'
              checked={settings.removeTabAfterOpen}
              // eslint-disable-next-line typescript/no-misused-promises
              onCheckedChange={handleToggleRemoveAfterOpen}
              className='cursor-pointer'
            />
            <Label
              htmlFor='remove-after-open'
              className='cursor-pointer text-foreground'
            >
              {t('options.autoDelete.openAfter')}
            </Label>
          </div>
          <p className='mt-1 ml-7 text-sm text-muted-foreground'>
            {t('options.autoDelete.openAfterDescription')}
          </p>

          <div className='mt-6 mb-4 flex items-center gap-x-2'>
            <Checkbox
              id='remove-after-external-drop'
              checked={settings.removeTabAfterExternalDrop}
              // eslint-disable-next-line typescript/no-misused-promises
              onCheckedChange={handleToggleRemoveAfterExternalDrop}
              className='cursor-pointer'
            />
            <Label
              htmlFor='remove-after-external-drop'
              className='cursor-pointer text-foreground'
            >
              {t('options.autoDelete.externalDrop')}
            </Label>
          </div>
          <p className='mt-1 ml-7 text-sm text-muted-foreground'>
            {t('options.autoDelete.externalDropDescription')}
          </p>

          <div className='mt-6 mb-4 flex items-center gap-x-2'>
            <Checkbox
              id='exclude-pinned-tabs'
              checked={settings.excludePinnedTabs}
              // eslint-disable-next-line typescript/no-misused-promises
              onCheckedChange={handleToggleExcludePinnedTabs}
              className='cursor-pointer'
            />
            <Label
              htmlFor='exclude-pinned-tabs'
              className='cursor-pointer text-foreground'
            >
              {t('options.autoDelete.excludePinned')}
            </Label>
          </div>
          <p className='mt-1 ml-7 text-sm text-muted-foreground'>
            {t('options.autoDelete.excludePinnedDescription')}
          </p>

          <div className='mt-6 mb-4 flex items-center gap-x-2'>
            <Checkbox
              id='open-url-in-blank'
              checked={settings.openUrlInBackground}
              // eslint-disable-next-line typescript/no-misused-promises
              onCheckedChange={handleToggleOpenUrlInBackground}
              className='cursor-pointer'
            />
            <Label
              htmlFor='open-url-in-blank'
              className='cursor-pointer text-foreground'
            >
              {t('options.autoDelete.background')}
            </Label>
          </div>
          <p className='mt-1 ml-7 text-sm text-muted-foreground'>
            {t('options.autoDelete.saveInBackgroundDescription')}
          </p>

          <div className='mt-6 mb-4 flex items-center gap-x-2'>
            <Checkbox
              id='open-all-in-new-window'
              checked={settings.openAllInNewWindow}
              // eslint-disable-next-line typescript/no-misused-promises
              onCheckedChange={handleToggleOpenAllInNewWindow}
              className='cursor-pointer'
            />
            <Label
              htmlFor='open-all-in-new-window'
              className='cursor-pointer text-foreground'
            >
              {t('options.autoDelete.allWindows')}
            </Label>
          </div>
          <p className='mt-1 ml-7 text-sm text-muted-foreground'>
            {t('options.autoDelete.allWindowsDescription')}
          </p>

          <div className='mt-6 mb-4 flex items-center gap-x-2'>
            <Checkbox
              id='show-saved-time'
              checked={settings.showSavedTime}
              // eslint-disable-next-line typescript/no-misused-promises
              onCheckedChange={handleToggleShowSavedTime}
              className='cursor-pointer'
            />
            <Label
              htmlFor='show-saved-time'
              className='cursor-pointer text-foreground'
            >
              {t('options.autoDelete.savedTime')}
            </Label>
          </div>
          <p className='mt-1 ml-7 text-sm text-muted-foreground'>
            {t('options.autoDelete.savedTimeDescription')}
          </p>

          <div className='mt-6 mb-4 flex items-center gap-x-2'>
            <Checkbox
              id='confirm-delete-each'
              checked={settings.confirmDeleteEach}
              // eslint-disable-next-line typescript/no-misused-promises
              onCheckedChange={handleToggleConfirmDeleteEach}
              className='cursor-pointer'
            />
            <Label
              htmlFor='confirm-delete-each'
              className='cursor-pointer text-foreground'
            >
              {t('options.autoDelete.confirmDeleteEach')}
            </Label>
          </div>
          <p className='mt-1 ml-7 text-sm text-muted-foreground'>
            {t('options.autoDelete.confirmDeleteEachDescription')}
          </p>

          <div className='mt-6 mb-4 flex items-center gap-x-2'>
            <Checkbox
              id='confirm-delete-all'
              checked={settings.confirmDeleteAll}
              // eslint-disable-next-line typescript/no-misused-promises
              onCheckedChange={handleToggleConfirmDeleteAll}
              className='cursor-pointer'
            />
            <Label
              htmlFor='confirm-delete-all'
              className='cursor-pointer text-foreground'
            >
              {t('options.autoDelete.confirmDeleteAll')}
            </Label>
          </div>
          <p className='mt-1 ml-7 text-sm text-muted-foreground'>
            {t('options.autoDelete.confirmDeleteAllDescription')}
          </p>
        </div>

        <div className='mb-8 rounded-lg border border-border bg-card p-6 shadow-md'>
          <h2 className='mb-4 text-xl font-semibold text-foreground'>
            {t('options.excludePatterns.title')}
          </h2>
          <div className='mb-4'>
            <Label
              htmlFor='excludePatterns'
              className='mb-2 block text-foreground'
            >
              {t('options.excludePatterns.label')}
            </Label>
            <ExcludePatternInputRow
              excludePatternInput={excludePatternInput}
              onInputChange={handleExcludePatternInputChange}
              onBlur={handleBlurExcludePattern}
              // eslint-disable-next-line typescript/no-misused-promises
              onKeyDown={handleExcludePatternKeyDown}
              onAdd={handleClickAddExcludePattern}
            />
            <div className='mt-3 flex flex-wrap gap-2 rounded-md border border-border bg-background/40 p-3'>
              {activeExcludePatterns.length === 0 ? (
                <p className='text-sm text-muted-foreground'>
                  {t('options.excludePatterns.empty')}
                </p>
              ) : (
                activeExcludePatterns.map((pattern) => (
                  <ExcludePatternBadge
                    key={pattern}
                    pattern={pattern}
                    // eslint-disable-next-line typescript/no-misused-promises
                    onRemove={removeExcludePattern}
                  />
                ))
              )}
            </div>
            <p className='mt-1 text-sm text-muted-foreground'>
              {t('options.excludePatterns.help')}
            </p>
          </div>
        </div>

        <div className='mb-8 rounded-lg border border-border bg-card p-6 shadow-md'>
          <div className='mb-4 flex items-center justify-between gap-4'>
            <div>
              <h2 className='text-xl font-semibold text-foreground'>
                {t('options.previewFontSizeCustomization')}
              </h2>
              <p className='mt-1 text-sm text-muted-foreground'>
                {t('options.fontSize.description')}
              </p>
            </div>
            <Button
              variant='outline'
              size='sm'
              // eslint-disable-next-line typescript/no-misused-promises
              onClick={handleResetFontSize}
              className='flex cursor-pointer items-center gap-1'
            >
              <RotateCcw size={16} />
              {t('common.reset')}
            </Button>
          </div>

          <div className='grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_200px]'>
            <div>
              <Label
                htmlFor='font-size-range'
                className='mb-2 block text-foreground'
              >
                {t('options.fontSize.rangeLabel')}
              </Label>
              <input
                id='font-size-range'
                aria-label={t('options.fontSize.rangeLabel')}
                type='range'
                min={MIN_FONT_SIZE_PERCENT}
                max={MAX_FONT_SIZE_PERCENT}
                step={FONT_SIZE_PERCENT_STEP}
                value={fontSizeSliderValue}
                onChange={handleFontSizeSliderChange}
                onMouseUp={handleCommitFontSizeSlider}
                onTouchEnd={handleCommitFontSizeSlider}
                onBlur={handleCommitFontSizeSlider}
                onKeyUp={handleKeyUpFontSizeSlider}
                className='h-9 w-full cursor-pointer accent-primary'
              />
            </div>

            <FontSizeInputColumn
              value={fontSizeInputValue}
              onValueChange={handleFontSizeInputChange}
              onBlur={handleBlurFontSizeInput}
              onKeyDown={handleKeyDownFontSizeInput}
            />
          </div>
        </div>

        <div className='mb-8 rounded-lg border border-border bg-card p-6 shadow-md'>
          <div className='mb-4 flex items-center justify-between'>
            <h2 className='text-xl font-semibold text-foreground'>
              {t('options.previewColorCustomization')}
            </h2>
            <Button
              variant='outline'
              size='sm'
              // eslint-disable-next-line typescript/no-misused-promises
              onClick={handleResetColors}
              className='flex cursor-pointer items-center gap-1'
            >
              <RotateCcw size={16} />
              {t('common.reset')}
            </Button>
          </div>
          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            {colorOptions.map(({ key, labelKey }) => {
              const changeHandler = createThemeColorChangeHandler(
                key,
                // eslint-disable-next-line typescript/no-misused-promises
                handleColorChange,
              )

              return (
                <ColorPickerRow
                  key={key}
                  colorKey={key}
                  // `||` needed: color could be empty string
                  // eslint-disable-next-line typescript/prefer-nullish-coalescing
                  color={settings.colors?.[key] || getDefaultColor(key)}
                  label={t(labelKey)}
                  onChange={changeHandler}
                />
              )
            })}
          </div>
        </div>

        <div className='mt-4'>
          <Button
            type='button'
            onClick={handleClickContact}
            className='w-full cursor-pointer'
          >
            {t('options.contact')}
          </Button>
        </div>
        <p className='mt-2 text-sm text-muted-foreground'>
          {t('options.contactDescription')}
        </p>

        <div className='mt-8 mb-10 text-center'>
          <Button
            type='button'
            className='w-full cursor-pointer'
            onClick={handleClickReleaseNotes}
          >
            {t('options.releaseNotes')}
          </Button>
        </div>
      </div>
    </div>
  )
}

const OptionsRoute = () => useOptionsRouteView()

export { OptionsRoute, OptionsRoute as OptionsPage }
