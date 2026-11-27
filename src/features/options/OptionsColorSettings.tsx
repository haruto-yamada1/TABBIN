import { RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { colorOptions } from '@/constants/colorOptions'
import { getDefaultColor } from '@/constants/defaultColors'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { OptionsColorPickerRow } from '@/features/options/OptionsColorPickerRow'
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

type OptionsColorSettingsProps = {
  colors: UserSettings['colors']
  onColorChange: (
    key: keyof NonNullable<UserSettings['colors']>,
    value: string,
  ) => Promise<boolean>
  onResetColors: () => Promise<boolean>
  sectionId: string
}

/**
 * 色カスタマイズ設定カード (issue #1127 で OptionsRoute から分離)。
 * 目次からのアンカー先として sectionId を受け取る。
 */
export const OptionsColorSettings = ({
  colors,
  onColorChange,
  onResetColors,
  sectionId,
}: OptionsColorSettingsProps) => {
  const { t } = useI18n()

  return (
    <div
      id={sectionId}
      className='mb-8 scroll-mt-4 rounded-lg border border-border bg-card p-6 shadow-md'
    >
      <div className='mb-4 flex items-center justify-between'>
        <h2 className='text-xl font-semibold text-foreground'>
          {t('options.previewColorCustomization')}
        </h2>
        <Button
          variant='outline'
          size='sm'
          // eslint-disable-next-line typescript/no-misused-promises
          onClick={onResetColors}
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
            onColorChange,
          )

          return (
            <OptionsColorPickerRow
              key={key}
              colorKey={key}
              // `||` needed: color could be empty string
              // eslint-disable-next-line typescript/prefer-nullish-coalescing
              color={colors?.[key] || getDefaultColor(key)}
              label={t(labelKey)}
              onChange={changeHandler}
            />
          )
        })}
      </div>
    </div>
  )
}
