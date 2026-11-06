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
    getOpenUrlsSnapshot: () => [...urls],
    subscribeOpenUrls: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
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
