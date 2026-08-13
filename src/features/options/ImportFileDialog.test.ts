import { describe, expect, it, vi } from 'vitest' // eslint-disable-line

import {
  createCloseImportDialogAction,
  createImportDialogOpenChangeHandler,
  importDialogReducer,
  initialImportDialogState,
  resetImportFileInput,
  shouldCloseImportDialog,
} from './importFileDialog.helpers'

describe('shouldCloseImportDialog', () => {
  it('dialog が閉じる操作だけ close として扱う', () => {
    expect(shouldCloseImportDialog(false)).toBe(true)
    expect(shouldCloseImportDialog(true)).toBe(false)
    const close = vi.fn()
    const resetFileInput = vi.fn()
    const handleOpenChange = createImportDialogOpenChangeHandler({
      close,
      resetFileInput,
    })

    handleOpenChange(true)

    expect(close).not.toHaveBeenCalled()
    expect(resetFileInput).not.toHaveBeenCalled()

    handleOpenChange(false)

    expect(close).toHaveBeenCalledTimes(1)
    expect(resetFileInput).toHaveBeenCalledTimes(1)

    const dispatchImportDialog = vi.fn()
    createCloseImportDialogAction(dispatchImportDialog)()
    expect(dispatchImportDialog).toHaveBeenCalledWith({ type: 'CLOSE' })
  })

  it('reducer は未知 action では状態を変えない', () => {
    expect(
      importDialogReducer(initialImportDialogState, {
        type: 'UNKNOWN',
      } as never),
    ).toBe(initialImportDialogState)
  })

  it('current Backup V2 の preview では未対応の merge を解除する', () => {
    const state = importDialogReducer(initialImportDialogState, {
      type: 'SET_PREVIEW',
      preview: {
        categoriesCount: 0,
        domainsCount: 0,
        formatKind: 'current-v2',
        hasAiChat: false,
        hasAnalytics: false,
        projectsCount: 0,
        timestamp: '2026-08-12T00:00:00.000Z',
        version: '2.0.8',
      },
    })

    expect(state.mergeData).toBe(false)
    expect(state.step).toBe('preview')
  })

  it('resetImportFileInput は input がある場合だけ value を空にする', () => {
    const input = {
      value: 'settings.json',
    } as HTMLInputElement

    resetImportFileInput(input)
    resetImportFileInput(null)

    expect(input.value).toBe('')
  })
})
