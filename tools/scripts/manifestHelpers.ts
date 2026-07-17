export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const isHostPermission = (permission: string): boolean =>
  permission === '<all_urls>' || permission.includes('://')

export const readStringArray = (
  manifest: Record<string, unknown>,
  property: string,
  label: string,
): string[] => {
  const value = manifest[property]
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === 'string')
  ) {
    throw new TypeError(`${label} ${property} is missing or not a string array`)
  }
  return value
}
