import type { ChromeOnChangedListener } from '@/lib/browser/chrome-storage'
import {
  getChromeStorageLocal,
  getChromeStorageOnChanged,
} from '@/lib/browser/chrome-storage'

const ONBOARDING_DISMISSED_KEY = 'onboardingDismissed'

const requireStorage = () => {
  const storage = getChromeStorageLocal()
  if (!storage) {
    throw new Error('Onboarding storage unavailable')
  }
  return storage
}

export const readOnboardingDismissed = async (): Promise<boolean> => {
  const stored = await requireStorage().get(ONBOARDING_DISMISSED_KEY)
  return stored[ONBOARDING_DISMISSED_KEY] === true
}

export const dismissOnboarding = async (): Promise<void> => {
  const storage = getChromeStorageLocal()
  if (!storage) {
    throw new Error('Onboarding storage unavailable')
  }
  await storage.set({ [ONBOARDING_DISMISSED_KEY]: true })
}

export const subscribeOnboardingDismissed = (onDismissed: () => void) => {
  const changes = getChromeStorageOnChanged()
  const listener: ChromeOnChangedListener = (changed, area) => {
    if (
      area === 'local' &&
      changed[ONBOARDING_DISMISSED_KEY]?.newValue === true
    ) {
      onDismissed()
    }
  }
  changes?.addListener(listener)
  return () => changes?.removeListener(listener)
}
