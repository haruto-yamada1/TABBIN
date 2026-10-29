import * as fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PersistenceV2Snapshot } from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'
import { PERSISTENCE_STORE_NAMES } from '@/contexts/saved-tabs/infrastructure/persistence/indexed-db/persistenceDatabaseSchema'

import {
  commandArbitrary,
  commandTrace,
  failureSummary,
  PersistenceCommand,
  persistenceParameters,
  runCommands,
} from './persistenceCommands.fixture'
import {
  assertPersistenceModel,
  assertSavedTabsRoundTrip,
  invariant,
  URL_CASES,
} from './persistenceModel.fixture'
import type { PersistenceRuntime } from './persistenceRuntime.fixture'

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(1000)
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async () => ({ userSettings: { enableCategories: true } })),
        set: vi.fn(async () => undefined),
      },
    },
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const url = {
  id: 'synthetic-id',
  url: 'https://fixture.invalid/a',
  normalizedUrl: 'https://fixture.invalid/a',
  title: 'synthetic',
  firstSavedAt: 1,
  lastSavedAt: 1,
  updatedAt: 1,
}
const fixture: PersistenceV2Snapshot = {
  urls: [url],
  collections: [
    {
      id: 'collection',
      name: 'synthetic',
      createdAt: 1,
      updatedAt: 1,
      sortOrder: 0,
      definition: { type: 'domain', domain: 'fixture.invalid' },
    },
  ],
  categories: [
    {
      id: 'category',
      collectionId: 'collection',
      name: 'synthetic',
      keywords: [],
      createdAt: 1,
      updatedAt: 1,
      sortOrder: 0,
    },
  ],
  memberships: [
    {
      collectionId: 'collection',
      urlId: url.id,
      categoryId: 'category',
      addedAt: 1,
      updatedAt: 1,
      sortOrder: 0,
    },
  ],
  groups: [],
}

describe('IndexedDB state machine oracle pressure', () => {
  it('detects valid but lossy logical metadata after a Backup roundtrip', () => {
    const changed = {
      ...fixture,
      collections: fixture.collections.map((row) => ({
        ...row,
        createdAt: 0,
        updatedAt: 999,
        sortOrder: 123,
      })),
    }
    expect(() => assertSavedTabsRoundTrip(fixture, changed)).toThrow(
      'LOGICAL_METADATA_MISMATCH',
    )
  })

  it.each([
    [
      'DUPLICATE_URL_ID',
      {
        ...fixture,
        urls: [
          url,
          {
            ...url,
            url: 'https://fixture.invalid/b',
            normalizedUrl: 'https://fixture.invalid/b',
          },
        ],
      },
    ],
    [
      'DUPLICATE_NORMALIZED_URL',
      { ...fixture, urls: [url, { ...url, id: 'another-id' }] },
    ],
    ['URL_MISSING', { ...fixture, urls: [] }],
    ['COLLECTION_MISSING', { ...fixture, collections: [] }],
    ['CATEGORY_MISSING', { ...fixture, categories: [] }],
    [
      'GROUP_MISSING',
      {
        ...fixture,
        collections: [
          {
            id: 'collection',
            name: 'synthetic',
            createdAt: 1,
            updatedAt: 1,
            sortOrder: 0,
            definition: { type: 'domain' as const, domain: 'fixture.invalid' },
            groupId: 'missing',
          },
        ],
      },
    ],
  ])('detects deliberately broken %s', (code, snapshot) => {
    expect(() => assertPersistenceModel(snapshot)).toThrow(code)
  })
})

const corruptDatabase = async (real: PersistenceRuntime): Promise<void> => {
  const snapshot = await real.reader.readConsistentSnapshot()
  const first = snapshot.savedTabs.urls[0]
  if (!first) {
    return
  }
  const db = await real.manager.open()
  const transaction = db.transaction(PERSISTENCE_STORE_NAMES.urls, 'readwrite')
  transaction.objectStore(PERSISTENCE_STORE_NAMES.urls).put({
    ...first,
    title: 'private-title-should-never-appear-in-report',
  })
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.addEventListener(
      'abort',
      () => reject(new Error('SYNTHETIC_CORRUPTION_FAILED')),
      { once: true },
    )
    transaction.addEventListener(
      'error',
      () => reject(new Error('SYNTHETIC_CORRUPTION_FAILED')),
      { once: true },
    )
  })
}

const poisonedProperty = (replayPath?: string) =>
  fc.asyncProperty(
    fc.commands(
      [
        fc
          .integer({ min: 0, max: 100000 })
          .map((titleSlot) => new PersistenceCommand('save', 0, titleSlot)),
        fc.constant(new PersistenceCommand('export')),
      ],
      {
        maxCommands: 8,
        size: 'max',
        ...(replayPath === undefined ? {} : { replayPath }),
      },
    ),
    async (commands) =>
      runCommands(commands, async (real, model) => {
        await corruptDatabase(real)
        assertPersistenceModel(
          (await real.reader.readConsistentSnapshot()).savedTabs,
          model.state,
        )
      }),
  )

describe('IndexedDB persistence model', () => {
  it('runs every command and identity boundary in a deterministic integration scenario', async () => {
    const commands = [
      ...URL_CASES.map((_, slot) => new PersistenceCommand('save', slot)),
      new PersistenceCommand('resave'),
      new PersistenceCommand('move', 0, 0),
      new PersistenceCommand('category', 0),
      new PersistenceCommand('move', 0, 1),
      new PersistenceCommand('invalid-save'),
      new PersistenceCommand('invalid-move'),
      new PersistenceCommand('invalid-import'),
      new PersistenceCommand('export'),
      new PersistenceCommand('delete'),
      new PersistenceCommand('resave', 1, 1),
      new PersistenceCommand('undo'),
      new PersistenceCommand('delete', 7),
      new PersistenceCommand('import'),
    ]
    await expect(runCommands(commands)).resolves.toBeUndefined()
  })

  it('restores an older Undo after a different URL was saved', async () => {
    await expect(
      runCommands([
        new PersistenceCommand('save', 2),
        new PersistenceCommand('delete', 2),
        new PersistenceCommand('save', 0),
        new PersistenceCommand('undo'),
      ]),
    ).resolves.toBeUndefined()
  })

  it('compares generated legal and rejected operations after every step', async () => {
    const parameters = persistenceParameters()
    const details = await fc.check(
      fc.asyncProperty(
        fc.commands([commandArbitrary], {
          maxCommands: parameters.maxCommands,
          size: 'max',
          ...(parameters.replayPath === undefined
            ? {}
            : { replayPath: parameters.replayPath }),
        }),
        async (commands) => runCommands(commands),
      ),
      {
        numRuns: parameters.numRuns,
        ...(parameters.seed === undefined ? {} : { seed: parameters.seed }),
        ...(parameters.path === undefined
          ? {}
          : { path: parameters.path, endOnFailure: true }),
      },
    )
    if (details.failed) {
      throw new Error(failureSummary(details))
    }
    expect(details.failed).toBe(false)
  }, 600_000)

  it('detects a real DB mutation, shrinks it, replays it and redacts payloads', async () => {
    const options = { seed: 12345, numRuns: 40 }
    const first = await fc.check(poisonedProperty(), options)
    const repeated = await fc.check(poisonedProperty(), options)
    expect(first.failed).toBe(true)
    expect(first.counterexamplePath).toBe(repeated.counterexamplePath)
    expect(first.numShrinks).toBeGreaterThan(0)
    expect(failureSummary(first)).toBe(failureSummary(repeated))
    const trace = commandTrace(first)
    const replayPath = /replayPath="([^"]+)"/.exec(trace)?.[1]
    expect(replayPath).toBeDefined()
    invariant(first.counterexamplePath !== null, 'MISSING_COUNTEREXAMPLE_PATH')
    if (first.counterexamplePath === null) {
      return
    }
    const replayed = await fc.check(poisonedProperty(replayPath), {
      seed: first.seed,
      path: first.counterexamplePath,
      endOnFailure: true,
    })
    expect(replayed.failed).toBe(true)
    const report = failureSummary(first)
    expect(report).toContain('save(0,0)')
    expect(report).toContain('12345')
    expect(report).not.toContain('https://')
    expect(report).not.toContain('private-title')
    expect(report).not.toContain('synthetic-id')
  })

  it('accepts CI optional replay variables when inputs are absent', () => {
    vi.stubEnv('PERSISTENCE_FC_RUNS', undefined)
    vi.stubEnv('PERSISTENCE_FC_COMMANDS', undefined)
    vi.stubEnv('PERSISTENCE_FC_SEED', '')
    vi.stubEnv('PERSISTENCE_FC_PATH', '')
    vi.stubEnv('PERSISTENCE_FC_REPLAY_PATH', '')
    expect(persistenceParameters()).toEqual({ numRuns: 100, maxCommands: 40 })
    vi.unstubAllEnvs()
  })

  it('refuses invalid run settings instead of silently changing the reproduction', () => {
    for (const [name, value] of [
      ['PERSISTENCE_FC_RUNS', '0'],
      ['PERSISTENCE_FC_COMMANDS', '-1'],
      ['PERSISTENCE_FC_SEED', '2147483648'],
      ['PERSISTENCE_FC_PATH', 'url:private'],
      ['PERSISTENCE_FC_REPLAY_PATH', 'https://private.invalid'],
    ]) {
      if (!name || !value) {
        throw new Error('INVALID_TEST_CASE')
      }
      vi.stubEnv(name, value)
      expect(persistenceParameters).toThrow(/INVALID/)
      vi.unstubAllEnvs()
    }
  })
})
