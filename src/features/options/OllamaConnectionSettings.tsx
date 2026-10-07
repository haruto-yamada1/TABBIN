import { useCallback } from 'react'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { OllamaBaseUrl } from '@/constants/productionNetworkPolicy'
import {
  isOllamaBaseUrl,
  OLLAMA_BASE_URL_VALUES,
  resolveOllamaBaseUrl,
} from '@/constants/productionNetworkPolicy'
import { useI18n } from '@/features/i18n/context/I18nProvider'

type OllamaConnectionSettingsProps = {
  baseUrl: OllamaBaseUrl | undefined
  onBaseUrlChange: (baseUrl: OllamaBaseUrl) => void
}

export const OllamaConnectionSettings = ({
  baseUrl,
  onBaseUrlChange,
}: OllamaConnectionSettingsProps) => {
  const { t } = useI18n()
  const handleValueChange = useCallback(
    (value: string) => {
      if (isOllamaBaseUrl(value)) {
        onBaseUrlChange(value)
      }
    },
    [onBaseUrlChange],
  )

  return (
    <section
      aria-labelledby='ollama-settings-title'
      className='mb-8 rounded-lg border border-border bg-card p-6 shadow-md'
    >
      <h2
        id='ollama-settings-title'
        className='mb-4 text-xl font-semibold text-foreground'
      >
        {t('options.ollama.title')}
      </h2>
      <Label
        htmlFor='ollama-base-url'
        className='mb-2 block font-medium text-foreground'
      >
        {t('options.ollama.baseUrlLabel')}
      </Label>
      <Select
        value={resolveOllamaBaseUrl(baseUrl)}
        onValueChange={handleValueChange}
      >
        <SelectTrigger
          id='ollama-base-url'
          aria-describedby='ollama-base-url-description'
          className='w-full cursor-pointer bg-background'
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OLLAMA_BASE_URL_VALUES.map((url) => (
            <SelectItem key={url} value={url}>
              {url}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p
        id='ollama-base-url-description'
        className='mt-2 text-sm text-muted-foreground'
      >
        {t('options.ollama.baseUrlDescription')}
      </p>
    </section>
  )
}
