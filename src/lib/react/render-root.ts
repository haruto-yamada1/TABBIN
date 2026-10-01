import { createElement } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'

import { logger } from '@/lib/logging/logger'

import { RenderErrorBoundary } from './RenderErrorBoundary'
import type { RenderRecoveryOptions } from './RenderErrorBoundary'

const roots = new WeakMap<HTMLElement, Root>()

const getOrCreateRoot = (container: HTMLElement): Root => {
  const existingRoot = roots.get(container)
  if (existingRoot) {
    return existingRoot
  }

  // React's default callbacks log the raw error, including private messages.
  const root = createRoot(container, {
    onCaughtError: (error) => {
      logger.error('react_render_caught', error)
    },
    onUncaughtError: (error) => {
      logger.error('react_render_uncaught', error)
    },
    onRecoverableError: (error) => {
      logger.error('react_render_recoverable', error)
    },
  })
  roots.set(container, root)
  return root
}

const renderToRoot = (
  container: HTMLElement,
  node: ReactNode,
  recovery: RenderRecoveryOptions = {},
) => {
  getOrCreateRoot(container).render(
    createElement(RenderErrorBoundary, recovery, node),
  )
}

const mountToElement = (
  containerId: string,
  node: ReactNode,
  notFoundMessage: string,
  recovery?: RenderRecoveryOptions,
) => {
  const container = document.querySelector(`#${containerId}`)
  if (!container) {
    throw new Error(notFoundMessage)
  }

  if (!(container instanceof HTMLElement)) {
    throw new Error(`Container #${containerId} is not an HTMLElement`)
  }

  renderToRoot(container, node, recovery)
}

export { getOrCreateRoot, mountToElement, renderToRoot }
