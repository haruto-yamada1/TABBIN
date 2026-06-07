import { describe, expect, it, vi } from 'vitest' // eslint-disable-line

import {
  createCloseImportDialogAction,
  createImportDialogOpenChangeHandler,
  importDialogReducer,
  initialImportDialogState,
  resetImportFileInput,
  shouldCloseImportDialog,
} from './ImportFileDialog'

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

  it('resetImportFileInput は input がある場合だけ value を空にする', () => {
    const input = {
      value: 'settings.json',
    } as HTMLInputElement

    resetImportFileInput(input)
    resetImportFileInput(null)

    expect(input.value).toBe('')
  })
})
