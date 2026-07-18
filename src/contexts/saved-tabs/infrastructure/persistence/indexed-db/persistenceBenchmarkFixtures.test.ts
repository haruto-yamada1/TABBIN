import { describe, expect, it } from 'vitest'

import {
  AI_PERSISTENCE_SCALE_CASES,
  MIGRATION_PERSISTENCE_SCALE_CASES,
  QUERY_PERSISTENCE_SCALE_CASES,
  createAiPersistenceBenchmarkFixture,
  createPersistenceBenchmarkFixture,
} from './persistenceBenchmarkFixtures'

describe('Persistence v2 benchmark fixtures', () => {
  it('Issue #726 のmigration scale matrixを固定する', () => {
    expect(MIGRATION_PERSISTENCE_SCALE_CASES).toEqual(
      [1_000, 10_000, 50_000, 100_000].flatMap((urlCount) =>
        [1, 3, 10].map((membershipMultiplier) => ({
          membershipMultiplier,
          urlCount,
        })),
      ),
    )
  })

  it('query とAI conversationのsmall/medium/large profileを固定する', () => {
    expect(QUERY_PERSISTENCE_SCALE_CASES).toEqual([
      { membershipCount: 50_000, urlCount: 10_000 },
      { membershipCount: 250_000, urlCount: 50_000 },
      { membershipCount: 500_000, urlCount: 100_000 },
    ])
    expect(AI_PERSISTENCE_SCALE_CASES.map(({ name }) => name)).toEqual([
      'small',
      'medium',
      'large',
    ])
  })

  it('deterministicな小規模fixtureを生成する', () => {
    const fixture = createPersistenceBenchmarkFixture({
      membershipMultiplier: 3,
      urlCount: 4,
    })

    expect(fixture.urls).toHaveLength(4)
    expect(fixture.memberships).toHaveLength(12)
    expect(fixture.memberships[0]).toMatchObject({
      collectionId: 'collection-0',
      urlId: 'url-0',
    })
  })

  it('AI conversation/message profileから参照整合性のあるfixtureを生成する', () => {
    const fixture = createAiPersistenceBenchmarkFixture({
      conversationCount: 3,
      messageCount: 8,
    })

    expect(fixture.conversations).toHaveLength(3)
    expect(fixture.messages).toHaveLength(8)
    expect(
      fixture.messages.every((message) =>
        fixture.conversations.some(
          (conversation) => conversation.id === message.conversationId,
        ),
      ),
    ).toBe(true)
  })

  it('invalid AI profileをbenchmark開始前にrejectする', () => {
    expect(() =>
      createAiPersistenceBenchmarkFixture({
        conversationCount: 0,
        messageCount: 1,
      }),
    ).toThrow('conversationCount')
    expect(() =>
      createAiPersistenceBenchmarkFixture({
        conversationCount: 1,
        messageCount: -1,
      }),
    ).toThrow('messageCount')
  })
})
