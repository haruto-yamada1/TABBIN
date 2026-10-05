import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { API, Snapshot } from 'typescript/unstable/sync'
import { describe, expect, it, vi } from 'vitest'

import * as ts from './native-parser.mjs'

function callsIn(source: ts.SourceFile): ts.CallExpression[] {
  const calls: ts.CallExpression[] = []
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      calls.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return calls
}

const requireNode = <T>(value: T | undefined): T => {
  if (value === undefined) {
    throw new Error('Expected a native AST node')
  }
  return value
}

describe('native TypeScript parser', () => {
  it('recovers from a caught syntax error within the same batch', () => {
    const result = ts.withSourceParser((parse) => {
      expect(() => parse('invalid.ts', 'const invalid = ;')).toThrow(
        /Expression expected/,
      )
      return parse('recovered.tsx', 'const recovered = <main />')
    })
    expect(result.text).toBe('const recovered = <main />')
    expect(result.scriptKind).toBe(ts.ScriptKind.TSX)
  })

  it('owns one native API per batch while preserving syntax modes and AST lifetime', () => {
    const close = vi.spyOn(API.prototype, 'close')
    try {
      const sources = ts.withSourceParser((parse) => [
        parse('first.ts', 'const first: number = 1'),
        parse('second.tsx', 'const second = <div />'),
        parse('third.js', 'fetch("third")'),
      ])
      expect(sources.map((source) => source.scriptKind)).toEqual([
        ts.ScriptKind.TS,
        ts.ScriptKind.TSX,
        ts.ScriptKind.JS,
      ])
      expect(sources.map((source) => source.text)).toEqual([
        'const first: number = 1',
        'const second = <div />',
        'fetch("third")',
      ])
      expect(close).toHaveBeenCalledOnce()
    } finally {
      close.mockRestore()
    }
  })

  it('invalidates same-path ASTs and closes the batch on parser errors', () => {
    const close = vi.spyOn(API.prototype, 'close')
    try {
      expect(() =>
        ts.withSourceParser((parse) => {
          const original = parse('same.ts', 'fetch("old")')
          const updated = parse('same.ts', 'fetch("new")')
          expect(original.text).toBe('fetch("old")')
          expect(updated.text).toBe('fetch("new")')
          parse('same.ts', 'const invalid = ;')
        }),
      ).toThrow(/Expression expected/)
      expect(close).toHaveBeenCalledOnce()
    } finally {
      close.mockRestore()
    }
  })

  it('preserves missing annotations in native property signatures', () => {
    const source = ts.parseSourceFile(
      'property.ts',
      'interface Store { port; typed: IDBObjectStore }',
    )
    const types: (ts.SyntaxKind | undefined)[] = []
    const visit = (node: ts.Node): void => {
      if (ts.isPropertySignature(node)) {
        types.push(ts.getPropertySignatureType(node)?.kind)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    expect(types).toEqual([undefined, ts.SyntaxKind.TypeReference])
  })

  it('closes the native API even when releasing a snapshot fails', () => {
    const realDispose = Snapshot.prototype.dispose
    const realClose = API.prototype.close
    const update = vi.spyOn(API.prototype, 'updateSnapshot')
    const dispose = vi
      .spyOn(Snapshot.prototype, 'dispose')
      .mockImplementation(function failRelease(this: Snapshot) {
        realDispose.call(this)
        throw new Error('snapshot release failed')
      })
    const close = vi.spyOn(API.prototype, 'close')
    try {
      expect(() => ts.parseSourceFile('release.ts', 'const value = 1')).toThrow(
        'snapshot release failed',
      )
      expect(close).toHaveBeenCalledOnce()
    } finally {
      const activeApi = update.mock.contexts[0]
      if (activeApi instanceof API) {
        realClose.call(activeApi)
      }
      update.mockRestore()
      dispose.mockRestore()
      close.mockRestore()
    }
  })

  it.each([
    ['memory.ts', 'const value: number = 1', ts.ScriptKind.TS],
    ['memory.tsx', 'const view = <div />', ts.ScriptKind.TSX],
    ['memory.js', 'const value = 1', ts.ScriptKind.JS],
    ['memory.jsx', 'const view = <div />', ts.ScriptKind.JSX],
    ['memory.mts', 'export const value: number = 1', ts.ScriptKind.TS],
    ['memory.cjs', 'module.exports = 1', ts.ScriptKind.JS],
  ])('parses in-memory %s using its filename mode', (filename, text, kind) => {
    const source = ts.parseSourceFile(filename, text)

    expect(ts.isSourceFile(source)).toBe(true)
    expect(source.scriptKind).toBe(kind)
    expect(source.text).toBe(text)
  })

  it('retains genuine native parents, traversal and text after closing the API', () => {
    const source = ts.parseSourceFile(
      'parent.ts',
      'const result = fetch("https://example.com")',
    )
    const call = requireNode(callsIn(source)[0])

    expect(call).toBeDefined()
    expect(ts.isVariableDeclaration(call.parent)).toBe(true)
    expect(call.getText(source)).toBe('fetch("https://example.com")')
    expect(call.getSourceFile()).toBe(source)
    expect(ts.forEachChild(source, (node) => node)).toBe(source.statements[0])
  })

  it.each([
    ['const label = "日本😀"; fetch("url")', 0, 22],
    ['\uFEFFfetch("url")', 0, 1],
    ['\uFEFFconst label = "日本😀";\r\nfetch("url")', 1, 0],
    ['const label = "日本😀";\u2028fetch("url")', 1, 0],
  ])('preserves original UTF-16 locations for %j', (text, line, character) => {
    const source = ts.parseSourceFile('unicode.ts', text)
    const call = requireNode(callsIn(source)[0])

    expect(call.getStart(source)).toBe(text.indexOf('fetch'))
    expect(source.getLineAndCharacterOfPosition(call.getStart(source))).toEqual(
      {
        line,
        character,
      },
    )
    expect(call.getText(source)).toBe('fetch("url")')
    expect(source.text.length).toBe(text.length)
  })

  it('rejects malformed syntax with the native located diagnostic', () => {
    expect(() => ts.parseSourceFile('malformed.ts', 'const x = ;')).toThrow(
      /malformed\.ts:1:11.*Expression expected/,
    )
    const error = (() => {
      try {
        ts.parseSourceFile('malformed.ts', 'const x = ;')
      } catch (error) {
        return error
      }
      throw new Error('Malformed source must be rejected')
    })()
    expect(error).toBeInstanceOf(SyntaxError)
    expect((error as SyntaxError).cause).toEqual([
      expect.objectContaining({ pos: 10, end: 11, code: 1109 }),
    ])
  })

  it('preserves Unicode positions on parser diagnostics', () => {
    const text = '\uFEFFconst label = "日本😀"; const x = ;'

    expect(() => ts.parseSourceFile('unicode-error.ts', text)).toThrow(
      new RegExp(
        `unicode-error\\.ts:1:${text.indexOf(';', 25) + 1}.*Expression expected`,
      ),
    )
  })

  it('reparses valid, invalid and updated valid text at the same virtual path', () => {
    const original = ts.parseSourceFile('same.ts', 'fetch("original")')

    expect(() => ts.parseSourceFile('same.ts', 'const x = ;')).toThrow(
      SyntaxError,
    )
    const updated = ts.parseSourceFile('same.ts', 'fetch("updated")')

    expect(requireNode(callsIn(original)[0]).getText(original)).toBe(
      'fetch("original")',
    )
    expect(requireNode(callsIn(updated)[0]).getText(updated)).toBe(
      'fetch("updated")',
    )
  })

  it('uses only virtual source without resolving real imports, config or libraries', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'tabbin-native-parser-'))
    const filename = path.join(directory, 'source.ts')
    const text = [
      '/// <reference path="./dependency.ts" />',
      'import "./dependency"',
      'const value: MissingGlobalType = unknownGlobal',
    ].join('\n')
    try {
      writeFileSync(filename, 'const diskSource = ;')
      writeFileSync(
        path.join(directory, 'dependency.ts'),
        'const dependency = ;',
      )
      writeFileSync(
        path.join(directory, 'tsconfig.json'),
        '{ invalid real config',
      )

      const source = ts.parseSourceFile(filename, text)

      expect(source.text).toBe(text)
      expect(source.statements).toHaveLength(2)
      expect(ts.isImportDeclaration(requireNode(source.statements[0]))).toBe(
        true,
      )
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('parses minified JS imports and classifies JSX using the native filename mode', () => {
    const text =
      'import{a as b}from"./chunk.js";const c=()=>fetch(b);export{c};'

    const source = ts.parseSourceFile('chunk-abc123.js', text)

    expect(source.scriptKind).toBe(ts.ScriptKind.JS)
    expect(requireNode(callsIn(source)[0]).getText(source)).toBe('fetch(b)')
    const jsWithJsx = ts.parseSourceFile('chunk.js', 'const view = <div />')
    expect(jsWithJsx.scriptKind).toBe(ts.ScriptKind.JS)
    expect(jsWithJsx.languageVariant).toBe(ts.LanguageVariant.JSX)
    expect(
      ts.parseSourceFile('chunk.jsx', 'const view = <div />').scriptKind,
    ).toBe(ts.ScriptKind.JSX)
  })

  it('recognizes strings and constant templates without treating interpolations as literals', () => {
    const source = ts.parseSourceFile(
      'literal.ts',
      `fetch("string");fetch(\`constant\`);fetch(\`value\${variable}\`)`,
    )

    expect(
      callsIn(source).map((call) =>
        ts.isStringLiteralLike(requireNode(call.arguments[0])),
      ),
    ).toEqual([true, true, false])
  })

  it('recognizes exported modifiers while excluding decorators', () => {
    const source = ts.parseSourceFile(
      'modifiers.ts',
      '@decorator export class Example {}\nfunction local() {}',
    )
    const exported = requireNode(source.statements.find(ts.isClassDeclaration))
    const local = requireNode(source.statements.find(ts.isFunctionDeclaration))

    expect(ts.canHaveModifiers(exported)).toBe(true)
    expect(ts.getModifiers(exported)?.map((node) => node.kind)).toEqual([
      ts.SyntaxKind.ExportKeyword,
    ])
    expect(ts.canHaveModifiers(local)).toBe(true)
    expect(ts.getModifiers(local)).toBeUndefined()
    expect(
      ts.canHaveModifiers(
        requireNode(callsIn(ts.parseSourceFile('call.ts', 'fetch()'))[0]),
      ),
    ).toBe(false)
  })
})
