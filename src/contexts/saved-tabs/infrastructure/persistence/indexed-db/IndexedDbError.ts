export const toIndexedDbError = (
  value: unknown,
  fallbackMessage: string,
): Error =>
  value instanceof Error
    ? value
    : new Error(fallbackMessage, {
        cause: value,
      })
