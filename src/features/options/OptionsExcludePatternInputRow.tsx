import { Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/features/i18n/context/I18nProvider'

type OptionsExcludePatternInputRowProps = {
  excludePatternInput: string
  onInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  onBlur: () => void
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
  onAdd: () => void
}

export const OptionsExcludePatternInputRow = ({
  excludePatternInput,
  onInputChange,
  onBlur,
  onKeyDown,
  onAdd,
}: OptionsExcludePatternInputRowProps) => {
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
