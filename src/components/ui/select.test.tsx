// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { createPrimitive } = vi.hoisted(() => ({
  createPrimitive:
    (tag: keyof JSX.IntrinsicElements) =>
    ({
      children,
      ...props
    }: {
      children?: React.ReactNode
    } & Record<string, unknown>) =>
      createElement(tag, props, children),
}))

vi.mock('@radix-ui/react-select', () => ({
  Root: createPrimitive('div'),
  Group: createPrimitive('div'),
  Value: createPrimitive('span'),
  Trigger: createPrimitive('button'),
  Icon: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Content: createPrimitive('div'),
  Viewport: createPrimitive('div'),
  Label: createPrimitive('div'),
  Item: createPrimitive('div'),
  ItemIndicator: createPrimitive('span'),
  ItemText: createPrimitive('span'),
  Separator: createPrimitive('div'),
  ScrollUpButton: createPrimitive('div'),
  ScrollDownButton: createPrimitive('div'),
}))

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './select'

describe('select ui', () => {
  const getRenderedNodes = () => {
    const item = screen.getByText('Item 1').closest('div')
    if (!item?.parentElement?.parentElement?.parentElement) {
      throw new Error('select content not found')
    }

    return {
      item,
      group: item.parentElement,
      viewport: item.parentElement.parentElement,
      content: item.parentElement.parentElement.parentElement,
    }
  }

  afterEach(() => {
    cleanup()
  })

  it('各ラッパーに data-slot と追加クラスを付与する', () => {
    render(
      <Select>
        <SelectTrigger className='trigger-extra'>
          <SelectValue>Current Value</SelectValue>
        </SelectTrigger>
        <SelectContent className='content-extra'>
          <SelectGroup>
            <SelectLabel className='label-extra'>Group Label</SelectLabel>
            <SelectItem value='item-1' className='item-extra'>
              Item 1
            </SelectItem>
            <SelectSeparator className='separator-extra' />
          </SelectGroup>
        </SelectContent>
      </Select>,
    )

    const { item, group, viewport, content } = getRenderedNodes()

    expect(screen.getByText('Current Value').tagName).toBe('SPAN')
    expect(screen.getByRole('button').className).toContain('trigger-extra')
    expect(screen.getByRole('button').className).toContain('cursor-pointer')
    expect(screen.getByRole('button').className).toContain('justify-between')
    expect(screen.getByText('Group Label').className).toContain('label-extra')
    expect(item?.className).toContain('item-extra')
    expect(group?.querySelector('.separator-extra')).toBeTruthy()
    expect(content.className).toContain('content-extra')
    expect(content.className).toContain(
      'max-h-(--radix-select-content-available-height)',
    )
    expect(content.className).toContain('overflow-y-auto')
    expect(content.className).toContain('overflow-x-hidden')
    expect(viewport.className).toContain('min-w-(--radix-select-trigger-width)')
  })

  it('popper 以外の position では popper 専用クラスを付けない', () => {
    render(
      <Select>
        <SelectTrigger>
          <SelectValue>Value</SelectValue>
        </SelectTrigger>
        <SelectContent position='item-aligned'>
          <SelectItem value='item-1'>Item 1</SelectItem>
        </SelectContent>
      </Select>,
    )

    const { content, viewport } = getRenderedNodes()
    expect(content.className).not.toContain('translate-y-1')
    expect(viewport.className).not.toContain(
      'min-w-(--radix-select-trigger-width)',
    )
  })

  it('SelectTrigger は aria-invalid=true のときエラー表示用クラスを持つ', () => {
    render(
      <Select>
        <SelectTrigger aria-invalid>
          <SelectValue>Invalid Value</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='item-1'>Item 1</SelectItem>
        </SelectContent>
      </Select>,
    )

    const trigger = screen.getByRole('button', { name: 'Invalid Value' })
    expect(trigger.getAttribute('aria-invalid')).toBe('true')
    expect(trigger.className).toContain('aria-invalid:border-destructive')
    expect(trigger.className).toContain('aria-invalid:ring-destructive/20')
    expect(trigger.className).toContain('dark:aria-invalid:ring-destructive/40')
  })

  it('SelectTrigger は長い現在値を省略表示できるクラスを持つ', () => {
    render(
      <Select>
        <SelectTrigger>
          <SelectValue>現在開いているドメインのタブをすべて保存</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='item-1'>Item 1</SelectItem>
        </SelectContent>
      </Select>,
    )

    const trigger = screen.getByRole('button', {
      name: '現在開いているドメインのタブをすべて保存',
    })
    expect(trigger.className).toContain('min-w-0')
    expect(trigger.className).toContain('[&>span]:min-w-0')
    expect(trigger.className).toContain('[&>span]:truncate')
  })
})
