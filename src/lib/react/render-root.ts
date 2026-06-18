import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'

const ROOT_KEY = '__tabbinReactRoot__'

type RootContainer = HTMLElement & {
  [ROOT_KEY]?: Root
}

const getOrCreateRoot = (container: HTMLElement) => {
  const rootContainer = container as RootContainer

  // eslint-disable-next-line typescript/prefer-nullish-coalescing -- intentional initialization pattern
  if (!rootContainer[ROOT_KEY]) {
    rootContainer[ROOT_KEY] = createRoot(container)
  }

  return rootContainer[ROOT_KEY]
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
