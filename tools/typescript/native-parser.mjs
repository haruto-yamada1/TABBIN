import path from 'node:path'

import {
  SyntaxKind,
  isModifier,
  isNoSubstitutionTemplateLiteral,
  isSignatureDeclaration,
  isStringLiteral,
} from 'typescript/unstable/ast'
import { createVirtualFileSystem } from 'typescript/unstable/fs'
import { API } from 'typescript/unstable/sync'

// oxlint-disable-next-line import/export -- Oxlint cannot follow this SDK subpath's re-exports; compile and native parser tests verify its exports.
export * from 'typescript/unstable/ast'
// oxlint-disable-next-line import/named -- This SDK export is verified by compile and native parser tests.
export { isPropertySignatureDeclaration as isPropertySignature } from 'typescript/unstable/ast'

/**
 * @param {string} filename
 * @param {string} sourceText
 * @returns {import('typescript/unstable/ast').SourceFile}
 */
export function parseSourceFile(filename, sourceText) {
  return withSourceParser((parse) => parse(filename, sourceText))
}

/**
 * Own one native process for an invocation; never share it between callers.
 * @template T
 * @param {(parse: typeof parseSourceFile) => T} work
 * @returns {T}
 */
export function withSourceParser(work) {
  const configFileName = path.resolve(
    process.cwd(),
    '.tabbin-native-parser',
    'tsconfig.json',
  )
  const virtualFs = createVirtualFileSystem({})
  const createConfig = (fileName) =>
    JSON.stringify({
      compilerOptions: {
        allowJs: true,
        jsx: 'preserve',
        noLib: true,
        noResolve: true,
        target: 'esnext',
        types: [],
      },
      files: [fileName],
    })
  const api = new API({
    cwd: process.cwd(),
    fs: {
      ...virtualFs,
      // Undefined delegates to the real filesystem; absent virtual files and
      // directories must remain absent throughout syntax-only parsing.
      readFile: (name) => virtualFs.readFile?.(name) ?? null,
      getAccessibleEntries: (name) =>
        virtualFs.getAccessibleEntries?.(name) ?? {
          files: [],
          directories: [],
        },
    },
  })
  /** @type {string | undefined} */
  let previousFile
  let closed = false
  /** @type {typeof parseSourceFile} */
  const parse = (filename, sourceText) => {
    if (closed) {
      throw new Error('Native parser session is closed')
    }
    const fileName = path.resolve(filename)
    // Preserve the original UTF-16 offsets when the native reader strips BOMs.
    const parserText = sourceText.startsWith('\uFEFF')
      ? ` ${sourceText.slice(1)}`
      : sourceText
    const sameFile = previousFile === fileName
    const deleted = previousFile && !sameFile ? [previousFile] : []
    for (const oldFile of deleted) {
      virtualFs.removeFile?.(oldFile)
    }
    virtualFs.writeFile?.(fileName, parserText)
    virtualFs.writeFile?.(configFileName, createConfig(fileName))
    const snapshot = api.updateSnapshot({
      openProjects: [configFileName],
      fileChanges: {
        changed: [configFileName, ...(sameFile ? [fileName] : [])],
        created: sameFile ? [] : [fileName],
        deleted,
      },
    })
    previousFile = fileName
    try {
      return readSnapshotSource({
        api,
        snapshot,
        configFileName,
        fileName,
        filename,
        parserText,
      })
    } finally {
      snapshot.dispose()
    }
  }
  try {
    return work(parse)
  } finally {
    closed = true
    api.close()
  }
}

/**
 * @param {{ api: import('typescript/unstable/sync').API; snapshot: import('typescript/unstable/sync').Snapshot; configFileName: string; fileName: string; filename: string; parserText: string }} options
 * @returns {import('typescript/unstable/ast').SourceFile}
 */
function readSnapshotSource({
  api,
  snapshot,
  configFileName,
  fileName,
  filename,
  parserText,
}) {
  // Native snapshot updates and the local AST cache require separate invalidation.
  api.clearSourceFileCache()
  const program = snapshot.getProject(configFileName)?.program
  const source = program?.getSourceFile(fileName)
  if (!source || source.text !== parserText) {
    throw new Error(
      `Native parser did not return the requested text: ${filename}`,
    )
  }
  const diagnostics = program.getSyntacticDiagnostics()
  if (diagnostics.length > 0) {
    const message = diagnostics
      .map((diagnostic) => {
        const { line, character } = source.getLineAndCharacterOfPosition(
          diagnostic.pos,
        )
        return `${filename}:${line + 1}:${character + 1}: ${diagnostic.text}`
      })
      .join('\n')
    throw new SyntaxError(message, { cause: diagnostics })
  }
  return source
}

/**
 * @template T
 * @param {import('typescript/unstable/ast').Node} node
 * @param {(node: import('typescript/unstable/ast').Node) => T} visitor
 * @returns {T | undefined}
 */
export function forEachChild(node, visitor) {
  return node.forEachChild(visitor)
}

/**
 * @param {import('typescript/unstable/ast').Node} node
 * @returns {node is import('typescript/unstable/ast').Node & import('typescript/unstable/ast').FunctionLikeBase}
 */
export function isFunctionLike(node) {
  return (
    isSignatureDeclaration(node) ||
    node.kind === SyntaxKind.JSDocSignature ||
    node.kind === SyntaxKind.JSDocFunctionType
  )
}

/**
 * @param {import('typescript/unstable/ast').Node} node
 * @returns {node is import('typescript/unstable/ast').StringLiteral | import('typescript/unstable/ast').NoSubstitutionTemplateLiteral}
 */
export function isStringLiteralLike(node) {
  return isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node)
}

/** @type {Set<import('typescript/unstable/ast').SyntaxKind>} */
const modifierSyntaxKinds = new Set([
  SyntaxKind.TypeParameter,
  SyntaxKind.Parameter,
  SyntaxKind.PropertySignature,
  SyntaxKind.PropertyDeclaration,
  SyntaxKind.MethodSignature,
  SyntaxKind.MethodDeclaration,
  SyntaxKind.Constructor,
  SyntaxKind.GetAccessor,
  SyntaxKind.SetAccessor,
  SyntaxKind.IndexSignature,
  SyntaxKind.ConstructorType,
  SyntaxKind.FunctionExpression,
  SyntaxKind.ArrowFunction,
  SyntaxKind.ClassExpression,
  SyntaxKind.VariableStatement,
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.ClassDeclaration,
  SyntaxKind.InterfaceDeclaration,
  SyntaxKind.TypeAliasDeclaration,
  SyntaxKind.EnumDeclaration,
  SyntaxKind.ModuleDeclaration,
  SyntaxKind.ImportEqualsDeclaration,
  SyntaxKind.ImportDeclaration,
  SyntaxKind.ExportAssignment,
  SyntaxKind.ExportDeclaration,
])

/**
 * @param {import('typescript/unstable/ast').Node} node
 * @returns {node is import('typescript/unstable/ast').ModifiersBase}
 */
export function canHaveModifiers(node) {
  return modifierSyntaxKinds.has(node.kind)
}

/**
 * @param {import('typescript/unstable/ast').ModifiersBase} node
 * @returns {readonly import('typescript/unstable/ast').Modifier[] | undefined}
 */
export function getModifiers(node) {
  return node.modifiers?.filter(isModifier)
}

/**
 * The SDK declares this field required, but unannotated signatures omit it.
 * @param {import('typescript/unstable/ast').PropertySignatureDeclaration} node
 * @returns {import('typescript/unstable/ast').TypeNode | undefined}
 */
export function getPropertySignatureType(node) {
  return node.type
}
