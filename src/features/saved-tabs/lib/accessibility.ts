type Translate = (
  key: string,
  fallback?: string,
  values?: Record<string, string>,
) => string

export const getScopedNounActionLabel = (
  t: Translate,
  targetName: string | undefined,
  actionLabel: string,
): string => {
  if (!targetName) {
    return actionLabel
  }

  return t('savedTabs.accessibility.nounAction', undefined, {
    action: actionLabel,
    target: targetName,
  })
}

export const getScopedObjectActionLabel = (
  t: Translate,
  targetName: string | undefined,
  actionLabel: string,
): string => {
  if (!targetName) {
    return actionLabel
  }

  return t('savedTabs.accessibility.objectAction', undefined, {
    action: actionLabel,
    target: targetName,
  })
}

export const getScopedSortLabel = (
  t: Translate,
  targetName: string | undefined,
  sortLabel: string,
): string => {
  if (!targetName) {
    return sortLabel
  }

  return t('savedTabs.accessibility.sortState', undefined, {
    sort: sortLabel,
    target: targetName,
  })
}
