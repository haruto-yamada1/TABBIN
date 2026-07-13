import ts from 'typescript'

import type { NetworkCallsiteKind } from './production-network-policy'

type PotentialAliasAssignment = {
  captured: boolean
  environment: PotentialAliasEnvironment
  expression: ts.Expression
  name: string
}

type PotentialAliasEnvironment = {
  assignments: PotentialAliasAssignment[]
  capturedKinds: Map<string, ReadonlySet<NetworkCallsiteKind>>
  declaredNames: Set<string>
  kinds: Map<string, ReadonlySet<NetworkCallsiteKind>>
  node: ts.Node
  parent: PotentialAliasEnvironment | null
  type: 'block' | 'function' | 'source'
}

type PendingAliasAssignment = PotentialAliasAssignment & {
  environment: PotentialAliasEnvironment
}

type DirectReferenceResolver = (
  node: ts.Node,
) => ReadonlySet<NetworkCallsiteKind>

export type PotentialAliasSummary = {
  bindings: ReadonlyMap<string, ReadonlySet<NetworkCallsiteKind>>
  capturedBindings: ReadonlyMap<string, ReadonlySet<NetworkCallsiteKind>>
}

const collectBindingNames = (name: ts.BindingName): string[] => {
  if (ts.isIdentifier(name)) {
    return [name.text]
  }
  return name.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : collectBindingNames(element.name),
  )
}

const getPotentialAliasKinds = (
  environment: PotentialAliasEnvironment,
  name: string,
): ReadonlySet<NetworkCallsiteKind> => {
  for (
    let current: PotentialAliasEnvironment | null = environment;
    current !== null;
    current = current.parent
  ) {
    const kinds = current.kinds.get(name)
    if (kinds !== undefined) {
      return kinds
    }
  }
  return new Set()
}

const isLogicalExpression = (node: ts.Node): node is ts.BinaryExpression =>
  ts.isBinaryExpression(node) &&
  [
    ts.SyntaxKind.AmpersandAmpersandToken,
    ts.SyntaxKind.BarBarToken,
    ts.SyntaxKind.QuestionQuestionToken,
  ].includes(node.operatorToken.kind)

const resolvePotentialAliasKinds = (
  expression: ts.Expression,
  environment: PotentialAliasEnvironment,
  resolveDirectReferences: DirectReferenceResolver,
): ReadonlySet<NetworkCallsiteKind> => {
  const directKinds = resolveDirectReferences(expression)
  const environmentKinds = ts.isIdentifier(expression)
    ? getPotentialAliasKinds(environment, expression.text)
    : new Set<NetworkCallsiteKind>()
  if (directKinds.size > 0 || environmentKinds.size > 0) {
    return new Set([...directKinds, ...environmentKinds])
  }
  if (ts.isConditionalExpression(expression)) {
    return new Set([
      ...resolvePotentialAliasKinds(
        expression.whenTrue,
        environment,
        resolveDirectReferences,
      ),
      ...resolvePotentialAliasKinds(
        expression.whenFalse,
        environment,
        resolveDirectReferences,
      ),
    ])
  }
  if (isLogicalExpression(expression)) {
    return new Set([
      ...resolvePotentialAliasKinds(
        expression.left,
        environment,
        resolveDirectReferences,
      ),
      ...resolvePotentialAliasKinds(
        expression.right,
        environment,
        resolveDirectReferences,
      ),
    ])
  }
  if (!ts.isCallExpression(expression)) {
    return new Set()
  }
  const callee = expression.expression
  if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== 'bind') {
    return new Set()
  }
  return resolvePotentialAliasKinds(
    callee.expression,
    environment,
    resolveDirectReferences,
  )
}

const createEnvironment = (
  environments: PotentialAliasEnvironment[],
  node: ts.Node,
  parent: PotentialAliasEnvironment | null,
  type: PotentialAliasEnvironment['type'],
): PotentialAliasEnvironment => {
  const environment: PotentialAliasEnvironment = {
    assignments: [],
    capturedKinds: new Map(),
    declaredNames: new Set(),
    kinds: new Map(),
    node,
    parent,
    type,
  }
  environments.push(environment)
  return environment
}

const getEnvironmentType = (
  node: ts.Node,
): PotentialAliasEnvironment['type'] | null => {
  if (ts.isFunctionLike(node)) {
    return 'function'
  }
  if (
    ts.isBlock(node) ||
    ts.isCatchClause(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isSwitchStatement(node)
  ) {
    return 'block'
  }
  return null
}

const findVariableEnvironment = (
  environment: PotentialAliasEnvironment,
): PotentialAliasEnvironment => {
  let current = environment
  while (current.type === 'block' && current.parent !== null) {
    current = current.parent
  }
  return current
}

const registerVariableDeclaration = (
  node: ts.VariableDeclaration,
  environment: PotentialAliasEnvironment,
): void => {
  const declarationList = ts.isVariableDeclarationList(node.parent)
    ? node.parent
    : null
  const isBlockScoped =
    ts.isCatchClause(node.parent) ||
    (declarationList !== null &&
      (declarationList.flags & ts.NodeFlags.BlockScoped) !== 0)
  const declarationEnvironment = isBlockScoped
    ? environment
    : findVariableEnvironment(environment)
  for (const name of collectBindingNames(node.name)) {
    declarationEnvironment.declaredNames.add(name)
  }
  if (ts.isIdentifier(node.name) && node.initializer !== undefined) {
    declarationEnvironment.assignments.push({
      captured: false,
      environment,
      expression: node.initializer,
      name: node.name.text,
    })
  }
}

const findDeclaredEnvironment = (
  environment: PotentialAliasEnvironment,
  name: string,
): PotentialAliasEnvironment | null => {
  let current: PotentialAliasEnvironment | null = environment
  while (current !== null) {
    if (current.declaredNames.has(name)) {
      return current
    }
    current = current.parent
  }
  return null
}

const findFunctionEnvironment = (
  environment: PotentialAliasEnvironment,
): PotentialAliasEnvironment => {
  let current = environment
  while (current.type === 'block' && current.parent !== null) {
    current = current.parent
  }
  return current
}

const isEnvironmentAncestor = (
  ancestor: PotentialAliasEnvironment,
  environment: PotentialAliasEnvironment,
): boolean => {
  let current = environment.parent
  while (current !== null) {
    if (current === ancestor) {
      return true
    }
    current = current.parent
  }
  return false
}

const assignPendingAliases = (
  pendingAssignments: readonly PendingAliasAssignment[],
): void => {
  for (const assignment of pendingAssignments) {
    const declaredEnvironment = findDeclaredEnvironment(
      assignment.environment,
      assignment.name,
    )
    const functionEnvironment = findFunctionEnvironment(assignment.environment)
    const target =
      declaredEnvironment === null ||
      (functionEnvironment.type === 'function' &&
        isEnvironmentAncestor(declaredEnvironment, functionEnvironment))
        ? functionEnvironment
        : declaredEnvironment
    target.assignments.push({
      captured: false,
      environment: assignment.environment,
      expression: assignment.expression,
      name: assignment.name,
    })
    if (
      declaredEnvironment !== null &&
      target !== declaredEnvironment &&
      isEnvironmentAncestor(declaredEnvironment, target)
    ) {
      declaredEnvironment.assignments.push({
        captured: true,
        environment: assignment.environment,
        expression: assignment.expression,
        name: assignment.name,
      })
    }
  }
}

const registerFunctionParameters = (
  node: ts.SignatureDeclaration,
  environment: PotentialAliasEnvironment,
): void => {
  for (const parameter of node.parameters) {
    for (const name of collectBindingNames(parameter.name)) {
      environment.declaredNames.add(name)
    }
  }
}

const collectPotentialEnvironments = (
  source: ts.SourceFile,
): PotentialAliasEnvironment[] => {
  const environments: PotentialAliasEnvironment[] = []
  const pendingAssignments: PendingAliasAssignment[] = []
  const sourceEnvironment = createEnvironment(
    environments,
    source,
    null,
    'source',
  )
  const visit = (
    node: ts.Node,
    environment: PotentialAliasEnvironment,
  ): void => {
    if (node !== source) {
      const environmentType = getEnvironmentType(node)
      if (environmentType !== null) {
        if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
          environment.declaredNames.add(node.name.text)
        }
        const childEnvironment = createEnvironment(
          environments,
          node,
          environment,
          environmentType,
        )
        if (ts.isFunctionLike(node)) {
          registerFunctionParameters(node, childEnvironment)
        }
        ts.forEachChild(node, (child) => {
          visit(child, childEnvironment)
        })
        return
      }
    }
    if (ts.isVariableDeclaration(node)) {
      registerVariableDeclaration(node, environment)
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      pendingAssignments.push({
        captured: false,
        environment,
        expression: node.right,
        name: node.left.text,
      })
    }
    ts.forEachChild(node, (child) => {
      visit(child, environment)
    })
  }
  visit(source, sourceEnvironment)
  assignPendingAliases(pendingAssignments)
  return environments
}

const applyPotentialAssignment = (
  target: PotentialAliasEnvironment,
  assignment: PotentialAliasAssignment,
  resolveDirectReferences: DirectReferenceResolver,
): void => {
  const resolvedKinds = resolvePotentialAliasKinds(
    assignment.expression,
    assignment.environment,
    resolveDirectReferences,
  )
  const existing = target.kinds.get(assignment.name) ?? new Set()
  target.kinds.set(assignment.name, new Set([...existing, ...resolvedKinds]))
  if (!assignment.captured) {
    return
  }
  const capturedKinds = target.capturedKinds.get(assignment.name) ?? new Set()
  target.capturedKinds.set(
    assignment.name,
    new Set([...capturedKinds, ...resolvedKinds]),
  )
}

export const collectPotentialNetworkAliasKinds = (
  source: ts.SourceFile,
  resolveDirectReferences: DirectReferenceResolver,
): WeakMap<ts.Node, PotentialAliasSummary> => {
  const environments = collectPotentialEnvironments(source)
  const assignmentCount = environments.reduce(
    (count, environment) => count + environment.assignments.length,
    0,
  )
  for (let pass = 0; pass <= assignmentCount; pass += 1) {
    for (const environment of environments) {
      for (const assignment of environment.assignments) {
        applyPotentialAssignment(
          environment,
          assignment,
          resolveDirectReferences,
        )
      }
    }
  }
  const result = new WeakMap<ts.Node, PotentialAliasSummary>()
  for (const environment of environments) {
    result.set(environment.node, {
      bindings: environment.kinds,
      capturedBindings: environment.capturedKinds,
    })
  }
  return result
}
