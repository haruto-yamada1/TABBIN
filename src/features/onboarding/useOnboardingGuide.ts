import { useEffect, useState } from 'react'

import { logger } from '@/lib/logging/logger'
import {
  dismissOnboarding,
  readOnboardingDismissed,
  subscribeOnboardingDismissed,
} from '@/lib/storage/onboarding'

type GuideState = 'loading' | 'hidden' | 'teaser' | 'expanded'

export const useOnboardingGuide = (automatic: boolean) => {
  const [state, setState] = useState<GuideState>(
    automatic ? 'loading' : 'hidden',
  )
  const [isSaving, setIsSaving] = useState(false)
  const [hasSaveError, setHasSaveError] = useState(false)

  useEffect(() => {
    if (!automatic) {
      return undefined
    }
    let active = true
    const unsubscribe = subscribeOnboardingDismissed(() => {
      setState('hidden')
    })
    void readOnboardingDismissed().then(
      (dismissed) => {
        if (active) {
          setState((current) => {
            if (current !== 'loading') {
              return current
            }
            return dismissed ? 'hidden' : 'teaser'
          })
        }
      },
      () => {
        if (active) {
          setState('hidden')
          logger.warn('onboarding_state_read_failed')
        }
      },
    )
    return () => {
      active = false
      unsubscribe()
    }
  }, [automatic])

  const dismiss = async () => {
    setIsSaving(true)
    setHasSaveError(false)
    try {
      await dismissOnboarding()
      setState('hidden')
    } catch {
      setHasSaveError(true)
    } finally {
      setIsSaving(false)
    }
  }

  return {
    state,
    isSaving,
    hasSaveError,
    show: () => {
      setState('expanded')
    },
    dismiss: () => {
      void dismiss()
    },
  }
}
