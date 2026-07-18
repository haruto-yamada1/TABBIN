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
  private eventDrainBlocked = false
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
    this.dependencies = {
      ...dependencies,
      relevantScopes: new Set(dependencies.relevantScopes),
    }
  }

  readonly start = async (): Promise<void> => {
    if (this.disposed) {
      return
    }
    if (this.startPromise) {
      return this.startPromise
    }

    const attempt = this.startOnce()
    const trackedAttempt = attempt.catch((error: unknown) => {
      this.startPromise = undefined
      throw error
    })
    this.startPromise = trackedAttempt
    return this.startPromise
  }

  readonly checkCurrentRevision = async (): Promise<void> => {
    if (this.isDisposed()) {
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
    this.eventDrainBlocked = false
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
    this.eventDrainBlocked = false
    this.scheduleEventDrain()
  }

  private readonly queryAndApply = async (): Promise<void> => {
    const projection = await this.dependencies.query()
    if (this.disposed) {
      return
    }

    await this.dependencies.apply(projection)
    if (this.isDisposed()) {
      return
    }

    this.lastAppliedRevision = Math.max(
      this.lastAppliedRevision,
      projection.revision,
    )
    if (
      this.pendingEventRevision !== undefined &&
      this.pendingEventRevision <= this.lastAppliedRevision
    ) {
      this.pendingEventRevision = undefined
      this.eventDrainBlocked = false
    }
  }

  private async startOnce(): Promise<void> {
    this.starting = true
    let installedUnsubscribe: (() => void) | undefined
    try {
      installedUnsubscribe = this.dependencies.changePort.subscribe(
        this.handleChange,
      )
      this.unsubscribe = installedUnsubscribe
      await this.enqueue(this.queryAndApply)
      this.starting = false
      this.scheduleEventDrain()
    } catch (error) {
      this.pendingEventRevision = undefined
      this.eventDrainBlocked = false
      this.starting = false
      if (installedUnsubscribe && this.unsubscribe === installedUnsubscribe) {
        this.unsubscribe = undefined
        try {
          installedUnsubscribe()
        } catch {
          // Startup の元エラーを unsubscribe 失敗で隠さない。
        }
      }
      throw error
    }
  }

  private isDisposed(): boolean {
    return this.disposed
  }

  private retainPendingEventRevision(hintedRevision: number): void {
    this.pendingEventRevision = Math.max(
      this.pendingEventRevision ?? Number.NEGATIVE_INFINITY,
      hintedRevision,
    )
    this.eventDrainBlocked = true
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
      this.eventDrainBlocked ||
      this.eventDrainPromise ||
      this.pendingEventRevision === undefined
    ) {
      return
    }

    const scheduled = this.enqueue(this.drainPendingEvents)
    this.eventDrainPromise = scheduled

    const finish = (): void => {
      this.eventDrainPromise = undefined
      this.scheduleEventDrain()
    }
    void scheduled.then(finish, finish)
  }

  private readonly drainPendingEvents = async (): Promise<void> => {
    const hintedRevision = this.pendingEventRevision
    this.pendingEventRevision = undefined
    if (hintedRevision === undefined) {
      return
    }

    try {
      await this.queryAndApply()
    } catch {
      if (this.isDisposed()) {
        return
      }
      this.retainPendingEventRevision(hintedRevision)
      return
    }

    if (this.isDisposed()) {
      return
    }
    if (hintedRevision > this.lastAppliedRevision) {
      this.retainPendingEventRevision(hintedRevision)
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
