import { useCallback } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import { toast } from 'sonner'

import { savedTabsUncategorizedProjectId as UNCATEGORIZED_PROJECT_ID } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDefaultsDto'
import type {
  SavedTabsCustomProjectDto as CustomProject,
  SavedTabsProjectKeywordSettingsDto as ProjectKeywordSettings,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import { toStorageCustomProject } from '@/contexts/saved-tabs/application/mappers/SavedTabsSnapshotMapper'
import type { ViewMode } from '@/contexts/saved-tabs/presentation/types/mode'

import {
  showCustomProjectDeleteUndoToast,
  toRawStorageCustomProject,
} from './projectManagementDefaults'
import type { ProjectManagementRefs } from './useProjectManagementRefs'

interface ProjectCrudHandlerDeps {
  refs: ProjectManagementRefs
  setCustomProjects: Dispatch<SetStateAction<CustomProject[]>>
  setViewMode: Dispatch<SetStateAction<ViewMode>>
  customProjectsRef: RefObject<CustomProject[]>
  creatingProjectNamesRef: RefObject<Set<string>>
  t: (key: string, fallback?: string, values?: Record<string, string>) => string
}

const useProjectCrudHandlers = ({
  refs,
  setCustomProjects,
  setViewMode,
  customProjectsRef,
  creatingProjectNamesRef,
  t,
}: ProjectCrudHandlerDeps) => {
  const syncDomainDataToCustomProjects = useCallback(async (): Promise<
    CustomProject[]
  > => {
    try {
      const raws = await refs.getCustomProjectRawsQueryRef.current()
      const projects = raws.map(toRawStorageCustomProject)
      setCustomProjects(projects)
      return projects
    } catch (error) {
      console.error('データ同期エラー:', error)
      try {
        const latestRaws = await refs.getCustomProjectRawsQueryRef.current()
        const latestProjects = latestRaws.map(toRawStorageCustomProject)
        setCustomProjects(latestProjects)
        return latestProjects
      } catch (error) {
        console.error('プロジェクト再取得エラー:', error)
        return []
      }
    }
  }, [setCustomProjects, refs.getCustomProjectRawsQueryRef])

  const handleViewModeChange = useCallback(
    async (mode: ViewMode): Promise<void> => {
      console.log(`ビューモードを ${mode} に変更します`)
      setViewMode(mode)
      if (mode !== 'custom') {
        return
      }
      console.log('カスタムモードに切り替え: データ同期を開始')
      await syncDomainDataToCustomProjects()
    },
    [setViewMode, syncDomainDataToCustomProjects],
  )

  const handleCreateProject = useCallback(
    async (name: string): Promise<void> => {
      const normalizedName = name.trim()
      const projectKey = normalizedName.toLowerCase()
      if (!normalizedName) {
        return
      }
      if (creatingProjectNamesRef.current.has(projectKey)) {
        return
      }

      creatingProjectNamesRef.current.add(projectKey)
      try {
        const { project: newProject } =
          await refs.createCustomProjectUseCaseRef.current({
            name: normalizedName,
          })
        const storageProject = toStorageCustomProject(newProject)
        setCustomProjects((prev) => {
          const withoutCreated = prev.filter(
            (project) => project.id !== newProject.id,
          )
          return [storageProject, ...withoutCreated]
        })
        toast.success(
          t('savedTabs.projectAdded', undefined, {
            name: normalizedName,
          }),
        )
      } catch (error) {
        console.error('プロジェクト作成エラー:', error)
        if (
          error instanceof Error &&
          error.message.startsWith('DUPLICATE_PROJECT_NAME:')
        ) {
          toast.error(
            t('savedTabs.projects.duplicateName', undefined, {
              name: normalizedName,
            }),
          )
        } else {
          toast.error(t('savedTabs.projects.createError'))
        }
      } finally {
        creatingProjectNamesRef.current.delete(projectKey)
      }
    },
    [
      creatingProjectNamesRef,
      refs.createCustomProjectUseCaseRef,
      setCustomProjects,
      t,
    ],
  )

  const handleDeleteProject = useCallback(
    async (projectId: string): Promise<void> => {
      try {
        const project = customProjectsRef.current.find(
          (p) => p.id === projectId,
        )
        if (!project) {
          return
        }
        await refs.deleteCustomProjectUseCaseRef
          .current({
            projectId: UNCATEGORIZED_PROJECT_ID,
          })
          .catch(async () => {})
        await refs.deleteCustomProjectUseCaseRef.current({
          projectId,
        })
        setCustomProjects((prev) => prev.filter((p) => p.id !== projectId))
        toast.success(
          t('savedTabs.projects.deleted', undefined, {
            name: project.name,
          }),
        )
      } catch (error) {
        console.error('プロジェクト削除エラー:', error)
        toast.error(t('savedTabs.projects.deleteError'))
      }
    },
    [
      customProjectsRef,
      refs.deleteCustomProjectUseCaseRef,
      setCustomProjects,
      t,
    ],
  )

  const handleRenameProject = useCallback(
    async (projectId: string, newName: string): Promise<void> => {
      try {
        await refs.updateCustomProjectNameUseCaseRef.current({
          newName,
          projectId,
        })
        setCustomProjects((prev) =>
          prev.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  name: newName,
                  updatedAt: Date.now(),
                }
              : p,
          ),
        )
        toast.success(t('savedTabs.projectManagement.renamed'))
      } catch (error) {
        console.error('プロジェクト名変更エラー:', error)
        if (
          error instanceof Error &&
          error.message.startsWith('DUPLICATE_PROJECT_NAME:')
        ) {
          toast.error(
            t('savedTabs.projects.duplicateName', undefined, {
              name: newName,
            }),
          )
        } else {
          toast.error(t('savedTabs.projectManagement.renameError'))
        }
      }
    },
    [refs.updateCustomProjectNameUseCaseRef, setCustomProjects, t],
  )

  const handleUpdateProjectKeywords = useCallback(
    async (
      projectId: string,
      projectKeywords: ProjectKeywordSettings,
    ): Promise<void> => {
      try {
        await refs.updateCustomProjectKeywordsUseCaseRef.current({
          projectId,
          projectKeywords,
        })
        setCustomProjects((prev) =>
          prev.map((project) =>
            project.id === projectId
              ? {
                  ...project,
                  projectKeywords,
                  updatedAt: Date.now(),
                }
              : project,
          ),
        )
        toast.success(t('savedTabs.projects.keywordsUpdated'))
      } catch (error) {
        console.error('キーワード設定更新エラー:', error)
        toast.error(t('savedTabs.projects.keywordsUpdateError'))
      }
    },
    [refs.updateCustomProjectKeywordsUseCaseRef, setCustomProjects, t],
  )

  const handleAddUrlToProject = useCallback(
    async (projectId: string, url: string, title: string): Promise<void> => {
      try {
        await refs.addUrlToCustomProjectUseCaseRef.current({
          projectId,
          title,
          url,
        })
        const updatedRaws = await refs.getCustomProjectRawsQueryRef.current()
        setCustomProjects(updatedRaws.map(toRawStorageCustomProject))
        toast.success(t('savedTabs.tab.added'))
      } catch (error) {
        console.error('URL追加エラー:', error)
        toast.error(t('savedTabs.tab.addError'))
      }
    },
    [
      refs.addUrlToCustomProjectUseCaseRef,
      refs.getCustomProjectRawsQueryRef,
      setCustomProjects,
      t,
    ],
  )

  const handleDeleteUrlFromProject = useCallback(
    async (projectId: string, url: string): Promise<void> => {
      try {
        const undoSnapshot =
          await refs.getCustomProjectUndoSnapshotQueryRef.current()
        await refs.removeUrlFromCustomProjectUseCaseRef.current({
          projectId,
          url,
        })
        const updatedRaws = await refs.getCustomProjectRawsQueryRef.current()
        setCustomProjects(updatedRaws.map(toRawStorageCustomProject))
        showCustomProjectDeleteUndoToast({
          count: 1,
          restoreCustomProjectsSnapshotUseCase:
            refs.restoreCustomProjectsSnapshotUseCaseRef.current,
          setCustomProjects,
          snapshot: undoSnapshot,
          t,
        })
        toast.success(t('savedTabs.tab.deleted'))
      } catch (error) {
        console.error('URL削除エラー:', error)
        toast.error(t('savedTabs.tab.deleteError'))
      }
    },
    [
      refs.getCustomProjectUndoSnapshotQueryRef,
      refs.removeUrlFromCustomProjectUseCaseRef,
      refs.getCustomProjectRawsQueryRef,
      refs.restoreCustomProjectsSnapshotUseCaseRef,
      setCustomProjects,
      t,
    ],
  )

  const handleDeleteUrlsFromProject = useCallback(
    async (projectId: string, urls: string[]): Promise<void> => {
      try {
        const undoSnapshot =
          await refs.getCustomProjectUndoSnapshotQueryRef.current()
        await refs.removeUrlsFromCustomProjectUseCaseRef.current({
          projectId,
          urls,
        })
        const updatedRaws = await refs.getCustomProjectRawsQueryRef.current()
        setCustomProjects(updatedRaws.map(toRawStorageCustomProject))
        showCustomProjectDeleteUndoToast({
          count: urls.length,
          restoreCustomProjectsSnapshotUseCase:
            refs.restoreCustomProjectsSnapshotUseCaseRef.current,
          setCustomProjects,
          snapshot: undoSnapshot,
          t,
        })
        toast.success(
          t('savedTabs.tabs.deletedCount', undefined, {
            count: String(urls.length),
          }),
        )
      } catch (error) {
        console.error('URL一括削除エラー:', error)
        toast.error(t('savedTabs.tab.deleteError'))
      }
    },
    [
      refs.getCustomProjectUndoSnapshotQueryRef,
      refs.removeUrlsFromCustomProjectUseCaseRef,
      refs.getCustomProjectRawsQueryRef,
      refs.restoreCustomProjectsSnapshotUseCaseRef,
      setCustomProjects,
      t,
    ],
  )

  return {
    handleAddUrlToProject,
    handleCreateProject,
    handleDeleteProject,
    handleDeleteUrlFromProject,
    handleDeleteUrlsFromProject,
    handleRenameProject,
    handleUpdateProjectKeywords,
    handleViewModeChange,
    syncDomainDataToCustomProjects,
  }
}

export { useProjectCrudHandlers }
