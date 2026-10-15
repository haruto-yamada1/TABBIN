/* eslint-disable no-restricted-imports -- browser harness mounts the production invalidation consumer */
import { createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { createBroadcastChannelPersistenceChangeAdapter } from '@/contexts/saved-tabs/infrastructure/browser/BroadcastChannelPersistenceChangeAdapter'
import { createPersistenceChangeStorageAdapter } from '@/contexts/saved-tabs/infrastructure/browser/PersistenceChangeStorageAdapter'
import { useSavedTabsStorageSync } from '@/contexts/saved-tabs/presentation/hooks/useSavedTabsStorageSync'

import { createConcurrentPersistenceBrowserHarness } from './concurrent-persistence-browser-harness'
import type { ConcurrentPersistenceBrowserHarness } from './concurrent-persistence-browser-harness'

type Projection = Pick<
  Awaited<
    ReturnType<ConcurrentPersistenceBrowserHarness['readConsistentSnapshot']>
  >,
  'revision' | 'savedTabs'
>

const mountConsumer = (persistence: ConcurrentPersistenceBrowserHarness) => {
  const container = document.querySelector('#root')
  if (!container) {
    throw new Error('The browser consumer requires a root element.')
  }
  const changePort = createPersistenceChangeStorageAdapter(
    createBroadcastChannelPersistenceChangeAdapter(),
  )
  const Consumer = () => {
    const [projection, setProjection] = useState<Projection>()
    useSavedTabsStorageSync(changePort, async () => {
      const { revision, savedTabs } = await persistence.readConsistentSnapshot()
      setProjection({ revision, savedTabs })
    })
    return createElement(
      'output',
      { 'data-testid': 'persistence-projection' },
      projection ? JSON.stringify(projection) : 'Loading',
    )
  }
  const root = createRoot(container)
  root.render(createElement(Consumer))
  return () => {
    root.unmount()
  }
}

declare global {
  // eslint-disable-next-line typescript/consistent-type-definitions -- ambient Window extension requires interface merging
  interface Window {
    __initializeTabbinInvalidation: (
      databaseName: string,
      consumer: boolean,
    ) => void
    __tabbinInvalidationLoadId: string
  }
}

Object.assign(globalThis, {
  __initializeTabbinInvalidation: (databaseName: string, consumer: boolean) => {
    const persistence = createConcurrentPersistenceBrowserHarness(databaseName)
    window.__tabbinConcurrentPersistence = persistence
    window.__tabbinInvalidationLoadId = crypto.randomUUID()
    const unmount = consumer ? mountConsumer(persistence) : () => {}
    window.addEventListener(
      'pagehide',
      () => {
        unmount()
        persistence.close()
      },
      { once: true },
    )
  },
})
