import { Buffer } from 'node:buffer'

import { parseSync } from '@swc/core'
import type { Plugin } from 'vite'

const virtualId = 'virtual:tabbin-rendering-profiler'
const resolvedId = `\0${virtualId}`
const importProbe = `import { Profiler as TabbinRenderingProfiler, recordRenderingCommit } from '${virtualId}';\n`
const profiledComponents = new Set([
  'DomainModeContainer',
  'CustomModeContainer',
  'SortableDomainCard',
  'CustomProjectCard',
  'DomainCardContent',
  'ProjectCardCategoryList',
  'ProjectCardUncategorizedArea',
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object'

const visitObjects = (
  node: unknown,
  visit: (value: Record<string, unknown>) => void,
) => {
  if (!isRecord(node)) {
    return
  }
  visit(node)
  for (const child of Object.values(node)) {
    if (Array.isArray(child)) {
      child.forEach((value: unknown) => {
        visitObjects(value, visit)
      })
    } else if (isRecord(child)) {
      visitObjects(child, visit)
    }
  }
}

const instrumentOperation = (source: string, kind: 'session' | 'pageQuery') => {
  const tree = parseSync(source, { syntax: 'typescript' })
  const bodies: Record<string, unknown>[] = []
  visitObjects(tree, (node) => {
    let body: unknown
    if (
      kind === 'session' &&
      node.type === 'ClassMethod' &&
      isRecord(node.key) &&
      node.key.value === 'run' &&
      isRecord(node.function)
    ) {
      body = node.function.body
    }
    if (
      kind === 'pageQuery' &&
      node.type === 'ArrowFunctionExpression' &&
      node.async === true
    ) {
      body = node.body
    }
    if (isRecord(body)) {
      bodies.push(body)
    }
  })
  const span = bodies[0]?.span
  if (
    bodies.length !== 1 ||
    !isRecord(span) ||
    typeof span.start !== 'number' ||
    typeof span.end !== 'number'
  ) {
    throw new Error(`Rendering benchmark ${kind} instrumentation is stale`)
  }
  const bytes = Buffer.from(source)
  // Keep the original body, including every return/throw, under finally.
  return `import { beginRenderingOperation } from '${virtualId}';
${bytes.subarray(0, span.start).toString('utf8')}
const endRenderingOperation = beginRenderingOperation('${kind}');
try {
${bytes.subarray(span.start, span.end - 2).toString('utf8')}
} finally { endRenderingOperation?.(); }
${bytes.subarray(span.end - 2).toString('utf8')}`
}

const readKeyAttribute = (source: string, opening: unknown): string => {
  if (!isRecord(opening) || !Array.isArray(opening.attributes)) {
    return ''
  }
  const key: unknown = opening.attributes.find(
    (attribute: unknown) =>
      isRecord(attribute) &&
      isRecord(attribute.name) &&
      attribute.name.value === 'key',
  )
  const span = isRecord(key) ? key.span : null
  if (
    !isRecord(span) ||
    typeof span.start !== 'number' ||
    typeof span.end !== 'number'
  ) {
    return ''
  }
  return ` ${Buffer.from(source)
    .subarray(span.start - 1, span.end - 1)
    .toString('utf8')}`
}

// SWC spans are UTF-8 byte positions, including comments containing Japanese.
const wrapProfiledJsx = (source: string): string | null => {
  const tree = parseSync(source, { syntax: 'typescript', tsx: true })
  const insertions: { offset: number; text: string }[] = []
  const visit = (node: unknown) => {
    if (!isRecord(node)) {
      return
    }
    const opening = node.opening
    const name = isRecord(opening) ? opening.name : null
    if (
      node.type === 'JSXElement' &&
      isRecord(name) &&
      typeof name.value === 'string' &&
      profiledComponents.has(name.value) &&
      isRecord(node.span) &&
      typeof node.span.start === 'number' &&
      typeof node.span.end === 'number'
    ) {
      const keyAttribute = readKeyAttribute(source, opening)
      insertions.push(
        {
          offset: node.span.start - 1,
          text: `<TabbinRenderingProfiler${keyAttribute} id='${name.value}' onRender={recordRenderingCommit}>`,
        },
        { offset: node.span.end - 1, text: '</TabbinRenderingProfiler>' },
      )
    }
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) {
        child.forEach(visit)
      } else if (isRecord(child)) {
        visit(child)
      }
    }
  }
  visit(tree)
  if (insertions.length === 0) {
    return null
  }
  let output = Buffer.from(source)
  for (const insertion of insertions.toSorted(
    (left, right) => right.offset - left.offset,
  )) {
    output = Buffer.concat([
      output.subarray(0, insertion.offset),
      Buffer.from(insertion.text),
      output.subarray(insertion.offset),
    ])
  }
  return importProbe + output.toString('utf8')
}

export const renderingProfilerPlugin = (): Plugin => ({
  name: 'tabbin-rendering-profiler',
  enforce: 'pre',
  resolveId(id) {
    return id === virtualId ? resolvedId : null
  },
  load(id) {
    if (id !== resolvedId) {
      return null
    }
    return `
      export { Profiler } from 'react';
      export function beginRenderingOperation(kind) {
        return globalThis.tabbinRenderingProbe?.beginOperation(kind);
      }
      export function recordRenderingCommit(id, phase, actualDuration, baseDuration, startTime, commitTime) {
        globalThis.tabbinRenderingProbe?.recordReactCommit({
          id, phase, actualDuration, baseDuration, startTime, commitTime
        });
      }
    `
  },
  transform(source, id) {
    const filename = id.split('?')[0] ?? ''
    if (filename.endsWith('/IndexedDbSavedTabsSessionService.ts')) {
      return { code: instrumentOperation(source, 'session'), map: null }
    }
    if (filename.endsWith('/GetSavedTabsPageDataQuery.ts')) {
      return { code: instrumentOperation(source, 'pageQuery'), map: null }
    }
    if (filename.endsWith('/src/lib/react/render-root.ts')) {
      const original = 'createElement(RenderErrorBoundary, recovery, node)'
      if (!source.includes(original)) {
        throw new Error('Rendering benchmark root instrumentation is stale')
      }
      return {
        code:
          importProbe +
          source.replace(
            original,
            `createElement(TabbinRenderingProfiler, { id: 'root', onRender: recordRenderingCommit }, ${original})`,
          ),
        map: null,
      }
    }
    if (
      !filename.includes('/src/contexts/saved-tabs/presentation/') ||
      !filename.endsWith('.tsx') ||
      filename.endsWith('.test.tsx') ||
      ![...profiledComponents].some((component) =>
        source.includes(`<${component}`),
      )
    ) {
      return null
    }
    const code = wrapProfiledJsx(source)
    return code === null ? null : { code, map: null }
  },
})
