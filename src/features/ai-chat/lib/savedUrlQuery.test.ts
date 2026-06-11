import { describe, expect, it } from 'vitest' // eslint-disable-line

import type { AiSavedUrlRecord } from '@/features/ai-chat/types'

import {
  findSavedUrlsAddedInMonthPage,
  listSavedUrlPage,
  searchSavedUrlsPage,
} from './savedUrlQuery'

const createRecord = (
  id: string,
  savedAt: number,
  title = `Title ${id}`,
): AiSavedUrlRecord => ({
  id,
  url: `https://example.com/${id}`,
  title,
  domain: 'example.com',
  savedAt,
  savedInProjects: [],
  savedInTabGroups: [],
  subCategories: [],
  projectCategories: [],
  parentCategories: [],
})

describe('listSavedUrlPage', () => {
  it('page=1, pageSize=2, desc で先頭2件を返す', () => {
    const records = [
      createRecord('url-1', 100),
      createRecord('url-2', 300),
      createRecord('url-3', 200),
    ]

    expect(
      listSavedUrlPage(records, {
        page: 1,
        pageSize: 2,
        sortDirection: 'desc',
      }),
    ).toStrictEqual(
      expect.objectContaining({
        hasNextPage: true,
        hasPreviousPage: false,
        items: [createRecord('url-2', 300), createRecord('url-3', 200)],
        page: 1,
        pageSize: 2,
        sortDirection: 'desc',
        totalItems: 3,
        totalPages: 2,
      }),
    )
  })

  it('page=2, pageSize=2, asc で後続ページを返す', () => {
    const records = [
      createRecord('url-1', 100),
      createRecord('url-2', 300),
      createRecord('url-3', 200),
    ]

    expect(
      listSavedUrlPage(records, {
        page: 2,
        pageSize: 2,
        sortDirection: 'asc',
      }),
    ).toStrictEqual(
      expect.objectContaining({
        hasNextPage: false,
        hasPreviousPage: true,
        items: [createRecord('url-2', 300)],
        page: 2,
        totalItems: 3,
        totalPages: 2,
      }),
    )
  })

  it('pageSize 指定だけで page=1 の先頭結果を返す', () => {
    const records = [
      createRecord('url-1', 100),
      createRecord('url-2', 300),
      createRecord('url-3', 200),
    ]

    expect(
      listSavedUrlPage(records, {
        pageSize: 2,
      }),
    ).toStrictEqual(
      expect.objectContaining({
        items: [createRecord('url-2', 300), createRecord('url-3', 200)],
        page: 1,
        pageSize: 2,
      }),
    )
  })

  it('options 未指定かつ空配列でも default page 情報を返す', () => {
    expect(listSavedUrlPage([])).toStrictEqual({
      hasNextPage: false,
      hasPreviousPage: false,
      items: [],
      page: 1,
      pageSize: 50,
      sortDirection: 'desc',
      totalItems: 0,
      totalPages: 0,
    })
  })
})

describe('findSavedUrlsAddedInMonthPage', () => {
  it('filter -> sort -> paginate の順で月別結果を返す', () => {
    const records = [
      createRecord('url-1', Date.UTC(2026, 2, 1, 0, 0, 0), 'March A'),
      createRecord('url-2', Date.UTC(2026, 2, 5, 0, 0, 0), 'March B'),
      createRecord('url-3', Date.UTC(2026, 1, 28, 14, 59, 59), 'February'),
    ]

    expect(
      findSavedUrlsAddedInMonthPage(records, {
        month: 3,
        page: 1,
        pageSize: 1,
        sortDirection: 'desc',
        year: 2026,
      }),
    ).toStrictEqual(
      expect.objectContaining({
        items: [
          createRecord('url-2', Date.UTC(2026, 2, 5, 0, 0, 0), 'March B'),
        ],
        totalItems: 2,
        totalPages: 2,
      }),
    )
  })
})

describe('searchSavedUrlsPage', () => {
  it('検索結果も sort/paginate した page object を返す', () => {
    const records = [
      createRecord('url-1', 100, 'React docs'),
      createRecord('url-2', 300, 'React blog'),
      createRecord('url-3', 200, 'Vue docs'),
    ]

    expect(
      searchSavedUrlsPage(records, {
        page: 1,
        pageSize: 1,
        query: 'react',
        sortDirection: 'asc',
      }),
    ).toStrictEqual(
      expect.objectContaining({
        items: [createRecord('url-1', 100, 'React docs')],
        totalItems: 2,
        totalPages: 2,
      }),
    )
  })
})
