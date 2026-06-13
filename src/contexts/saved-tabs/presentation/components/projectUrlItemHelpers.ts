const getCategoryDisplayName = (category?: string) => {
  if (!category) {
    return ''
  }
  const parts = category.split('/')
  return parts.at(-1)
}

const getCategoryLevel = (category?: string) => {
  if (!category) {
    return 0
  }
  return category.split('/').length - 1
}

export { getCategoryDisplayName, getCategoryLevel }
