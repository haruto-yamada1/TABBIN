import { describe, expect, it, vi } from 'vitest'

import { createAcademyWelcomeCommands } from '@/features/academy/application/use-cases/AcademyWelcomeUseCases'
import { emptyAcademyState } from '@/features/academy/domain/AcademyProgressRepository'

const setup = () => {
  const state = emptyAcademyState()
  const ports = {
    welcome: {
      prepare: vi.fn(async () => {}),
      isPending: vi.fn(async () => true),
      claim: vi.fn(async () => true),
    },
    progress: {
      read: vi.fn(async () => state),
      update: vi.fn(async () => state),
      exportRaw: vi.fn(async () => state),
    },
    ready: vi.fn(async () => {}),
    recordIntro: vi.fn(async (_action: 'dismiss' | 'skip') => {}),
  }
  return { state, ports, commands: createAcademyWelcomeCommands(ports) }
}

describe('Academy welcome commands', () => {
  it('waits for initialization before marking a new installation eligible', async () => {
    const { ports, commands } = setup()
    const ready = Promise.withResolvers<undefined>()
    ports.ready.mockReturnValue(ready.promise)
    const prepared = commands.prepareInstall()
    expect(ports.welcome.prepare).not.toHaveBeenCalled()
    ready.resolve(undefined)
    await prepared
    expect(ports.welcome.prepare).toHaveBeenCalledOnce()
  })

  it('does not propose a guide to existing users without an install marker', async () => {
    const { ports, commands } = setup()
    ports.welcome.isPending.mockResolvedValue(false)
    expect(await commands.claim()).toBe(false)
    expect(ports.progress.read).not.toHaveBeenCalled()
    expect(ports.welcome.claim).not.toHaveBeenCalled()
  })

  it('claims the eligible guide once readiness and independent intro facts permit it', async () => {
    const { ports, commands } = setup()
    expect(await commands.claim()).toBe(true)
    expect(ports.ready).toHaveBeenCalledOnce()
    expect(ports.progress.read).toHaveBeenCalledOnce()
    expect(ports.welcome.claim).toHaveBeenCalledOnce()
    expect(ports.progress.update).not.toHaveBeenCalled()
  })

  it.each(['dismissedAt', 'skippedAt'] as const)(
    'preserves an existing %s without re-prompting',
    async (fact) => {
      const { state, ports, commands } = setup()
      state.intro[fact] = 100
      expect(await commands.claim()).toBe(false)
      expect(ports.welcome.claim).not.toHaveBeenCalled()
    },
  )

  it.each(['dismiss', 'skip'] as const)(
    'records %s through the intro command without resetting lessons',
    async (action) => {
      const { ports, commands } = setup()
      await commands.dismiss(action)
      expect(ports.recordIntro).toHaveBeenCalledWith(action)
      expect(ports.progress.update).not.toHaveBeenCalled()
    },
  )

  it('does not arm or claim a guide when data initialization fails', async () => {
    const { ports, commands } = setup()
    ports.ready.mockRejectedValue(new Error('unavailable'))
    await expect(commands.prepareInstall()).rejects.toThrow('unavailable')
    await expect(commands.claim()).rejects.toThrow('unavailable')
    expect(ports.welcome.prepare).not.toHaveBeenCalled()
    expect(ports.welcome.claim).not.toHaveBeenCalled()
  })

  it('does not claim or write over unreadable progress', async () => {
    const { ports, commands } = setup()
    ports.progress.read.mockRejectedValue(new Error('read failed'))
    await expect(commands.claim()).rejects.toThrow('read failed')
    expect(ports.welcome.claim).not.toHaveBeenCalled()
    expect(ports.progress.update).not.toHaveBeenCalled()
  })
})
