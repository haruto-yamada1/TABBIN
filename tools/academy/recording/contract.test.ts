import { createAcademyFixture } from '#academy-fixture'
import { describe, expect, it } from 'vitest'

import { validateSaveFlow } from './contract'
import type { SaveFlowEvidence } from './contract'

const createEvidence = (): SaveFlowEvidence => {
  const snapshot = createAcademyFixture()
  return {
    source: 'unpacked-development',
    extensionId: 'demo-extension',
    expectedUrls: snapshot.urls.map((item) => item.url),
    beforeTabs: snapshot.urls.map((item, index) => ({
      id: index + 1,
      url: item.url,
      active: index === 0,
    })),
    afterTabs: [
      {
        id: 10,
        url: 'chrome-extension://demo-extension/app.html#/saved-tabs?mode=domain',
        active: true,
      },
    ],
    isOnToolbar: true,
    clickBehavior: 'saveWindowTabs',
    snapshot,
  }
}

describe('Academy save recording evidence', () => {
  it.each(['chrome-web-store', 'unpacked-development'] as const)(
    'accepts a complete save flow while preserving the %s installation source',
    (source) => {
      expect(validateSaveFlow({ ...createEvidence(), source })).toEqual({
        status: 'passed',
        errors: [],
      })
    },
  )

  it('requires multiple distinct hostnames rather than multiple paths', () => {
    const evidence = createEvidence()
    evidence.expectedUrls = evidence.expectedUrls.slice(0, 2)
    expect(validateSaveFlow(evidence).errors).toContain('fixture-hostnames')
  })

  it('rejects an empty, malformed or duplicate fixture', () => {
    for (const expectedUrls of [
      [],
      ['not a URL', 'https://notes.filming.test/inbox'],
      [
        'https://study.filming.test/guide',
        'https://study.filming.test/guide',
        'https://notes.filming.test/inbox',
      ],
    ]) {
      expect(
        validateSaveFlow({ ...createEvidence(), expectedUrls }).errors,
      ).toContain('fixture-urls')
    }
  })

  it('requires exactly the expected live tabs and distinct browser tab IDs before clicking', () => {
    const evidence = createEvidence()
    evidence.beforeTabs = evidence.beforeTabs.slice(1)
    expect(validateSaveFlow(evidence).errors).toContain('before-tabs')
    const duplicateId = createEvidence()
    duplicateId.beforeTabs = duplicateId.beforeTabs.map((tab) => ({
      ...tab,
      id: 1,
    }))
    expect(validateSaveFlow(duplicateId).errors).toContain('before-tabs')
  })

  it('rejects an unexpected tab or duplicate URL before clicking', () => {
    const evidence = createEvidence()
    evidence.beforeTabs = [
      ...evidence.beforeTabs,
      { id: 9, url: 'chrome://extensions', active: false },
    ]
    expect(validateSaveFlow(evidence).errors).toContain('before-tabs')
    const duplicateUrl = createEvidence()
    duplicateUrl.beforeTabs = duplicateUrl.beforeTabs.map((tab) => ({
      ...tab,
      url: duplicateUrl.expectedUrls[0] ?? '',
    }))
    expect(validateSaveFlow(duplicateUrl).errors).toContain('before-tabs')
  })

  it('requires all original tab IDs to disappear', () => {
    const evidence = createEvidence()
    evidence.afterTabs = evidence.afterTabs.map((tab) => ({ ...tab, id: 1 }))
    expect(validateSaveFlow(evidence).errors).toContain(
      'fixture-tabs-still-open',
    )
  })

  it('requires exactly one active Domain app tab in the same extension', () => {
    for (const afterTabs of [
      [],
      [...createEvidence().afterTabs, ...createEvidence().beforeTabs],
      [{ id: 10, url: 'chrome://newtab', active: true }],
      [
        {
          id: 10,
          url: 'chrome-extension://other/app.html#/saved-tabs?mode=domain',
          active: true,
        },
      ],
      [
        {
          id: 10,
          url: 'chrome-extension://demo-extension/app.html#/saved-tabs?mode=custom',
          active: true,
        },
      ],
      createEvidence().afterTabs.map((tab) => ({ ...tab, active: false })),
    ]) {
      expect(
        validateSaveFlow({ ...createEvidence(), afterTabs }).errors,
      ).toContain('after-domain-tab')
    }
  })

  it('requires exact saved URLs without missing, duplicate or additional records', () => {
    const evidence = createEvidence()
    const [firstUrl] = evidence.snapshot.urls
    if (!firstUrl) {
      throw new Error('Missing fixture URL.')
    }
    for (const urls of [
      evidence.snapshot.urls.slice(1),
      [
        ...evidence.snapshot.urls,
        { id: 'extra', url: 'https://extra.filming.test/' },
      ],
      [...evidence.snapshot.urls, firstUrl],
    ]) {
      expect(
        validateSaveFlow({
          ...evidence,
          snapshot: { ...evidence.snapshot, urls },
        }).errors,
      ).toContain('saved-urls')
    }
  })

  it('requires each hostname to have its own Domain collection', () => {
    const evidence = createEvidence()
    evidence.snapshot.collections = evidence.snapshot.collections.slice(1)
    expect(validateSaveFlow(evidence).errors).toContain('domain-collections')
  })

  it('rejects missing, dangling, duplicate or cross-domain memberships', () => {
    const evidence = createEvidence()
    const [first] = evidence.snapshot.memberships
    const [, secondDomain] = evidence.snapshot.collections
    if (!first || !secondDomain) {
      throw new Error('Missing fixture membership or Domain.')
    }
    for (const memberships of [
      evidence.snapshot.memberships.slice(1),
      [...evidence.snapshot.memberships, first],
      evidence.snapshot.memberships.map((item, index) =>
        index === 0 ? { ...item, collectionId: secondDomain.id } : item,
      ),
      [
        ...evidence.snapshot.memberships,
        { urlId: 'absent', collectionId: first.collectionId },
      ],
      [
        ...evidence.snapshot.memberships,
        { urlId: first.urlId, collectionId: 'absent' },
      ],
    ]) {
      expect(
        validateSaveFlow({
          ...evidence,
          snapshot: { ...evidence.snapshot, memberships },
        }).errors,
      ).toContain('domain-memberships')
    }
  })

  it('rejects saving without native pinning or with a different click behavior', () => {
    expect(
      validateSaveFlow({ ...createEvidence(), isOnToolbar: false }).errors,
    ).toContain('toolbar-not-pinned')
    expect(
      validateSaveFlow({
        ...createEvidence(),
        clickBehavior: 'saveSameDomainTabs',
      }).errors,
    ).toContain('click-behavior-not-window')
  })
})
