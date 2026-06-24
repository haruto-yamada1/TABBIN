/**
 * presentation 層で扱う `CustomProject` の view-model。
 *
 * domain `CustomProject` を UI 描画に必要な形に丸めた読み取り専用モデル。
 * 既存の `CustomProjectCard` / `CustomProjectSection` が要求する形に揃え、
 * コンポーネントへそのまま props として渡せることを目標にする。
 */
export interface CustomProjectViewModel {
  readonly id: string
  readonly name: string
  readonly urlIds: readonly string[]
  readonly urls: readonly {
    readonly id?: string
    readonly url: string
    readonly title: string
    readonly category?: string
  }[]
  readonly categories: readonly string[]
  readonly categoryOrder: readonly string[]
  readonly displayUrlCount: number
  readonly hasUrls: boolean
  readonly updatedAt: number
  readonly createdAt: number
}

/**
 * domain `CustomProject` を view-model へ変換する純関数。
 *
 * branded な `CustomProjectId` / `UrlRecordId` などを含む entity を受け取れる
 * よう、`urlIds` は readonly 許容にしている。`toCustomProjectViewModel` の
 * 利用側 (`createDomainModeViewModel` / `createCustomModeViewModel`) は
 * presentation 層で branded 型を意識せず `readonly` として扱える。
 */
export const toCustomProjectViewModel = (project: {
  id: string
  name: string
  urlIds?: readonly string[]
  urls?: readonly {
    id?: string
    url: string
    title: string
    category?: string
  }[]
  categories: readonly string[]
  categoryOrder?: readonly string[]
  createdAt: number
  updatedAt: number
}): CustomProjectViewModel => {
  const urlIds = project.urlIds ?? []
  const urls = project.urls ?? []
  const displayUrlCount = urls.length > 0 ? urls.length : urlIds.length
  return {
    categories: [...project.categories],
    categoryOrder: [...(project.categoryOrder ?? project.categories)],
    createdAt: project.createdAt,
    displayUrlCount,
    hasUrls: displayUrlCount > 0,
    id: project.id,
    name: project.name,
    updatedAt: project.updatedAt,
    urlIds: [...urlIds],
    urls: [...urls],
  }
}
