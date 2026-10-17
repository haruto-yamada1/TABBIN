import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { SavedTabsCustomProjectDto as CustomProject } from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'
import { useI18n } from '@/features/i18n/context/I18nProvider'

type NewProjectDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  customProjects: CustomProject[]
  onCreateProject: (name: string) => void
}

export const NewProjectDialog = ({
  open,
  onOpenChange,
  customProjects,
  onCreateProject,
}: NewProjectDialogProps) => {
  const { t } = useI18n()
  const [newProjectName, setNewProjectName] = useState('')
  const handleInputRef = useCallback((node: HTMLInputElement | null) => {
    node?.focus()
  }, [])
  const handleNameChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setNewProjectName(event.target.value)
    },
    [],
  )
  const handleEnter = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') {
        return
      }
      const isComposing =
        event.nativeEvent.isComposing ||
        ('isComposing' in event &&
          Boolean(Reflect.get(event, 'isComposing'))) ||
        false
      if (isComposing) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const name = newProjectName.trim()
      if (!name) {
        toast.error(t('savedTabs.projectNameRequired'))
        return
      }
      const exists = customProjects.some(
        (project) => project.name.toLowerCase() === name.toLowerCase(),
      )
      if (exists) {
        toast.error(t('savedTabs.projectNameDuplicate'))
        return
      }

      onCreateProject(name)
      toast.success(t('savedTabs.projectAdded', undefined, { name }))
      setNewProjectName('')
      onOpenChange(false)
    },
    [newProjectName, customProjects, onCreateProject, onOpenChange, t],
  )

  if (!open) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('savedTabs.newProjectTitle')}</DialogTitle>
        </DialogHeader>
        <Input
          ref={handleInputRef}
          value={newProjectName}
          onChange={handleNameChange}
          onKeyDown={handleEnter}
          placeholder={t('savedTabs.newProjectPlaceholder')}
          className='mb-2 w-full'
        />
      </DialogContent>
    </Dialog>
  )
}
