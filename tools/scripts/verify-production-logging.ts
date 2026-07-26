import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import ts from 'typescript'

const projectRoot = path.resolve(import.meta.dirname, '../..')
const sourceRoot = path.join(projectRoot, 'src')
const outputRoots = [
  path.join(projectRoot, '.output/chrome-mv3'),
  path.join(projectRoot, '.output/firefox-mv2'),
]
const consoleMethods = new Set(['debug', 'error', 'info', 'log', 'warn'])
const MIN_DIAGNOSTIC_FRAGMENT_LENGTH = 12
const STRUCTURED_LOG_EVENT = 'background_message_received'

const collectFiles = (root: string, predicate: (file: string) => boolean) => {
  const files: string[] = []
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        visit(entryPath)
      } else if (entry.isFile() && predicate(entryPath)) {
        files.push(entryPath)
      }
    }
  }
  visit(root)
  return files
}

const isProductionSource = (file: string): boolean =>
  /\.(?:ts|tsx)$/u.test(file) &&
  !/\.(?:test|spec|stories?)\.(?:ts|tsx)$/u.test(file) &&
  !file.includes(`${path.sep}test${path.sep}`)

const collectLiteralFragments = (node: ts.Node): string[] => {
  const fragments: string[] = []
  const visit = (child: ts.Node): void => {
    if (ts.isStringLiteralLike(child)) {
      fragments.push(child.text)
    } else if (ts.isTemplateExpression(child)) {
      fragments.push(child.head.text)
      for (const span of child.templateSpans) {
        fragments.push(span.literal.text)
      }
    }
    ts.forEachChild(child, visit)
  }
  visit(node)
  return fragments
}

const getDirectConsoleFragments = (node: ts.Node): string[] => {
  if (
    !ts.isCallExpression(node) ||
    !ts.isPropertyAccessExpression(node.expression) ||
    !ts.isIdentifier(node.expression.expression) ||
    node.expression.expression.text !== 'console' ||
    !consoleMethods.has(node.expression.name.text)
  ) {
    return []
  }
  return node.arguments.flatMap(collectLiteralFragments)
}

const collectConsoleFragmentsFromSource = (source: ts.SourceFile): string[] => {
  const fragments: string[] = []
  const visit = (node: ts.Node): void => {
    fragments.push(...getDirectConsoleFragments(node))
    ts.forEachChild(node, visit)
  }
  visit(source)
  return fragments
}

const collectDirectConsoleFragments = (): string[] => {
  const fragments = new Set<string>()
  for (const file of collectFiles(sourceRoot, isProductionSource)) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    )
    for (const fragment of collectConsoleFragmentsFromSource(source)) {
      const trimmed = fragment.trim()
      if (trimmed.length >= MIN_DIAGNOSTIC_FRAGMENT_LENGTH) {
        fragments.add(trimmed)
      }
    }
  }
  return [...fragments]
}

const readProductionJavaScript = (outputRoot: string) => {
  if (!existsSync(outputRoot) || !statSync(outputRoot).isDirectory()) {
    throw new Error(`Production output is missing: ${outputRoot}`)
  }
  const bundleParts: string[] = []
  const directConsoleFragments: string[] = []
  for (const file of collectFiles(outputRoot, (entry) =>
    entry.endsWith('.js'),
  )) {
    const code = readFileSync(file, 'utf8')
    bundleParts.push(code)
    directConsoleFragments.push(
      ...collectConsoleFragmentsFromSource(
        ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true),
      ),
    )
  }
  return {
    bundle: bundleParts.join('\n'),
    directConsoleFragments,
  }
}

const fragments = collectDirectConsoleFragments()
for (const outputRoot of outputRoots) {
  const { bundle, directConsoleFragments } =
    readProductionJavaScript(outputRoot)
  const leakedFragments = fragments.filter((fragment) =>
    directConsoleFragments.includes(fragment),
  )
  if (leakedFragments.length > 0) {
    throw new Error(
      `Legacy direct console diagnostics remain in ${outputRoot}: ${leakedFragments.slice(0, 10).join(', ')}`,
    )
  }
  if (!bundle.includes(STRUCTURED_LOG_EVENT)) {
    throw new Error(`Structured logger event is missing from ${outputRoot}`)
  }
}

console.log(
  `production logging verified (${fragments.length} legacy fragments removed)`,
)
