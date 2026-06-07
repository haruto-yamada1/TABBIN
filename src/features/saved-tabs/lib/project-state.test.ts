import { describe, expect, it } from 'vitest' // eslint-disable-line

import type { CustomProject } from '@/types/storage'

import { moveUrlBetweenProjectsState } from './project-state'

const createProjects = (): CustomProject[] => [
  {
    id: 'project-a',
    name: 'Project A',
    categories: ['Todo'],
    urls: [
      {
        url: 'https://example.com/a',
        title: 'A',
        category: 'Todo',
        savedAt: 1,
      },
      {
        url: 'https://example.com/b',
        title: 'B',
        category: 'Todo',
        savedAt: 2,
      },
    ],
    createdAt: 10,
    updatedAt: 10,
  },
  {
    id: 'project-b',
    name: 'Project B',
    categories: ['Inbox'],
    urls: [],
    createdAt: 20,
    updatedAt: 20,
  },
]

describe('moveUrlBetweenProjectsState', () => {
  it('指定URLを移動元から削除し、移動先に追加してupdatedAtを更新する', () => {
    const projects = createProjects()

    const next = moveUrlBetweenProjectsState({
      projects,
      sourceProjectId: 'project-a',
      targetProjectId: 'project-b',
      url: {
        url: 'https://example.com/a',
        title: 'A',
        category: 'Todo',
      },
      movedAt: 99,
    })

    expect(next[0]?.urls).toStrictEqual([
      {
        url: 'https://example.com/b',
        title: 'B',
        category: 'Todo',
        savedAt: 2,
      },
    ])
    expect(next[0]?.updatedAt).toBe(99)
    expect(next[1]?.urls).toStrictEqual([
      {
        url: 'https://example.com/a',
        title: 'A',
        category: 'Todo',
        savedAt: 99,
      },
    ])
    expect(next[1]?.updatedAt).toBe(99)
  })

  it('元配列は破壊せず、新しい参照を返す', () => {
    const projects = createProjects()

    const next = moveUrlBetweenProjectsState({
      projects,
      sourceProjectId: 'project-a',
      targetProjectId: 'project-b',
      url: {
        url: 'https://example.com/a',
        title: 'A',
      },
      movedAt: 123,
    })

    expect(next).not.toBe(projects)
    expect(next[0]).not.toBe(projects[0])
    expect(next[1]).not.toBe(projects[1])
    expect(projects[0]?.urls?.length).toBe(2)
    expect(projects[1]?.urls?.length).toBe(0)
  })

  it('移動先 urls が未初期化でも配列を生成して追加できる', () => {
    const projects = createProjects().map((project) =>
      project.id === 'project-b' ? { ...project, urls: undefined } : project,
    )

    const next = moveUrlBetweenProjectsState({
      projects,
      sourceProjectId: 'project-a',
      targetProjectId: 'project-b',
      url: {
        url: 'https://example.com/a',
        title: 'A',
      },
      movedAt: 456,
    })

    expect(next[1]?.urls).toStrictEqual([
      {
        url: 'https://example.com/a',
        title: 'A',
        savedAt: 456,
      },
    ])
  })

  it('移動元 urls が未初期化でも安全に処理できる', () => {
    const projects = createProjects().map((project) =>
      project.id === 'project-a' ? { ...project, urls: undefined } : project,
    )

    const next = moveUrlBetweenProjectsState({
      projects,
      sourceProjectId: 'project-a',
      targetProjectId: 'project-b',
      url: {
        url: 'https://example.com/a',
        title: 'A',
      },
      movedAt: 789,
    })

    expect(next[0]?.urls).toStrictEqual([])
    expect(next[0]?.updatedAt).toBe(789)
    expect(next[1]?.urls).toStrictEqual([
      {
        url: 'https://example.com/a',
        title: 'A',
        savedAt: 789,
      },
    ])
  })

  it('移動元・移動先以外のプロジェクトは変更しない', () => {
    const projects = [
      ...createProjects(),
      {
        id: 'project-c',
        name: 'Project C',
        categories: ['Later'],
        urls: [
          {
            url: 'https://example.com/c',
            title: 'C',
            category: 'Later',
            savedAt: 3,
          },
        ],
        createdAt: 30,
        updatedAt: 30,
      },
    ]

    const next = moveUrlBetweenProjectsState({
      projects,
      sourceProjectId: 'project-a',
      targetProjectId: 'project-b',
      url: {
        url: 'https://example.com/a',
        title: 'A',
        category: 'Todo',
      },
      movedAt: 999,
    })

    expect(next[2]).toStrictEqual(projects[2])
  })
})
