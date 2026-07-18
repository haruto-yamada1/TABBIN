import type {
  PersistenceChangePort,
  PersistenceChangeScope,
} from '@/contexts/saved-tabs/application/ports/PersistenceChangePort'

export type RevisionedPersistenceProjection = {
  readonly revision: number
}

export type PersistenceInvalidationCoordinator = {
  readonly checkCurrentRevision: () => Promise<void>
  readonly dispose: () => void
  readonly refresh: () => Promise<void>
  readonly start: () => Promise<void>
}

export type PersistenceInvalidationCoordinatorDependencies<
  Projection extends RevisionedPersistenceProjection,
> = {
  readonly apply: (projection: Projection) => Promise<void> | void
  readonly changePort: Pick<PersistenceChangePort, 'subscribe'>
  readonly query: () => Promise<Projection>
  readonly readCurrentRevision: () => Promise<number>
  readonly relevantScopes: ReadonlySet<PersistenceChangeScope>
}

export class PersistenceInvalidationCoordinatorService<
  Projection extends RevisionedPersistenceProjection,
> implements PersistenceInvalidationCoordinator {
  private readonly dependencies: PersistenceInvalidationCoordinatorDependencies<Projection>
  private disposed = false
  private eventDrainPromise: Promise<void> | undefined
  private lastAppliedRevision = Number.NEGATIVE_INFINITY
  private operationTail: Promise<void> = Promise.resolve()
  private pendingEventRevision: number | undefined
  private startPromise: Promise<void> | undefined
  private starting = false
  private unsubscribe: (() => void) | undefined

  constructor(
    dependencies: PersistenceInvalidationCoordinatorDependencies<Projection>,
  ) {
    this.dependencies = dependencies
  }

  readonly start = async (): Promise<void> => {
    if (this.disposed) {
      return
    }
    if (this.startPromise) {
      return this.startPromise
    }

    this.startPromise = this.startOnce()
    return this.startPromise
  }

  readonly checkCurrentRevision = async (): Promise<void> => {
    if (this.disposed) {
      return
    }

    return this.enqueue(async () => {
      const currentRevision = await this.dependencies.readCurrentRevision()
      if (this.disposed || currentRevision <= this.lastAppliedRevision) {
        return
      }

      await this.queryAndApply()
    })
  }

  readonly refresh = async (): Promise<void> => {
    if (this.disposed) {
      return
    }
    return this.enqueue(this.queryAndApply)
  }

  readonly dispose = (): void => {
    if (this.disposed) {
      return
    }

    this.disposed = true
    this.pendingEventRevision = undefined
    const unsubscribe = this.unsubscribe
    this.unsubscribe = undefined
    unsubscribe?.()
  }

  private readonly handleChange = (event: {
    readonly revision: number
    readonly scopes: readonly PersistenceChangeScope[]
  }): void => {
    if (
      this.disposed ||
      event.revision <= this.lastAppliedRevision ||
      !event.scopes.some((scope) => this.dependencies.relevantScopes.has(scope))
    ) {
      return
    }

    this.pendingEventRevision = Math.max(
      this.pendingEventRevision ?? Number.NEGATIVE_INFINITY,
      event.revision,
    )
    this.scheduleEventDrain()
  }

  private readonly queryAndApply = async (): Promise<void> => {
    const projection = await this.dependencies.query()
    if (this.disposed) {
      return
    }

    await this.dependencies.apply(projection)

    this.lastAppliedRevision = Math.max(
      this.lastAppliedRevision,
      projection.revision,
    )
  }

  private async startOnce(): Promise<void> {
    this.starting = true
    try {
      this.unsubscribe = this.dependencies.changePort.subscribe(
        this.handleChange,
      )
    } finally {
      this.starting = false
    }

    const initialQuery = this.enqueue(this.queryAndApply)
    this.scheduleEventDrain()
    await initialQuery
  }

  private async enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.operationTail.then(async () => {
      if (this.disposed) {
        return
      }
      await operation()
    })
    this.operationTail = result.catch(() => {})
    return result
  }

  private scheduleEventDrain(): void {
    if (
      this.disposed ||
      this.starting ||
      this.eventDrainPromise ||
      this.pendingEventRevision === undefined
    ) {
      return
    }

    const scheduled = this.enqueue(this.drainPendingEvents)
    this.eventDrainPromise = scheduled

    const finish = (): void => {
      if (this.eventDrainPromise !== scheduled) {
        return
      }
      this.eventDrainPromise = undefined
      this.scheduleEventDrain()
    }
    void scheduled.then(finish, finish)
  }

  private readonly drainPendingEvents = async (): Promise<void> => {
    if (this.disposed) {
      return
    }

    const hintedRevision = this.pendingEventRevision
    this.pendingEventRevision = undefined
    if (hintedRevision === undefined) {
      return
    }
    if (hintedRevision <= this.lastAppliedRevision) {
      return this.drainPendingEvents()
    }

    try {
      await this.queryAndApply()
    } catch {
      return
    }

    return this.drainPendingEvents()
  }
}

export const createPersistenceInvalidationCoordinator = <
  Projection extends RevisionedPersistenceProjection,
>(
  dependencies: PersistenceInvalidationCoordinatorDependencies<Projection>,
): PersistenceInvalidationCoordinator =>
  new PersistenceInvalidationCoordinatorService(dependencies)
