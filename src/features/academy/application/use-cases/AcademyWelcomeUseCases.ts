import type { AcademyWelcomePorts } from '@/features/academy/application/ports/AcademyWelcomePorts'

export const createAcademyWelcomeCommands = (ports: AcademyWelcomePorts) => ({
  prepareInstall: async (): Promise<void> => {
    // Eligibility is control state. Data initialization gates presentation in
    // claim(), so a stalled bootstrap cannot prevent the install page opening.
    await ports.welcome.prepare()
  },
  claim: async (): Promise<boolean> => {
    await ports.ready()
    if (!(await ports.welcome.isPending())) {
      return false
    }
    const { intro } = await ports.progress.read()
    if (intro.dismissedAt !== null || intro.skippedAt !== null) {
      return false
    }
    return ports.welcome.claim()
  },
  dismiss: async (action: 'dismiss' | 'skip'): Promise<void> => {
    await ports.recordIntro(action)
  },
})
