export const DEFAULT_EXCLUDE_PATTERNS = [
  'about:',
  'chrome-extension://',
  'chrome://',
]

export const mergeExcludePatterns = (
  excludePatterns: readonly string[] | undefined,
): string[] => {
  const mergedPatterns = new Set<string>(DEFAULT_EXCLUDE_PATTERNS)

  for (const pattern of excludePatterns ?? []) {
    if (typeof pattern !== 'string') {
      continue
    }
    const normalizedPattern = pattern.trim()
    if (normalizedPattern) {
      mergedPatterns.add(normalizedPattern)
    }
  }

  return [...mergedPatterns]
}

type UserSettingsDefaultsShape = {
  excludePatterns: string[]
}

export const mergeStoredUserSettingsDefaults = <
  TSettings extends UserSettingsDefaultsShape,
>(
  defaultSettings: TSettings,
  settings: Partial<TSettings>,
): TSettings => ({
  ...defaultSettings,
  ...settings,
  excludePatterns: mergeExcludePatterns(settings.excludePatterns),
})
