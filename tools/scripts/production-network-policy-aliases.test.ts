import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'

import type { NetworkCallsiteKind } from './production-network-policy'
import { collectPotentialNetworkAliasKinds } from './production-network-policy-aliases'

describe('collectPotentialNetworkAliasKinds', () => {
  it('stops evaluating assignments once their alias kinds converge', () => {
    const source = ts.createSourceFile(
      'aliases.ts',
      `
        const first = fetch
        const second = first
      `,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    const resolveDirectReferences = vi.fn(
      (node: ts.Node): ReadonlySet<NetworkCallsiteKind> =>
        ts.isIdentifier(node) && node.text === 'fetch'
          ? new Set(['fetch'])
          : new Set(),
    )

    const summaries = collectPotentialNetworkAliasKinds(
      source,
      resolveDirectReferences,
    )

    expect(summaries.get(source)?.bindings.get('second')).toEqual(
      new Set(['fetch']),
    )
    expect(resolveDirectReferences).toHaveBeenCalledTimes(4)
  })
})
