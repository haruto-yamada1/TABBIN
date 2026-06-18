// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest' // eslint-disable-line

import { getOrCreateRoot, mountToElement, renderToRoot } from './render-root'

const rootMocks = vi.hoisted(() => ({
  createRoot: vi.fn(() => ({
    render: vi.fn(),
  })),
}))

vi.mock('react-dom/client', () => ({
  createRoot: rootMocks.createRoot,
}))

describe('render-root', () => {
  it('同じ container では root を再利用して render する', () => {
    const container = document.createElement('div')

    const firstRoot = getOrCreateRoot(container)
    const secondRoot = getOrCreateRoot(container)

    expect(firstRoot).toBe(secondRoot)
    expect(rootMocks.createRoot).toHaveBeenCalledOnce()

    renderToRoot(container, <span>content</span>)

    expect(firstRoot.render).toHaveBeenCalledWith(<span>content</span>)
  })

  it('指定 ID の要素へ mount し、存在しなければ例外を投げる', () => {
    const container = document.createElement('div')
    container.id = 'app'
    document.body.append(container)

    expect(() => {
      mountToElement('app', <span>mounted</span>, 'missing')
    }).not.toThrow()
    expect(() => {
      mountToElement('missing-app', <span>missing</span>, 'root missing')
    }).toThrow('root missing')
  })
})
