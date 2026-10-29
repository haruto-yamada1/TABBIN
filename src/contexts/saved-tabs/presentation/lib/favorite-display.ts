import { arrayMove } from '@dnd-kit/sortable'

/** Stable display-only partition. Never writes membership/manual ordering. */
export const getFavoriteDisplayUrls = <T extends { isFavorite?: boolean }>(
  urls: T[],
  favoritesOnly = false,
): T[] => {
  const favorites = urls.filter((url) => url.isFavorite)
  if (favoritesOnly) {
    return favorites
  }
  if (favorites.length === 0) {
    return urls
  }
  return [...favorites, ...urls.filter((url) => !url.isFavorite)]
}

/** Reorder only visible URLs of the same favorite state in their manual slots. */
export const reorderFavoriteUrls = <
  T extends { url: string; isFavorite?: boolean },
>(
  urls: T[],
  activeUrl: string,
  overUrl: string,
  visibleUrls: T[] = urls,
): T[] | null => {
  const active = urls.find((item) => item.url === activeUrl)
  const over = urls.find((item) => item.url === overUrl)
  if (
    !active ||
    !over ||
    Boolean(active.isFavorite) !== Boolean(over.isFavorite)
  ) {
    return null
  }
  const visible = new Set(visibleUrls.map((item) => item.url))
  const inBucket = (item: T) =>
    visible.has(item.url) &&
    Boolean(item.isFavorite) === Boolean(active.isFavorite)
  const bucket = visibleUrls.filter(inBucket)
  const from = bucket.findIndex((item) => item.url === activeUrl)
  const to = bucket.findIndex((item) => item.url === overUrl)
  if (from < 0 || to < 0 || from === to) {
    return null
  }
  const reordered = arrayMove(bucket, from, to).values()
  return urls.map((item) =>
    inBucket(item) ? (reordered.next().value ?? item) : item,
  )
}
