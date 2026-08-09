/**
 * URL record hydrated with collection-membership metadata for application
 * commands and queries. Persistence identity remains the membership `urlId`.
 */
export type ResolvedCustomProjectUrlDto = {
  readonly category?: string
  readonly favIconUrl?: string
  readonly id: string
  readonly notes?: string
  readonly savedAt: number
  readonly title: string
  readonly url: string
}
