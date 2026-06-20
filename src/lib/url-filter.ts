const normalizeExcludePatterns = (
  excludePatterns: readonly unknown[] | undefined,
): string[] =>
  (excludePatterns ?? []).reduce<string[]>((patterns, pattern) => {
    if (typeof pattern !== 'string') {
      return patterns
    }
    const normalizedPattern = pattern.trim()
    if (normalizedPattern) {
      patterns.push(normalizedPattern)
    }
    return patterns
  }, [])

const normalizeUrlCandidate = (
  url: string | null | undefined,
): string | null => {
  if (typeof url !== 'string') {
    return null
  }

  const normalizedUrl = url.trim()
  return normalizedUrl.length > 0 ? normalizedUrl : null
}

const isValidUrl = (url: string | null | undefined): boolean => {
  const normalizedUrl = normalizeUrlCandidate(url)
  if (!normalizedUrl) {
    return false
  }

  try {
    new URL(normalizedUrl)
    return true
  } catch {
    return false
  }
}

const isUrlExcludedByPatterns = (
  url: string | null | undefined,
  excludePatterns: readonly unknown[] | undefined,
): boolean => {
  const normalizedUrl = normalizeUrlCandidate(url)
  if (!normalizedUrl) {
    return false
  }

  const normalizedPatterns = normalizeExcludePatterns(excludePatterns)
  return normalizedPatterns.some((pattern) => normalizedUrl.includes(pattern))
}

const isSavableUrl = (
  url: string | null | undefined,
  excludePatterns: readonly unknown[] | undefined,
): boolean => {
  const normalizedUrl = normalizeUrlCandidate(url)
  if (!normalizedUrl) {
    return false
  }

  return (
    isValidUrl(normalizedUrl) &&
    !isUrlExcludedByPatterns(normalizedUrl, excludePatterns)
  )
}

const filterItemsBySavableUrl = <T extends { url?: string | null }>(
  items: T[],
  excludePatterns: readonly unknown[] | undefined,
): T[] => items.filter((item) => isSavableUrl(item.url, excludePatterns))

export {
  filterItemsBySavableUrl,
  isSavableUrl,
  isUrlExcludedByPatterns,
  isValidUrl,
  normalizeUrlCandidate,
}
