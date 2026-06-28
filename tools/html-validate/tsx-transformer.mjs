import fs from 'node:fs'
import path from 'node:path'

import ts from 'typescript'

/** @typedef {import('html-validate').Source} Source */
/** @typedef {import('html-validate').TransformerResult} TransformerResult */
/** @typedef {ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment} RenderableJsx */
/** @typedef {readonly ts.JsxChild[]} JsxChildren */
/** @typedef {Map<string, RenderableJsx>} ComponentMap */
/** @typedef {Map<string, string>} IntrinsicMap */
/** @typedef {{ componentMap: ComponentMap; intrinsicMap: IntrinsicMap; slottedChildren: JsxChildren | null }} SerializationContext */

/** @type {Set<string>} */
const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

/** @type {IntrinsicMap} */
const KNOWN_INTRINSIC_COMPONENTS = new Map([['Button', 'button']])

/** @type {IntrinsicMap} */
const KNOWN_EXTERNAL_INTRINSIC_COMPONENTS = new Map([
  ['AccordionPrimitive.Content', 'div'],
  ['AccordionPrimitive.Header', 'h3'],
  ['AccordionPrimitive.Item', 'div'],
  ['AccordionPrimitive.Trigger', 'button'],
  ['AlertDialogPrimitive.Action', 'button'],
  ['AlertDialogPrimitive.Cancel', 'button'],
  ['AlertDialogPrimitive.Content', 'div'],
  ['AlertDialogPrimitive.Description', 'p'],
  ['AlertDialogPrimitive.Overlay', 'div'],
  ['AlertDialogPrimitive.Title', 'h2'],
  ['AlertDialogPrimitive.Trigger', 'button'],
  ['CollapsiblePrimitive.Content', 'div'],
  ['CollapsiblePrimitive.Trigger', 'button'],
  ['DialogPrimitive.Close', 'button'],
  ['DialogPrimitive.Content', 'div'],
  ['DialogPrimitive.Description', 'p'],
  ['DialogPrimitive.Overlay', 'div'],
  ['DialogPrimitive.Title', 'h2'],
  ['DialogPrimitive.Trigger', 'button'],
  ['PopoverPrimitive.Close', 'button'],
  ['PopoverPrimitive.Content', 'div'],
  ['PopoverPrimitive.Trigger', 'button'],
  ['SelectPrimitive.Content', 'div'],
  ['SelectPrimitive.Item', 'div'],
  ['SelectPrimitive.Label', 'div'],
  ['SelectPrimitive.Trigger', 'button'],
  ['SelectPrimitive.Viewport', 'div'],
  ['TabsPrimitive.Content', 'div'],
  ['TabsPrimitive.List', 'div'],
  ['TabsPrimitive.Trigger', 'button'],
  ['TooltipPrimitive.Content', 'div'],
  ['TooltipPrimitive.Trigger', 'button'],
])

/**
 * @param {Source} source
 * @returns {TransformerResult}
 */
function transformer(source) {
  const sourceFile = ts.createSourceFile(
    source.filename,
    source.data,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )

  const componentMap = collectLocalComponents(sourceFile)
  const intrinsicMap = new Map([
    ...KNOWN_INTRINSIC_COMPONENTS,
    ...collectImportedIntrinsicComponents(sourceFile, source.filename),
  ])
  /** @type {RenderableJsx[]} */
  const roots = []

  /**
   * @param {ts.Node} node
   * @param {boolean} insideJsx
   * @returns {void}
   */
  function visit(node, insideJsx) {
    if (!insideJsx && isLocalComponentDeclaration(node)) {
      return
    }

    if (isJsxNode(node)) {
      if (!insideJsx && isRenderableJsx(node)) {
        roots.push(node)
      }

      ts.forEachChild(node, (child) => {
        visit(child, true)
      })
      return
    }

    ts.forEachChild(node, (child) => {
      visit(child, false)
    })
  }

  visit(sourceFile, false)

  if (roots.length === 0) {
    return []
  }

  const firstRoot = roots[0]
  const position = sourceFile.getLineAndCharacterOfPosition(
    firstRoot.getStart(sourceFile),
  )
  const context = { componentMap, intrinsicMap, slottedChildren: null }
  const data = roots
    .map((root) => serializeNode(root, sourceFile, context))
    .join('\n')

  return [
    {
      data,
      filename: source.filename,
      line: position.line + 1,
      column: position.character + 1,
      offset: firstRoot.getStart(sourceFile),
      originalData: source.originalData ?? source.data,
    },
  ]
}

transformer.api = 1

/**
 * @param {ts.Node} node
 * @returns {node is RenderableJsx}
 */
function isRenderableJsx(node) {
  return (
    ts.isJsxElement(node) ||
    ts.isJsxSelfClosingElement(node) ||
    ts.isJsxFragment(node)
  )
}

/**
 * @param {ts.Node} node
 * @returns {boolean}
 */
function isJsxNode(node) {
  return (
    isRenderableJsx(node) ||
    ts.isJsxOpeningElement(node) ||
    ts.isJsxClosingElement(node) ||
    ts.isJsxOpeningFragment(node) ||
    ts.isJsxClosingFragment(node) ||
    ts.isJsxText(node) ||
    ts.isJsxExpression(node)
  )
}

/**
 * @param {ts.Node} node
 * @param {ts.SourceFile} sourceFile
 * @param {SerializationContext} context
 * @returns {string}
 */
function serializeNode(node, sourceFile, context) {
  if (ts.isJsxElement(node)) {
    return serializeElement(node, sourceFile, context)
  }

  if (ts.isJsxSelfClosingElement(node)) {
    return serializeSelfClosing(node, sourceFile, context)
  }

  if (ts.isJsxFragment(node)) {
    return node.children
      .map((child) => serializeNode(child, sourceFile, context))
      .join('')
  }

  if (ts.isJsxText(node)) {
    return escapeText(node.getText(sourceFile).replace(/\s+/g, ' ').trim())
  }

  if (ts.isJsxExpression(node)) {
    return serializeExpression(node.expression, sourceFile, context)
  }

  return ''
}

/**
 * @param {ts.JsxElement} node
 * @param {ts.SourceFile} sourceFile
 * @param {SerializationContext} context
 * @returns {string}
 */
function serializeElement(node, sourceFile, context) {
  const tagName = node.openingElement.tagName.getText(sourceFile)
  const attributes = node.openingElement.attributes
  const intrinsicTagName = getIntrinsicTagName(
    tagName,
    attributes,
    sourceFile,
    context.intrinsicMap,
  )

  if (!intrinsicTagName) {
    if (hasBooleanAttribute(attributes, 'asChild', sourceFile)) {
      return node.children
        .map((child) => serializeNode(child, sourceFile, context))
        .join('')
    }

    const localComponent = context.componentMap.get(tagName)
    if (localComponent) {
      return serializeNode(localComponent, sourceFile, {
        ...context,
        slottedChildren: node.children,
      })
    }

    return `<span data-component="${escapeAttribute(tagName)}"></span>`
  }

  const serializedChildren = node.children
    .map((child) => serializeNode(child, sourceFile, context))
    .join('')
  const htmlTagName = intrinsicTagName.toLowerCase()
  const serializedAttributes = serializeAttributes(attributes, sourceFile)

  if (VOID_ELEMENTS.has(htmlTagName)) {
    return `<${htmlTagName}${serializedAttributes}>`
  }

  return `<${htmlTagName}${serializedAttributes}>${serializedChildren}</${htmlTagName}>`
}

/**
 * @param {ts.JsxSelfClosingElement} node
 * @param {ts.SourceFile} sourceFile
 * @param {SerializationContext} context
 * @returns {string}
 */
function serializeSelfClosing(node, sourceFile, context) {
  const tagName = node.tagName.getText(sourceFile)
  const attributes = node.attributes
  const intrinsicTagName = getIntrinsicTagName(
    tagName,
    attributes,
    sourceFile,
    context.intrinsicMap,
  )

  if (!intrinsicTagName) {
    if (hasBooleanAttribute(attributes, 'asChild', sourceFile)) {
      return ''
    }

    const localComponent = context.componentMap.get(tagName)
    if (localComponent) {
      return serializeNode(localComponent, sourceFile, {
        ...context,
        slottedChildren: [],
      })
    }

    return `<span data-component="${escapeAttribute(tagName)}"></span>`
  }

  const htmlTagName = intrinsicTagName.toLowerCase()
  const serializedAttributes = serializeAttributes(attributes, sourceFile)

  if (VOID_ELEMENTS.has(htmlTagName)) {
    return `<${htmlTagName}${serializedAttributes}>`
  }

  return `<${htmlTagName}${serializedAttributes}></${htmlTagName}>`
}

/**
 * @param {ts.Expression | undefined} expression
 * @param {ts.SourceFile} sourceFile
 * @param {SerializationContext} context
 * @returns {string}
 */
function serializeExpression(expression, sourceFile, context) {
  if (!expression) {
    return ''
  }

  if (
    context.slottedChildren &&
    ts.isIdentifier(expression) &&
    expression.text === 'children'
  ) {
    return context.slottedChildren
      .map((child) => serializeNode(child, sourceFile, {
        ...context,
        slottedChildren: null,
      }))
      .join('')
  }

  if (isRenderableJsx(expression)) {
    return serializeNode(expression, sourceFile, context)
  }

  /** @type {string[]} */
  const descendants = []

  /**
   * @param {ts.Node} node
   * @returns {void}
   */
  function visit(node) {
    if (isRenderableJsx(node)) {
      descendants.push(serializeNode(node, sourceFile, context))
      return
    }

    ts.forEachChild(node, visit)
  }

  ts.forEachChild(expression, visit)
  return descendants.join('')
}

/**
 * @param {ts.SourceFile} sourceFile
 * @returns {ComponentMap}
 */
function collectLocalComponents(sourceFile) {
  /** @type {ComponentMap} */
  const componentMap = new Map()

  for (const statement of sourceFile.statements) {
    const component = getLocalComponent(statement)
    if (component) {
      componentMap.set(component.name, component.node)
    }
  }

  return componentMap
}

/**
 * @param {ts.Node} node
 * @returns {{ name: string; node: RenderableJsx } | null}
 */
function getLocalComponent(node) {
  if (ts.isFunctionDeclaration(node)) {
    return getFunctionDeclarationComponent(node)
  }

  return ts.isVariableStatement(node)
    ? getVariableStatementComponent(node)
    : null
}

/**
 * @param {ts.FunctionDeclaration} node
 * @returns {{ name: string; node: RenderableJsx } | null}
 */
function getFunctionDeclarationComponent(node) {
  if (!node.name || !isComponentName(node.name.text) || !node.body) {
    return null
  }

  const returnedNode = findReturnedJsx(node.body)
  return returnedNode ? { name: node.name.text, node: returnedNode } : null
}

/**
 * @param {ts.VariableStatement} node
 * @returns {{ name: string; node: RenderableJsx } | null}
 */
function getVariableStatementComponent(node) {
  for (const declaration of node.declarationList.declarations) {
    if (
      !ts.isIdentifier(declaration.name) ||
      !isComponentName(declaration.name.text)
    ) {
      continue
    }

    const initializer = declaration.initializer
    if (!initializer) {
      continue
    }

    const unwrappedInitializer = unwrapExpression(initializer)
    const componentNode = getComponentNodeFromInitializer(unwrappedInitializer)

    if (componentNode) {
      return { name: declaration.name.text, node: componentNode }
    }
  }

  return null
}

/**
 * @param {ts.Node} initializer
 * @returns {RenderableJsx | null}
 */
function getComponentNodeFromInitializer(initializer) {
  if (isRenderableJsx(initializer)) {
    return initializer
  }

  if (
    !ts.isArrowFunction(initializer) &&
    !ts.isFunctionExpression(initializer)
  ) {
    return null
  }

  const body = unwrapExpression(initializer.body)

  if (isRenderableJsx(body)) {
    return body
  }

  return ts.isBlock(body) ? findReturnedJsx(body) : null
}

/**
 * @template {ts.Node} T
 * @param {T} node
 * @returns {ts.Node}
 */
function unwrapExpression(node) {
  let current = node
  while (ts.isParenthesizedExpression(current)) {
    current = current.expression
  }

  return current
}

/**
 * @param {ts.Node} node
 * @returns {boolean}
 */
function isExported(node) {
  return Boolean(
    ts.canHaveModifiers(node) &&
    ts
      .getModifiers(node)
      ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
  )
}

/**
 * @param {ts.Block} block
 * @returns {RenderableJsx | null}
 */
function findReturnedJsx(block) {
  for (const statement of block.statements) {
    if (
      ts.isReturnStatement(statement) &&
      statement.expression &&
      isRenderableJsx(statement.expression)
    ) {
      return statement.expression
    }
  }

  return null
}

/**
 * @param {ts.Node} node
 * @returns {boolean}
 */
function isLocalComponentDeclaration(node) {
  return !isExported(node) && Boolean(getLocalComponent(node))
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isComponentName(name) {
  return /^[A-Z]/.test(name)
}

/**
 * @param {ts.SourceFile} sourceFile
 * @param {string} filename
 * @returns {IntrinsicMap}
 */
function collectImportedIntrinsicComponents(sourceFile, filename) {
  return collectImportedIntrinsicComponentsWithSeen(
    sourceFile,
    filename,
    new Set(),
  )
}

/**
 * @param {ts.SourceFile} sourceFile
 * @param {string} filename
 * @param {Set<string>} seen
 * @returns {IntrinsicMap}
 */
function collectImportedIntrinsicComponentsWithSeen(
  sourceFile,
  filename,
  seen,
) {
  /** @type {IntrinsicMap} */
  const intrinsicMap = new Map()

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) {
      continue
    }

    const importedFile = resolveImportFile(statement.moduleSpecifier, filename)
    if (!importedFile) {
      continue
    }

    for (const importedName of getImportedNames(statement)) {
      const intrinsicTagName = inferExportedIntrinsicTagName(
        importedFile,
        importedName.imported,
        seen,
      )

      if (intrinsicTagName) {
        intrinsicMap.set(importedName.local, intrinsicTagName)
      }
    }
  }

  return intrinsicMap
}

/**
 * @param {ts.Expression} moduleSpecifier
 * @param {string} importerFilename
 * @returns {string | null}
 */
function resolveImportFile(moduleSpecifier, importerFilename) {
  if (!ts.isStringLiteral(moduleSpecifier)) {
    return null
  }

  const specifier = moduleSpecifier.text
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) {
    return null
  }

  const basePath = specifier.startsWith('@/')
    ? path.resolve(process.cwd(), 'src', specifier.slice(2))
    : path.resolve(path.dirname(importerFilename), specifier)

  return resolveCandidateFile(basePath)
}

/**
 * @param {string} basePath
 * @returns {string | null}
 */
function resolveCandidateFile(basePath) {
  const candidates = [
    basePath,
    `${basePath}.tsx`,
    `${basePath}.ts`,
    path.join(basePath, 'index.tsx'),
    path.join(basePath, 'index.ts'),
  ]

  return (
    candidates.find(
      (candidate) =>
        fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
    ) ?? null
  )
}

/**
 * @param {ts.ImportDeclaration} statement
 * @returns {Array<{ imported: string; local: string }>}
 */
function getImportedNames(statement) {
  const importClause = statement.importClause
  if (!importClause) {
    return []
  }

  /** @type {Array<{ imported: string; local: string }>} */
  const importedNames = []

  if (importClause.name) {
    importedNames.push({
      imported: 'default',
      local: importClause.name.text,
    })
  }

  const namedBindings = importClause.namedBindings
  if (!namedBindings || !ts.isNamedImports(namedBindings)) {
    return importedNames
  }

  for (const element of namedBindings.elements) {
    importedNames.push({
      imported: element.propertyName?.text ?? element.name.text,
      local: element.name.text,
    })
  }

  return importedNames
}

/**
 * @param {string} filename
 * @param {string} exportName
 * @param {Set<string>} seen
 * @returns {string | null}
 */
function inferExportedIntrinsicTagName(filename, exportName, seen) {
  const seenKey = `${filename}:${exportName}`
  if (seen.has(seenKey)) {
    return null
  }

  seen.add(seenKey)

  const data = readTextFile(filename)
  if (!data) {
    return null
  }

  const sourceFile = ts.createSourceFile(
    filename,
    data,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const exportedNode = getExportedComponentNode(sourceFile, exportName)

  if (!exportedNode) {
    return null
  }

  return inferRenderableIntrinsicTagName(
    sourceFile,
    exportedNode,
    filename,
    seen,
  )
}

/**
 * @param {string} filename
 * @returns {string | null}
 */
function readTextFile(filename) {
  try {
    return fs.readFileSync(filename, 'utf8')
  } catch {
    return null
  }
}

/**
 * @param {ts.SourceFile} sourceFile
 * @param {string} exportName
 * @returns {RenderableJsx | null}
 */
function getExportedComponentNode(sourceFile, exportName) {
  for (const statement of sourceFile.statements) {
    const exportedNode = getExportedFunctionComponentNode(statement, exportName)
    if (exportedNode) {
      return exportedNode
    }

    if (ts.isVariableStatement(statement) && isExported(statement)) {
      const variableNode = getVariableComponentNodeByName(statement, exportName)
      if (variableNode) {
        return variableNode
      }
    }
  }

  return null
}

/**
 * @param {ts.Statement} statement
 * @param {string} exportName
 * @returns {RenderableJsx | null}
 */
function getExportedFunctionComponentNode(statement, exportName) {
  if (!ts.isFunctionDeclaration(statement) || !isExported(statement)) {
    return null
  }

  if (exportName !== 'default' && statement.name?.text !== exportName) {
    return null
  }

  return statement.body ? findReturnedJsx(statement.body) : null
}

/**
 * @param {ts.VariableStatement} statement
 * @param {string} exportName
 * @returns {RenderableJsx | null}
 */
function getVariableComponentNodeByName(statement, exportName) {
  for (const declaration of statement.declarationList.declarations) {
    if (!ts.isIdentifier(declaration.name)) {
      continue
    }

    if (exportName !== declaration.name.text) {
      continue
    }

    const initializer = declaration.initializer
    return initializer
      ? getComponentNodeFromInitializer(unwrapExpression(initializer))
      : null
  }

  return null
}

/**
 * @param {ts.SourceFile} sourceFile
 * @param {RenderableJsx} node
 * @param {string} filename
 * @param {Set<string>} seen
 * @returns {string | null}
 */
function inferRenderableIntrinsicTagName(sourceFile, node, filename, seen) {
  if (ts.isJsxFragment(node)) {
    return null
  }

  const tagName = getRenderableTagName(node, sourceFile)
  const attributes = getRenderableAttributes(node)
  if (hasBooleanAttribute(attributes, 'asChild', sourceFile)) {
    return null
  }

  if (isNativeTagName(tagName)) {
    return tagName
  }

  const externalIntrinsicTagName =
    KNOWN_EXTERNAL_INTRINSIC_COMPONENTS.get(tagName)
  if (externalIntrinsicTagName) {
    return externalIntrinsicTagName
  }

  const importedIntrinsicComponents =
    collectImportedIntrinsicComponentsWithSeen(sourceFile, filename, seen)
  return (
    importedIntrinsicComponents.get(tagName) ??
    KNOWN_INTRINSIC_COMPONENTS.get(tagName) ??
    null
  )
}

/**
 * @param {ts.JsxElement | ts.JsxSelfClosingElement} node
 * @param {ts.SourceFile} sourceFile
 * @returns {string}
 */
function getRenderableTagName(node, sourceFile) {
  return ts.isJsxElement(node)
    ? node.openingElement.tagName.getText(sourceFile)
    : node.tagName.getText(sourceFile)
}

/**
 * @param {ts.JsxElement | ts.JsxSelfClosingElement} node
 * @returns {ts.JsxAttributes}
 */
function getRenderableAttributes(node) {
  return ts.isJsxElement(node)
    ? node.openingElement.attributes
    : node.attributes
}

/**
 * @param {ts.JsxAttributes} attributes
 * @param {ts.SourceFile} sourceFile
 * @returns {string}
 */
function serializeAttributes(attributes, sourceFile) {
  /** @type {string[]} */
  const serialized = []

  for (const property of attributes.properties) {
    if (!ts.isJsxAttribute(property)) {
      continue
    }

    const name = normalizeAttributeName(property.name.getText(sourceFile))

    if (!property.initializer) {
      serialized.push(name)
      continue
    }

    serialized.push(
      `${name}="${escapeAttribute(getAttributeValue(property.initializer))}"`,
    )
  }

  return serialized.length > 0 ? ` ${serialized.join(' ')}` : ''
}

/**
 * @param {ts.JsxAttributeValue} initializer
 * @returns {string}
 */
function getAttributeValue(initializer) {
  if (ts.isStringLiteral(initializer)) {
    return initializer.text
  }

  if (ts.isJsxExpression(initializer) && initializer.expression) {
    if (ts.isStringLiteral(initializer.expression)) {
      return initializer.expression.text
    }

    if (ts.isNumericLiteral(initializer.expression)) {
      return initializer.expression.text
    }
  }

  return '__dynamic__'
}

/**
 * @param {string} name
 * @returns {string}
 */
function normalizeAttributeName(name) {
  if (name === 'className') {
    return 'class'
  }

  if (name === 'htmlFor') {
    return 'for'
  }

  return name
}

/**
 * @param {string} tagName
 * @returns {boolean}
 */
function isNativeTagName(tagName) {
  return /^[a-z][a-z0-9-]*$/.test(tagName)
}

/**
 * @param {string} tagName
 * @param {ts.JsxAttributes} attributes
 * @param {ts.SourceFile} sourceFile
 * @param {IntrinsicMap} intrinsicMap
 * @returns {string | null}
 */
function getIntrinsicTagName(tagName, attributes, sourceFile, intrinsicMap) {
  if (isNativeTagName(tagName)) {
    return tagName
  }

  if (hasBooleanAttribute(attributes, 'asChild', sourceFile)) {
    return null
  }

  return (
    intrinsicMap.get(tagName) ??
    KNOWN_EXTERNAL_INTRINSIC_COMPONENTS.get(tagName) ??
    null
  )
}

/**
 * @param {ts.JsxAttributes} attributes
 * @param {string} attributeName
 * @param {ts.SourceFile} sourceFile
 * @returns {boolean}
 */
function hasBooleanAttribute(attributes, attributeName, sourceFile) {
  return attributes.properties.some(
    (property) =>
      ts.isJsxAttribute(property) &&
      property.name.getText(sourceFile) === attributeName &&
      isTruthyBooleanAttribute(property.initializer),
  )
}

/**
 * @param {ts.JsxAttributeValue | undefined} initializer
 * @returns {boolean}
 */
function isTruthyBooleanAttribute(initializer) {
  if (!initializer) {
    return true
  }

  return (
    ts.isJsxExpression(initializer) &&
    initializer.expression?.kind === ts.SyntaxKind.TrueKeyword
  )
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeText(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * @param {string | number} value
 * @returns {string}
 */
function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// oxlint-disable-next-line import/no-default-export -- html-validate loads ESM transformers from default export.
export default transformer
