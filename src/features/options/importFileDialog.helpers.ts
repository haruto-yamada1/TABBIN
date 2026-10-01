import type { Dispatch } from 'react'

import type { ImportPreview } from '@/features/options/lib/import-export'

type PreviewData = ImportPreview

type ImportDialogState = {
  isOpen: boolean
  step: 'select' | 'preview'
  previewData: PreviewData | null
}

type ImportDialogAction =
  | { type: 'OPEN' }
  | { type: 'CLOSE' }
  | { type: 'RESET' }
  | { type: 'SET_PREVIEW'; preview: PreviewData }

const initialImportDialogState: ImportDialogState = {
  isOpen: false,
  step: 'select',
  previewData: null,
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
        previewData: action.preview,
        step: 'preview',
      }
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
