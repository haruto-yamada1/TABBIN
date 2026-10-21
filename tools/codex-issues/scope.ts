import { z } from 'zod'

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    const fields = Object.entries(value).toSorted(([left], [right]) =>
      left.localeCompare(right),
    )
    return `{${fields.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function guardedPackage(before: string, after: string): boolean {
  try {
    const original = z.record(z.string(), z.unknown()).parse(JSON.parse(before))
    const proposed = z.record(z.string(), z.unknown()).parse(JSON.parse(after))
    const originalImports = z
      .record(z.string(), z.string())
      .parse(original.imports ?? {})
    const proposedImports = z
      .record(z.string(), z.string())
      .parse(proposed.imports ?? {})
    const importsAllowed =
      Object.entries(originalImports).every(
        ([alias, target]) => proposedImports[alias] === target,
      ) &&
      Object.entries(proposedImports).every(([alias, target]) => {
        if (Object.hasOwn(originalImports, alias)) {
          return originalImports[alias] === target
        }
        return (
          /^#[a-z][a-z0-9_/-]*$/iu.test(alias) &&
          target === './src/constants/language.ts'
        )
      })
    if (!importsAllowed) {
      return false
    }
    delete original.imports
    delete proposed.imports
    return canonicalJson(original) === canonicalJson(proposed)
  } catch {
    return false
  }
}
