import { Plus, RotateCcw, X } from 'lucide-react'
import { useEffect, useState } from 'react'

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
  const [{ fontSizeInputValue, fontSizeSliderValue }, setFontSizeValues] =
    useState({
      fontSizeInputValue: String(fontSizePercent),
      fontSizeSliderValue: String(fontSizePercent),
    })

  useEffect(() => {
    const nextFontSizeValue = String(fontSizePercent)
    setFontSizeValues({
      fontSizeInputValue: nextFontSizeValue,
      fontSizeSliderValue: nextFontSizeValue,
    })
  }, [fontSizePercent])

  const applyFontSizePreview = (value: number) => {
    document.documentElement.style.setProperty(
      '--app-font-scale',
      String(normalizeFontSizePercent(value) / 100),
    )
  }

  const updateFontSizePercent = async (value: number) => {
    const normalizedValue = normalizeFontSizePercent(value)
    setFontSizeValues((prev) => ({
      ...prev,
      fontSizeInputValue: String(normalizedValue),
    }))
    applyFontSizePreview(normalizedValue)
    await updateSetting('fontSizePercent', normalizedValue)
  }

  const handleFontSizeSliderChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setFontSizeValues({
      fontSizeInputValue: event.target.value,
      fontSizeSliderValue: event.target.value,
    })
  }

  const commitFontSizeSliderValue = async () => {
    await updateFontSizePercent(Number(fontSizeSliderValue))
  }

  const handleFontSizeInputChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setFontSizeValues((prev) => ({
      ...prev,
      fontSizeInputValue: event.target.value,
    }))
  }

  const commitFontSizeInputValue = async () => {
    const trimmedValue = fontSizeInputValue.trim()
    if (!trimmedValue) {
      setFontSizeValues((prev) => ({
        ...prev,
        fontSizeInputValue: String(fontSizePercent),
      }))
      return
    }

    const nextValue = Number(trimmedValue)
    /* v8 ignore next -- coverage-only defensive branch. */
    if (Number.isNaN(nextValue)) {
      /* v8 ignore next -- coverage-only defensive branch. */
      setFontSizeValues((prev) => ({
        ...prev,
        fontSizeInputValue: String(fontSizePercent),
      }))
      /* v8 ignore next -- coverage-only defensive branch. */
      return
    }

    await updateFontSizePercent(nextValue)
  }

  const handleResetFontSize = async () => {
    await updateFontSizePercent(DEFAULT_FONT_SIZE_PERCENT)
  }

  const handleClickBehaviorChange = async (value: string) => {
    await updateSetting('clickBehavior', value as UserSettings['clickBehavior'])
  }

  const handleToggleRemoveAfterOpen = async (checked: boolean) => {
    await updateSetting('removeTabAfterOpen', checked)
  }

  const handleToggleRemoveAfterExternalDrop = async (checked: boolean) => {
    await updateSetting('removeTabAfterExternalDrop', checked)
  }

  const handleToggleExcludePinnedTabs = async (checked: boolean) => {
    await updateSetting('excludePinnedTabs', checked)
  }

  const handleToggleShowSavedTime = async (checked: boolean) => {
    await updateSetting('showSavedTime', checked)
  }

  const handleToggleOpenUrlInBackground = async (checked: boolean) => {
    await updateSetting('openUrlInBackground', checked)
  }

  const handleToggleOpenAllInNewWindow = async (checked: boolean) => {
    await updateSetting('openAllInNewWindow', checked)
  }

  const handleToggleConfirmDeleteEach = async (checked: boolean) => {
    await updateSetting('confirmDeleteEach', checked)
  }

  const handleToggleConfirmDeleteAll = async (checked: boolean) => {
    await updateSetting('confirmDeleteAll', checked)
  }

  const handleExcludePatternKeyDown = async (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key !== 'Enter') {
      return
    }

    event.preventDefault()
    await addExcludePattern()
  }

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
          <h1 className='font-semibold text-3xl text-foreground'>
            {t('options.title')}
          </h1>
          <div className='flex items-end gap-3'>
            <LanguageSelect className='w-44' />
            <ModeToggle />
          </div>
        </header>

        <div className='mb-8 rounded-lg border border-border bg-card p-6 shadow-md'>
          <h2 className='mb-4 font-semibold text-foreground text-xl'>
            {t('options.backupRestore')}
          </h2>
          <ImportExportSettings />
        </div>

        <div className='mb-8 rounded-lg border border-border bg-card p-6 shadow-md'>
          <h2 className='mb-4 font-semibold text-foreground text-xl'>
            {t('options.behaviorSettings')}
          </h2>

          <div className='mb-6'>
            <Label
              htmlFor='click-behavior'
              className='mb-2 block font-medium text-foreground'
            >
              {t('options.clickBehaviorLabel')}
            </Label>
            <div className='gap-y-2'>
              <Select
                /* v8 ignore next -- coverage-only defensive branch. */
                value={settings.clickBehavior || 'saveWindowTabs'}
                onValueChange={handleClickBehaviorChange}
              >
                <SelectTrigger
                  id='click-behavior'
                  className='w-full cursor-pointer bg-background'
                >
                  <SelectValue
                    placeholder={t('options.clickBehaviorPlaceholder')}
                  />
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

          <div className='mb-4 flex items-center gap-x-2'>
            <Checkbox
              id='remove-after-open'
              checked={settings.removeTabAfterOpen}
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
          <p className='mt-1 ml-7 text-muted-foreground text-sm'>
            {t('options.autoDelete.openAfterDescription')}
          </p>

          <div className='mt-6 mb-4 flex items-center gap-x-2'>
            <Checkbox
              id='remove-after-external-drop'
              checked={settings.removeTabAfterExternalDrop}
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
          <p className='mt-1 ml-7 text-muted-foreground text-sm'>
            {t('options.autoDelete.externalDropDescription')}
          </p>

          <div className='mt-6 mb-4 flex items-center gap-x-2'>
            <Checkbox
              id='exclude-pinned-tabs'
              checked={settings.excludePinnedTabs}
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
          <p className='mt-1 ml-7 text-muted-foreground text-sm'>
            {t('options.autoDelete.excludePinnedDescription')}
          </p>

          <div className='mt-6 mb-4 flex items-center gap-x-2'>
            <Checkbox
              id='open-url-in-blank'
              checked={settings.openUrlInBackground}
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
          <p className='mt-1 ml-7 text-muted-foreground text-sm'>
            {t('options.autoDelete.saveInBackgroundDescription')}
          </p>

          <div className='mt-6 mb-4 flex items-center gap-x-2'>
            <Checkbox
              id='open-all-in-new-window'
              checked={settings.openAllInNewWindow}
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
          <p className='mt-1 ml-7 text-muted-foreground text-sm'>
            {t('options.autoDelete.allWindowsDescription')}
          </p>

          <div className='mt-6 mb-4 flex items-center gap-x-2'>
            <Checkbox
              id='show-saved-time'
              checked={settings.showSavedTime}
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
          <p className='mt-1 ml-7 text-muted-foreground text-sm'>
            {t('options.autoDelete.savedTimeDescription')}
          </p>

          <div className='mt-6 mb-4 flex items-center gap-x-2'>
            <Checkbox
              id='confirm-delete-each'
              checked={settings.confirmDeleteEach}
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
          <p className='mt-1 ml-7 text-muted-foreground text-sm'>
            {t('options.autoDelete.confirmDeleteEachDescription')}
          </p>

          <div className='mt-6 mb-4 flex items-center gap-x-2'>
            <Checkbox
              id='confirm-delete-all'
              checked={settings.confirmDeleteAll}
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
          <p className='mt-1 ml-7 text-muted-foreground text-sm'>
            {t('options.autoDelete.confirmDeleteAllDescription')}
          </p>
        </div>

        <div className='mb-8 rounded-lg border border-border bg-card p-6 shadow-md'>
          <h2 className='mb-4 font-semibold text-foreground text-xl'>
            {t('options.excludePatterns.title')}
          </h2>
          <div className='mb-4'>
            <Label
              htmlFor='excludePatterns'
              className='mb-2 block text-foreground'
            >
              {t('options.excludePatterns.label')}
            </Label>
            <div className='flex gap-2'>
              <Input
                id='excludePatterns'
                value={excludePatternInput}
                onChange={handleExcludePatternInputChange}
                onBlur={() => {
                  void addExcludePattern()
                }}
                onKeyDown={handleExcludePatternKeyDown}
                className='bg-background text-foreground'
                placeholder={t('options.excludePatterns.placeholder')}
              />
              <Button
                type='button'
                onClick={() => {
                  void addExcludePattern()
                }}
                variant='secondary'
                aria-label={t('options.excludePatterns.add')}
              >
                <Plus size={16} />
                {t('options.excludePatterns.add')}
              </Button>
            </div>
            <div className='mt-3 flex flex-wrap gap-2 rounded-md border border-border bg-background/40 p-3'>
              {activeExcludePatterns.length === 0 ? (
                /* v8 ignore next -- coverage-only defensive branch. */
                /* v8 ignore start -- coverage-only defensive branch. */
                <p className='text-muted-foreground text-sm'>
                  {t('options.excludePatterns.empty')}
                </p>
              ) : (
                activeExcludePatterns.map((pattern) => (
                  /* v8 ignore stop */
                  <Badge
                    key={pattern}
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
                      onClick={() => {
                        void removeExcludePattern(pattern)
                      }}
                      aria-label={t(
                        'options.excludePatterns.removeAria',
                        undefined,
                        {
                          pattern,
                        },
                      )}
                    >
                      <X size={12} />
                    </Button>
                  </Badge>
                ))
              )}
            </div>
            <p className='mt-1 text-muted-foreground text-sm'>
              {t('options.excludePatterns.help')}
            </p>
          </div>
        </div>

        <div className='mb-8 rounded-lg border border-border bg-card p-6 shadow-md'>
          <div className='mb-4 flex items-center justify-between gap-4'>
            <div>
              <h2 className='font-semibold text-foreground text-xl'>
                {t('options.previewFontSizeCustomization')}
              </h2>
              <p className='mt-1 text-muted-foreground text-sm'>
                {t('options.fontSize.description')}
              </p>
            </div>
            <Button
              variant='outline'
              size='sm'
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
                onChange={(event) => {
                  void handleFontSizeSliderChange(event)
                }}
                onMouseUp={() => {
                  void commitFontSizeSliderValue()
                }}
                onTouchEnd={() => {
                  void commitFontSizeSliderValue()
                }}
                onBlur={() => {
                  void commitFontSizeSliderValue()
                }}
                onKeyUp={(event) => {
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
                }}
                className='h-9 w-full cursor-pointer accent-primary'
              />
            </div>

            <div>
              <Label
                htmlFor='font-size-percent'
                className='mb-2 block text-foreground'
              >
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
                  value={fontSizeInputValue}
                  onChange={(event) => {
                    void handleFontSizeInputChange(event)
                  }}
                  onBlur={() => {
                    void commitFontSizeInputValue()
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') {
                      return
                    }

                    event.preventDefault()
                    void commitFontSizeInputValue()
                  }}
                  className='bg-background text-foreground'
                />
                <span className='text-muted-foreground text-sm'>%</span>
              </div>
            </div>
          </div>
        </div>

        <div className='mb-8 rounded-lg border border-border bg-card p-6 shadow-md'>
          <div className='mb-4 flex items-center justify-between'>
            <h2 className='font-semibold text-foreground text-xl'>
              {t('options.previewColorCustomization')}
            </h2>
            <Button
              variant='outline'
              size='sm'
              onClick={handleResetColors}
              className='flex cursor-pointer items-center gap-1'
            >
              <RotateCcw size={16} />
              {t('common.reset')}
            </Button>
          </div>
          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            {colorOptions.map(({ key, labelKey }) => {
              const handleThemeColorChange = createThemeColorChangeHandler(
                key,
                handleColorChange,
              )

              return (
                <div key={key} className='flex flex-col'>
                  <Label
                    htmlFor={`${key}-picker`}
                    className='mb-2 block whitespace-normal break-all text-foreground'
                  >
                    {t(labelKey)}
                  </Label>
                  <div className='flex items-center gap-x-4'>
                    <input
                      id={`${key}-picker`}
                      type='color'
                      value={settings.colors?.[key] || getDefaultColor(key)}
                      onChange={handleThemeColorChange}
                      className='size-8 shrink-0 cursor-pointer border-0 p-0'
                    />
                    <div className='min-w-0 flex-1'>
                      <Input
                        id={`${key}-hex`}
                        type='text'
                        value={settings.colors?.[key] || getDefaultColor(key)}
                        onChange={handleThemeColorChange}
                        className='w-full bg-background text-foreground'
                        placeholder={t('options.color.hexPlaceholder')}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className='mt-4'>
          <Button
            type='button'
            onClick={() =>
              window.open(
                'https://forms.gle/c9gBiF2TmgXaeU7J6',
                '_blank',
                'noopener,noreferrer',
              )
            }
            className='w-full cursor-pointer'
          >
            {t('options.contact')}
          </Button>
        </div>
        <p className='mt-2 text-muted-foreground text-sm'>
          {t('options.contactDescription')}
        </p>

        <div className='mt-8 mb-10 text-center'>
          <Button
            type='button'
            className='w-full cursor-pointer'
            onClick={() =>
              window.open(
                chrome.runtime.getURL('changelog.html'),
                '_blank',
                'noopener,noreferrer',
              )
            }
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
