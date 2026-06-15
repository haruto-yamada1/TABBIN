import { describe, expect, it } from 'vitest'

import {
  createMockTabGroupRepository,
  toMockTabGroup,
} from './createMockTabGroupRepository'

describe('createMockTabGroupRepository', () => {
  it('初期 savedTabs を findAll で返す', async () => {
    const repo = createMockTabGroupRepository({
      savedTabs: [toMockTabGroup({ domain: 'example.com', id: 'g1' })],
    })
    const all = await repo.findAll()
    expect(all).toHaveLength(1)
    expect(all[0]?.id).toBe('g1')
  })

  it('findById は一致するエントリを返し、無ければ null', async () => {
    const repo = createMockTabGroupRepository({
      savedTabs: [toMockTabGroup({ domain: 'example.com', id: 'g1' })],
    })
    const found = await repo.findById('g1' as never)
    const missing = await repo.findById('g2' as never)
    expect(found?.id).toBe('g1')
    expect(missing).toBeNull()
  })

  it('saveAll は state を差し替える', async () => {
    const repo = createMockTabGroupRepository({
      savedTabs: [toMockTabGroup({ domain: 'example.com', id: 'g1' })],
    })
    const next = [toMockTabGroup({ domain: 'other.com', id: 'g2' })]
    await repo.saveAll(next)
    const all = await repo.findAll()
    expect(all.map((t) => t.id)).toStrictEqual(['g2'])
  })

  it('removeByIds は指定 id を除外する', async () => {
    const repo = createMockTabGroupRepository({
      savedTabs: [
        toMockTabGroup({ domain: 'a.com', id: 'g1' }),
        toMockTabGroup({ domain: 'b.com', id: 'g2' }),
      ],
    })
    await repo.removeByIds(['g1'] as never)
    const all = await repo.findAll()
    expect(all.map((t) => t.id)).toStrictEqual(['g2'])
  })
})
