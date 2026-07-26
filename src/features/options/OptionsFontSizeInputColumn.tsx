import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  FONT_SIZE_PERCENT_STEP,
  MAX_FONT_SIZE_PERCENT,
  MIN_FONT_SIZE_PERCENT,
} from '@/constants/fontSize'
import { useI18n } from '@/features/i18n/context/I18nProvider'

type OptionsFontSizeInputColumnProps = {
  value: string
  onValueChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  onBlur: () => void
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
}

export const OptionsFontSizeInputColumn = ({
  value,
  onValueChange,
  onBlur,
  onKeyDown,
}: OptionsFontSizeInputColumnProps) => {
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
