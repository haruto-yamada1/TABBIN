import { isJsonValue } from './jsonValue'

export type PersistenceCapacityErrorCode =
  | 'PERSISTENCE_QUOTA_EXCEEDED'
  | 'PERSISTENCE_DISK_WRITE_FAILED'
  | 'PERSISTENCE_STORAGE_UNAVAILABLE'
  | 'PERSISTENCE_CAPACITY_PREFLIGHT_FAILED'

export type PersistenceFailureStage =
  | 'capacity-preflight'
  | 'target-write'
  | 'transaction-abort'

export const PERSISTENCE_SOURCE_ENTITY_KINDS = [
  'analyticsViews',
  'attachments',
  'categories',
  'collections',
  'conversations',
  'groups',
  'memberships',
  'messages',
  'settings',
  'urls',
] as const

export type PersistenceSourceEntityKind =
  (typeof PERSISTENCE_SOURCE_ENTITY_KINDS)[number]

export type PersistenceSourceEntityCounts = Readonly<
  Partial<Record<PersistenceSourceEntityKind, number>>
>

export type PersistenceCapacityPlan = {
  minimumReserveBytes: number
  reserveRatio: number
  sourceEntityCounts: PersistenceSourceEntityCounts
  sourceSerializedBytes: number
  targetExpansionRatio: number
}

export type PersistenceStorageEstimate = {
  quota?: number
  usage?: number
}

export type PersistenceCapacityDiagnostics = {
  approximateSourceBytes: number
  estimatedQuotaBytes?: number
  estimatedUsageBytes?: number
  sourceEntityCounts: PersistenceSourceEntityCounts
}

type PersistenceCapacityAssessmentBase = {
  availableBytes: number
  diagnostics: PersistenceCapacityDiagnostics
  projectedTargetBytes: number
  requiredHeadroomBytes: number
  reserveBytes: number
}

export type PersistenceCapacityAssessment =
  | (PersistenceCapacityAssessmentBase & {
      status: 'ready'
    })
  | (PersistenceCapacityAssessmentBase & {
      errorCode:
        | 'PERSISTENCE_QUOTA_EXCEEDED'
        | 'PERSISTENCE_CAPACITY_PREFLIGHT_FAILED'
      status: 'blocked'
    })

export type PersistenceFailureOutcome = {
  canCutover: false
  controlState: 'failed'
  diagnostics: PersistenceCapacityDiagnostics & {
    errorCode: PersistenceCapacityErrorCode
    failedStage: PersistenceFailureStage
  }
  legacySourceAction: 'retain'
  recoveryActions: readonly ['backup', 'retry']
}

export type PersistenceStorageEstimatePort =
  () => Promise<PersistenceStorageEstimate>

const unavailableStorageErrorNames = new Set([
  'InvalidStateError',
  'NotFoundError',
  'SecurityError',
  'VersionError',
])
const persistenceSourceEntityKindSet = new Set<string>(
  PERSISTENCE_SOURCE_ENTITY_KINDS,
)

export const measureSerializedBytes = (value: unknown): number => {
  if (!isJsonValue(value)) {
    throw new TypeError('persistence source must be JSON-serializable')
  }
  const serialized = JSON.stringify(value)
  return new TextEncoder().encode(serialized).byteLength
}

const isFiniteNonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

const isSafeNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const isFinitePositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

const hasOnlyKnownSourceEntityKinds = (
  sourceEntityCounts: PersistenceSourceEntityCounts,
): boolean =>
  Object.keys(sourceEntityCounts).every((kind) =>
    persistenceSourceEntityKindSet.has(kind),
  )

const createSafeSourceEntityCounts = (
  sourceEntityCounts: PersistenceSourceEntityCounts,
): PersistenceSourceEntityCounts => {
  const safeCounts: Partial<Record<PersistenceSourceEntityKind, number>> = {}
  for (const kind of PERSISTENCE_SOURCE_ENTITY_KINDS) {
    const count = sourceEntityCounts[kind]
    if (isSafeNonNegativeInteger(count)) {
      safeCounts[kind] = count
    }
  }
  return safeCounts
}

const isValidPlan = (plan: PersistenceCapacityPlan): boolean =>
  isSafeNonNegativeInteger(plan.minimumReserveBytes) &&
  isFiniteNonNegative(plan.reserveRatio) &&
  isSafeNonNegativeInteger(plan.sourceSerializedBytes) &&
  isFinitePositive(plan.targetExpansionRatio) &&
  hasOnlyKnownSourceEntityKinds(plan.sourceEntityCounts) &&
  Object.values(plan.sourceEntityCounts).every(isSafeNonNegativeInteger)

const createDiagnostics = (
  plan: PersistenceCapacityPlan,
  estimate: PersistenceStorageEstimate,
): PersistenceCapacityDiagnostics => ({
  approximateSourceBytes: isSafeNonNegativeInteger(plan.sourceSerializedBytes)
    ? plan.sourceSerializedBytes
    : 0,
  ...(isSafeNonNegativeInteger(estimate.quota)
    ? { estimatedQuotaBytes: estimate.quota }
    : {}),
  ...(isSafeNonNegativeInteger(estimate.usage)
    ? { estimatedUsageBytes: estimate.usage }
    : {}),
  sourceEntityCounts: createSafeSourceEntityCounts(plan.sourceEntityCounts),
})

export const assessPersistenceCapacity = (
  plan: PersistenceCapacityPlan,
  estimate: PersistenceStorageEstimate,
): PersistenceCapacityAssessment => {
  const planIsValid = isValidPlan(plan)
  const projectedTargetBytes = planIsValid
    ? Math.ceil(plan.sourceSerializedBytes * plan.targetExpansionRatio)
    : 0
  const reserveBytes = planIsValid
    ? Math.max(
        plan.minimumReserveBytes,
        Math.ceil(projectedTargetBytes * plan.reserveRatio),
      )
    : 0
  const requiredHeadroomBytes = projectedTargetBytes + reserveBytes
  const requirementIsValid =
    isSafeNonNegativeInteger(projectedTargetBytes) &&
    isSafeNonNegativeInteger(reserveBytes) &&
    isSafeNonNegativeInteger(requiredHeadroomBytes)
  const { quota, usage } = estimate
  const estimateIsValid =
    isSafeNonNegativeInteger(quota) &&
    isSafeNonNegativeInteger(usage) &&
    usage <= quota
  const availableBytes = estimateIsValid ? quota - usage : 0
  const base = {
    availableBytes,
    diagnostics: createDiagnostics(plan, estimate),
    projectedTargetBytes,
    requiredHeadroomBytes,
    reserveBytes,
  }

  if (!planIsValid || !requirementIsValid || !estimateIsValid) {
    return {
      ...base,
      errorCode: 'PERSISTENCE_CAPACITY_PREFLIGHT_FAILED',
      status: 'blocked',
    }
  }

  if (availableBytes < requiredHeadroomBytes) {
    return {
      ...base,
      errorCode: 'PERSISTENCE_QUOTA_EXCEEDED',
      status: 'blocked',
    }
  }

  return {
    ...base,
    status: 'ready',
  }
}

export const runPersistenceCapacityPreflight = async (
  plan: PersistenceCapacityPlan,
  estimateStorage: PersistenceStorageEstimatePort,
): Promise<PersistenceCapacityAssessment> => {
  try {
    return assessPersistenceCapacity(plan, await estimateStorage())
  } catch {
    return assessPersistenceCapacity(plan, {})
  }
}

export const classifyPersistenceWriteFailure = (
  error: unknown,
): PersistenceCapacityErrorCode => {
  const name =
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    typeof error.name === 'string'
      ? error.name
      : ''

  if (name === 'QuotaExceededError') {
    return 'PERSISTENCE_QUOTA_EXCEEDED'
  }
  if (unavailableStorageErrorNames.has(name)) {
    return 'PERSISTENCE_STORAGE_UNAVAILABLE'
  }
  return 'PERSISTENCE_DISK_WRITE_FAILED'
}

export const createPersistenceFailureOutcome = (
  errorCode: PersistenceCapacityErrorCode,
  failedStage: PersistenceFailureStage,
  diagnostics: PersistenceCapacityDiagnostics,
): PersistenceFailureOutcome => ({
  canCutover: false,
  controlState: 'failed',
  diagnostics: {
    ...diagnostics,
    errorCode,
    failedStage,
  },
  legacySourceAction: 'retain',
  recoveryActions: ['backup', 'retry'],
})
