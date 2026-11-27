import { KeyboardShortcutsSettings } from './KeyboardShortcutsSettings'
import { LinkCaptureSettings } from './LinkCaptureSettings'
import { SavedTabTitleSettings } from './SavedTabTitleSettings'

export const PageAccessSettings = () => (
  <>
    <SavedTabTitleSettings />
    <LinkCaptureSettings />
    <LinkCaptureSettings mode='click' />
    <KeyboardShortcutsSettings />
  </>
)
