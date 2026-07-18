import { z } from 'zod'

import type {
  PersistenceChangeEvent,
  PersistenceChangePort,
  PersistenceChangeScope,
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

export class PersistenceChangeCleanupError extends Error {
  readonly code = 'PERSISTENCE_CHANGE_CLEANUP_FAILED'

  constructor() {
    super('Persistence change transport cleanup failed.')
    this.name = 'PersistenceChangeCleanupError'
  }
}

const definePersistenceChangeScopes = <
  const Scopes extends readonly PersistenceChangeScope[],
>(
  scopes: Scopes,
  ..._missingScopes: Exclude<
    PersistenceChangeScope,
    Scopes[number]
  > extends never
    ? []
    : [never]
): Scopes => scopes

const PERSISTENCE_CHANGE_SCOPES = definePersistenceChangeScopes([
  'analyticsViews',
  'categories',
  'collections',
  'conversations',
  'groups',
  'memberships',
  'recoverySnapshots',
  'urls',
] as const)

const PersistenceChangeEventSchema = z
  .object({
    changeId: z.string().min(1),
    revision: z.number().int().positive(),
    scopes: z
      .array(z.enum(PERSISTENCE_CHANGE_SCOPES))
      .min(1)
      .refine((scopes) => new Set(scopes).size === scopes.length),
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
  let nativeListener: EventListener

  return {
    addEventListener: (type, listener) => {
      nativeListener = (event) => {
        listener({ data: 'data' in event ? event.data : undefined })
      }
      channel.addEventListener(type, nativeListener)
    },
    close: () => {
      channel.close()
    },
    postMessage: channel.postMessage.bind(channel),
    removeEventListener: (type, _listener) => {
      channel.removeEventListener(type, nativeListener)
    },
  }
}

const copyEvent = (event: PersistenceChangeEvent): PersistenceChangeEvent => ({
  changeId: event.changeId,
  revision: event.revision,
  scopes: [...event.scopes],
})

const closeChannelBestEffort = (channel: BroadcastChannelLike): boolean => {
  try {
    channel.close()
    return true
  } catch {
    return false
  }
}

const removeMessageListenerBestEffort = (
  channel: BroadcastChannelLike,
  listener: BroadcastChannelMessageListener,
): void => {
  try {
    channel.removeEventListener('message', listener)
  } catch {
    // Cleanup must not expose transport-specific errors.
  }
}

export const createBroadcastChannelPersistenceChangeAdapter = (
  deps: BroadcastChannelPersistenceChangeAdapterDeps = {},
): PersistenceChangePort => {
  const channelFactory = deps.channelFactory ?? createGlobalBroadcastChannel
  const channelName =
    deps.channelName ?? PERSISTENCE_CHANGE_BROADCAST_CHANNEL_NAME

  return {
    publish: async (event) => {
      await Promise.resolve()

      let channel: BroadcastChannelLike | undefined
      let primaryError: 'publication' | 'unavailable' | undefined
      try {
        channel = channelFactory(channelName)
        const postMessage = channel.postMessage.bind(channel)
        postMessage(copyEvent(event))
      } catch (error) {
        primaryError =
          error instanceof PersistenceChangeTransportUnavailableError
            ? 'unavailable'
            : 'publication'
      }

      const cleanupSucceeded = channel ? closeChannelBestEffort(channel) : true
      if (primaryError === 'unavailable') {
        throw new PersistenceChangeTransportUnavailableError()
      }
      if (primaryError === 'publication') {
        throw new PersistenceChangePublicationError()
      }
      if (!cleanupSucceeded) {
        throw new PersistenceChangeCleanupError()
      }
    },
    subscribe: (listener) => {
      let active = false
      const handleMessage: BroadcastChannelMessageListener = (message) => {
        if (!active) {
          return
        }
        const result = PersistenceChangeEventSchema.safeParse(message.data)
        if (!result.success) {
          return
        }
        listener(copyEvent(result.data))
      }
      let channel: BroadcastChannelLike | undefined

      try {
        channel = channelFactory(channelName)
        channel.addEventListener('message', handleMessage)
        active = true
      } catch {
        if (channel) {
          removeMessageListenerBestEffort(channel, handleMessage)
          closeChannelBestEffort(channel)
        }
        throw new PersistenceChangeTransportUnavailableError()
      }

      return () => {
        if (!active) {
          return
        }
        active = false
        removeMessageListenerBestEffort(channel, handleMessage)
        closeChannelBestEffort(channel)
      }
    },
  }
}
