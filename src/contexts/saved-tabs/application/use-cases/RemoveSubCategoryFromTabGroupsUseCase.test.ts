import { describe, expect, it, vi } from 'vitest'

import type { SavedTabsTabGroupDto as TabGroup } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type { RemoveSubCategoryFromTabGroupPort } from '@/contexts/saved-tabs/application/ports/RemoveSubCategoryFromTabGroupPort'
import { createTabGroup } from '@/contexts/saved-tabs/testing/createCurrentCollectionFixtures'

import { createRemoveSubCategoryFromTabGroupsUseCase } from './RemoveSubCategoryFromTabGroupsUseCase'
import type { RemoveSubCategoryFromTabGroupsUseCaseDeps } from './RemoveSubCategoryFromTabGroupsUseCase'

const createPortMock = (
  result: readonly TabGroup[],
): {
  port: RemoveSubCategoryFromTabGroupPort
  spy: ReturnType<typeof vi.fn>
} => {
  const spy = vi.fn(
    async (
      _groupId: string,
      _categoryName: string,
    ): Promise<readonly TabGroup[]> => result,
  )
  return {
    port: {
      removeSubCategoryFromTabGroup: spy,
    },
    spy,
  }
}

const createDeps = (
  port: RemoveSubCategoryFromTabGroupPort,
): RemoveSubCategoryFromTabGroupsUseCaseDeps => ({
  removeSubCategoryFromTabGroupPort: port,
})

describe('createRemoveSubCategoryFromTabGroupsUseCase', () => {
  it('port.removeSubCategoryFromTabGroup に groupId と categoryName を渡して呼び出す', async () => {
    const target: TabGroup = createTabGroup({
      domain: 'example.com',
      id: 'group-1',
      subCategories: ['news'],
      memberships: [{ urlId: 'url-1' }, { category: 'news', urlId: 'url-2' }],
    })
    const { port, spy } = createPortMock([target])
    const useCase = createRemoveSubCategoryFromTabGroupsUseCase(
      createDeps(port),
    )

    const result = await useCase({
      categoryName: 'docs',
      groupId: 'group-1',
    })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('group-1', 'docs')
    expect(result.tabGroups).toStrictEqual([target])
  })

  it('port が更新不要 (空配列相当) を返した場合、use-case も同じ tabGroups を返す', async () => {
    const { port, spy } = createPortMock([])
    const useCase = createRemoveSubCategoryFromTabGroupsUseCase(
      createDeps(port),
    )

    const result = await useCase({
      categoryName: 'docs',
      groupId: 'group-missing',
    })

    expect(spy).toHaveBeenCalledWith('group-missing', 'docs')
    expect(result.tabGroups).toStrictEqual([])
  })

  it('port がエラーを投げると use-case からも伝播する', async () => {
    const port: RemoveSubCategoryFromTabGroupPort = {
      removeSubCategoryFromTabGroup: vi.fn(
        async (): Promise<readonly TabGroup[]> => {
          throw new Error('storage write failed')
        },
      ),
    }
    const useCase = createRemoveSubCategoryFromTabGroupsUseCase(
      createDeps(port),
    )

    await expect(
      useCase({ categoryName: 'docs', groupId: 'group-1' }),
    ).rejects.toThrow('storage write failed')
  })
})
