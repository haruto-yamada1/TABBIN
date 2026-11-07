import saveTabs from '#academy-save-scenario'
import { describe, expect, it } from 'vitest'

import { parseScenario } from './scenario'

describe('Academy scenario contract', () => {
  it('accepts the versioned, bounded native/page editing timeline', () => {
    expect(parseScenario(saveTabs)).toMatchObject({
      id: 'save-tabs',
      demoSeed: 'academy-997-v1',
    })
  })

  it.each([
    { ...saveTabs, output: { ...saveTabs.output, filename: '../escape.mp4' } },
    { ...saveTabs, browserVersion: '' },
    { ...saveTabs, actions: [{ type: 'eval', code: 'arbitrary()' }] },
    { ...saveTabs, captions: [{ start: 0, end: 999, ja: '長い', en: 'Long' }] },
    {
      ...saveTabs,
      segments: [{ kind: 'page', start: -1, seconds: 8, zoom: 1 }],
    },
    { ...saveTabs, demoSeed: 'personal-data' },
  ])('rejects unsafe or inconsistent scenario %#', (scenario) => {
    expect(() => parseScenario(scenario)).toThrow(/.+/u)
  })
})
