import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { clickBehaviorOptions } from '@/constants/clickBehaviorOptions'
import { useI18n } from '@/features/i18n/context/I18nProvider'

type ClickBehaviorSelectProps = {
  value: string
  onValueChange: (value: string) => void
}

export const ClickBehaviorSelect: React.FC<ClickBehaviorSelectProps> = ({
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
