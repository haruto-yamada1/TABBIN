import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import type { UserSettings } from '@/types/storage'

type OptionsColorPickerRowProps = {
  colorKey: keyof NonNullable<UserSettings['colors']>
  color: string
  label: string
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
}

export const OptionsColorPickerRow = ({
  colorKey,
  color,
  label,
  onChange,
}: OptionsColorPickerRowProps) => {
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
          data-testid={`color-picker-${colorKey}`}
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
