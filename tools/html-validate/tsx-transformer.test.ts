import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import transformer from './tsx-transformer.mjs'

function transform(source: string, filename = 'fixture.tsx'): string {
  const [result] = transformer({
    data: source,
    filename,
    line: 1,
    column: 1,
    offset: 0,
  })

  return result.data
}

describe('tsx html-validate transformer', () => {
  it('extracts native JSX elements from TSX source', () => {
    expect(
      transform(`
        export function SaveButton() {
          return (
            <button type="button" className={styles.button}>
              <span>保存</span>
            </button>
          )
        }
      `),
    ).toContain(
      '<button type="button" class="__dynamic__"><span>保存</span></button>',
    )
  })

  it('preserves invalid button descendants so element-permitted-content can fail', () => {
    expect(
      transform(`
        export function SaveButton() {
          return <button type="button"><div>保存</div></button>
        }
      `),
    ).toContain('<button type="button"><div>保存</div></button>')
  })

  it('extracts JSX from conditionals and array maps', () => {
    expect(
      transform(`
        export function Actions({ items, enabled }) {
          return (
            <div>
              {enabled ? <button type="button"><a href="/x">Open</a></button> : null}
              {items.map((item) => <button type="button"><input value={item.name} /></button>)}
            </div>
          )
        }
      `),
    ).toContain(
      '<div><button type="button"><a href="/x">Open</a></button><button type="button"><input value="__dynamic__"></button></div>',
    )
  })

  it('represents custom components as neutral phrasing content without inferring their children', () => {
    expect(
      transform(`
        export function SaveButton() {
          return <button type="button"><Icon><div /></Icon><span>保存</span></button>
        }
      `),
    ).toContain(
      '<button type="button"><span data-component="Icon"></span><span>保存</span></button>',
    )
  })

  it('serializes known button components as native buttons', () => {
    expect(
      transform(`
        export function SaveButton() {
          return <Button type="button"><div>保存</div></Button>
        }
      `),
    ).toContain('<button type="button"><div>保存</div></button>')
  })

  it('does not infer a native button for asChild Button composition', () => {
    expect(
      transform(`
        export function LinkButton() {
          return <Button asChild><a href="/tabs"><div>保存</div></a></Button>
        }
      `),
    ).toContain('<span data-component="Button"></span>')
  })

  it('inlines local components when they are rendered inside known intrinsic components', () => {
    expect(
      transform(`
        const ButtonContent = () => (
          <div>
            <span>保存</span>
          </div>
        )

        export function SaveButton() {
          return <Button type="button"><ButtonContent /></Button>
        }
      `),
    ).toContain('<button type="button"><div><span>保存</span></div></button>')
  })

  it('preserves call-site children when inlining local wrappers', () => {
    expect(
      transform(`
        const LocalButton = ({ children }) => (
          <button type="button">{children}</button>
        )

        export function SaveButton() {
          return <LocalButton><div>保存</div></LocalButton>
        }
      `),
    ).toContain('<button type="button"><div>保存</div></button>')
  })

  it('uses exported same-file wrappers for inference while keeping them as roots', () => {
    expect(
      transform(`
        export const LocalButton = ({ children }) => (
          <button type="button">{children}</button>
        )

        export function SaveButton() {
          return <LocalButton><div>保存</div></LocalButton>
        }
      `),
    ).toContain('<button type="button"><div>保存</div></button>')
  })

  it('does not infer a native button for explicit true asChild composition', () => {
    expect(
      transform(`
        export function LinkButton() {
          return <Button asChild={true}><a href="/tabs"><div>保存</div></a></Button>
        }
      `),
    ).toContain('<span data-component="Button"></span>')
  })

  it('infers imported wrappers that render known intrinsic components', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tsx-transformer-'))
    try {
      fs.writeFileSync(
        path.join(directory, 'Suggestion.tsx'),
        `
          import { Button } from './Button'

          export const Suggestion = ({ children }) => (
            <Button type="button">{children}</Button>
          )
        `,
      )
      fs.writeFileSync(
        path.join(directory, 'Button.tsx'),
        `
          export const Button = ({ children }) => (
            <button type="button">{children}</button>
          )
        `,
      )

      expect(
        transform(
          `
            import { Suggestion } from './Suggestion'

            export function SaveButton() {
              return <Suggestion><div>保存</div></Suggestion>
            }
          `,
          path.join(directory, 'fixture.tsx'),
        ),
      ).toContain('<button><div>保存</div></button>')
    } finally {
      fs.rmSync(directory, { force: true, recursive: true })
    }
  })

  it('infers imported wrappers that render non-button intrinsic elements', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tsx-transformer-'))
    try {
      fs.writeFileSync(
        path.join(directory, 'List.tsx'),
        `
          export const List = ({ children }) => (
            <ul>{children}</ul>
          )
        `,
      )

      expect(
        transform(
          `
            import { List } from './List'

            export function CategoryList() {
              return <List><span>invalid item</span></List>
            }
          `,
          path.join(directory, 'fixture.tsx'),
        ),
      ).toContain('<ul><span>invalid item</span></ul>')
    } finally {
      fs.rmSync(directory, { force: true, recursive: true })
    }
  })

  it('infers imported wrappers that render registered external primitives', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tsx-transformer-'))
    try {
      fs.writeFileSync(
        path.join(directory, 'AlertDialog.tsx'),
        `
          import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'

          export const AlertDialogAction = ({ children }) => (
            <AlertDialogPrimitive.Action>{children}</AlertDialogPrimitive.Action>
          )
        `,
      )

      expect(
        transform(
          `
            import { AlertDialogAction } from './AlertDialog'

            export function ConfirmButton() {
              return <AlertDialogAction><div>Delete</div></AlertDialogAction>
            }
          `,
          path.join(directory, 'fixture.tsx'),
        ),
      ).toContain('<button><div>Delete</div></button>')
    } finally {
      fs.rmSync(directory, { force: true, recursive: true })
    }
  })
})
