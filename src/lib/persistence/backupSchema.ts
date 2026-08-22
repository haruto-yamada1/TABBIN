export type BackupEnvelope<TData, TVersion extends number = number> = {
  readonly appVersion: string
  readonly data: TData
  readonly exportedAt: string
  readonly schemaVersion: TVersion
}

export const BACKUP_SCHEMA_ERROR_CODES = [
  'INVALID_SCHEMA',
  'UNSUPPORTED_FUTURE_SCHEMA',
  'UNSUPPORTED_SCHEMA_VERSION',
] as const

export type BackupSchemaErrorCode = (typeof BACKUP_SCHEMA_ERROR_CODES)[number]

const BACKUP_SCHEMA_ERROR_MESSAGES: Readonly<
  Record<BackupSchemaErrorCode, string>
> = {
  INVALID_SCHEMA: 'Backup schema is invalid',
  UNSUPPORTED_FUTURE_SCHEMA: 'Backup schema is newer than supported',
  UNSUPPORTED_SCHEMA_VERSION: 'Backup schema version is unsupported',
}

export class BackupSchemaError extends Error {
  readonly code: BackupSchemaErrorCode
  readonly currentVersion: number | undefined
  readonly receivedVersion: number | undefined

  constructor(
    code: BackupSchemaErrorCode,
    versions: {
      readonly currentVersion?: number
      readonly receivedVersion?: number
    } = {},
  ) {
    super(BACKUP_SCHEMA_ERROR_MESSAGES[code])
    this.name = 'BackupSchemaError'
    this.code = code
    this.currentVersion = versions.currentVersion
    this.receivedVersion = versions.receivedVersion
  }
}

export type BackupFormatDetection =
  | { readonly kind: 'legacy' }
  | { readonly kind: 'versioned'; readonly schemaVersion: number }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const detectBackupFormat = (input: unknown): BackupFormatDetection => {
  if (!isRecord(input)) {
    throw new BackupSchemaError('INVALID_SCHEMA')
  }
  if (!Object.hasOwn(input, 'schemaVersion')) {
    return { kind: 'legacy' }
  }

  const schemaVersion = input.schemaVersion
  if (
    typeof schemaVersion !== 'number' ||
    !Number.isSafeInteger(schemaVersion) ||
    schemaVersion < 1
  ) {
    throw new BackupSchemaError('INVALID_SCHEMA')
  }

  return { kind: 'versioned', schemaVersion }
}
