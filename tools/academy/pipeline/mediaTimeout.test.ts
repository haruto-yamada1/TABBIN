import { afterEach, describe, expect, it, vi } from 'vitest'

const child = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn: child.spawn }))
vi.mock('node:fs/promises', async (original) => ({
  ...(await original<object>()),
  appendFile: vi.fn(async () => undefined),
}))

import { runMediaCommand } from './render'

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})
describe('media deadline', () => {
  it('rejects when a stalled child never emits close, rather than waiting forever', async () => {
    vi.useFakeTimers()
    const stream = { on: vi.fn(), setEncoding: vi.fn() }
    const process = {
      once: vi.fn(),
      stdout: stream,
      stderr: stream,
      kill: vi.fn(() => false),
    }
    child.spawn.mockReturnValue(process)
    const result = runMediaCommand('/fixture', 'ffmpeg', [])
    let failure: unknown
    const finished = result.catch((error: unknown) => {
      failure = error
    })
    await vi.waitFor(() => expect(child.spawn).toHaveBeenCalledOnce())
    await vi.advanceTimersByTimeAsync(120_000)
    await finished
    expect(failure).toBeInstanceOf(Error)
    expect(String(failure)).toContain('timeout')
    expect(process.kill).toHaveBeenCalledWith('SIGTERM')
  })
})
