import { DeletePolicySettings } from './DeletePolicySettings'
import { useSettings } from './hooks/useSettings'
import { KeyboardShortcutsSettings } from './KeyboardShortcutsSettings'
import { LinkCaptureSettings } from './LinkCaptureSettings'
import { SavedTabTitleSettings } from './SavedTabTitleSettings'

export const PageAccessSettings = () => {
  const { settings } = useSettings()

  return (
    <>
      <SavedTabTitleSettings />
      <LinkCaptureSettings />
      <LinkCaptureSettings mode='click' />
      <KeyboardShortcutsSettings />
      <DeletePolicySettings
        confirmDeleteAll={settings.confirmDeleteAll}
        confirmDeleteEach={settings.confirmDeleteEach}
      />
    </>
  )
}
