import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'

const roots = new WeakMap<HTMLElement, Root>()

const getOrCreateRoot = (container: HTMLElement): Root => {
  const existingRoot = roots.get(container)
  if (existingRoot) {
    return existingRoot
  }

  const root = createRoot(container)
  roots.set(container, root)
  return root
}

const renderToRoot = (container: HTMLElement, node: ReactNode) => {
  getOrCreateRoot(container).render(node)
}

const mountToElement = (
  containerId: string,
  node: ReactNode,
  notFoundMessage: string,
) => {
  const container = document.querySelector(`#${containerId}`)
  if (!container) {
    throw new Error(notFoundMessage)
  }

  if (!(container instanceof HTMLElement)) {
    throw new Error(`Container #${containerId} is not an HTMLElement`)
  }

  renderToRoot(container, node)
}

export { getOrCreateRoot, mountToElement, renderToRoot }
