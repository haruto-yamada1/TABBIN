import type { Dispatch } from 'react'

import type { LegacyBackupAdvisory } from '@/features/options/lib/import-export/compatibility/legacyBackupPolicy'

type PreviewData = {
  version: string
  timestamp: string
  categoriesCount: number
  domainsCount: number
  formatKind: 'current-v2' | 'legacy'
  projectsCount: number
  hasAiChat: boolean
  hasAnalytics: boolean
  legacyBackupAdvisory?: LegacyBackupAdvisory
}

type ImportDialogState = {
  isOpen: boolean
  step: 'select' | 'preview'
  previewData: PreviewData | null
  mergeData: boolean
}

type ImportDialogAction =
  | { type: 'OPEN' }
  | { type: 'CLOSE' }
  | { type: 'RESET' }
  | { type: 'SET_PREVIEW'; preview: PreviewData }
  | { type: 'SET_MERGE'; mergeData: boolean }

const initialImportDialogState: ImportDialogState = {
  isOpen: false,
  step: 'select',
  previewData: null,
  mergeData: true,
}

const importDialogReducer = (
  state: ImportDialogState,
  action: ImportDialogAction,
): ImportDialogState => {
  switch (action.type) {
    case 'OPEN': {
      return { ...state, isOpen: true, step: 'select', previewData: null }
    }
    case 'CLOSE': {
      return initialImportDialogState
    }
    case 'RESET': {
      return { ...state, step: 'select', previewData: null }
    }
    case 'SET_PREVIEW': {
      return {
        ...state,
        mergeData:
          action.preview.formatKind === 'current-v2' ? false : state.mergeData,
        previewData: action.preview,
        step: 'preview',
      }
    }
    case 'SET_MERGE': {
      return { ...state, mergeData: action.mergeData }
    }
    default: {
      return state
    }
  }
}

const shouldCloseImportDialog = (open: boolean): boolean => !open
const createImportDialogOpenChangeHandler =
  ({
    close,
    resetFileInput,
  }: {
    close: () => void
    resetFileInput: () => void
  }) =>
  (open: boolean): void => {
    if (shouldCloseImportDialog(open)) {
      close()
      resetFileInput()
    }
  }
const createCloseImportDialogAction =
  (dispatchImportDialog: Dispatch<ImportDialogAction>) => (): void => {
    dispatchImportDialog({ type: 'CLOSE' })
  }
const resetImportFileInput = (fileInput: HTMLInputElement | null): void => {
  if (fileInput) {
    fileInput.value = ''
  }
}

export type { ImportDialogAction, ImportDialogState, PreviewData }
export {
  createCloseImportDialogAction,
  createImportDialogOpenChangeHandler,
  importDialogReducer,
  initialImportDialogState,
  resetImportFileInput,
  shouldCloseImportDialog,
}
