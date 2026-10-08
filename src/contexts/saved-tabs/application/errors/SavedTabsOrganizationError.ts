export type SavedTabsOrganizationErrorCode =
  | 'INVALID_PROPOSAL'
  | 'TARGET_NOT_FOUND'
  | 'DUPLICATE_PROJECT_NAME'
  | 'NO_CHANGES'
  | 'STALE_PREVIEW'
  | 'PREVIEW_UNAVAILABLE'
  | 'UNDO_UNAVAILABLE'
  | 'UNDO_CONFLICT'
  | 'INTEGRITY_ERROR'
  | 'COMMIT_FAILED'
  | 'SESSION_CAPACITY'

export class SavedTabsOrganizationError extends Error {
  readonly code: SavedTabsOrganizationErrorCode

  constructor(code: SavedTabsOrganizationErrorCode) {
    super(code)
    this.code = code
    this.name = 'SavedTabsOrganizationError'
  }
}
