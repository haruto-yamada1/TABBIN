/**
 * Custom project の undo に必要な rich field を保持する application DTO。
 * storage/repository の raw 型を presentation へ公開しないための境界型。
 */
export type SavedTabsCustomProjectRawSnapshotDto = {
  readonly id: string
  readonly name: string
  readonly categories: readonly string[]
  readonly createdAt: number
  readonly updatedAt: number
  readonly urlIds?: readonly string[]
  readonly urls?: readonly {
    readonly id?: string
    readonly url: string
    readonly title: string
    readonly savedAt?: number
  }[]
  readonly urlMetadata?: Readonly<
    Record<string, { readonly notes?: string; readonly category?: string }>
  >
  readonly projectKeywords?: {
    readonly urlKeywords: readonly string[]
    readonly titleKeywords: readonly string[]
    readonly domainKeywords: readonly string[]
  }
  readonly categoryOrder?: readonly string[]
}
