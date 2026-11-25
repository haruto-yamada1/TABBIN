import { describe, expect, it } from 'vitest'

import { checkPersistenceIntegrity } from '@/contexts/saved-tabs/public-api'

import { createAcademyFixture } from './fixture'

describe('Academy filming / E2E fixture', () => {
  it('recreates a small, independent snapshot with fixed IDs and timestamps', () => {
    const first = createAcademyFixture()
    expect(first.urls).toHaveLength(6)
    expect(createAcademyFixture()).toEqual(first)
    expect(createAcademyFixture().urls).not.toBe(first.urls)
    first.urls.pop()
    expect(createAcademyFixture().urls).toHaveLength(6)
  })

  it('uses the current persistence model with parent, child and uncategorized data', () => {
    const fixture = createAcademyFixture()
    expect(fixture.groups).toHaveLength(2)
    expect(fixture.categories).toHaveLength(3)
    expect(fixture.collections).toHaveLength(3)
    expect(fixture.collections.some((item) => !('groupId' in item))).toBe(true)
    expect(fixture.memberships.some((item) => !('categoryId' in item))).toBe(
      true,
    )
  })

  it('provides a separately selected empty scenario', () => {
    expect(createAcademyFixture('empty')).toEqual({
      categories: [],
      collections: [],
      groups: [],
      memberships: [],
      urls: [],
    })
  })

  it('keeps references, URL identities, ordering and timestamp provenance valid', () => {
    const fixture = createAcademyFixture()
    expect(checkPersistenceIntegrity(fixture)).toEqual({
      isHealthy: true,
      issues: [],
    })
    const hosts = new Map<string, number>()
    for (const url of fixture.urls) {
      const { hostname, protocol } = new URL(url.url)
      expect(hostname.endsWith('.filming.test')).toBe(true)
      expect(protocol).toBe('https:')
      hosts.set(hostname, (hosts.get(hostname) ?? 0) + 1)
      const membership = fixture.memberships.find(
        (item) => item.urlId === url.id,
      )
      const collection = fixture.collections.find(
        (item) => item.id === membership?.collectionId,
      )
      expect(collection?.definition.domain).toBe(hostname)
    }
    expect([...hosts.values()]).toEqual([2, 2, 2])
  })
})
