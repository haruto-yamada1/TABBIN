import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { createAcademyWelcomeUseCases } from '@/app/composition/createAcademyWelcomeUseCases'

export type AcademyWelcomeCommands = ReturnType<
  typeof createAcademyWelcomeUseCases
>

export const useAcademyWelcome = (useCases?: AcademyWelcomeCommands) => {
  const commands = useMemo(
    () => useCases ?? createAcademyWelcomeUseCases(),
    [useCases],
  )
  const [state, setState] = useState({ open: false, busy: false, error: false })
  const claim = useRef<Promise<boolean> | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    let active = true
    claim.current ??= commands.claim()
    void claim.current.then(
      (open) => {
        if (active) {
          setState({ open, busy: false, error: false })
        }
      },
      () => {
        // A failed eligibility read never interrupts the user's normal work.
      },
    )
    return () => {
      active = false
    }
  }, [commands])

  const finish = useCallback(
    async (action: 'dismiss' | 'skip', start = false) => {
      setState({ open: true, busy: true, error: false })
      let error = false
      try {
        await commands.dismiss(action)
      } catch {
        error = true
      }
      // The display claim is already persisted. Recording the choice must never
      // make this optional guide block the app when progress storage fails.
      setState({ open: false, busy: false, error })
      if (start) {
        void navigate('/academy')
      }
    },
    [commands, navigate],
  )
  const handleStart = useCallback(() => {
    void finish('dismiss', true)
  }, [finish])
  const handleLater = useCallback(() => {
    void finish('dismiss')
  }, [finish])
  const handleSkip = useCallback(() => {
    void finish('skip')
  }, [finish])
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open && !state.busy) {
        handleLater()
      }
    },
    [state.busy, handleLater],
  )
  return { ...state, handleStart, handleLater, handleSkip, handleOpenChange }
}
