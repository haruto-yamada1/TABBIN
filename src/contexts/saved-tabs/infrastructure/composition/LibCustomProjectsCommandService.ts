import {
  addCategoryToProject,
  addUrlToCustomProject,
  moveUrlBetweenCustomProjects,
  removeCategoryFromProject,
  removeUrlFromCustomProject,
  removeUrlIdsFromAllCustomProjects,
  removeUrlsFromAllCustomProjects,
  removeUrlsFromCustomProject,
  renameCategoryInProject,
  reorderProjectUrls,
  setUrlCategory,
  updateCategoryOrder,
  updateProjectKeywords,
} from '@/lib/storage/projects'
import type { CustomProject, ProjectKeywordSettings } from '@/types/storage'

import type { CustomProjectsCommandService } from '../../application/ports/CustomProjectsCommandService'

/**
 * `CustomProjectsCommandService` の `lib/storage` delegate 実装。
 *
 * `lib/storage/projects` 自体は issue #509 では削除しない方針のため、
 * adapter は `chrome.storage.local` への直接アクセスを持たず、
 * lib/storage 関数への薄いラッパにとどめる。`lib/storage` 全面 DDD 化は
 * 別 issue で段階的に行う。
 */
export const createLibCustomProjectsCommandService =
  (): CustomProjectsCommandService => ({
    addCategoryToProject: async (
      projectId: string,
      categoryName: string,
    ): Promise<void> => {
      await addCategoryToProject(projectId, categoryName)
    },
    addUrlToCustomProject: async (
      projectId: string,
      url: string,
      title: string,
      options?: { notes?: string; category?: string },
    ): Promise<void> => {
      await addUrlToCustomProject(projectId, url, title, options)
    },
    moveUrlBetweenCustomProjects: async (
      sourceProjectId: string,
      targetProjectId: string,
      url: string,
    ): Promise<void> => {
      await moveUrlBetweenCustomProjects(sourceProjectId, targetProjectId, url)
    },
    removeCategoryFromProject: async (
      projectId: string,
      categoryName: string,
    ): Promise<void> => {
      await removeCategoryFromProject(projectId, categoryName)
    },
    removeUrlFromCustomProject: async (
      projectId: string,
      url: string,
    ): Promise<void> => {
      await removeUrlFromCustomProject(projectId, url)
    },
    removeUrlIdsFromAllCustomProjects: async (
      urlIds: string[],
      options?: { throwOnError?: boolean },
    ): Promise<void> => {
      await removeUrlIdsFromAllCustomProjects(urlIds, options)
    },
    removeUrlsFromAllCustomProjects: async (
      urls: string[],
      options?: { throwOnError?: boolean },
    ): Promise<void> => {
      await removeUrlsFromAllCustomProjects(urls, options)
    },
    removeUrlsFromCustomProject: async (
      projectId: string,
      urls: string[],
    ): Promise<void> => {
      await removeUrlsFromCustomProject(projectId, urls)
    },
    renameCategoryInProject: async (
      projectId: string,
      oldCategoryName: string,
      newCategoryName: string,
    ): Promise<void> => {
      await renameCategoryInProject(projectId, oldCategoryName, newCategoryName)
    },
    reorderProjectUrls: async (
      projectId: string,
      urls: CustomProject['urls'],
    ): Promise<void> => {
      await reorderProjectUrls(projectId, urls)
    },
    setUrlCategory: async (
      projectId: string,
      url: string,
      category?: string,
    ): Promise<void> => {
      await setUrlCategory(projectId, url, category)
    },
    updateCategoryOrder: async (
      projectId: string,
      newOrder: string[],
    ): Promise<void> => {
      await updateCategoryOrder(projectId, newOrder)
    },
    updateProjectKeywords: async (
      projectId: string,
      projectKeywords: ProjectKeywordSettings,
    ): Promise<void> => {
      await updateProjectKeywords(projectId, projectKeywords)
    },
  })
