import { beforeEach, describe, expect, it, vi } from 'vitest'

import { linkCaptureMessageSchema } from '@/types/link-capture'
import type { LinkCaptureMessage } from '@/types/link-capture'

import {
  createLinkCaptureHandler,
  handleLinkCaptureMessage,
  linkCaptureSenderOrigin,
} from './link-capture'

const production = vi.hoisted(() => ({
  contains: vi.fn(async () => true),
  settings: vi.fn(async () => ({ enabled: true })),
  userSettings: vi.fn(async () => ({ excludePatterns: [] })),
  records: vi.fn(async () => [{ url: 'https://example.com/already-saved' }]),
  save: vi.fn(
    async (): Promise<
      { savedCount: number; existingCount: number } | undefined
    > => ({ savedCount: 1, existingCount: 0 }),
  ),
}))
vi.mock('wxt/browser', () => ({
  browser: {
    runtime: { id: 'extension' },
    permissions: { contains: production.contains },
  },
}))
vi.mock('@/lib/storage/link-capture-settings', () => ({
  readLinkCaptureSettings: production.settings,
}))
vi.mock('@/lib/storage/settings', () => ({
  requireUserSettings: production.userSettings,
}))
vi.mock('@/app/composition/backgroundSavedTabsDataPlane', () => ({
  getBackgroundSavedTabsDataPlane: () => ({
    readInsightRecords: production.records,
    saveTabs: production.save,
  }),
}))
beforeEach(() => {
  vi.clearAllMocks()
  production.save.mockResolvedValue({ savedCount: 1, existingCount: 0 })
})

const sender = {
  frameId: 0,
  id: 'extension',
  origin: 'https://source.example',
  tab: { id: 7, incognito: false, url: 'https://source.example/list' },
  url: 'https://source.example/list',
}
const message = (
  overrides: Partial<LinkCaptureMessage> = {},
): LinkCaptureMessage => ({
  action: 'saveLinkCapture',
  links: [{ title: 'Docs', url: 'https://example.com/docs' }],
  requestId: '00000000-0000-4000-8000-000000000001',
  ...overrides,
})
const setup = () => {
  const deps = {
    extensionId: () => 'extension',
    hasPermission: vi.fn(async () => true),
    readEnabled: vi.fn(async () => true),
    readExcludePatterns: vi.fn(async () => ['excluded']),
    readSavedUrls: vi.fn(async (): Promise<readonly string[]> => []),
    saveLinks: vi.fn(
      async (links: readonly { url: string; title: string }[]) => ({
        existingCount: 0,
        savedCount: links.length,
      }),
    ),
  }
  return { deps, handle: createLinkCaptureHandler(deps) }
}

describe('link capture message boundary', () => {
  it.each([
    {
      links: Array.from({ length: 1001 }, () => ({
        title: '',
        url: 'https://example.com/',
      })),
    },
    { links: [{ title: 'x'.repeat(513), url: 'https://example.com/' }] },
    { links: [{ title: '', url: 'x'.repeat(8193) }] },
    { links: [{ title: '', url: '' }] },
    { links: [{ title: 1, url: 'https://example.com/' }] },
    { requestId: 'not-a-token' },
    { confirmed: 'true' },
    { extra: 'page text' },
    {
      links: Array.from({ length: 1000 }, () => ({
        title: 'x'.repeat(512),
        url: `https://example.com/${'x'.repeat(512)}`,
      })),
    },
  ])('rejects malformed or excessive requests: %j', (overrides) => {
    expect(
      linkCaptureMessageSchema.safeParse({ ...message(), ...overrides })
        .success,
    ).toBe(false)
  })

  it('accepts an empty selection as an explicit no-op', async () => {
    expect(
      linkCaptureMessageSchema.safeParse(message({ links: [] })).success,
    ).toBe(true)
    const { deps, handle } = setup()
    await expect(handle(message({ links: [] }), sender)).resolves.toMatchObject(
      { status: 'ok', saved: 0 },
    )
    expect(deps.saveLinks).not.toHaveBeenCalled()
  })

  it.each([
    null,
    {},
    { ...sender, id: 'foreign-extension' },
    { ...sender, frameId: 1 },
    { ...sender, tab: undefined },
    { ...sender, tab: { id: '7' } },
    { ...sender, tab: { id: -1 } },
    { ...sender, tab: { id: 7, incognito: true } },
    { ...sender, url: 'chrome://settings' },
    { ...sender, url: 'not-a-url' },
    {
      ...sender,
      url: [
        'https://',
        'fixture-user',
        ':',
        'fixture-pass',
        '@source.example/',
      ].join(''),
    },
    { ...sender, origin: 'https://other.example' },
    { ...sender, tab: { id: 7, url: 'https://other.example/' } },
    { ...sender, tab: { id: 7, url: 'bad' } },
  ])(
    'rejects untrusted, private, restricted, or framed senders: %j',
    async (invalidSender) => {
      const { deps, handle } = setup()
      await expect(handle(message(), invalidSender)).resolves.toMatchObject({
        status: 'forbidden',
      })
      expect(deps.readEnabled).not.toHaveBeenCalled()
      expect(deps.saveLinks).not.toHaveBeenCalled()
    },
  )

  it('requires the current extension id but accepts Firefox senders without optional origin/tab URL', () => {
    expect(linkCaptureSenderOrigin(sender, '')).toBeNull()
    expect(
      linkCaptureSenderOrigin(
        { ...sender, origin: undefined, tab: { id: 7 } },
        'extension',
      ),
    ).toBe('https://source.example')
  })
})

describe('save-only link capture', () => {
  it('uses a portless host permission pattern so Firefox can save links on nondefault-port pages', async () => {
    const portSender = {
      ...sender,
      origin: 'http://localhost:8080',
      url: 'http://localhost:8080/list',
      tab: { ...sender.tab, url: 'http://localhost:8080/list' },
    }
    await expect(
      handleLinkCaptureMessage(message(), portSender),
    ).resolves.toMatchObject({ status: 'ok', saved: 1 })
    expect(production.contains).toHaveBeenCalledExactlyOnceWith({
      permissions: ['scripting'],
      origins: ['http://localhost/*'],
    })
    expect(production.save).toHaveBeenCalledWith(message().links, {
      preserveExisting: true,
    })
  })

  it('does not report success when an incompatible data plane omits atomic counts', async () => {
    production.save.mockResolvedValue(undefined)
    await expect(
      handleLinkCaptureMessage(
        message({ requestId: '00000000-0000-4000-8000-000000000999' }),
        sender,
      ),
    ).resolves.toMatchObject({ status: 'error', saved: 0, failed: 1 })
  })

  it('deduplicates exact URLs, filters policy and unsafe schemes, and returns actual atomic counts', async () => {
    const { deps, handle } = setup()
    deps.readSavedUrls.mockResolvedValue(['https://example.com/docs'])
    deps.saveLinks.mockResolvedValue({ savedCount: 2, existingCount: 1 })
    const response = await handle(
      message({
        links: [
          { title: 'Existing', url: 'https://example.com/docs' },
          { title: 'Duplicate', url: 'https://example.com/docs' },
          { title: 'Exact slash', url: 'https://example.com/docs/' },
          {
            title: 'Exact query',
            url: 'https://example.com/docs?x=1#fragment',
          },
          { title: 'Excluded', url: 'https://example.com/excluded' },
          { title: 'Script', url: ['javascript', 'alert(1)'].join(':') },
          { title: 'Mail', url: 'mailto:example@example.com' },
          { title: 'Bad', url: 'bad' },
          {
            title: 'Credentials',
            url: [
              'https://',
              'fixture-user',
              ':',
              'fixture-pass',
              '@example.com/',
            ].join(''),
          },
        ],
      }),
      sender,
    )
    expect(response).toEqual({
      status: 'ok',
      saved: 2,
      newCount: 2,
      existing: 1,
      duplicates: 1,
      excluded: 5,
      failed: 0,
    })
    expect(deps.saveLinks).toHaveBeenCalledExactlyOnceWith([
      { title: 'Existing', url: 'https://example.com/docs' },
      { title: 'Exact slash', url: 'https://example.com/docs/' },
      { title: 'Exact query', url: 'https://example.com/docs?x=1#fragment' },
    ])
    expect(deps.hasPermission).toHaveBeenCalledWith('https://source.example')
  })

  it.each([
    'disabled',
    'revoked',
    'settings-error',
    'policy-error',
    'permission-error',
    'snapshot-error',
  ])('fails closed when %s without touching data', async (failure) => {
    const { deps, handle } = setup()
    if (failure === 'disabled') {
      deps.readEnabled.mockResolvedValue(false)
    }
    if (failure === 'revoked') {
      deps.hasPermission.mockResolvedValue(false)
    }
    if (failure === 'settings-error') {
      deps.readEnabled.mockRejectedValue(new Error('settings'))
    }
    if (failure === 'policy-error') {
      deps.readExcludePatterns.mockRejectedValue(new Error('policy'))
    }
    if (failure === 'permission-error') {
      deps.hasPermission.mockRejectedValue(new Error('permissions'))
    }
    if (failure === 'snapshot-error') {
      deps.readSavedUrls.mockRejectedValue(new Error('snapshot'))
    }
    await expect(handle(message(), sender)).resolves.toMatchObject({
      status:
        failure === 'disabled' || failure === 'revoked' ? 'forbidden' : 'error',
      saved: 0,
    })
    expect(deps.saveLinks).not.toHaveBeenCalled()
  })

  it('previews current counts without saving and requires explicit confirmation above 50 distinct allowed links', async () => {
    const { deps, handle } = setup()
    const links = Array.from({ length: 51 }, (_, index) => ({
      title: `Link ${index}`,
      url: `https://example.com/${index}`,
    }))
    deps.readSavedUrls.mockResolvedValue(['https://example.com/0'])
    await expect(
      handle(message({ action: 'previewLinkCapture', links }), sender),
    ).resolves.toMatchObject({
      status: 'confirmation_required',
      newCount: 50,
      existing: 1,
      saved: 0,
    })
    await expect(handle(message({ links }), sender)).resolves.toMatchObject({
      status: 'confirmation_required',
      saved: 0,
    })
    expect(deps.saveLinks).not.toHaveBeenCalled()
    await expect(
      handle(message({ confirmed: true, links }), sender),
    ).resolves.toMatchObject({ status: 'ok', saved: 51 })
    expect(deps.saveLinks).toHaveBeenCalledOnce()
  })

  it('uses immediate saving at 50 and normal preview has no side effects', async () => {
    const { deps, handle } = setup()
    await expect(
      handle(message({ action: 'previewLinkCapture' }), sender),
    ).resolves.toMatchObject({ status: 'ok', newCount: 1, saved: 0 })
    const links = Array.from({ length: 50 }, (_, index) => ({
      title: '',
      url: `https://example.com/${index}`,
    }))
    await expect(handle(message({ links }), sender)).resolves.toMatchObject({
      status: 'ok',
      saved: 50,
    })
    expect(deps.saveLinks).toHaveBeenCalledOnce()
  })

  it('serializes requests, returns a cached committed response for retries, and rejects token reuse for changed links', async () => {
    const { deps, handle } = setup()
    const responses = await Promise.all([
      handle(message(), sender),
      handle(message(), sender),
    ])
    expect(responses[0]).toEqual(responses[1])
    expect(deps.saveLinks).toHaveBeenCalledOnce()
    await expect(
      handle(
        message({ links: [{ url: 'https://example.com/changed', title: '' }] }),
        sender,
      ),
    ).resolves.toMatchObject({ status: 'invalid_message' })
    expect(deps.saveLinks).toHaveBeenCalledOnce()
    deps.readEnabled.mockResolvedValue(false)
    await expect(handle(message(), sender)).resolves.toMatchObject({
      status: 'forbidden',
    })
  })

  it('isolates retry receipts between tabs and document lifetimes on the same origin', async () => {
    const { deps, handle } = setup()
    await handle(message(), sender)
    await handle(message(), { ...sender, tab: { ...sender.tab, id: 8 } })
    await handle(message(), { ...sender, documentId: 'next-document' })
    expect(deps.saveLinks).toHaveBeenCalledTimes(3)
  })

  it('reports persistence failure and permits the same retained batch to be retried', async () => {
    const { deps, handle } = setup()
    deps.saveLinks.mockRejectedValueOnce(new Error('IndexedDB commit failed'))
    await expect(handle(message(), sender)).resolves.toMatchObject({
      status: 'error',
      failed: 1,
      saved: 0,
    })
    await expect(handle(message(), sender)).resolves.toMatchObject({
      status: 'ok',
      saved: 1,
      failed: 0,
    })
    expect(deps.saveLinks).toHaveBeenCalledTimes(2)
  })

  it('retries an ambiguous commit after worker restart without changing the already saved record', async () => {
    const { deps, handle } = setup()
    const records = new Map<
      string,
      { readonly title: string; readonly url: string; readonly savedAt: number }
    >()
    deps.readSavedUrls.mockImplementation(async () => [...records.keys()])
    deps.saveLinks.mockImplementation(async (links) => {
      const fresh = links.filter(({ url }) => !records.has(url))
      for (const link of fresh) {
        records.set(link.url, { ...link, savedAt: 123 })
      }
      return {
        existingCount: links.length - fresh.length,
        savedCount: fresh.length,
      }
    })
    // The transaction committed but its completion signal was lost during worker shutdown.
    deps.saveLinks.mockImplementationOnce(async (links) => {
      for (const link of links) {
        records.set(link.url, { ...link, savedAt: 123 })
      }
      throw new Error('Worker stopped after commit')
    })
    await expect(handle(message(), sender)).resolves.toMatchObject({
      status: 'error',
      saved: 0,
    })
    const committed = structuredClone([...records.values()])
    const restarted = createLinkCaptureHandler(deps)
    await expect(restarted(message(), sender)).resolves.toMatchObject({
      status: 'ok',
      saved: 0,
      existing: 1,
    })
    expect([...records.values()]).toEqual(committed)
  })

  it('accepts actual existing counts when another context saves a URL after preview', async () => {
    const { deps, handle } = setup()
    await expect(
      handle(message({ action: 'previewLinkCapture' }), sender),
    ).resolves.toMatchObject({ newCount: 1 })
    deps.saveLinks.mockResolvedValue({ existingCount: 1, savedCount: 0 })
    await expect(handle(message(), sender)).resolves.toMatchObject({
      status: 'ok',
      saved: 0,
      existing: 1,
    })
  })

  it('bounds its retry-response cache and remains safe after an evicted token is replayed', async () => {
    const { deps, handle } = setup()
    await Promise.all(
      Array.from({ length: 65 }, async (_, index) =>
        handle(
          message({
            requestId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
          }),
          sender,
        ),
      ),
    )
    deps.saveLinks.mockResolvedValue({ existingCount: 1, savedCount: 0 })
    await expect(
      handle(
        message({ requestId: '00000000-0000-4000-8000-000000000000' }),
        sender,
      ),
    ).resolves.toMatchObject({ status: 'ok', saved: 0, existing: 1 })
    expect(deps.saveLinks).toHaveBeenCalledTimes(66)
  })
})
