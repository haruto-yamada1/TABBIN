// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import type * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@radix-ui/react-scroll-area', () => {
  const Root = ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement>) => (
    <div data-testid='root' {...props}>
      {children}
    </div>
  )
  const Viewport = ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement>) => (
    <div data-testid='viewport' {...props}>
      {children}
    </div>
  )
  const ScrollAreaScrollbar = ({
    children,
    orientation,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { orientation?: string }) => (
    <div data-testid='scrollbar' data-orientation={orientation} {...props}>
      {children}
    </div>
  )
  const ScrollAreaThumb = ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement>) => (
    <div data-testid='thumb' {...props}>
      {children}
    </div>
  )
  const Corner = (props: React.HTMLAttributes<HTMLDivElement>) => (
    <div data-testid='corner' {...props} />
  )

  return {
    Root,
    Viewport,
    ScrollAreaScrollbar,
    ScrollAreaThumb,
    Corner,
  }
})

import { ScrollArea, ScrollBar } from './scroll-area'

describe('ScrollAreaコンポーネント', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('ScrollArea にデフォルトの縦スクロールバーを描画する', () => {
    render(
      <ScrollArea>
        <div>Content</div>
      </ScrollArea>,
    )

    const scrollbars = screen.getAllByTestId('scrollbar')
    expect(scrollbars[0]?.getAttribute('data-orientation')).toBe('vertical')
    expect(scrollbars[0]?.className).toContain('h-full w-2.5')
  })

  it('orientation が horizontal のとき横向きスタイルを適用する', () => {
    render(<ScrollBar orientation='horizontal' />)

    const scrollbar = screen
      .getAllByTestId('scrollbar')
      .find((el) => el.getAttribute('data-orientation') === 'horizontal')
    if (!scrollbar) {
      throw new Error('horizontal scrollbar not found')
    }
    expect(scrollbar.getAttribute('data-orientation')).toBe('horizontal')
    expect(scrollbar.className).toContain('h-2.5')
    expect(scrollbar.className).toContain('flex-col')
    expect(scrollbar.className).toContain('border-t')
  })
})
