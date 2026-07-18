import { describe, expect, it } from 'vitest'

import type {
  PersistenceChangeEvent,
  PersistenceChangePort,
} from '@/contexts/saved-tabs/application/ports/PersistenceChangePort'

import { createPersistenceInvalidationCoordinator } from './PersistenceInvalidationCoordinatorService'

type TestProjection = {
  readonly revision: number
  readonly value: string
}

const createProjection = (
  revision: number,
  value = `revision-${revision}`,
): TestProjection => ({ revision, value })

const createDeferred = <Value>() => {
  let resolve!: (value: Value) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<Value>((_resolve, _reject) => {
    resolve = _resolve
    reject = _reject
  })
  return { promise, reject, resolve }
}

class FakePersistenceChangePort implements PersistenceChangePort {
  listener: ((event: PersistenceChangeEvent) => void) | undefined
  subscribeCalls = 0
  unsubscribeCalls = 0
  readonly order: string[]

  constructor(order: string[] = []) {
    this.order = order
  }

  readonly publish = async (): Promise<void> => {}

  readonly subscribe = (
    listener: (event: PersistenceChangeEvent) => void,
  ): (() => void) => {
    this.order.push('subscribe')
    this.subscribeCalls += 1
    this.listener = listener
    return () => {
      this.unsubscribeCalls += 1
      this.listener = undefined
    }
  }

  emit(event: PersistenceChangeEvent): void {
    this.listener?.(event)
  }
}

const event = (
  revision: number,
  scopes: PersistenceChangeEvent['scopes'] = ['collections'],
): PersistenceChangeEvent => ({
  changeId: `change-${revision}`,
  revision,
  scopes,
})

describe('PersistenceInvalidationCoordinator', () => {
  it('start は subscribe 後に初回 Query を実行して projection を apply する', async () => {
    const order: string[] = []
    const changePort = new FakePersistenceChangePort(order)
    const applied: TestProjection[] = []
    const coordinator = createPersistenceInvalidationCoordinator({
      apply: (projection: TestProjection) => {
        order.push('apply')
        applied.push(projection)
      },
      changePort,
      query: async () => {
        order.push('query')
        return createProjection(1)
      },
      readCurrentRevision: async () => 1,
      relevantScopes: new Set(['collections']),
    })

    await coordinator.start()

    expect(order).toStrictEqual(['subscribe', 'query', 'apply'])
    expect(applied).toStrictEqual([createProjection(1)])
    expect(changePort.subscribeCalls).toBe(1)
  })

  it('concurrent・重複 start は同じ startup を共有する', async () => {
    const changePort = new FakePersistenceChangePort()
    const queryStarted = createDeferred<undefined>()
    const queryResult = createDeferred<TestProjection>()
    let queryCalls = 0
    const coordinator = createPersistenceInvalidationCoordinator({
      apply: () => {},
      changePort,
      query: async () => {
        queryCalls += 1
        queryStarted.resolve(undefined)
        return queryResult.promise
      },
      readCurrentRevision: async () => 1,
      relevantScopes: new Set(['collections']),
    })

    const firstStart = coordinator.start()
    const concurrentStart = coordinator.start()
    await queryStarted.promise

    expect(changePort.subscribeCalls).toBe(1)
    expect(queryCalls).toBe(1)

    queryResult.resolve(createProjection(1))
    await Promise.all([firstStart, concurrentStart])
    await coordinator.start()

    expect(changePort.subscribeCalls).toBe(1)
    expect(queryCalls).toBe(1)
  })

  it('subscribe が失敗した startup はキャッシュせず後続 start で再試行できる', async () => {
    let listener: ((event: PersistenceChangeEvent) => void) | undefined
    let subscribeCalls = 0
    const changePort = {
      subscribe: (nextListener: (event: PersistenceChangeEvent) => void) => {
        subscribeCalls += 1
        if (subscribeCalls === 1) {
          throw new Error('subscribe failed')
        }
        listener = nextListener
        return () => {
          listener = undefined
        }
      },
    }
    let queryCalls = 0
    const coordinator = createPersistenceInvalidationCoordinator({
      apply: () => {},
      changePort,
      query: async () => {
        queryCalls += 1
        return createProjection(1)
      },
      readCurrentRevision: async () => 1,
      relevantScopes: new Set(['collections']),
    })

    await expect(coordinator.start()).rejects.toThrow('subscribe failed')
    expect(listener).toBeUndefined()

    await coordinator.start()

    expect(subscribeCalls).toBe(2)
    expect(queryCalls).toBe(1)
  })

  it('初回 Query が失敗した startup は購読と pending hint を破棄して再試行できる', async () => {
    let listener: ((event: PersistenceChangeEvent) => void) | undefined
    let subscribeCalls = 0
    let unsubscribeCalls = 0
    const changePort = {
      subscribe: (nextListener: (event: PersistenceChangeEvent) => void) => {
        subscribeCalls += 1
        listener = nextListener
        if (subscribeCalls === 1) {
          listener(event(99))
        }
        return () => {
          unsubscribeCalls += 1
          listener = undefined
          if (unsubscribeCalls === 1) {
            throw new Error('unsubscribe failed')
          }
        }
      },
    }
    let queryCalls = 0
    const coordinator = createPersistenceInvalidationCoordinator({
      apply: () => {},
      changePort,
      query: async () => {
        queryCalls += 1
        if (queryCalls === 1) {
          throw new Error('query failed')
        }
        return createProjection(1)
      },
      readCurrentRevision: async () => 1,
      relevantScopes: new Set(['collections']),
    })

    await expect(coordinator.start()).rejects.toThrow('query failed')
    expect(listener).toBeUndefined()
    expect(unsubscribeCalls).toBe(1)

    await coordinator.start()
    await coordinator.refresh()

    expect(subscribeCalls).toBe(2)
    expect(unsubscribeCalls).toBe(1)
    expect(queryCalls).toBe(3)
  })

  it('初回 apply が失敗した startup は購読を解除して再試行できる', async () => {
    const changePort = new FakePersistenceChangePort()
    let applyCalls = 0
    const coordinator = createPersistenceInvalidationCoordinator({
      apply: () => {
        applyCalls += 1
        if (applyCalls === 1) {
          throw new Error('apply failed')
        }
      },
      changePort,
      query: async () => createProjection(1),
      readCurrentRevision: async () => 1,
      relevantScopes: new Set(['collections']),
    })

    await expect(coordinator.start()).rejects.toThrow('apply failed')
    expect(changePort.listener).toBeUndefined()
    expect(changePort.unsubscribeCalls).toBe(1)

    await coordinator.start()

    expect(changePort.subscribeCalls).toBe(2)
    expect(changePort.unsubscribeCalls).toBe(1)
    expect(applyCalls).toBe(2)
  })

  it('新しい relevant event を hint として現在値を再 Query する', async () => {
    const changePort = new FakePersistenceChangePort()
    const queryStarted = createDeferred<undefined>()
    const queryResult = createDeferred<TestProjection>()
    const secondApply = createDeferred<undefined>()
    const applied: TestProjection[] = []
    let queryCalls = 0
    const coordinator = createPersistenceInvalidationCoordinator({
      apply: (projection: TestProjection) => {
        applied.push(projection)
        if (projection.revision === 2) {
          secondApply.resolve(undefined)
        }
      },
      changePort,
      query: async () => {
        queryCalls += 1
        if (queryCalls === 1) {
          return createProjection(1)
        }
        queryStarted.resolve(undefined)
        return queryResult.promise
      },
      readCurrentRevision: async () => 2,
      relevantScopes: new Set(['collections']),
    })
    await coordinator.start()

    changePort.emit(event(2))
    await queryStarted.promise
    queryResult.resolve(createProjection(2))
    await secondApply.promise

    expect(queryCalls).toBe(2)
    expect(applied).toStrictEqual([createProjection(1), createProjection(2)])
  })

  it('unrelated scope の event は Query しない', async () => {
    const changePort = new FakePersistenceChangePort()
    let queryCalls = 0
    const coordinator = createPersistenceInvalidationCoordinator({
      apply: () => {},
      changePort,
      query: async () => {
        queryCalls += 1
        return createProjection(1)
      },
      readCurrentRevision: async () => 1,
      relevantScopes: new Set(['collections']),
    })
    await coordinator.start()

    changePort.emit(event(99, ['analyticsViews', 'conversations']))
    await coordinator.checkCurrentRevision()

    expect(queryCalls).toBe(1)
  })

  it('caller の relevantScopes を後から変更しても event routing は変わらない', async () => {
    const changePort = new FakePersistenceChangePort()
    const relevantScopes = new Set<PersistenceChangeEvent['scopes'][number]>([
      'collections',
    ])
    const secondApply = createDeferred<undefined>()
    let queryCalls = 0
    const coordinator = createPersistenceInvalidationCoordinator({
      apply: (projection: TestProjection) => {
        if (projection.revision === 2) {
          secondApply.resolve(undefined)
        }
      },
      changePort,
      query: async () => {
        queryCalls += 1
        return createProjection(queryCalls)
      },
      readCurrentRevision: async () => 2,
      relevantScopes,
    })
    relevantScopes.clear()
    relevantScopes.add('conversations')
    await coordinator.start()

    changePort.emit(event(2, ['collections']))
    await secondApply.promise
    changePort.emit(event(3, ['conversations']))
    await coordinator.checkCurrentRevision()

    expect(queryCalls).toBe(2)
  })

  it('適用済み revision 以下の stale・duplicate・out-of-order event は Query しない', async () => {
    const changePort = new FakePersistenceChangePort()
    let queryCalls = 0
    const coordinator = createPersistenceInvalidationCoordinator({
      apply: () => {},
      changePort,
      query: async () => {
        queryCalls += 1
        return createProjection(5)
      },
      readCurrentRevision: async () => 5,
      relevantScopes: new Set(['collections']),
    })
    await coordinator.start()

    changePort.emit(event(5))
    changePort.emit(event(3))
    changePort.emit(event(4))
    changePort.emit(event(5))
    await coordinator.checkCurrentRevision()

    expect(queryCalls).toBe(1)
  })

  it('in-flight Query 中の event を最高 revision へ coalesce して直列に再 Query する', async () => {
    const changePort = new FakePersistenceChangePort()
    const secondQueryStarted = createDeferred<undefined>()
    const secondQueryResult = createDeferred<TestProjection>()
    const thirdQueryStarted = createDeferred<undefined>()
    const thirdQueryResult = createDeferred<TestProjection>()
    const thirdApply = createDeferred<undefined>()
    const applied: TestProjection[] = []
    let queryCalls = 0
    const coordinator = createPersistenceInvalidationCoordinator({
      apply: (projection: TestProjection) => {
        applied.push(projection)
        if (projection.revision === 6) {
          thirdApply.resolve(undefined)
        }
      },
      changePort,
      query: async () => {
        queryCalls += 1
        if (queryCalls === 1) {
          return createProjection(1)
        }
        if (queryCalls === 2) {
          secondQueryStarted.resolve(undefined)
          return secondQueryResult.promise
        }
        thirdQueryStarted.resolve(undefined)
        return thirdQueryResult.promise
      },
      readCurrentRevision: async () => 6,
      relevantScopes: new Set(['collections']),
    })
    await coordinator.start()

    changePort.emit(event(2))
    await secondQueryStarted.promise
    changePort.emit(event(5))
    changePort.emit(event(3))
    changePort.emit(event(6))
    changePort.emit(event(4))
    secondQueryResult.resolve(createProjection(2))
    await thirdQueryStarted.promise

    expect(queryCalls).toBe(3)
    thirdQueryResult.resolve(createProjection(6))
    await thirdApply.promise
    await coordinator.checkCurrentRevision()

    expect(queryCalls).toBe(3)
    expect(applied).toStrictEqual([
      createProjection(1),
      createProjection(2),
      createProjection(6),
    ])
  })

  it('非同期 apply の完了まで次の Query を開始しない', async () => {
    const changePort = new FakePersistenceChangePort()
    const secondApplyStarted = createDeferred<undefined>()
    const secondApplyFinished = createDeferred<undefined>()
    const thirdQueryStarted = createDeferred<undefined>()
    let queryCalls = 0
    const coordinator = createPersistenceInvalidationCoordinator({
      apply: async (projection: TestProjection) => {
        if (projection.revision === 2) {
          secondApplyStarted.resolve(undefined)
          await secondApplyFinished.promise
        }
      },
      changePort,
      query: async () => {
        queryCalls += 1
        if (queryCalls === 3) {
          thirdQueryStarted.resolve(undefined)
        }
        return createProjection(queryCalls)
      },
      readCurrentRevision: async () => 3,
      relevantScopes: new Set(['collections']),
    })
    await coordinator.start()

    changePort.emit(event(2))
    await secondApplyStarted.promise
    changePort.emit(event(3))
    expect(queryCalls).toBe(2)

    secondApplyFinished.resolve(undefined)
    await thirdQueryStarted.promise
    expect(queryCalls).toBe(3)
  })

  it('missed event を current revision check で検出して再 Query する', async () => {
    const changePort = new FakePersistenceChangePort()
    const applied: TestProjection[] = []
    let queryCalls = 0
    let revisionReads = 0
    const coordinator = createPersistenceInvalidationCoordinator({
      apply: (projection: TestProjection) => {
        applied.push(projection)
      },
      changePort,
      query: async () => {
        queryCalls += 1
        return createProjection(queryCalls === 1 ? 1 : 4)
      },
      readCurrentRevision: async () => {
        revisionReads += 1
        return 4
      },
      relevantScopes: new Set(['collections']),
    })
    await coordinator.start()

    await coordinator.checkCurrentRevision()

    expect(revisionReads).toBe(1)
    expect(queryCalls).toBe(2)
    expect(applied.at(-1)).toStrictEqual(createProjection(4))
  })

  it('current revision が未更新なら focus check は Query を省略する', async () => {
    const changePort = new FakePersistenceChangePort()
    let queryCalls = 0
    const coordinator = createPersistenceInvalidationCoordinator({
      apply: () => {},
      changePort,
      query: async () => {
        queryCalls += 1
        return createProjection(7)
      },
      readCurrentRevision: async () => 7,
      relevantScopes: new Set(['collections']),
    })
    await coordinator.start()

    await coordinator.checkCurrentRevision()

    expect(queryCalls).toBe(1)
  })

  it('explicit refresh は revision が同じでも必ず Query する', async () => {
    const changePort = new FakePersistenceChangePort()
    let queryCalls = 0
    const coordinator = createPersistenceInvalidationCoordinator({
      apply: () => {},
      changePort,
      query: async () => {
        queryCalls += 1
        return createProjection(1)
      },
      readCurrentRevision: async () => 1,
      relevantScopes: new Set(['collections']),
    })
    await coordinator.start()

    await coordinator.refresh()

    expect(queryCalls).toBe(2)
  })

  it('event-triggered Query rejection 後も後続 event で回復し unhandled rejection を出さない', async () => {
    const changePort = new FakePersistenceChangePort()
    const failedQueryStarted = createDeferred<undefined>()
    const recoveredApply = createDeferred<undefined>()
    let queryCalls = 0
    const coordinator = createPersistenceInvalidationCoordinator({
      apply: (projection: TestProjection) => {
        if (projection.revision === 3) {
          recoveredApply.resolve(undefined)
        }
      },
      changePort,
      query: async () => {
        queryCalls += 1
        if (queryCalls === 1) {
          return createProjection(1)
        }
        if (queryCalls === 2) {
          failedQueryStarted.resolve(undefined)
          throw new Error('query failed')
        }
        return createProjection(3)
      },
      readCurrentRevision: async () => 1,
      relevantScopes: new Set(['collections']),
    })
    await coordinator.start()

    changePort.emit(event(2))
    await failedQueryStarted.promise
    await coordinator.checkCurrentRevision()
    changePort.emit(event(3))
    await recoveredApply.promise

    expect(queryCalls).toBe(3)
  })

  it('event Query 失敗後は自動 retry せず focus check で hint を収束できる', async () => {
    const changePort = new FakePersistenceChangePort()
    const failedQueryStarted = createDeferred<undefined>()
    const failedQuery = createDeferred<TestProjection>()
    const recoveredApply = createDeferred<undefined>()
    let focusChecked = false
    let currentRevision = 1
    let queryCalls = 0
    const coordinator = createPersistenceInvalidationCoordinator({
      apply: (projection: TestProjection) => {
        if (projection.revision === 5) {
          recoveredApply.resolve(undefined)
        }
      },
      changePort,
      query: async () => {
        queryCalls += 1
        if (queryCalls === 1) {
          return createProjection(1)
        }
        if (queryCalls === 2) {
          failedQueryStarted.resolve(undefined)
          return failedQuery.promise
        }
        expect(focusChecked).toBe(true)
        return createProjection(5)
      },
      readCurrentRevision: async () => {
        focusChecked = true
        return currentRevision
      },
      relevantScopes: new Set(['collections']),
    })
    await coordinator.start()

    changePort.emit(event(2))
    await failedQueryStarted.promise
    changePort.emit(event(5))
    failedQuery.reject(new Error('transient query failure'))
    await coordinator.checkCurrentRevision()

    expect(queryCalls).toBe(2)

    currentRevision = 5
    await coordinator.checkCurrentRevision()
    await recoveredApply.promise

    expect(queryCalls).toBe(3)
  })

  it('event apply 失敗後は自動 retry せず explicit refresh で hint を収束できる', async () => {
    const changePort = new FakePersistenceChangePort()
    const failedApplyStarted = createDeferred<undefined>()
    const failedApply = createDeferred<undefined>()
    const recoveredApply = createDeferred<undefined>()
    let refreshRequested = false
    let queryCalls = 0
    let eventApplyCalls = 0
    const coordinator = createPersistenceInvalidationCoordinator({
      apply: async (projection: TestProjection) => {
        if (projection.revision === 1) {
          return
        }
        eventApplyCalls += 1
        if (eventApplyCalls === 1) {
          failedApplyStarted.resolve(undefined)
          await failedApply.promise
          throw new Error('transient apply failure')
        }
        expect(refreshRequested).toBe(true)
        recoveredApply.resolve(undefined)
      },
      changePort,
      query: async () => {
        queryCalls += 1
        if (queryCalls === 1) {
          return createProjection(1)
        }
        return createProjection(queryCalls === 2 ? 2 : 5)
      },
      readCurrentRevision: async () => 1,
      relevantScopes: new Set(['collections']),
    })
    await coordinator.start()

    changePort.emit(event(2))
    await failedApplyStarted.promise
    changePort.emit(event(5))
    failedApply.resolve(undefined)
    await coordinator.checkCurrentRevision()

    expect(queryCalls).toBe(2)

    refreshRequested = true
    await coordinator.refresh()
    await recoveredApply.promise

    expect(queryCalls).toBe(3)
    expect(eventApplyCalls).toBe(2)
  })

  it('apply 失敗時は revision を進めず同じ event revision で再試行できる', async () => {
    const changePort = new FakePersistenceChangePort()
    const failedApplyStarted = createDeferred<undefined>()
    const recoveredApply = createDeferred<undefined>()
    let queryCalls = 0
    let revisionTwoApplyCalls = 0
    const coordinator = createPersistenceInvalidationCoordinator({
      apply: async (projection: TestProjection) => {
        if (projection.revision !== 2) {
          return
        }
        revisionTwoApplyCalls += 1
        if (revisionTwoApplyCalls === 1) {
          failedApplyStarted.resolve(undefined)
          throw new Error('apply failed')
        }
        recoveredApply.resolve(undefined)
      },
      changePort,
      query: async () => {
        queryCalls += 1
        return createProjection(queryCalls === 1 ? 1 : 2)
      },
      readCurrentRevision: async () => 1,
      relevantScopes: new Set(['collections']),
    })
    await coordinator.start()

    changePort.emit(event(2))
    await failedApplyStarted.promise
    await coordinator.checkCurrentRevision()
    changePort.emit(event(2))
    await recoveredApply.promise

    expect(queryCalls).toBe(3)
    expect(revisionTwoApplyCalls).toBe(2)
  })

  it('dispose は一度だけ unsubscribe し in-flight 完了後も apply と後続処理を止める', async () => {
    const changePort = new FakePersistenceChangePort()
    const secondQueryStarted = createDeferred<undefined>()
    const secondQueryResult = createDeferred<TestProjection>()
    const applied: TestProjection[] = []
    let queryCalls = 0
    let revisionReads = 0
    const coordinator = createPersistenceInvalidationCoordinator({
      apply: (projection: TestProjection) => {
        applied.push(projection)
      },
      changePort,
      query: async () => {
        queryCalls += 1
        if (queryCalls === 1) {
          return createProjection(1)
        }
        secondQueryStarted.resolve(undefined)
        return secondQueryResult.promise
      },
      readCurrentRevision: async () => {
        revisionReads += 1
        return 99
      },
      relevantScopes: new Set(['collections']),
    })
    await coordinator.start()

    changePort.emit(event(2))
    await secondQueryStarted.promise
    coordinator.dispose()
    coordinator.dispose()
    secondQueryResult.resolve(createProjection(2))
    changePort.emit(event(3))
    await coordinator.checkCurrentRevision()
    await coordinator.refresh()

    expect(changePort.unsubscribeCalls).toBe(1)
    expect(queryCalls).toBe(2)
    expect(revisionReads).toBe(0)
    expect(applied).toStrictEqual([createProjection(1)])
  })

  it('非同期 apply 中の dispose は購読解除し pending event の後続 Query を止める', async () => {
    const changePort = new FakePersistenceChangePort()
    const secondApplyStarted = createDeferred<undefined>()
    const secondApplyFinished = createDeferred<undefined>()
    const secondApplyReturned = createDeferred<undefined>()
    let queryCalls = 0
    const coordinator = createPersistenceInvalidationCoordinator({
      apply: async (projection: TestProjection) => {
        if (projection.revision === 2) {
          secondApplyStarted.resolve(undefined)
          await secondApplyFinished.promise
          secondApplyReturned.resolve(undefined)
        }
      },
      changePort,
      query: async () => {
        queryCalls += 1
        return createProjection(queryCalls)
      },
      readCurrentRevision: async () => 3,
      relevantScopes: new Set(['collections']),
    })
    await coordinator.start()

    changePort.emit(event(2))
    await secondApplyStarted.promise
    changePort.emit(event(3))
    coordinator.dispose()
    secondApplyFinished.resolve(undefined)
    await secondApplyReturned.promise
    await coordinator.refresh()

    expect(changePort.unsubscribeCalls).toBe(1)
    expect(queryCalls).toBe(2)
  })
})
