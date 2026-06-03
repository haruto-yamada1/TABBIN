import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import type { LanguageSetting } from '@/features/i18n/messages'
import { cn } from '@/lib/utils'

const languageOptions: LanguageSetting[] = ['system', 'ja', 'en']
const getLanguageOptionKey = (option: LanguageSetting) => {
  switch (option) {
    case 'system': {
      return 'language.system'
    }
    case 'ja': {
      return 'language.japanese'
    }
    case 'en': {
      return 'language.english'
    }
  }
}

export const LanguageSelect = ({
  className,
  triggerClassName,
}: {
  className?: string
  triggerClassName?: string
}) => {
  const { languageSetting, setLanguageSetting, t } = useI18n()

  return (
    <div className={cn('space-y-2', className)}>
      <Label
        className='text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase'
        htmlFor='language-select'
      >
        {t('language.label')}
      </Label>
      <Select
        value={languageSetting}
        onValueChange={(value) =>
          void setLanguageSetting(value as LanguageSetting)
        }
      >
        <SelectTrigger
          id='language-select'
          aria-label={t('language.label')}
          className={cn('w-full bg-background', triggerClassName)}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {languageOptions.map((option) => (
            <SelectItem key={option} value={option}>
              {t(getLanguageOptionKey(option))}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
