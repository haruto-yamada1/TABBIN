import { describe, expect, it } from 'vitest'

import { createCustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import { createTabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import { createUrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'
import { createCustomProjectId } from '@/contexts/saved-tabs/domain/value-objects/CustomProjectId'
import { createTabGroupId } from '@/contexts/saved-tabs/domain/value-objects/TabGroupId'
import { createUrlRecordId } from '@/contexts/saved-tabs/domain/value-objects/UrlRecordId'

import {
  collectReferencedUrlRecordIds,
  filterUnreferencedUrlRecords,
  isUrlRecordReferencedElsewhere,
} from './UrlReferenceService'

const tabGroupA = createTabGroup({
  id: 'group-a',
  domain: 'a.example.com',
  urlIds: ['url-1', 'url-2'],
})
const tabGroupB = createTabGroup({
  id: 'group-b',
  domain: 'b.example.com',
  urlIds: ['url-2', 'url-3'],
})
const project = createCustomProject({
  id: 'project-1',
  name: 'Project 1',
  urlIds: ['url-3', 'url-4'],
  categories: [],
  createdAt: 1,
  updatedAt: 1,
})

const buildUrlRecord = (id: string) =>
  createUrlRecord({
    id,
    url: `https://example.com/${id}`,
    title: id,
    savedAt: 1_700_000_000_000,
  })

describe('UrlReferenceService.collectReferencedUrlRecordIds', () => {
  it('TabGroup と CustomProject の両方から参照集合を返す', () => {
    const referenced = collectReferencedUrlRecordIds({
      tabGroups: [tabGroupA, tabGroupB],
      customProjects: [project],
    })
    expect(referenced.has(createUrlRecordId('url-1'))).toBe(true)
    expect(referenced.has(createUrlRecordId('url-2'))).toBe(true)
    expect(referenced.has(createUrlRecordId('url-3'))).toBe(true)
    expect(referenced.has(createUrlRecordId('url-4'))).toBe(true)
    expect(referenced.has(createUrlRecordId('url-5'))).toBe(false)
  })
})

describe('UrlReferenceService.isUrlRecordReferencedElsewhere', () => {
  it('別の TabGroup から参照されていれば true', () => {
    expect(
      isUrlRecordReferencedElsewhere({
        urlRecordId: createUrlRecordId('url-2'),
        tabGroups: [tabGroupA, tabGroupB],
        customProjects: [],
        origin: { kind: 'tabGroup', id: createTabGroupId('group-a') },
      }),
    ).toBe(true)
  })

  it('削除元 TabGroup でのみ参照されていれば false', () => {
    expect(
      isUrlRecordReferencedElsewhere({
        urlRecordId: createUrlRecordId('url-1'),
        tabGroups: [tabGroupA],
        customProjects: [],
        origin: { kind: 'tabGroup', id: createTabGroupId('group-a') },
      }),
    ).toBe(false)
  })

  it('CustomProject から参照されていれば true', () => {
    expect(
      isUrlRecordReferencedElsewhere({
        urlRecordId: createUrlRecordId('url-3'),
        tabGroups: [],
        customProjects: [project],
      }),
    ).toBe(true)
  })

  it('削除元 CustomProject でのみ参照されていれば false', () => {
    expect(
      isUrlRecordReferencedElsewhere({
        urlRecordId: createUrlRecordId('url-4'),
        tabGroups: [],
        customProjects: [project],
        origin: {
          kind: 'customProject',
          id: createCustomProjectId('project-1'),
        },
      }),
    ).toBe(false)
  })

  it('複数集約が同じ UrlRecord を参照しているケースで誤って参照無しにならない', () => {
    expect(
      isUrlRecordReferencedElsewhere({
        urlRecordId: createUrlRecordId('url-3'),
        tabGroups: [tabGroupA, tabGroupB],
        customProjects: [project],
        origin: {
          kind: 'customProject',
          id: createCustomProjectId('project-1'),
        },
      }),
    ).toBe(true)
  })
})

describe('UrlReferenceService.filterUnreferencedUrlRecords', () => {
  it('どこからも参照されていない UrlRecord だけを抽出する', () => {
    const records = [
      buildUrlRecord('url-1'),
      buildUrlRecord('url-2'),
      buildUrlRecord('url-orphan'),
    ]
    const result = filterUnreferencedUrlRecords({
      urlRecords: records,
      tabGroups: [tabGroupA, tabGroupB],
      customProjects: [project],
    })
    expect(result.map((record) => record.id)).toStrictEqual(['url-orphan'])
  })
})
