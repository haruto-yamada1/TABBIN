export type JsonPrimitive = boolean | null | number | string

export type JsonObject = { readonly [key: string]: JsonValue }

export type JsonValue = JsonPrimitive | readonly JsonValue[] | JsonObject

const isJsonNumber = (value: number): boolean =>
  Number.isFinite(value) && !Object.is(value, -0)

const isJsonArray = (
  value: readonly unknown[],
  ancestors: Set<object>,
): value is readonly JsonValue[] => {
  if (ancestors.has(value)) {
    return false
  }
  ancestors.add(value)

  const hasOnlyJsonIndexes = Reflect.ownKeys(value).every((key) => {
    if (key === 'length') {
      return true
    }
    if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key)) {
      return false
    }
    const index = Number(key)
    return index < value.length
  })
  const result =
    hasOnlyJsonIndexes &&
    Object.keys(value).length === value.length &&
    value.every((item) => isJsonValueInternal(item, ancestors))

  ancestors.delete(value)
  return result
}

const isJsonObject = (
  value: object,
  ancestors: Set<object>,
): value is JsonObject => {
  const prototype = Reflect.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    return false
  }
  if (ancestors.has(value)) {
    return false
  }
  ancestors.add(value)

  const result = Reflect.ownKeys(value).every((key) => {
    if (typeof key !== 'string') {
      return false
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    return Boolean(
      descriptor?.enumerable &&
      'value' in descriptor &&
      isJsonValueInternal(descriptor.value, ancestors),
    )
  })

  ancestors.delete(value)
  return result
}

const isJsonValueInternal = (
  value: unknown,
  ancestors: Set<object>,
): value is JsonValue => {
  if (value === null) {
    return true
  }
  if (typeof value === 'boolean' || typeof value === 'string') {
    return true
  }
  if (typeof value === 'number') {
    return isJsonNumber(value)
  }
  if (typeof value !== 'object') {
    return false
  }
  return Array.isArray(value)
    ? isJsonArray(value, ancestors)
    : isJsonObject(value, ancestors)
}

export const isJsonValue = (value: unknown): value is JsonValue =>
  isJsonValueInternal(value, new Set<object>())
