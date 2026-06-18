/**
 * @file createMockParentCategoryRepository.ts
 * @description テスト用に `ParentCategoryRepository` の最小モックを生成するヘルパー。
 *
 * 背景は `createMockTabGroupRepository.ts` を参照。branded ↔ plain 変換
 * のキャストをここに閉じ込めて共有する。
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-type-assertion, typescript/no-unsafe-assignment, typescript/no-unsafe-type-assertion -- branded ↔ plain 変換キャストの集約点 */

import { vi } from 'vitest'

import type { ParentCategory } from '../domain/entities/ParentCategory'
import type { ParentCategoryRepository } from '../domain/repositories/ParentCategoryRepository'
import type { ParentCategoryId } from '../domain/value-objects/ParentCategoryId'

export interface MockParentCategoryRepositoryState {
  readonly parentCategories: readonly ParentCategory[]
}

export const createMockParentCategoryRepository = (
  initial: MockParentCategoryRepositoryState,
): ParentCategoryRepository => {
  const state: { parentCategories: readonly ParentCategory[] } = {
    parentCategories: [...initial.parentCategories],
  }
  return {
    findAll: vi.fn(async () => state.parentCategories),

    findById: vi.fn(async (id) => {
      const idString = id as unknown as string
      return (
        state.parentCategories.find((category) => category.id === idString) ??
        null
      )
    }),

    saveAll: vi.fn(async (next) => {
      state.parentCategories = next
    }),

    removeByIds: vi.fn(async (ids) => {
      const idSet = new Set<string>(ids as unknown as readonly string[])
      state.parentCategories = state.parentCategories.filter(
        (category) => !idSet.has(category.id as unknown as string),
      )
    }),
  }
}

export const toMockParentCategory = (input: {
  id: string
  name: string
  domains?: readonly string[]
  domainNames?: readonly string[]
}): ParentCategory =>
  ({
    domainNames: input.domainNames ? [...input.domainNames] : [],
    domains: input.domains ? [...input.domains] : [],
    id: input.id as unknown as ParentCategoryId,
    name: input.name,
  }) as unknown as ParentCategory
