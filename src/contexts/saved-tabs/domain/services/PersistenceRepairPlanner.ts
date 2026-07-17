import type {
  StorageIntegrityIssue,
  StorageIntegrityReport,
} from './PersistenceIntegrityChecker'

type AutomaticSafeInvariantCode =
  | 'DUPLICATE_MEMBERSHIP'
  | 'INVALID_ACTIVE_CHAT_REFERENCE'

type RemoveDuplicateMembershipOperation = {
  readonly collectionId: string
  readonly destructive: true
  readonly removeCount: number
  readonly type: 'REMOVE_DUPLICATE_MEMBERSHIP'
  readonly urlId: string
}

type ResetActiveChatReferenceOperation = {
  readonly conversationId: string
  readonly destructive: false
  readonly type: 'RESET_ACTIVE_CHAT_REFERENCE'
}

export type StorageRepairOperation =
  | RemoveDuplicateMembershipOperation
  | ResetActiveChatReferenceOperation

export type StorageRepairPlan = {
  readonly destructive: boolean
  readonly operations: readonly StorageRepairOperation[]
  readonly unresolvedIssues: readonly StorageIntegrityIssue[]
}

type AutomaticSafeIssue = StorageIntegrityIssue<AutomaticSafeInvariantCode>

const isAutomaticSafeIssue = (
  issue: StorageIntegrityIssue,
): issue is AutomaticSafeIssue =>
  issue.repairability === 'automatic-safe' &&
  (issue.code === 'DUPLICATE_MEMBERSHIP' ||
    issue.code === 'INVALID_ACTIVE_CHAT_REFERENCE')

const createRepairOperation = (
  issue: AutomaticSafeIssue,
): StorageRepairOperation => {
  if (issue.code === 'DUPLICATE_MEMBERSHIP') {
    return {
      collectionId: issue.collectionId,
      destructive: true,
      removeCount: issue.occurrenceCount - 1,
      type: 'REMOVE_DUPLICATE_MEMBERSHIP',
      urlId: issue.urlId,
    }
  }
  return {
    conversationId: issue.conversationId,
    destructive: false,
    type: 'RESET_ACTIVE_CHAT_REFERENCE',
  }
}

export const createStorageRepairPlan = (
  report: StorageIntegrityReport,
): StorageRepairPlan => {
  const operations: StorageRepairOperation[] = []
  const unresolvedIssues: StorageIntegrityIssue[] = []

  for (const issue of report.issues) {
    if (isAutomaticSafeIssue(issue)) {
      operations.push(createRepairOperation(issue))
    } else {
      unresolvedIssues.push(issue)
    }
  }

  return {
    destructive: operations.some(({ destructive }) => destructive),
    operations,
    unresolvedIssues,
  }
}
