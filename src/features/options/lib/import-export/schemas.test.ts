import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildFullUserSettings } from '@/features/options/lib/importExportTestFixtures'

import { backupDataSchema, parseBackupData } from './schemas'

let consoleErrorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleErrorSpy.mockRestore()
})

const baseBackup = (): Record<string, unknown> => ({
  version: '9.9.9',
  timestamp: '2026-07-05T00:00:00.000Z',
  userSettings: buildFullUserSettings(),
  parentCategories: [],
  savedTabs: [],
})

describe('parseBackupData', () => {
  it('accepts https URLs', () => {
    const data = {
      ...baseBackup(),
      urls: [
        {
          id: 'url-1',
          url: 'https://example.com/path?q=1#hash',
          title: 'Example',
          savedAt: 100,
        },
      ],
    }

    const result = parseBackupData(JSON.stringify(data))
    expect(result).not.toBeNull()
  })

  it('accepts http URLs', () => {
    const data = {
      ...baseBackup(),
      urls: [
        {
          id: 'url-1',
          url: 'http://localhost:11434/api/tags',
          title: 'Ollama',
          savedAt: 100,
        },
      ],
    }

    const result = parseBackupData(JSON.stringify(data))
    expect(result).not.toBeNull()
  })

  it('accepts IP address URLs', () => {
    const data = {
      ...baseBackup(),
      urls: [
        {
          id: 'url-1',
          url: 'http://127.0.0.1:11434',
          title: 'Localhost',
          savedAt: 100,
        },
      ],
    }

    const result = parseBackupData(JSON.stringify(data))
    expect(result).not.toBeNull()
  })

  it('accepts chrome:// scheme URLs', () => {
    const data = {
      ...baseBackup(),
      urls: [
        {
          id: 'url-1',
          url: 'chrome://settings',
          title: 'Settings',
          savedAt: 100,
        },
      ],
    }

    const result = parseBackupData(JSON.stringify(data))
    expect(result).not.toBeNull()
  })

  it('accepts about: scheme URLs', () => {
    const data = {
      ...baseBackup(),
      urls: [
        {
          id: 'url-1',
          url: 'about:blank',
          title: 'Blank',
          savedAt: 100,
        },
      ],
    }
    const result = parseBackupData(JSON.stringify(data))
    expect(result).not.toBeNull()
  })

  it('accepts file:// scheme URLs', () => {
    const data = {
      ...baseBackup(),
      urls: [
        {
          id: 'url-1',
          url: 'file:///tmp/test.txt',
          title: 'Local File',
          savedAt: 100,
        },
      ],
    }

    const result = parseBackupData(JSON.stringify(data))
    expect(result).not.toBeNull()
  })

  it('accepts chrome-extension:// scheme URLs', () => {
    const data = {
      ...baseBackup(),
      urls: [
        {
          id: 'url-1',
          url: 'chrome-extension://abc123/page.html',
          title: 'Extension',
          savedAt: 100,
        },
      ],
    }

    const result = parseBackupData(JSON.stringify(data))
    expect(result).not.toBeNull()
  })

  it('accepts placeholder URLs with tabbin.invalid domain', () => {
    const data = {
      ...baseBackup(),
      urls: [
        {
          id: 'url-1',
          url: 'https://tabbin.invalid/#tabbin-export-custom-missing-project-1-url-1',
          title: 'Missing',
          savedAt: 100,
        },
      ],
    }

    const result = parseBackupData(JSON.stringify(data))
    expect(result).not.toBeNull()
  })

  it('accepts favIconUrl with chrome://favicon scheme', () => {
    const data = {
      ...baseBackup(),
      urls: [
        {
          id: 'url-1',
          url: 'https://example.com',
          title: 'Example',
          savedAt: 100,
          favIconUrl:
            'chrome://favicon/size/16@2x/https://example.com/icon.png',
        },
      ],
    }

    const result = parseBackupData(JSON.stringify(data))
    expect(result).not.toBeNull()
  })

  it('accepts empty string favIconUrl for backward compatibility', () => {
    const data = {
      ...baseBackup(),
      urls: [
        {
          id: 'url-1',
          url: 'https://example.com',
          title: 'Example',
          savedAt: 100,
          favIconUrl: '',
        },
      ],
    }

    const result = parseBackupData(JSON.stringify(data))
    expect(result).not.toBeNull()
  })

  it('accepts savedTabs with embedded legacy URLs', () => {
    const data = {
      ...baseBackup(),
      savedTabs: [
        {
          id: 'tab-1',
          domain: 'example.com',
          urls: [
            { url: 'https://example.com/page1', title: 'Page 1', savedAt: 100 },
            { url: 'https://example.com/page2', title: 'Page 2', savedAt: 200 },
          ],
        },
      ],
    }

    const result = parseBackupData(JSON.stringify(data))
    expect(result).not.toBeNull()
  })

  it('accepts customProject with URLs', () => {
    const data = {
      ...baseBackup(),
      customProjects: [
        {
          id: 'project-1',
          name: 'Project 1',
          urls: [
            {
              url: 'https://example.com/project',
              title: 'Project Page',
              notes: 'Important',
              savedAt: 100,
              category: 'Docs',
            },
          ],
        },
      ],
    }

    const result = parseBackupData(JSON.stringify(data))
    expect(result).not.toBeNull()
  })

  it('accepts ollamaError details with URLs', () => {
    const data = {
      ...baseBackup(),
      aiChatConversations: [
        {
          createdAt: 100,
          id: 'conv-1',
          messages: [
            {
              content: 'hello',
              id: 'msg-1',
              role: 'assistant',
              ollamaError: {
                allowedOrigins: 'chrome-extension://*',
                baseUrl: 'http://localhost:11434',
                downloadUrl: 'https://ollama.com/download',
                faqUrl: 'https://ollama.com/faq',
                kind: 'notInstalledOrNotRunning',
                tagsUrl: 'http://localhost:11434/api/tags',
              },
            },
          ],
          title: 'Chat',
          updatedAt: 200,
        },
      ],
    }

    const result = parseBackupData(JSON.stringify(data))
    expect(result).not.toBeNull()
  })

  it('rejects non-URL string for url field', () => {
    const data = {
      ...baseBackup(),
      urls: [
        {
          id: 'url-1',
          url: 'not-a-url',
          title: 'Invalid',
          savedAt: 100,
        },
      ],
    }

    const result = parseBackupData(JSON.stringify(data))
    expect(result).toBeNull()
  })

  it('rejects empty string for url field', () => {
    const data = {
      ...baseBackup(),
      urls: [
        {
          id: 'url-1',
          url: '',
          title: 'Empty',
          savedAt: 100,
        },
      ],
    }

    const result = parseBackupData(JSON.stringify(data))
    expect(result).toBeNull()
  })

  it('rejects path-only string for url field', () => {
    const data = {
      ...baseBackup(),
      urls: [
        {
          id: 'url-1',
          url: '/path/to/file',
          title: 'Path',
          savedAt: 100,
        },
      ],
    }

    const result = parseBackupData(JSON.stringify(data))
    expect(result).toBeNull()
  })

  it('rejects domain-only string for url field', () => {
    const data = {
      ...baseBackup(),
      urls: [
        {
          id: 'url-1',
          url: 'example.com',
          title: 'Domain',
          savedAt: 100,
        },
      ],
    }

    const result = parseBackupData(JSON.stringify(data))
    expect(result).toBeNull()
  })

  it('rejects invalid URL in savedTabs legacy urls', () => {
    const data = {
      ...baseBackup(),
      savedTabs: [
        {
          id: 'tab-1',
          domain: 'example.com',
          urls: [{ url: 'invalid-url', title: 'Invalid' }],
        },
      ],
    }

    const result = parseBackupData(JSON.stringify(data))
    expect(result).toBeNull()
  })

  it('rejects invalid URL in customProject urls', () => {
    const data = {
      ...baseBackup(),
      customProjects: [
        {
          id: 'project-1',
          name: 'Project 1',
          urls: [{ url: 'not-valid', title: 'Invalid' }],
        },
      ],
    }

    const result = parseBackupData(JSON.stringify(data))
    expect(result).toBeNull()
  })

  it('rejects invalid URL in ollamaError details', () => {
    const data = {
      ...baseBackup(),
      aiChatConversations: [
        {
          createdAt: 100,
          id: 'conv-1',
          messages: [
            {
              content: 'hello',
              id: 'msg-1',
              role: 'assistant',
              ollamaError: {
                allowedOrigins: 'chrome-extension://*',
                baseUrl: 'invalid-url',
                downloadUrl: 'https://ollama.com/download',
                faqUrl: 'https://ollama.com/faq',
                kind: 'notInstalledOrNotRunning',
                tagsUrl: 'http://localhost:11434/api/tags',
              },
            },
          ],
          title: 'Chat',
          updatedAt: 200,
        },
      ],
    }

    const result = parseBackupData(JSON.stringify(data))
    expect(result).toBeNull()
  })

  it('rejects invalid favIconUrl (non-empty, non-url)', () => {
    const data = {
      ...baseBackup(),
      urls: [
        {
          id: 'url-1',
          url: 'https://example.com',
          title: 'Example',
          savedAt: 100,
          favIconUrl: 'not-a-url',
        },
      ],
    }

    const result = parseBackupData(JSON.stringify(data))
    expect(result).toBeNull()
  })

  it('accepts optional favIconUrl when omitted', () => {
    const data = {
      ...baseBackup(),
      urls: [
        {
          id: 'url-1',
          url: 'https://example.com',
          title: 'Example',
          savedAt: 100,
        },
      ],
    }

    const result = parseBackupData(JSON.stringify(data))
    expect(result).not.toBeNull()
  })

  it('accepts legacy format savedTabs with urlIds only', () => {
    const data = {
      ...baseBackup(),
      urls: [
        {
          id: 'url-1',
          url: 'https://example.com/page',
          title: 'Page',
          savedAt: 100,
        },
      ],
      savedTabs: [
        {
          id: 'tab-1',
          domain: 'example.com',
          urlIds: ['url-1'],
        },
      ],
    }

    const result = parseBackupData(JSON.stringify(data))
    expect(result).not.toBeNull()
  })

  it('preserves valid data through roundtrip', () => {
    const data = {
      ...baseBackup(),
      urls: [
        {
          id: 'url-1',
          url: 'https://example.com/page',
          title: 'Page',
          savedAt: 100,
        },
        {
          id: 'url-2',
          url: 'chrome://settings',
          title: 'Settings',
          savedAt: 200,
          favIconUrl: 'chrome://favicon/icon.png',
        },
      ],
      savedTabs: [
        {
          id: 'tab-1',
          domain: 'example.com',
          urls: [
            { url: 'https://example.com/a', title: 'A', savedAt: 10 },
            { url: 'https://example.com/b', title: 'B', savedAt: 20 },
          ],
        },
      ],
    }

    const result = parseBackupData(JSON.stringify(data))
    expect(result).not.toBeNull()
    expect(result?.urls).toHaveLength(2)
    expect(result?.urls?.[0]?.url).toBe('https://example.com/page')
    expect(result?.urls?.[0]?.title).toBe('Page')
    expect(result?.savedTabs?.[0]?.urls).toHaveLength(2)
  })
})

describe('backupDataSchema - safeParse', () => {
  it('rejects backup with non-URL in savedTabs embedded urls using direct schema', () => {
    const data = {
      ...baseBackup(),
      savedTabs: [
        {
          id: 'tab-1',
          domain: 'example.com',
          urls: [{ url: 'bad-url', title: 'Bad' }],
        },
      ],
    }

    const result = backupDataSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  it('rejects backup with non-URL in customProject urls using direct schema', () => {
    const data = {
      ...baseBackup(),
      customProjects: [
        {
          id: 'project-1',
          name: 'Project 1',
          urls: [{ url: '', title: 'Empty' }],
        },
      ],
    }

    const result = backupDataSchema.safeParse(data)
    expect(result.success).toBe(false)
  })
})
