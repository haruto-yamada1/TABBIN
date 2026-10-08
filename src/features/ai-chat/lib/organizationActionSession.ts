import type { SavedTabsOrganizationPreviewDto } from '@/contexts/saved-tabs/public-api'

type OrganizationActionOutcome = {
  readonly notificationFailed: boolean
  readonly preview: SavedTabsOrganizationPreviewDto
  readonly status: 'applied' | 'undone'
  readonly undoId: string | null
}

const MAX_SESSION_OUTCOMES = 20
const SESSION_LIFETIME_MS = 1_800_000
const outcomes = new Map<
  string,
  {
    readonly expiresAt: number
    readonly outcome: OrganizationActionOutcome
  }
>()

export const readOrganizationActionOutcome = (
  id: string,
): OrganizationActionOutcome | undefined => {
  const entry = outcomes.get(id)
  if (!entry || entry.expiresAt <= Date.now()) {
    outcomes.delete(id)
    return undefined
  }
  return entry.outcome
}

export const rememberOrganizationActionOutcome = (
  id: string,
  outcome: OrganizationActionOutcome,
): void => {
  for (const [key, entry] of outcomes) {
    if (
      entry.expiresAt <= Date.now() ||
      (entry.outcome.status === 'undone' && key !== id)
    ) {
      outcomes.delete(key)
    }
  }
  if (!outcomes.has(id) && outcomes.size >= MAX_SESSION_OUTCOMES) {
    const oldest = outcomes.keys().next().value
    if (oldest !== undefined) {
      outcomes.delete(oldest)
    }
  }
  outcomes.set(id, { expiresAt: Date.now() + SESSION_LIFETIME_MS, outcome })
}
