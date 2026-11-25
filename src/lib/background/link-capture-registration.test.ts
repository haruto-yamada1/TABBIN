import { describe, expect, it, vi } from 'vitest'

import { createLinkCaptureRegistration } from './link-capture-registration'

const fixture = () => ({
  readEnabled: vi.fn(async () => true),
  hasPermissions: vi.fn(async () => true),
  reconcileScript: vi.fn(async (_enabled: boolean) => {}),
  updateOpenPages: vi.fn(async (_enabled: boolean) => {}),
})

describe('link capture registration reconciliation', () => {
  it('enables only after opt-in and permission and updates already open pages', async () => {
    const deps = fixture()
    const state = createLinkCaptureRegistration(deps)
    await state.reconcile()
    expect(deps.reconcileScript).toHaveBeenCalledWith(true)
    expect(deps.updateOpenPages).toHaveBeenCalledWith(true)
    deps.readEnabled.mockResolvedValue(false)
    await state.reconcile()
    expect(deps.reconcileScript).toHaveBeenLastCalledWith(false)
    expect(deps.updateOpenPages).toHaveBeenLastCalledWith(false)
  })

  it('fails closed for revoked permission and unreadable settings, still removing page listeners', async () => {
    const deps = fixture()
    deps.hasPermissions.mockResolvedValue(false)
    const state = createLinkCaptureRegistration(deps)
    await state.reconcile()
    expect(deps.reconcileScript).toHaveBeenCalledWith(false)
    deps.readEnabled.mockRejectedValue(new Error('storage unavailable'))
    deps.reconcileScript.mockRejectedValue(new Error('permission revoked'))
    await expect(state.reconcile()).resolves.toBeUndefined()
    expect(deps.updateOpenPages).toHaveBeenLastCalledWith(false)
  })

  it('serializes overlapping enable/disable so an older enable cannot win', async () => {
    const deps = fixture()
    let release: (() => void) | undefined
    deps.reconcileScript.mockImplementationOnce(
      async () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    const state = createLinkCaptureRegistration(deps)
    const enable = state.reconcile()
    await vi.waitFor(() => expect(release).toBeDefined())
    deps.readEnabled.mockResolvedValue(false)
    const disable = state.reconcile()
    release?.()
    await Promise.all([enable, disable])
    expect(deps.reconcileScript.mock.calls.map(([enabled]) => enabled)).toEqual(
      [true, false],
    )
    expect(deps.updateOpenPages).toHaveBeenLastCalledWith(false)
  })
})
