/** A single selection may contain saved URLs from several domain groups. */
export type DeleteSelectedSavedUrlsCommand = {
  readonly targets: readonly {
    readonly tabGroupId: string
    readonly urls: readonly string[]
  }[]
}
