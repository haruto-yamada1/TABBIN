import { Folder, Globe } from 'lucide-react'
import type { ComponentType, ReactNode } from 'react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip'
import type { ViewMode } from '@/contexts/saved-tabs/presentation/types/mode'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import {
  SavedTabsResponsiveLabel,
  SavedTabsResponsiveTooltipContent,
} from './shared/SavedTabsResponsive'

interface ViewModeToggleProps {
  currentMode: ViewMode
  onChange: (mode: ViewMode) => void
}

const isKnownViewMode = (mode: unknown): mode is ViewMode =>
  mode === 'domain' || mode === 'custom'

const ViewModeSelectItem = ({
  value,
  icon: Icon,
  label,
}: {
  value: string
  icon: ComponentType<{ size: number }>
  label: string
}) => (
  <SelectItem value={value}>
    <div className='flex items-center gap-2'>
      <Icon size={16} />
      <span>{label}</span>
    </div>
  </SelectItem>
)

export const ViewModeToggle = ({
  currentMode,
  onChange,
}: ViewModeToggleProps) => {
  const { t } = useI18n()
  let selectedValue: ReactNode
  if (!isKnownViewMode(currentMode)) {
    selectedValue = t('savedTabs.viewMode.placeholder')
  } else if (currentMode === 'domain') {
    selectedValue = (
      <div className='flex items-center gap-2'>
        <Globe size={16} />
        <SavedTabsResponsiveLabel>
          {t('savedTabs.viewMode.domain')}
        </SavedTabsResponsiveLabel>
      </div>
    )
  } else {
    selectedValue = (
      <div className='flex items-center gap-2'>
        <Folder size={16} />
        <SavedTabsResponsiveLabel>
          {t('savedTabs.viewMode.custom')}
        </SavedTabsResponsiveLabel>
      </div>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div>
          <Select value={currentMode} onValueChange={onChange}>
            <SelectTrigger
              aria-label={t('savedTabs.viewMode.tooltip')}
              className='flex h-9 items-center gap-2'
            >
              <SelectValue
                placeholder={t('savedTabs.viewMode.selectPlaceholder')}
              >
                {selectedValue}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <ViewModeSelectItem
                value='domain'
                icon={Globe}
                label={t('savedTabs.viewMode.domain')}
              />
              <ViewModeSelectItem
                value='custom'
                icon={Folder}
                label={t('savedTabs.viewMode.custom')}
              />
            </SelectContent>
          </Select>
        </div>
      </TooltipTrigger>
      <SavedTabsResponsiveTooltipContent side='top'>
        {t('savedTabs.viewMode.tooltip')}
      </SavedTabsResponsiveTooltipContent>
    </Tooltip>
  )
}
