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

  it('accepts a native installation chapter without pretending it is a save', () => {
    const scenario = {
      ...saveTabs,
      id: 'install-extension',
      lessonId: 'install-extension',
      segments: [
        saveTabs.segments[0],
        { kind: 'native', stage: 'install', start: 0, seconds: 24, zoom: 1 },
        saveTabs.segments.at(-1),
      ],
    }
    expect(parseScenario(scenario).lessonId).toBe('install-extension')
  })

  it('accepts a bounded real UI category demonstration with selectable caption tracks', () => {
    const scenario = {
      ...saveTabs,
      id: 'parent-categories',
      lessonId: 'parent-categories',
      captionMode: 'tracks',
      actions: [
        saveTabs.actions[0],
        saveTabs.actions[1],
        {
          type: 'demonstrate-lesson',
          lessonId: 'parent-categories',
          seconds: 34,
        },
      ],
      segments: [
        saveTabs.segments[0],
        { kind: 'page', start: 0, seconds: 34, zoom: 1 },
        saveTabs.segments.at(-1),
      ],
    }
    expect(parseScenario(scenario).lessonId).toBe('parent-categories')
  })

  it.each(['install-extension', 'pin-extension'])(
    'rejects %s without the real native operation',
    (lessonId) => {
      expect(() =>
        parseScenario({ ...saveTabs, id: lessonId, lessonId }),
      ).toThrow('operation clip')
    },
  )

  it('rejects a demonstration of another lesson even on a valid page timeline', () => {
    expect(() =>
      parseScenario({
        ...saveTabs,
        id: 'reorder-items',
        lessonId: 'reorder-items',
        actions: [
          saveTabs.actions[0],
          saveTabs.actions[1],
          { type: 'demonstrate-lesson', lessonId: 'restore-tabs', seconds: 20 },
        ],
      }),
    ).toThrow('identifiers must match')
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
