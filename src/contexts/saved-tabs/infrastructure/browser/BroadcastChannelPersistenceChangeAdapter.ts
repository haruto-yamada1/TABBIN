import { z } from 'zod'

import type {
  PersistenceChangeEvent,
  PersistenceChangePort,
} from '@/contexts/saved-tabs/application/ports/PersistenceChangePort'

export const PERSISTENCE_CHANGE_BROADCAST_CHANNEL_NAME =
  'tabbin:persistence-change:v1'

export type BroadcastChannelMessageEventLike = {
  readonly data: unknown
}

type BroadcastChannelMessageListener = (
  event: BroadcastChannelMessageEventLike,
) => void

export type BroadcastChannelLike = {
  readonly addEventListener: (
    type: 'message',
    listener: BroadcastChannelMessageListener,
  ) => void
  readonly close: () => void
  readonly postMessage: (message: unknown) => void
  readonly removeEventListener: (
    type: 'message',
    listener: BroadcastChannelMessageListener,
  ) => void
}

export type BroadcastChannelFactory = (
  channelName: string,
) => BroadcastChannelLike

export type BroadcastChannelPersistenceChangeAdapterDeps = {
  readonly channelFactory?: BroadcastChannelFactory
  readonly channelName?: string
}

export class PersistenceChangePublicationError extends Error {
  readonly code = 'PERSISTENCE_CHANGE_PUBLICATION_FAILED'

  constructor() {
    super('Persistence change publication failed.')
    this.name = 'PersistenceChangePublicationError'
  }
}

export class PersistenceChangeTransportUnavailableError extends Error {
  readonly code = 'PERSISTENCE_CHANGE_TRANSPORT_UNAVAILABLE'

  constructor() {
    super('Persistence change transport is unavailable.')
    this.name = 'PersistenceChangeTransportUnavailableError'
  }
}

const PersistenceChangeEventSchema = z
  .object({
    changeId: z.string().min(1),
    revision: z.number().int().positive(),
    scopes: z
      .array(
        z.enum([
          'analyticsViews',
          'categories',
          'collections',
          'conversations',
          'groups',
          'memberships',
          'recoverySnapshots',
          'urls',
        ]),
      )
      .min(1),
  })
  .strict()

const createGlobalBroadcastChannel: BroadcastChannelFactory = (channelName) => {
  const BroadcastChannelConstructor = globalThis.BroadcastChannel
  if (typeof BroadcastChannelConstructor !== 'function') {
    throw new PersistenceChangeTransportUnavailableError()
  }

  let channel: BroadcastChannel
  try {
    channel = new BroadcastChannelConstructor(channelName)
  } catch {
    throw new PersistenceChangeTransportUnavailableError()
  }
  const nativeListeners = new Map<
    BroadcastChannelMessageListener,
    EventListener
  >()

  return {
    addEventListener: (type, listener) => {
      const nativeListener: EventListener = (event) => {
        listener({ data: 'data' in event ? event.data : undefined })
      }
      nativeListeners.set(listener, nativeListener)
      channel.addEventListener(type, nativeListener)
    },
    close: () => {
      channel.close()
    },
    postMessage: channel.postMessage.bind(channel),
    removeEventListener: (type, listener) => {
      const nativeListener = nativeListeners.get(listener)
      if (!nativeListener) {
        return
      }
      channel.removeEventListener(type, nativeListener)
      nativeListeners.delete(listener)
    },
  }
}

const copyEvent = (event: PersistenceChangeEvent): PersistenceChangeEvent => ({
  changeId: event.changeId,
  revision: event.revision,
  scopes: [...event.scopes],
})

export const createBroadcastChannelPersistenceChangeAdapter = (
  deps: BroadcastChannelPersistenceChangeAdapterDeps = {},
): PersistenceChangePort => {
  const channelFactory = deps.channelFactory ?? createGlobalBroadcastChannel
  const channelName =
    deps.channelName ?? PERSISTENCE_CHANGE_BROADCAST_CHANNEL_NAME

  return {
    publish: (event) => {
      let channel: BroadcastChannelLike | undefined
      try {
        channel = channelFactory(channelName)
        const postMessage = channel.postMessage.bind(channel)
        postMessage(copyEvent(event))
      } catch (error) {
        if (error instanceof PersistenceChangeTransportUnavailableError) {
          throw error
        }
        throw new PersistenceChangePublicationError()
      } finally {
        channel?.close()
      }
    },
    subscribe: (listener) => {
      const channel = channelFactory(channelName)
      let subscribed = true
      const handleMessage: BroadcastChannelMessageListener = (message) => {
        const result = PersistenceChangeEventSchema.safeParse(message.data)
        if (!result.success) {
          return
        }
        listener(copyEvent(result.data))
      }

      channel.addEventListener('message', handleMessage)

      return () => {
        if (!subscribed) {
          return
        }
        subscribed = false
        try {
          channel.removeEventListener('message', handleMessage)
        } finally {
          channel.close()
        }
      }
    },
  }
}
