import { describe, expect, it } from 'vitest'

import type { IdGeneratorPort } from '@/contexts/saved-tabs/application/ports/IdGeneratorPort'
import type {
  PersistenceChangeEvent,
  PersistenceChangePort,
} from '@/contexts/saved-tabs/application/ports/PersistenceChangePort'
import type {
  PersistenceCommitOptions,
  PersistenceCommitResult,
  PersistenceV2UnitOfWorkPort,
  PersistenceV2WritePlan,
} from '@/contexts/saved-tabs/application/ports/PersistenceV2UnitOfWorkPort'

import { createPersistenceMutationCoordinator } from './PersistenceMutationCoordinatorService'

const plan: PersistenceV2WritePlan = {
  urls: { delete: ['url-1'] },
}

const changeId = '11111111-1111-4111-8111-111111111111'

type CommitCall = {
  readonly options: PersistenceCommitOptions | undefined
  readonly plan: PersistenceV2WritePlan
}

class FakePersistenceV2UnitOfWorkPort implements PersistenceV2UnitOfWorkPort {
  readonly commitCalls: CommitCall[] = []
  private readonly commitImplementation: (
    plan: PersistenceV2WritePlan,
    options?: PersistenceCommitOptions,
  ) => Promise<PersistenceCommitResult>

  constructor(
    commitImplementation: (
      plan: PersistenceV2WritePlan,
      options?: PersistenceCommitOptions,
    ) => Promise<PersistenceCommitResult>,
  ) {
    this.commitImplementation = commitImplementation
  }

  readonly commit = async (
    plan: PersistenceV2WritePlan,
    options?: PersistenceCommitOptions,
  ): Promise<PersistenceCommitResult> => {
    this.commitCalls.push({ options, plan })
    return this.commitImplementation(plan, options)
  }

  readonly readRevision = async (): Promise<number> => 0
}

class FakePersistenceChangePort implements PersistenceChangePort {
  readonly publishedEvents: PersistenceChangeEvent[] = []
  private readonly publishImplementation: (
    event: PersistenceChangeEvent,
  ) => Promise<void>

  constructor(
    publishImplementation: (
      event: PersistenceChangeEvent,
    ) => Promise<void> = async () => {},
  ) {
    this.publishImplementation = publishImplementation
  }

  readonly publish = async (event: PersistenceChangeEvent): Promise<void> => {
    this.publishedEvents.push(event)
    return this.publishImplementation(event)
  }

  readonly subscribe = (): (() => void) => () => {}
}

class FakeIdGeneratorPort implements IdGeneratorPort {
  generateCalls = 0
  private readonly generateImplementation: () => string

  constructor(generateImplementation: () => string) {
    this.generateImplementation = generateImplementation
  }

  readonly generate = (): string => {
    this.generateCalls += 1
    return this.generateImplementation()
  }
}

const createDeferred = <Value>() => {
  let resolve!: (value: Value) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<Value>((_resolve, _reject) => {
    resolve = _resolve
    reject = _reject
  })
  return { promise, reject, resolve }
}

describe('PersistenceMutationCoordinator', () => {
  it('commit 完了後にだけ ID を生成して revision と scope 順をそのまま publish する', async () => {
    const commitResult: PersistenceCommitResult = {
      changedScopes: ['urls', 'collections', 'memberships'],
      revision: 42,
    }
    const options: PersistenceCommitOptions = { durability: 'strict' }
    const deferred = createDeferred<PersistenceCommitResult>()
    const callOrder: string[] = []
    const unitOfWork = new FakePersistenceV2UnitOfWorkPort(async () => {
      callOrder.push('commit')
      return deferred.promise
    })
    const idGenerator = new FakeIdGeneratorPort(() => {
      callOrder.push('generate')
      return changeId
    })
    const changePort = new FakePersistenceChangePort(async () => {
      callOrder.push('publish')
    })
    const coordinator = createPersistenceMutationCoordinator({
      changePort,
      idGenerator,
      unitOfWork,
    })

    const outcomePromise = coordinator.commit(plan, options)

    expect(callOrder).toStrictEqual(['commit'])
    expect(unitOfWork.commitCalls).toStrictEqual([{ options, plan }])
    expect(unitOfWork.commitCalls[0]?.options).toBe(options)

    deferred.resolve(commitResult)
    const outcome = await outcomePromise

    const expectedEvent: PersistenceChangeEvent = {
      changeId,
      revision: 42,
      scopes: ['urls', 'collections', 'memberships'],
    }
    expect(callOrder).toStrictEqual(['commit', 'generate', 'publish'])
    expect(changePort.publishedEvents).toStrictEqual([expectedEvent])
    expect(outcome).toStrictEqual({
      commitResult,
      event: expectedEvent,
      kind: 'committed_and_published',
    })
  })

  it('commit rejection を同一 error のまま返し ID 生成も publish もしない', async () => {
    const commitError = new Error('indexed-db transaction aborted')
    const unitOfWork = new FakePersistenceV2UnitOfWorkPort(async () => {
      throw commitError
    })
    const idGenerator = new FakeIdGeneratorPort(() => changeId)
    const changePort = new FakePersistenceChangePort()
    const coordinator = createPersistenceMutationCoordinator({
      changePort,
      idGenerator,
      unitOfWork,
    })

    await expect(coordinator.commit(plan)).rejects.toBe(commitError)

    expect(unitOfWork.commitCalls).toHaveLength(1)
    expect(idGenerator.generateCalls).toBe(0)
    expect(changePort.publishedEvents).toStrictEqual([])
  })

  it('publish 完了前に committed_and_published outcome を返さない', async () => {
    const commitResult: PersistenceCommitResult = {
      changedScopes: ['urls', 'memberships'],
      revision: 43,
    }
    const publishDeferred = createDeferred<undefined>()
    const publishStarted = createDeferred<undefined>()
    const unitOfWork = new FakePersistenceV2UnitOfWorkPort(
      async () => commitResult,
    )
    const idGenerator = new FakeIdGeneratorPort(() => changeId)
    const changePort = new FakePersistenceChangePort(async () => {
      publishStarted.resolve(undefined)
      return publishDeferred.promise
    })
    const coordinator = createPersistenceMutationCoordinator({
      changePort,
      idGenerator,
      unitOfWork,
    })
    let settled = false

    const outcomePromise = coordinator.commit(plan).then((outcome) => {
      settled = true
      return outcome
    })
    await publishStarted.promise

    expect(changePort.publishedEvents).toHaveLength(1)
    expect(settled).toBe(false)

    publishDeferred.resolve(undefined)
    const outcome = await outcomePromise

    expect(outcome).toStrictEqual({
      commitResult,
      event: {
        changeId,
        revision: 43,
        scopes: ['urls', 'memberships'],
      },
      kind: 'committed_and_published',
    })
    expect(unitOfWork.commitCalls).toHaveLength(1)
  })

  it('publish の非同期 rejection は commit 済みの typed/redacted partial-success outcome にする', async () => {
    const commitResult: PersistenceCommitResult = {
      changedScopes: ['memberships', 'urls'],
      revision: 43,
    }
    const rawPayload = { url: 'https://private.example/path' }
    const publishError = new Error('private transport error', {
      cause: rawPayload,
    })
    const unitOfWork = new FakePersistenceV2UnitOfWorkPort(
      async () => commitResult,
    )
    const idGenerator = new FakeIdGeneratorPort(() => changeId)
    const changePort = new FakePersistenceChangePort(async () => {
      await Promise.resolve()
      throw publishError
    })
    const coordinator = createPersistenceMutationCoordinator({
      changePort,
      idGenerator,
      unitOfWork,
    })

    const outcome = await coordinator.commit(plan)

    expect(outcome).toStrictEqual({
      commitResult,
      diagnostic: {
        code: 'PERSISTENCE_NOTIFICATION_FAILED_AFTER_COMMIT',
        revision: 43,
        scopes: ['memberships', 'urls'],
        stage: 'change_publication',
      },
      kind: 'commit_succeeded_notification_failed',
    })
    expect(outcome.commitResult).toBe(commitResult)
    expect(unitOfWork.commitCalls).toHaveLength(1)
    expect(idGenerator.generateCalls).toBe(1)
    expect(changePort.publishedEvents).toHaveLength(1)
    expect(JSON.stringify(outcome)).not.toContain(publishError.message)
    expect(JSON.stringify(outcome)).not.toContain(rawPayload.url)
  })

  it('ID 生成失敗も raw cause を含めず commit 済み partial-success outcome にする', async () => {
    const commitResult: PersistenceCommitResult = {
      changedScopes: ['collections', 'categories'],
      revision: 44,
    }
    const rawCause = { collectionName: 'private collection' }
    const unitOfWork = new FakePersistenceV2UnitOfWorkPort(
      async () => commitResult,
    )
    const idGenerator = new FakeIdGeneratorPort(() => {
      throw new Error('private identifier error', { cause: rawCause })
    })
    const changePort = new FakePersistenceChangePort()
    const coordinator = createPersistenceMutationCoordinator({
      changePort,
      idGenerator,
      unitOfWork,
    })

    const outcome = await coordinator.commit(plan)

    expect(outcome).toStrictEqual({
      commitResult,
      diagnostic: {
        code: 'PERSISTENCE_NOTIFICATION_FAILED_AFTER_COMMIT',
        revision: 44,
        scopes: ['collections', 'categories'],
        stage: 'change_id_generation',
      },
      kind: 'commit_succeeded_notification_failed',
    })
    expect(unitOfWork.commitCalls).toHaveLength(1)
    expect(idGenerator.generateCalls).toBe(1)
    expect(changePort.publishedEvents).toStrictEqual([])
    expect(JSON.stringify(outcome)).not.toContain('private identifier error')
    expect(JSON.stringify(outcome)).not.toContain(rawCause.collectionName)
  })
})
