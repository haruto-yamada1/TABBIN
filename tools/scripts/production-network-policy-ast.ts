import ts from 'typescript'

import type { NetworkCallsiteKind } from './production-network-policy'

export type AliasScope = {
  bindings: Map<string, ReadonlySet<NetworkCallsiteKind>>
  capturedBindings: ReadonlyMap<string, ReadonlySet<NetworkCallsiteKind>>
  potentialBindings: ReadonlyMap<string, ReadonlySet<NetworkCallsiteKind>>
  type: 'block' | 'function' | 'source'
}

export const collectBindingIdentifiers = (name: ts.BindingName): string[] => {
  if (ts.isIdentifier(name)) {
    return [name.text]
  }
  return name.elements.flatMap((element) =>
    ts.isOmittedExpression(element)
      ? []
      : collectBindingIdentifiers(element.name),
  )
}

export const cloneAliasScopes = (
  sourceScopes: readonly AliasScope[],
): AliasScope[] =>
  sourceScopes.map((scope) => ({
    bindings: new Map(
      [...scope.bindings].map(([name, kinds]) => [name, new Set(kinds)]),
    ),
    capturedBindings: scope.capturedBindings,
    potentialBindings: scope.potentialBindings,
    type: scope.type,
  }))

export const mergeAliasScopeStates = (
  states: readonly AliasScope[][],
): AliasScope[] =>
  states[0].map((scope, scopeIndex) => {
    const names = new Set(
      states.flatMap((state) => [
        ...(state[scopeIndex]?.bindings.keys() ?? []),
      ]),
    )
    return {
      bindings: new Map(
        [...names].map((name) => [
          name,
          new Set(
            states.flatMap((state) => [
              ...(state[scopeIndex]?.bindings.get(name) ?? []),
            ]),
          ),
        ]),
      ),
      capturedBindings: scope.capturedBindings,
      potentialBindings: scope.potentialBindings,
      type: scope.type,
    }
  })

type NetworkAstTraversalContext = {
  cloneScopes: (scopes: readonly AliasScope[]) => AliasScope[]
  createScope: (type: AliasScope['type'], node: ts.Node) => AliasScope
  declareAlias: (name: string, kinds: ReadonlySet<NetworkCallsiteKind>) => void
  enterNodeScope: (node: ts.Node) => boolean
  getScopes: () => AliasScope[]
  mergeScopeStates: (states: readonly AliasScope[][]) => AliasScope[]
  recordNetworkCallsite: (node: ts.Node) => void
  registerNodeAliases: (node: ts.Node) => void
  setScopes: (scopes: AliasScope[]) => void
  traverseFromClonedState: (
    initialScopes: readonly AliasScope[],
    traverse: () => void,
  ) => AliasScope[]
}

export class NetworkAstTraverser {
  private readonly context: NetworkAstTraversalContext

  constructor(context: NetworkAstTraversalContext) {
    this.context = context
  }

  traverse(node: ts.Node): void {
    if (
      this.visitFunction(node) ||
      this.visitConditional(node) ||
      this.visitLoop(node) ||
      this.visitSwitch(node) ||
      this.visitTry(node)
    ) {
      return
    }
    const createdScope = this.context.enterNodeScope(node)
    this.context.registerNodeAliases(node)
    this.context.recordNetworkCallsite(node)
    ts.forEachChild(node, (child) => {
      this.traverse(child)
    })
    if (createdScope) {
      this.context.getScopes().pop()
    }
  }

  private visitFunction(node: ts.Node): boolean {
    if (!ts.isFunctionLike(node)) {
      return false
    }
    if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
      this.context.declareAlias(node.name.text, new Set())
    }
    const previousScopes = this.context.getScopes()
    const functionScopes = this.context.cloneScopes(previousScopes)
    functionScopes.push(this.context.createScope('function', node))
    this.context.setScopes(functionScopes)
    for (const parameter of node.parameters) {
      for (const name of collectBindingIdentifiers(parameter.name)) {
        this.context.declareAlias(name, new Set())
      }
    }
    ts.forEachChild(node, (child) => {
      this.traverse(child)
    })
    this.context.setScopes(previousScopes)
    return true
  }

  private visitConditional(node: ts.Node): boolean {
    if (this.visitShortCircuitExpression(node)) {
      return true
    }
    if (ts.isIfStatement(node)) {
      this.visitIfStatement(node)
      return true
    }
    if (!ts.isConditionalExpression(node)) {
      return false
    }
    this.traverse(node.condition)
    const initialState = this.context.cloneScopes(this.context.getScopes())
    const whenTrueState = this.context.traverseFromClonedState(
      initialState,
      () => {
        this.traverse(node.whenTrue)
      },
    )
    const whenFalseState = this.context.traverseFromClonedState(
      initialState,
      () => {
        this.traverse(node.whenFalse)
      },
    )
    this.context.setScopes(
      this.context.mergeScopeStates([whenTrueState, whenFalseState]),
    )
    return true
  }

  private visitShortCircuitExpression(node: ts.Node): boolean {
    if (
      !ts.isBinaryExpression(node) ||
      ![
        ts.SyntaxKind.AmpersandAmpersandToken,
        ts.SyntaxKind.BarBarToken,
        ts.SyntaxKind.QuestionQuestionToken,
      ].includes(node.operatorToken.kind)
    ) {
      return false
    }
    this.traverse(node.left)
    const beforeRight = this.context.cloneScopes(this.context.getScopes())
    const afterRight = this.context.traverseFromClonedState(beforeRight, () => {
      this.traverse(node.right)
    })
    this.context.setScopes(
      this.context.mergeScopeStates([beforeRight, afterRight]),
    )
    return true
  }

  private visitIfStatement(node: ts.IfStatement): void {
    this.traverse(node.expression)
    const initialState = this.context.cloneScopes(this.context.getScopes())
    const thenState = this.context.traverseFromClonedState(initialState, () => {
      this.traverse(node.thenStatement)
    })
    const elseStatement = node.elseStatement
    const elseState =
      elseStatement === undefined
        ? initialState
        : this.context.traverseFromClonedState(initialState, () => {
            this.traverse(elseStatement)
          })
    this.context.setScopes(
      this.context.mergeScopeStates([thenState, elseState]),
    )
  }

  private visitLoop(node: ts.Node): boolean {
    if (ts.isForStatement(node)) {
      this.visitForStatement(node)
      return true
    }
    if (ts.isForInStatement(node) || ts.isForOfStatement(node)) {
      this.visitForEachStatement(node)
      return true
    }
    if (ts.isWhileStatement(node) || ts.isDoStatement(node)) {
      this.visitWhileStatement(node)
      return true
    }
    return false
  }

  private visitWhileStatement(node: ts.WhileStatement | ts.DoStatement): void {
    if (ts.isWhileStatement(node)) {
      this.traverse(node.expression)
    }
    const beforeIteration = this.context.cloneScopes(this.context.getScopes())
    const afterIteration = this.context.traverseFromClonedState(
      beforeIteration,
      () => {
        this.traverse(node.statement)
        if (ts.isDoStatement(node)) {
          this.traverse(node.expression)
        }
      },
    )
    if (ts.isDoStatement(node)) {
      const afterAdditionalIteration = this.context.traverseFromClonedState(
        afterIteration,
        () => {
          this.traverse(node.statement)
          this.traverse(node.expression)
        },
      )
      this.context.setScopes(
        this.context.mergeScopeStates([
          afterIteration,
          afterAdditionalIteration,
        ]),
      )
      return
    }
    this.context.setScopes(
      this.context.mergeScopeStates([beforeIteration, afterIteration]),
    )
  }

  private visitForStatement(node: ts.ForStatement): void {
    const scopes = this.context.getScopes()
    scopes.push(this.context.createScope('block', node))
    if (node.initializer !== undefined) {
      this.traverse(node.initializer)
    }
    if (node.condition !== undefined) {
      this.traverse(node.condition)
    }
    const beforeIteration = this.context.cloneScopes(this.context.getScopes())
    const afterIteration = this.context.traverseFromClonedState(
      beforeIteration,
      () => {
        this.traverse(node.statement)
        if (node.incrementor !== undefined) {
          this.traverse(node.incrementor)
        }
      },
    )
    this.context.setScopes(
      this.context.mergeScopeStates([beforeIteration, afterIteration]),
    )
    this.context.getScopes().pop()
  }

  private visitForEachStatement(
    node: ts.ForInStatement | ts.ForOfStatement,
  ): void {
    this.context.getScopes().push(this.context.createScope('block', node))
    this.traverse(node.expression)
    this.traverse(node.initializer)
    const beforeIteration = this.context.cloneScopes(this.context.getScopes())
    const afterIteration = this.context.traverseFromClonedState(
      beforeIteration,
      () => {
        this.traverse(node.statement)
      },
    )
    this.context.setScopes(
      this.context.mergeScopeStates([beforeIteration, afterIteration]),
    )
    this.context.getScopes().pop()
  }

  private visitSwitch(node: ts.Node): boolean {
    if (!ts.isSwitchStatement(node)) {
      return false
    }
    this.traverse(node.expression)
    this.context.getScopes().push(this.context.createScope('block', node))
    const beforeSwitch = this.context.cloneScopes(this.context.getScopes())
    const sequentialState = this.context.traverseFromClonedState(
      beforeSwitch,
      () => {
        this.traverse(node.caseBlock)
      },
    )
    const clauseStates = node.caseBlock.clauses.map((clause) =>
      this.context.traverseFromClonedState(beforeSwitch, () => {
        if (ts.isCaseClause(clause)) {
          this.traverse(clause.expression)
        }
        for (const statement of clause.statements) {
          this.traverse(statement)
        }
      }),
    )
    this.context.setScopes(
      this.context.mergeScopeStates([
        beforeSwitch,
        sequentialState,
        ...clauseStates,
      ]),
    )
    this.context.getScopes().pop()
    return true
  }

  private visitTry(node: ts.Node): boolean {
    if (!ts.isTryStatement(node)) {
      return false
    }
    const beforeTry = this.context.cloneScopes(this.context.getScopes())
    const tryState = this.context.traverseFromClonedState(beforeTry, () => {
      this.traverse(node.tryBlock)
    })
    const catchClause = node.catchClause
    const catchState =
      catchClause === undefined
        ? null
        : this.context.traverseFromClonedState(beforeTry, () => {
            this.traverseCatchClause(catchClause)
          })
    const mergedState = this.context.mergeScopeStates([
      tryState,
      ...(catchState === null ? [] : [catchState]),
    ])
    const finallyBlock = node.finallyBlock
    if (finallyBlock === undefined) {
      this.context.setScopes(mergedState)
      return true
    }
    const finalState = this.context.traverseFromClonedState(mergedState, () => {
      this.traverse(finallyBlock)
    })
    this.context.setScopes(finalState)
    return true
  }

  private traverseCatchClause(node: ts.CatchClause): void {
    this.context.getScopes().push(this.context.createScope('block', node))
    if (node.variableDeclaration !== undefined) {
      this.context.registerNodeAliases(node.variableDeclaration)
    }
    this.traverse(node.block)
    this.context.getScopes().pop()
  }
}
