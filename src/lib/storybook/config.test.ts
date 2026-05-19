// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import mainConfig from '../../../.storybook/main'

describe('Storybook main config', () => {
  it('discovers real component and feature stories', () => {
    expect(mainConfig.stories).toEqual(
      expect.arrayContaining([
        '../src/components/**/*.stories.@(js|jsx|mjs|ts|tsx)',
        '../src/features/**/*.stories.@(js|jsx|mjs|ts|tsx)',
      ]),
    )
  })

  it('disables Storybook auto refs discovery', () => {
    expect(mainConfig.refs).toEqual({})
  })

  it('disables Storybook browser auto-open in the npm script', () => {
    const packageJson = JSON.parse(
      readFileSync(path.resolve(import.meta.dirname, '../../../package.json'), {
        encoding: 'utf8',
      }),
    ) as {
      dependencies?: Record<string, string>
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.storybook).toContain('BROWSER=none')
  })

  it('does not keep media-chrome as a Storybook dependency', () => {
    const packageJson = JSON.parse(
      readFileSync(path.resolve(import.meta.dirname, '../../../package.json'), {
        encoding: 'utf8',
      }),
    ) as {
      dependencies?: Record<string, string>
    }

    expect(packageJson.dependencies?.['media-chrome']).toBeUndefined()
  })
})
