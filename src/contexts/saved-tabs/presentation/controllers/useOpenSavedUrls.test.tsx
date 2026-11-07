// @vitest-environment jsdom
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createSavedTabsPresentationPortsStub,
  createSavedTabsUseCasesStub,
} from '@/contexts/saved-tabs/application/testing/SavedTabsPresentationStubs'
import { SavedTabsUseCasesProvider } from '@/contexts/saved-tabs/presentation/controllers/SavedTabsUseCasesContext'
import { useOpenSavedUrls } from '@/contexts/saved-tabs/presentation/controllers/useOpenSavedUrls'
import { useOpenTabsRows } from '@/contexts/saved-tabs/presentation/controllers/useOpenTabsRows'

const createOpenUrlsFake = () => {
  const urls = new Set<string>()
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const listener of listeners) {
      listener()
    }
  }
  const port = {
    getSnapshot: () => false,
    subscribe: () => () => {},
    getOpenUrlsSnapshot: vi.fn(() => [...urls]),
    subscribeOpenUrls: vi.fn((listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }),
  }
  const setOpen = (url: string, isOpen: boolean) => {
    if (isOpen) {
      urls.add(url)
    } else {
      urls.delete(url)
    }
    notify()
  }
  return { port, setOpen, listeners, getUrls: () => [...urls] }
}

const withProvider = (fakePort: unknown, ui: React.ReactNode) => (
  <SavedTabsUseCasesProvider
    value={{
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      deps: {
        ...createSavedTabsPresentationPortsStub(),
        openSavedTabsPort: fakePort as never,
      },
      useCases: createSavedTabsUseCasesStub(),
    }}
  >
    {ui}
  </SavedTabsUseCasesProvider>
)

describe('useOpenSavedUrls', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('re-renders only on notified changes and keeps content up to date', () => {
    const fake = createOpenUrlsFake()
    const { result } = renderHook(() => useOpenSavedUrls(), {
      wrapper: ({ children }) => withProvider(fake.port, children),
    })
    expect(result.current).toEqual([])

    act(() => fake.setOpen('https://example.com/a', true))
    expect(result.current).toEqual(['https://example.com/a'])
    act(() => fake.setOpen('https://example.com/b', true))
    expect(result.current).toEqual([
      'https://example.com/a',
      'https://example.com/b',
    ])
    act(() => fake.setOpen('https://example.com/a', false))
    expect(result.current).toEqual(['https://example.com/b'])

    expect(fake.listeners.size).toBe(1)
  })

  it('returns the same array identity while the open set is unchanged', () => {
    const fake = createOpenUrlsFake()
    const { result, rerender } = renderHook(() => useOpenSavedUrls(), {
      wrapper: ({ children }) => withProvider(fake.port, children),
    })
    const first = result.current
    act(() => fake.setOpen('https://example.com/a', true))
    const second = result.current
    expect(second).not.toBe(first)
    rerender()
    expect(result.current).toBe(second)
  })

  it('does not read or subscribe while disabled and resumes with current urls', () => {
    const fake = createOpenUrlsFake()
    fake.setOpen('https://example.com/a', true)
    const { result, rerender } = renderHook(
      ({ enabled }) => useOpenSavedUrls(enabled),
      {
        initialProps: { enabled: false },
        wrapper: ({ children }) => withProvider(fake.port, children),
      },
    )
    expect(result.current).toEqual([])
    expect(fake.port.getOpenUrlsSnapshot).not.toHaveBeenCalled()
    expect(fake.port.subscribeOpenUrls).not.toHaveBeenCalled()

    rerender({ enabled: true })
    expect(result.current).toEqual(['https://example.com/a'])
    expect(fake.listeners.size).toBe(1)

    rerender({ enabled: false })
    expect(result.current).toEqual([])
    expect(fake.listeners.size).toBe(0)
    fake.port.getOpenUrlsSnapshot.mockClear()
    fake.port.subscribeOpenUrls.mockClear()
    act(() => fake.setOpen('https://example.com/a', false))
    act(() => fake.setOpen('https://example.com/b', true))
    rerender({ enabled: false })
    expect(fake.port.getOpenUrlsSnapshot).not.toHaveBeenCalled()
    expect(fake.port.subscribeOpenUrls).not.toHaveBeenCalled()

    rerender({ enabled: true })
    expect(result.current).toEqual(['https://example.com/b'])
    expect(fake.listeners.size).toBe(1)
  })

  it('suspends domain rows and whole-url observation while disabled or searching', () => {
    const fake = createOpenUrlsFake()
    fake.setOpen('https://example.com/a', true)
    const tabGroups = [
      {
        id: 'group-1',
        domain: 'example.com',
        urls: [{ id: 'u1', title: 'A', url: 'https://example.com/a' }],
      },
    ]
    const { result, rerender } = renderHook(
      ({ enabled, searchQuery }) =>
        useOpenTabsRows({ enabled, searchQuery, tabGroups }),
      {
        initialProps: { enabled: false, searchQuery: '' },
        wrapper: ({ children }) => withProvider(fake.port, children),
      },
    )
    expect(result.current).toEqual([])
    expect(fake.port.getOpenUrlsSnapshot).not.toHaveBeenCalled()
    expect(fake.port.subscribeOpenUrls).not.toHaveBeenCalled()
    rerender({ enabled: true, searchQuery: 'one' })
    expect(result.current).toEqual([])
    expect(fake.port.getOpenUrlsSnapshot).not.toHaveBeenCalled()
    expect(fake.port.subscribeOpenUrls).not.toHaveBeenCalled()

    rerender({ enabled: true, searchQuery: '  ' })
    expect(result.current.map((row) => row.url)).toEqual([
      'https://example.com/a',
    ])
    expect(fake.listeners.size).toBe(1)
    rerender({ enabled: true, searchQuery: 'two' })
    expect(result.current).toEqual([])
    expect(fake.listeners.size).toBe(0)
    fake.port.getOpenUrlsSnapshot.mockClear()
    rerender({ enabled: false, searchQuery: '' })
    expect(result.current).toEqual([])
    expect(fake.port.getOpenUrlsSnapshot).not.toHaveBeenCalled()
  })

  it('falls back to a stable empty snapshot without a runtime port', () => {
    const { result, rerender } = renderHook(() => useOpenSavedUrls())
    expect(result.current).toEqual([])
    rerender()
    expect(result.current).toBe(result.current)
  })
})

describe('open tabs snapshot consumer', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders every open url as plain text', () => {
    const fake = createOpenUrlsFake()
    fake.setOpen('https://example.com/a', true)
    fake.setOpen('https://example.com/b', true)
    render(
      withProvider(
        fake.port,
        <ListOfOpenUrls titles={{ 'https://example.com/a': 'A' }} />,
      ),
    )
    expect(screen.getByText('A')).toBeVisible()
    expect(screen.getByText('https://example.com/b')).toBeVisible()
  })
})

const ListOfOpenUrls = ({ titles }: { titles: Record<string, string> }) => {
  const urls = useOpenSavedUrls()
  return (
    <ul>
      {urls.map((url) => (
        <li key={url}>{titles[url] ?? url}</li>
      ))}
    </ul>
  )
}
