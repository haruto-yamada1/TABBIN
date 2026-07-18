import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PersistenceChangeEvent } from '@/contexts/saved-tabs/application/ports/PersistenceChangePort'

import {
  createBroadcastChannelPersistenceChangeAdapter,
  PersistenceChangePublicationError,
  PersistenceChangeTransportUnavailableError,
} from './BroadcastChannelPersistenceChangeAdapter'
import type {
  BroadcastChannelFactory,
  BroadcastChannelLike,
  BroadcastChannelMessageEventLike,
} from './BroadcastChannelPersistenceChangeAdapter'

const CHANNEL_NAME = 'test:persistence-change'
const EVENT: PersistenceChangeEvent = {
  changeId: 'change-1',
  revision: 1,
  scopes: ['collections', 'urls'],
}

type InMemoryChannel = BroadcastChannelLike & {
  readonly closed: boolean
  readonly dispatchMessage: (event: BroadcastChannelMessageEventLike) => void
  readonly listenerCount: number
}

const createInMemoryChannelFactory = () => {
  const channels = new Map<string, Set<InMemoryChannel>>()

  const factory: BroadcastChannelFactory = (name) => {
    let closed = false
    const listeners = new Set<
      (event: BroadcastChannelMessageEventLike) => void
    >()
    const peers = channels.get(name) ?? new Set<InMemoryChannel>()

    const channel: InMemoryChannel = {
      addEventListener: (_type, listener) => {
        listeners.add(listener)
      },
      close: () => {
        closed = true
        peers.delete(channel)
      },
      get closed() {
        return closed
      },
      get listenerCount() {
        return listeners.size
      },
      postMessage: (message) => {
        for (const peer of peers) {
          if (peer === channel || peer.closed) {
            continue
          }
          peer.dispatchMessage({ data: message })
        }
      },
      removeEventListener: (_type, listener) => {
        listeners.delete(listener)
      },
      dispatchMessage: (event) => {
        for (const listener of listeners) {
          listener(event)
        }
      },
    }

    peers.add(channel)
    channels.set(name, peers)
    return channel
  }

  return {
    channels,
    factory,
  }
}

const createAdapter = (factory: BroadcastChannelFactory) =>
  createBroadcastChannelPersistenceChangeAdapter({
    channelFactory: factory,
    channelName: CHANNEL_NAME,
  })

const postMessage = (channel: BroadcastChannelLike, message: unknown) => {
  const publish = channel.postMessage.bind(channel)
  publish(message)
}

describe('BroadcastChannelPersistenceChangeAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('別 context の publisher から subscriber へ変更 envelope を届ける', () => {
    const { factory } = createInMemoryChannelFactory()
    const publisher = createAdapter(factory)
    const subscriber = createAdapter(factory)
    const listener = vi.fn()

    subscriber.subscribe(listener)
    publisher.publish(EVENT)

    expect(listener).toHaveBeenCalledExactlyOnceWith(EVENT)
  })

  it('active subscriber や response がなくても publish を完了する', () => {
    const { channels, factory } = createInMemoryChannelFactory()
    const publisher = createAdapter(factory)

    expect(publisher.publish(EVENT)).toBeUndefined()
    expect(channels.get(CHANNEL_NAME)?.size).toBe(0)
  })

  it('unsubscribe は listener を外して自身が所有する channel だけを閉じる', () => {
    const { channels, factory } = createInMemoryChannelFactory()
    const firstListener = vi.fn()
    const secondListener = vi.fn()
    const firstUnsubscribe = createAdapter(factory).subscribe(firstListener)
    createAdapter(factory).subscribe(secondListener)
    const [firstChannel, secondChannel] = [
      ...(channels.get(CHANNEL_NAME) ?? []),
    ]

    firstUnsubscribe()

    expect(firstChannel).toMatchObject({ closed: true, listenerCount: 0 })
    expect(secondChannel).toMatchObject({ closed: false, listenerCount: 1 })

    createAdapter(factory).publish(EVENT)

    expect(firstListener).not.toHaveBeenCalled()
    expect(secondListener).toHaveBeenCalledExactlyOnceWith(EVENT)
  })

  it.each([
    null,
    undefined,
    'not-an-object',
    {},
    { changeId: 1, revision: 1, scopes: ['urls'] },
    { changeId: 'change-1', revision: '1', scopes: ['urls'] },
    { changeId: 'change-1', revision: 1 },
  ])('malformed inbound message %# を無視する', (message) => {
    const { factory } = createInMemoryChannelFactory()
    const listener = vi.fn()
    createAdapter(factory).subscribe(listener)
    const externalPublisher = factory(CHANNEL_NAME)

    postMessage(externalPublisher, message)

    expect(listener).not.toHaveBeenCalled()
  })

  it.each([
    { changeId: 'change-1', revision: 1, scopes: [] },
    { changeId: 'change-1', revision: 1, scopes: ['unknown'] },
    { changeId: 'change-1', revision: 0, scopes: ['urls'] },
    { changeId: 'change-1', revision: -1, scopes: ['urls'] },
  ])(
    'invalid revision または scopes を持つ message %# を無視する',
    (message) => {
      const { factory } = createInMemoryChannelFactory()
      const listener = vi.fn()
      createAdapter(factory).subscribe(listener)
      const externalPublisher = factory(CHANNEL_NAME)

      postMessage(externalPublisher, message)

      expect(listener).not.toHaveBeenCalled()
    },
  )

  it('validated envelope だけをコピーして listener へ届ける', () => {
    const { factory } = createInMemoryChannelFactory()
    const listener = vi.fn()
    createAdapter(factory).subscribe(listener)
    const externalPublisher = factory(CHANNEL_NAME)
    const scopes = ['urls']
    const rawMessage = {
      changeId: 'change-2',
      internalPayload: { privateValue: 'must-not-leak' },
      revision: 2,
      scopes,
    }

    postMessage(externalPublisher, rawMessage)

    const delivered = listener.mock.calls[0]?.[0]
    expect(delivered).toStrictEqual({
      changeId: 'change-2',
      revision: 2,
      scopes: ['urls'],
    })
    expect(delivered).not.toBe(rawMessage)
    expect(delivered?.scopes).not.toBe(scopes)
  })

  it('postMessage failure を payload 非保持の typed publication error に変換する', () => {
    const failingFactory: BroadcastChannelFactory = () => ({
      addEventListener: vi.fn(),
      close: vi.fn(),
      postMessage: () => {
        throw new Error('secret-change-id must not be copied')
      },
      removeEventListener: vi.fn(),
    })
    const adapter = createAdapter(failingFactory)
    let thrown: unknown

    try {
      adapter.publish({
        changeId: 'secret-change-id',
        revision: 1,
        scopes: ['urls'],
      })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(PersistenceChangePublicationError)
    expect(thrown).toMatchObject({
      code: 'PERSISTENCE_CHANGE_PUBLICATION_FAILED',
      message: 'Persistence change publication failed.',
      name: 'PersistenceChangePublicationError',
    })
    expect(JSON.stringify(thrown)).not.toContain('secret-change-id')
    expect(thrown).not.toHaveProperty('event')
    expect(thrown).not.toHaveProperty('payload')
  })

  it('BroadcastChannel API がない場合は typed unavailable error を投げる', () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    const adapter = createBroadcastChannelPersistenceChangeAdapter()

    expect(() => adapter.publish(EVENT)).toThrow(
      PersistenceChangeTransportUnavailableError,
    )
    expect(() => adapter.subscribe(vi.fn())).toThrow(
      PersistenceChangeTransportUnavailableError,
    )
  })
})
