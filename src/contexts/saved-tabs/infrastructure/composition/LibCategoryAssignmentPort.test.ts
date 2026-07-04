import { describe, expect, it, vi } from 'vitest'

import { createLibCategoryAssignmentPort } from './LibCategoryAssignmentPort'

describe('createLibCategoryAssignmentPort', () => {
  it('presentation category DTO を entity 化して repository に保存する', async () => {
    const saveAll = vi.fn()
    const port = createLibCategoryAssignmentPort({
      parentCategoryRepository: {
        findAll: vi.fn(),
        findById: vi.fn(),
        removeByIds: vi.fn(),
        saveAll,
      },
      tabGroupRepository: {
        findAll: vi.fn(),
        findById: vi.fn(),
        findRawDomainById: vi.fn(),
        findRawTabGroupById: vi.fn(),
        removeByIds: vi.fn(),
        saveAll: vi.fn(),
      },
    })

    await port.saveParentCategories([
      {
        domainNames: ['example.com'],
        domains: ['group-1'],
        id: 'category-1',
        name: 'Docs',
      },
    ])

    expect(saveAll).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'category-1', name: 'Docs' }),
    ])
  })

  it('presentation tab group DTO は urlIds 既定値込みで entity 化する', async () => {
    const saveAll = vi.fn()
    const port = createLibCategoryAssignmentPort({
      parentCategoryRepository: {
        findAll: vi.fn(),
        findById: vi.fn(),
        removeByIds: vi.fn(),
        saveAll: vi.fn(),
      },
      tabGroupRepository: {
        findAll: vi.fn(),
        findById: vi.fn(),
        findRawDomainById: vi.fn(),
        findRawTabGroupById: vi.fn(),
        removeByIds: vi.fn(),
        saveAll,
      },
    })

    await port.saveTabGroups([
      { domain: 'example.com', id: 'group-1', urlIds: undefined },
      { domain: 'docs.example.com', id: 'group-2', urlIds: ['url-1'] },
    ])

    expect(saveAll).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'group-1', urlIds: [] }),
      expect.objectContaining({ id: 'group-2', urlIds: ['url-1'] }),
    ])
  })

  // 回帰: 保存フロー (getTabDomain) が `https://example.com` のように
  // スキーム付き domain を書き込む既存データが saveTabGroups に流れた場合、
  // createTabGroup → createDomainName が「ドメイン名にスキームを含めることは
  // できません」で例外を投げないよう、入口で hostname へ正規化する。
  it('スキーム付き domain は hostname へ正規化して entity 化する', async () => {
    const saveAll = vi.fn()
    const port = createLibCategoryAssignmentPort({
      parentCategoryRepository: {
        findAll: vi.fn(),
        findById: vi.fn(),
        removeByIds: vi.fn(),
        saveAll: vi.fn(),
      },
      tabGroupRepository: {
        findAll: vi.fn(),
        findById: vi.fn(),
        findRawDomainById: vi.fn(),
        findRawTabGroupById: vi.fn(),
        removeByIds: vi.fn(),
        saveAll,
      },
    })

    await port.saveTabGroups([
      { domain: 'https://example.com', id: 'group-1', urlIds: [] },
      { domain: 'http://docs.example.com/path', id: 'group-2', urlIds: [] },
    ])

    expect(saveAll).toHaveBeenCalledTimes(1)
    const saved = saveAll.mock.calls[0]?.[0] as { domain: string }[]
    expect(saved[0].domain).toBe('example.com')
    expect(saved[1].domain).toBe('docs.example.com')
  })
})
