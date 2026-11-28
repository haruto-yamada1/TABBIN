export type ExpiredUrlRecoveryDto = {
  readonly expiredAt: number
  readonly id: string
  readonly memberships: readonly {
    readonly categoryName?: string
    readonly collectionName: string
  }[]
  readonly recoverUntil: number
  readonly title: string
  readonly url: string
}
