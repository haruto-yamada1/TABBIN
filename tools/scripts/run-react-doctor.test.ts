import { describe, expect, it, vi } from 'vitest'

import { runReactDoctor } from './run-react-doctor'

describe('reviewed project React Doctor execution', () => {
  it('refuses to execute the CLI when the license check fails', () => {
    const execute = vi.fn()
    expect(() =>
      runReactDoctor(['--score'], {
        execute,
        verify: () => {
          throw new Error('License changed or expired')
        },
      }),
    ).toThrow('License changed or expired')
    expect(execute).not.toHaveBeenCalled()
  })

  it.each([0, 1, 7, null])(
    'checks the license before forwarding arguments and exit status %s',
    (status) => {
      const events: string[] = []
      const execute = vi.fn(
        (executable: string, args: string[], root: string) => {
          events.push('execute')
          expect(executable).toBe('node')
          expect(root).toBe('/project')
          expect(args).toEqual([
            '/project/node_modules/react-doctor/bin/react-doctor.js',
            '.',
            '--scope',
            'full',
          ])
          return { status }
        },
      )
      expect(
        runReactDoctor(['.', '--scope', 'full'], {
          root: '/project',
          execute,
          verify: () => {
            events.push('license')
          },
        }),
      ).toBe(status ?? 1)
      expect(events).toEqual(['license', 'execute'])
    },
  )

  it('reports a process launch error instead of treating it as success', () => {
    expect(() =>
      runReactDoctor([], {
        verify: () => {},
        execute: () => ({ status: null, error: new Error('Node unavailable') }),
      }),
    ).toThrow('Node unavailable')
  })
})
