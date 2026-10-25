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

export const canReorderFavoriteDisplay = (
  urls: readonly { isFavorite?: boolean }[] | undefined,
  only: boolean,
  sortAllowsReorder = true,
): boolean =>
  sortAllowsReorder && !only && !(urls ?? []).some((url) => url.isFavorite)
