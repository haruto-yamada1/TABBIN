export type LegacyDomainCategoryOrderInput = {
  readonly categories: readonly string[]
  readonly order: readonly string[] | undefined
  readonly orderWithUncategorized: readonly string[] | undefined
}

export type LegacyDomainCategoryOrderResult = {
  readonly hasConflict: boolean
  readonly order: readonly string[] | undefined
}

const completeOrder = (
  order: readonly string[] | undefined,
  categories: readonly string[],
  hasUncategorizedMarker: boolean,
): LegacyDomainCategoryOrderResult => {
  if (!order) {
    return { hasConflict: false, order: undefined }
  }
  const markerCount = hasUncategorizedMarker
    ? order.filter((category) => category === '__uncategorized').length
    : 0
  const filtered = hasUncategorizedMarker
    ? order.filter((category) => category !== '__uncategorized')
    : [...order]
  const categorySet = new Set(categories)
  const orderedSet = new Set(filtered)
  return {
    hasConflict:
      markerCount > 1 ||
      orderedSet.size !== filtered.length ||
      filtered.some((category) => !categorySet.has(category)),
    order: [
      ...filtered,
      ...categories.filter((category) => !orderedSet.has(category)),
    ],
  }
}

const haveSameOrder = (
  left: readonly string[],
  right: readonly string[],
): boolean =>
  left.length === right.length &&
  left.every((category, index) => category === right[index])

export const mapLegacyDomainCategoryOrder = (
  input: LegacyDomainCategoryOrderInput,
): LegacyDomainCategoryOrderResult => {
  const plain = completeOrder(input.order, input.categories, false)
  const withUncategorized = completeOrder(
    input.orderWithUncategorized,
    input.categories,
    true,
  )
  return {
    hasConflict:
      plain.hasConflict ||
      withUncategorized.hasConflict ||
      Boolean(
        plain.order &&
        withUncategorized.order &&
        !haveSameOrder(plain.order, withUncategorized.order),
      ),
    order: plain.order ?? withUncategorized.order,
  }
}
