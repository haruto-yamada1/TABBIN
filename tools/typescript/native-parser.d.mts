import type {
  FunctionLikeBase,
  Modifier,
  ModifiersBase,
  Node,
  NoSubstitutionTemplateLiteral,
  PropertySignatureDeclaration,
  SourceFile,
  StringLiteral,
  TypeNode,
} from 'typescript/unstable/ast'

// oxlint-disable-next-line import/export -- Oxlint cannot follow this SDK subpath's re-exports; compile verifies the complete native declaration surface.
export * from 'typescript/unstable/ast'
export { isPropertySignatureDeclaration as isPropertySignature } from 'typescript/unstable/ast'

export function parseSourceFile(
  filename: string,
  sourceText: string,
): SourceFile
export type FunctionLike = Node & FunctionLikeBase
export function isFunctionLike(node: Node): node is FunctionLike
export function forEachChild<T>(
  node: Node,
  visitor: (node: Node) => T,
): T | undefined
export function isStringLiteralLike(
  node: Node,
): node is StringLiteral | NoSubstitutionTemplateLiteral
export function canHaveModifiers(node: Node): node is ModifiersBase
export function getModifiers(
  node: ModifiersBase,
): readonly Modifier[] | undefined
export function getPropertySignatureType(
  node: PropertySignatureDeclaration,
): TypeNode | undefined
