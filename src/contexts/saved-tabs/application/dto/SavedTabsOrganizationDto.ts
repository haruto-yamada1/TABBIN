import { z } from 'zod'

const MAX_IDENTIFIER_LENGTH = 200
const MAX_TARGET_URLS = 100
const MAX_PROJECT_NAME_LENGTH = 100

const identifier = z.string().trim().min(1).max(MAX_IDENTIFIER_LENGTH)
const urlIds = z
  .array(identifier)
  .min(1)
  .max(MAX_TARGET_URLS)
  .refine((ids) => new Set(ids).size === ids.length)

export const savedTabsOrganizationProposalSchema = z.discriminatedUnion(
  'kind',
  [
    z.strictObject({
      kind: z.literal('move_urls'),
      sourceProjectId: identifier,
      targetProjectId: identifier,
      urlIds,
    }),
    z.strictObject({
      categoryId: identifier.nullable(),
      kind: z.literal('set_category'),
      projectId: identifier,
      urlIds,
    }),
    z.strictObject({ kind: z.literal('delete_urls'), urlIds }),
    z.strictObject({
      kind: z.literal('create_project'),
      name: z.string().trim().min(1).max(MAX_PROJECT_NAME_LENGTH),
    }),
  ],
)

export type SavedTabsOrganizationProposal = z.infer<
  typeof savedTabsOrganizationProposalSchema
>

export type SavedTabsOrganizationCatalogDto = {
  readonly memberships: readonly {
    readonly categoryId?: string
    readonly projectId: string
    readonly urlId: string
  }[]
  readonly projects: readonly {
    readonly categories: readonly {
      readonly id: string
      readonly name: string
    }[]
    readonly id: string
    readonly name: string
  }[]
  readonly revision: number
}

export type SavedTabsOrganizationPreviewDto = {
  readonly expiresAt: number
  readonly id: string
  readonly proposal: SavedTabsOrganizationProposal
  readonly revision: number
  readonly targets: readonly {
    readonly after: string
    readonly before: string
    readonly id: string
    readonly title: string
    readonly url: string
  }[]
}

export type SavedTabsOrganizationExecuteResultDto = {
  readonly notificationFailed: boolean
  readonly undoId: string
}

export type SavedTabsOrganizationUndoResultDto = {
  readonly notificationFailed: boolean
}
