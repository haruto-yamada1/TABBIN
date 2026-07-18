import {
  PERSISTENCE_DATABASE_NAME,
  PERSISTENCE_DATABASE_VERSION,
  upgradePersistenceDatabase,
} from './persistenceDatabaseSchema'

export type IndexedDbBlockedUpgrade = {
  readonly databaseName: string
  readonly newVersion: number | null
  readonly oldVersion: number
}

export type IndexedDbConnectionManagerOptions = {
  readonly databaseName?: string
  readonly databaseVersion?: number
  readonly indexedDb?: IDBFactory
  readonly onBlocked?: (upgrade: IndexedDbBlockedUpgrade) => void
  readonly onVersionChange?: (event: IDBVersionChangeEvent) => void
  readonly upgrade?: (
    database: IDBDatabase,
    oldVersion: number,
    newVersion: number | null,
    transaction: IDBTransaction,
  ) => void
}

export class IndexedDbConnectionError extends Error {
  readonly code: 'OPEN_FAILED' | 'UPGRADE_FAILED'

  constructor(
    code: 'OPEN_FAILED' | 'UPGRADE_FAILED',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.code = code
    this.name = 'IndexedDbConnectionError'
  }
}

const isIndexedDbFactory = (value: unknown): value is IDBFactory =>
  typeof value === 'object' &&
  value !== null &&
  'open' in value &&
  typeof value.open === 'function'

export class IndexedDbConnectionManager {
  private database: IDBDatabase | undefined
  private opening: Promise<IDBDatabase> | undefined

  private readonly databaseName: string
  private readonly databaseVersion: number
  private readonly indexedDb: IDBFactory
  private readonly onBlocked:
    | ((upgrade: IndexedDbBlockedUpgrade) => void)
    | undefined
  private readonly onVersionChange:
    | ((event: IDBVersionChangeEvent) => void)
    | undefined
  private readonly upgrade: NonNullable<
    IndexedDbConnectionManagerOptions['upgrade']
  >

  constructor(options: IndexedDbConnectionManagerOptions = {}) {
    const indexedDb: unknown = options.indexedDb ?? globalThis.indexedDB
    if (!isIndexedDbFactory(indexedDb)) {
      throw new IndexedDbConnectionError(
        'OPEN_FAILED',
        'IndexedDB is not available in this extension context.',
      )
    }

    this.databaseName = options.databaseName ?? PERSISTENCE_DATABASE_NAME
    this.databaseVersion =
      options.databaseVersion ?? PERSISTENCE_DATABASE_VERSION
    this.indexedDb = indexedDb
    this.onBlocked = options.onBlocked
    this.onVersionChange = options.onVersionChange
    this.upgrade =
      options.upgrade ??
      ((database, oldVersion) => {
        upgradePersistenceDatabase(database, oldVersion)
      })
  }

  async open(): Promise<IDBDatabase> {
    if (this.database) {
      return this.database
    }
    if (this.opening) {
      return this.opening
    }

    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.indexedDb.open(
        this.databaseName,
        this.databaseVersion,
      )
      let upgradeError: unknown

      request.addEventListener('blocked', (event) => {
        this.onBlocked?.({
          databaseName: this.databaseName,
          newVersion: event.newVersion,
          oldVersion: event.oldVersion,
        })
      })
      request.addEventListener('upgradeneeded', (event) => {
        try {
          const transaction = request.transaction
          if (!transaction) {
            throw new Error('IndexedDB upgrade transaction is unavailable.')
          }
          this.upgrade(
            request.result,
            event.oldVersion,
            event.newVersion,
            transaction,
          )
        } catch (error) {
          upgradeError = error
          request.transaction?.abort()
        }
      })
      request.addEventListener('error', () => {
        this.opening = undefined
        reject(
          new IndexedDbConnectionError(
            upgradeError ? 'UPGRADE_FAILED' : 'OPEN_FAILED',
            upgradeError
              ? 'IndexedDB schema upgrade failed.'
              : 'IndexedDB connection open failed.',
            { cause: upgradeError ?? request.error },
          ),
        )
      })
      request.addEventListener('success', () => {
        const database = request.result
        database.addEventListener('versionchange', (event) => {
          database.close()
          if (this.database === database) {
            this.database = undefined
          }
          this.onVersionChange?.(event)
        })
        database.addEventListener('close', () => {
          if (this.database === database) {
            this.database = undefined
          }
        })
        this.database = database
        this.opening = undefined
        resolve(database)
      })
    })
    const managedOpening = opening.catch((error: unknown) => {
      if (this.opening === managedOpening) {
        this.opening = undefined
      }
      if (error instanceof IndexedDbConnectionError) {
        throw error
      }

      throw new IndexedDbConnectionError(
        'OPEN_FAILED',
        'IndexedDB connection open failed.',
        { cause: error },
      )
    })
    this.opening = managedOpening

    return managedOpening
  }

  close(): void {
    this.database?.close()
    this.database = undefined
  }
}
