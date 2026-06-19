/**
 * @file useProjectManagementRefs.ts
 * @description useProjectManagement から抽出した ref 設定フック。
 */

import { useRef } from 'react'

import type { GetCustomProjectOrderQuery } from '@/contexts/saved-tabs/application/queries/GetCustomProjectOrderQuery'
import type { GetCustomProjectRawsQuery } from '@/contexts/saved-tabs/application/queries/GetCustomProjectRawsQuery'
import type { GetCustomProjectUndoSnapshotQuery } from '@/contexts/saved-tabs/application/queries/GetCustomProjectUndoSnapshotQuery'
import type { AddCategoryToCustomProjectUseCase } from '@/contexts/saved-tabs/application/use-cases/AddCategoryToCustomProjectUseCase'
import type { AddUrlToCustomProjectUseCase } from '@/contexts/saved-tabs/application/use-cases/AddUrlToCustomProjectUseCase'
import type { CreateCustomProjectUseCase } from '@/contexts/saved-tabs/application/use-cases/CreateCustomProjectUseCase'
import type { DeleteCustomProjectUseCase } from '@/contexts/saved-tabs/application/use-cases/DeleteCustomProjectUseCase'
import type { RemoveCategoryFromCustomProjectUseCase } from '@/contexts/saved-tabs/application/use-cases/RemoveCategoryFromCustomProjectUseCase'
import type { RemoveUrlFromCustomProjectUseCase } from '@/contexts/saved-tabs/application/use-cases/RemoveUrlFromCustomProjectUseCase'
import type { RemoveUrlsFromCustomProjectUseCase } from '@/contexts/saved-tabs/application/use-cases/RemoveUrlsFromCustomProjectUseCase'
import type { RenameCustomProjectCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/RenameCustomProjectCategoryUseCase'
import type { ReorderCustomProjectUrlsUseCase } from '@/contexts/saved-tabs/application/use-cases/ReorderCustomProjectUrlsUseCase'
import type { RestoreCustomProjectsSnapshotUseCase } from '@/contexts/saved-tabs/application/use-cases/RestoreCustomProjectsSnapshotUseCase'
import type { SaveCustomProjectOrderUseCase } from '@/contexts/saved-tabs/application/use-cases/SaveCustomProjectOrderUseCase'
import type { SetCustomProjectUrlCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/SetCustomProjectUrlCategoryUseCase'
import type { UpdateCustomProjectCategoryOrderUseCase } from '@/contexts/saved-tabs/application/use-cases/UpdateCustomProjectCategoryOrderUseCase'
import type { UpdateCustomProjectKeywordsUseCase } from '@/contexts/saved-tabs/application/use-cases/UpdateCustomProjectKeywordsUseCase'
import type { UpdateCustomProjectNameUseCase } from '@/contexts/saved-tabs/application/use-cases/UpdateCustomProjectNameUseCase'

interface ProjectManagementRefs {
  getCustomProjectOrderQueryRef: { readonly current: GetCustomProjectOrderQuery }
  getCustomProjectUndoSnapshotQueryRef: { readonly current: GetCustomProjectUndoSnapshotQuery }
  getCustomProjectRawsQueryRef: { readonly current: GetCustomProjectRawsQuery }
  createCustomProjectUseCaseRef: { readonly current: CreateCustomProjectUseCase }
  deleteCustomProjectUseCaseRef: { readonly current: DeleteCustomProjectUseCase }
  updateCustomProjectNameUseCaseRef: { readonly current: UpdateCustomProjectNameUseCase }
  saveCustomProjectOrderUseCaseRef: { readonly current: SaveCustomProjectOrderUseCase }
  restoreCustomProjectsSnapshotUseCaseRef: { readonly current: RestoreCustomProjectsSnapshotUseCase }
  addUrlToCustomProjectUseCaseRef: { readonly current: AddUrlToCustomProjectUseCase }
  removeUrlFromCustomProjectUseCaseRef: { readonly current: RemoveUrlFromCustomProjectUseCase }
  removeUrlsFromCustomProjectUseCaseRef: { readonly current: RemoveUrlsFromCustomProjectUseCase }
  setCustomProjectUrlCategoryUseCaseRef: { readonly current: SetCustomProjectUrlCategoryUseCase }
  updateCustomProjectCategoryOrderUseCaseRef: { readonly current: UpdateCustomProjectCategoryOrderUseCase }
  reorderCustomProjectUrlsUseCaseRef: { readonly current: ReorderCustomProjectUrlsUseCase }
  renameCustomProjectCategoryUseCaseRef: { readonly current: RenameCustomProjectCategoryUseCase }
  updateCustomProjectKeywordsUseCaseRef: { readonly current: UpdateCustomProjectKeywordsUseCase }
  addCategoryToCustomProjectUseCaseRef: { readonly current: AddCategoryToCustomProjectUseCase }
  removeCategoryFromCustomProjectUseCaseRef: { readonly current: RemoveCategoryFromCustomProjectUseCase }
}

// eslint-disable-next-line eslint/max-params -- composition root bundles 18 deps
const useProjectManagementRefs = (
  getCustomProjectOrderQuery: GetCustomProjectOrderQuery,
  getCustomProjectUndoSnapshotQuery: GetCustomProjectUndoSnapshotQuery,
  getCustomProjectRawsQuery: GetCustomProjectRawsQuery,
  createCustomProjectUseCase: CreateCustomProjectUseCase,
  deleteCustomProjectUseCase: DeleteCustomProjectUseCase,
  updateCustomProjectNameUseCase: UpdateCustomProjectNameUseCase,
  saveCustomProjectOrderUseCase: SaveCustomProjectOrderUseCase,
  restoreCustomProjectsSnapshotUseCase: RestoreCustomProjectsSnapshotUseCase,
  addUrlToCustomProjectUseCase: AddUrlToCustomProjectUseCase,
  removeUrlFromCustomProjectUseCase: RemoveUrlFromCustomProjectUseCase,
  removeUrlsFromCustomProjectUseCase: RemoveUrlsFromCustomProjectUseCase,
  setCustomProjectUrlCategoryUseCase: SetCustomProjectUrlCategoryUseCase,
  updateCustomProjectCategoryOrderUseCase: UpdateCustomProjectCategoryOrderUseCase,
  reorderCustomProjectUrlsUseCase: ReorderCustomProjectUrlsUseCase,
  renameCustomProjectCategoryUseCase: RenameCustomProjectCategoryUseCase,
  updateCustomProjectKeywordsUseCase: UpdateCustomProjectKeywordsUseCase,
  addCategoryToCustomProjectUseCase: AddCategoryToCustomProjectUseCase,
  removeCategoryFromCustomProjectUseCase: RemoveCategoryFromCustomProjectUseCase,
) => {
  const getCustomProjectOrderQueryRef = useRef(getCustomProjectOrderQuery)
  const getCustomProjectUndoSnapshotQueryRef = useRef(
    getCustomProjectUndoSnapshotQuery,
  )
  const getCustomProjectRawsQueryRef = useRef(getCustomProjectRawsQuery)
  const createCustomProjectUseCaseRef = useRef(createCustomProjectUseCase)
  const deleteCustomProjectUseCaseRef = useRef(deleteCustomProjectUseCase)
  const updateCustomProjectNameUseCaseRef = useRef(
    updateCustomProjectNameUseCase,
  )
  const saveCustomProjectOrderUseCaseRef = useRef(saveCustomProjectOrderUseCase)
  const restoreCustomProjectsSnapshotUseCaseRef = useRef(
    restoreCustomProjectsSnapshotUseCase,
  )
  const addUrlToCustomProjectUseCaseRef = useRef(addUrlToCustomProjectUseCase)
  const removeUrlFromCustomProjectUseCaseRef = useRef(
    removeUrlFromCustomProjectUseCase,
  )
  const removeUrlsFromCustomProjectUseCaseRef = useRef(
    removeUrlsFromCustomProjectUseCase,
  )
  const setCustomProjectUrlCategoryUseCaseRef = useRef(
    setCustomProjectUrlCategoryUseCase,
  )
  const updateCustomProjectCategoryOrderUseCaseRef = useRef(
    updateCustomProjectCategoryOrderUseCase,
  )
  const reorderCustomProjectUrlsUseCaseRef = useRef(
    reorderCustomProjectUrlsUseCase,
  )
  const renameCustomProjectCategoryUseCaseRef = useRef(
    renameCustomProjectCategoryUseCase,
  )
  const updateCustomProjectKeywordsUseCaseRef = useRef(
    updateCustomProjectKeywordsUseCase,
  )
  const addCategoryToCustomProjectUseCaseRef = useRef(
    addCategoryToCustomProjectUseCase,
  )
  const removeCategoryFromCustomProjectUseCaseRef = useRef(
    removeCategoryFromCustomProjectUseCase,
  )

  return {
    getCustomProjectOrderQueryRef,
    getCustomProjectUndoSnapshotQueryRef,
    getCustomProjectRawsQueryRef,
    createCustomProjectUseCaseRef,
    deleteCustomProjectUseCaseRef,
    updateCustomProjectNameUseCaseRef,
    saveCustomProjectOrderUseCaseRef,
    restoreCustomProjectsSnapshotUseCaseRef,
    addUrlToCustomProjectUseCaseRef,
    removeUrlFromCustomProjectUseCaseRef,
    removeUrlsFromCustomProjectUseCaseRef,
    setCustomProjectUrlCategoryUseCaseRef,
    updateCustomProjectCategoryOrderUseCaseRef,
    reorderCustomProjectUrlsUseCaseRef,
    renameCustomProjectCategoryUseCaseRef,
    updateCustomProjectKeywordsUseCaseRef,
    addCategoryToCustomProjectUseCaseRef,
    removeCategoryFromCustomProjectUseCaseRef,
  }
}

export type { ProjectManagementRefs }
export { useProjectManagementRefs }
