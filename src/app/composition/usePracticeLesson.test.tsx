// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AcademyCommandError } from '@/features/academy/application/services/AcademyProgressService'

import { createPracticeComposition } from './createPracticeComposition'
import { usePracticeLesson } from './usePracticeLesson'

afterEach(cleanup)
const createProgress = () => ({
  startLesson: vi.fn(async () => ({
    lessonId: 'parent-categories',
    generation: 'attempt',
  })),
  completePracticeStep: vi.fn(async () => undefined),
  skipLesson: vi.fn(async () => undefined),
  resetProgress: vi.fn(async () => undefined),
})

describe('practice achievement integration', () => {
  it('records only committed successful operations and rewinds the local step independently of saved facts', async () => {
    const composition = createPracticeComposition()
    const progress = createProgress()
    const remount = vi.fn()
    const { result } = renderHook(() =>
      usePracticeLesson('parent-categories', composition, progress, remount),
    )
    expect(progress.startLesson).not.toHaveBeenCalled()
    await act(async () => {
      await expect(
        composition.useCases.createParentCategory({ name: 'Demo workspace' }),
      ).rejects.toThrow('DUPLICATE_CATEGORY_NAME')
    })
    expect(result.current.index).toBe(0)
    const before = composition.getSnapshot()
    await act(async () => {
      await composition.useCases.createParentCategory({ name: 'Development' })
    })
    await waitFor(() =>
      expect(progress.completePracticeStep).toHaveBeenCalledTimes(1),
    )
    expect(result.current.index).toBe(1)
    expect(progress.completePracticeStep).toHaveBeenCalledWith({
      lessonId: 'parent-categories',
      generation: 'attempt',
      stepId: 'parent-categories-create',
      action: 'organize-parent-category',
      environment: 'academy-sandbox',
    })
    act(() => result.current.back())
    await waitFor(() => expect(result.current.index).toBe(0))
    expect(composition.getSnapshot()).toEqual(before)
    expect(remount).toHaveBeenCalledOnce()
    expect(progress.completePracticeStep).toHaveBeenCalledTimes(1)
  })

  it('retains successful evidence after persistence failure and retries without repeating the operation', async () => {
    const composition = createPracticeComposition()
    const progress = createProgress()
    progress.completePracticeStep.mockRejectedValueOnce(new Error('offline'))
    const { result } = renderHook(() =>
      usePracticeLesson('parent-categories', composition, progress, vi.fn()),
    )
    await act(async () => {
      await composition.useCases.createParentCategory({ name: 'Development' })
    })
    await waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current.index).toBe(1)
    act(() => result.current.retrySave())
    await waitFor(() => expect(result.current.error).toBe(false))
    expect(progress.completePracticeStep).toHaveBeenCalledTimes(2)
    expect(progress.completePracticeStep.mock.calls[0]).toEqual(
      progress.completePracticeStep.mock.calls[1],
    )
  })

  it('requires explicit restart for an obsolete assessment without discarding other lessons', async () => {
    const composition = createPracticeComposition()
    const progress = createProgress()
    progress.startLesson.mockRejectedValueOnce(
      new AcademyCommandError('RELEARNING_REQUIRED'),
    )
    const { result } = renderHook(() =>
      usePracticeLesson('parent-categories', composition, progress, vi.fn()),
    )
    await act(async () => {
      await composition.useCases.createParentCategory({ name: 'Development' })
    })
    await waitFor(() => expect(result.current.requiresRestart).toBe(true))
    expect(progress.resetProgress).not.toHaveBeenCalled()
    act(() => result.current.restartProgress())
    await waitFor(() => expect(result.current.index).toBe(0))
    expect(progress.completePracticeStep).not.toHaveBeenCalled()
    expect(progress.resetProgress).toHaveBeenCalledWith('parent-categories')
    await act(async () => {
      await composition.useCases.createParentCategory({ name: 'Development' })
    })
    await waitFor(() =>
      expect(progress.completePracticeStep).toHaveBeenCalledOnce(),
    )
  })

  it('offers explicit recovery from an externally reset attempt and requires a fresh practice', async () => {
    const composition = createPracticeComposition()
    const progress = createProgress()
    const { result } = renderHook(() =>
      usePracticeLesson('parent-categories', composition, progress, vi.fn()),
    )
    await act(async () => {
      await composition.useCases.createParentCategory({ name: 'Development' })
    })
    await waitFor(() => expect(result.current.saving).toBe(false))
    progress.completePracticeStep.mockRejectedValueOnce(
      new AcademyCommandError('STALE_ATTEMPT'),
    )
    await act(async () => {
      await composition.useCases.renameParentCategory({
        categoryId: 'practice-created-0',
        newName: 'Projects',
      })
    })
    await waitFor(() => expect(result.current.requiresRestart).toBe(true))
    expect(progress.resetProgress).not.toHaveBeenCalled()
    act(() => result.current.restartProgress())
    await waitFor(() => expect(result.current.index).toBe(0))
    expect(composition.getSnapshot().groups).toHaveLength(2)
    expect(progress.completePracticeStep).toHaveBeenCalledTimes(2)
    await act(async () => {
      await composition.useCases.createParentCategory({ name: 'Development' })
    })
    await waitFor(() =>
      expect(progress.completePracticeStep).toHaveBeenCalledTimes(3),
    )
    expect(progress.startLesson).toHaveBeenCalledTimes(2)
    expect(result.current.error).toBe(false)
  })

  it('drains an achievement arriving while an earlier save is finishing', async () => {
    const composition = createPracticeComposition()
    const progress = createProgress()
    let finish: () => void = () => {
      throw new Error('First save did not start')
    }
    progress.completePracticeStep.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        finish = resolve
      })
    })
    const { result } = renderHook(() =>
      usePracticeLesson('parent-categories', composition, progress, vi.fn()),
    )
    await act(async () => {
      await composition.useCases.createParentCategory({ name: 'Development' })
    })
    await act(async () => {
      const renamed = composition.useCases.renameParentCategory({
        categoryId: 'practice-created-0',
        newName: 'Projects',
      })
      // Interleave the memory commit with completion of the first storage write.
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      finish()
      await renamed
    })
    expect(result.current.index).toBe(2)
    await waitFor(() =>
      expect(progress.completePracticeStep).toHaveBeenCalledTimes(2),
    )
    expect(result.current.error).toBe(false)
    expect(result.current.saving).toBe(false)
  })

  it('retries a failed skip write instead of clearing the error without persisting it', async () => {
    const composition = createPracticeComposition()
    const progress = createProgress()
    progress.skipLesson.mockRejectedValueOnce(
      new Error('temporary storage failure'),
    )
    const { result } = renderHook(() =>
      usePracticeLesson('parent-categories', composition, progress, vi.fn()),
    )
    act(() => result.current.skip())
    await waitFor(() => expect(result.current.error).toBe(true))
    act(() => result.current.retrySave())
    await waitFor(() => expect(progress.skipLesson).toHaveBeenCalledTimes(2))
    expect(result.current.error).toBe(false)
    expect(progress.completePracticeStep).not.toHaveBeenCalled()
  })

  it('skip discards practice changes and preserves already earned progress', async () => {
    const composition = createPracticeComposition()
    const before = composition.getSnapshot()
    const progress = createProgress()
    const { result } = renderHook(() =>
      usePracticeLesson('parent-categories', composition, progress, vi.fn()),
    )
    await act(async () => {
      await composition.useCases.createParentCategory({ name: 'Development' })
    })
    await waitFor(() =>
      expect(progress.completePracticeStep).toHaveBeenCalledOnce(),
    )
    act(() => result.current.skip())
    await waitFor(() => expect(progress.skipLesson).toHaveBeenCalledOnce())
    expect(result.current.stopped).toBe(true)
    expect(composition.getSnapshot()).toEqual(before)
    expect(progress.completePracticeStep).toHaveBeenCalledOnce()
    await act(async () => {
      await composition.useCases.createParentCategory({ name: 'Ignored' })
    })
    expect(result.current.index).toBe(0)
  })

  it('keeps rewind failures separate and clears them after a successful retry without progress storage', async () => {
    const composition = createPracticeComposition()
    const restore = vi
      .fn(composition.captureCheckpoint())
      .mockRejectedValueOnce(new Error('restore failed'))
    vi.spyOn(composition, 'captureCheckpoint').mockReturnValueOnce(restore)
    const { result } = renderHook(() =>
      usePracticeLesson('parent-categories', composition, undefined, vi.fn()),
    )
    await act(async () => {
      await composition.useCases.createParentCategory({ name: 'Development' })
    })
    act(() => result.current.back())
    await waitFor(() => expect(result.current.rewindFailed).toBe(true))
    expect(result.current.error).toBe(false)
    expect(result.current.rewindFailed).toBe(true)
    expect(result.current.index).toBe(1)
    act(() => result.current.back())
    await waitFor(() => expect(result.current.index).toBe(0))
    expect(result.current.rewindFailed).toBe(false)
    expect(result.current.error).toBe(false)
  })

  it('preserves an independent save failure when rewinding succeeds', async () => {
    const composition = createPracticeComposition()
    const progress = createProgress()
    progress.completePracticeStep.mockRejectedValueOnce(new Error('offline'))
    const { result } = renderHook(() =>
      usePracticeLesson('parent-categories', composition, progress, vi.fn()),
    )
    await act(async () => {
      await composition.useCases.createParentCategory({ name: 'Development' })
    })
    await waitFor(() => expect(result.current.error).toBe(true))
    act(() => result.current.back())
    await waitFor(() => expect(result.current.index).toBe(0))
    expect(result.current.error).toBe(true)
    expect(result.current.rewindFailed).toBe(false)
  })

  it('does not report a restarted attempt as recovered until its practice checkpoint restores', async () => {
    const composition = createPracticeComposition()
    const restore = vi
      .fn(composition.captureCheckpoint())
      .mockRejectedValueOnce(new Error('restore failed'))
    vi.spyOn(composition, 'captureCheckpoint').mockReturnValueOnce(restore)
    const progress = createProgress()
    progress.startLesson.mockRejectedValueOnce(
      new AcademyCommandError('RELEARNING_REQUIRED'),
    )
    const { result } = renderHook(() =>
      usePracticeLesson('parent-categories', composition, progress, vi.fn()),
    )
    await act(async () => {
      await composition.useCases.createParentCategory({ name: 'Development' })
    })
    await waitFor(() => expect(result.current.requiresRestart).toBe(true))
    act(() => result.current.restartProgress())
    await waitFor(() => expect(result.current.rewindFailed).toBe(true))
    await waitFor(() => expect(result.current.saving).toBe(false))
    expect(result.current.requiresRestart).toBe(true)
    expect(result.current.error).toBe(true)
    expect(result.current.rewindFailed).toBe(true)
    expect(result.current.index).toBe(1)
    act(() => result.current.restartProgress())
    await waitFor(() => expect(result.current.index).toBe(0))
    await waitFor(() => expect(result.current.saving).toBe(false))
    expect(result.current.requiresRestart).toBe(false)
    expect(result.current.error).toBe(false)
    expect(result.current.rewindFailed).toBe(false)
  })

  it('does not persist or lock a skipped practice when its rewind fails', async () => {
    const composition = createPracticeComposition()
    const restore = vi
      .fn(composition.captureCheckpoint())
      .mockRejectedValueOnce(new Error('restore failed'))
    vi.spyOn(composition, 'captureCheckpoint').mockReturnValueOnce(restore)
    const progress = createProgress()
    const { result } = renderHook(() =>
      usePracticeLesson('parent-categories', composition, progress, vi.fn()),
    )
    await act(async () => {
      await composition.useCases.createParentCategory({ name: 'Development' })
    })
    await waitFor(() =>
      expect(progress.completePracticeStep).toHaveBeenCalledOnce(),
    )
    act(() => result.current.skip())
    await waitFor(() => expect(result.current.rewindFailed).toBe(true))
    await waitFor(() => expect(result.current.stopped).toBe(false))
    expect(progress.skipLesson).not.toHaveBeenCalled()
    expect(result.current.rewindFailed).toBe(true)
    act(() => result.current.skip())
    await waitFor(() => expect(progress.skipLesson).toHaveBeenCalledOnce())
    expect(result.current.stopped).toBe(true)
    expect(result.current.index).toBe(0)
    expect(result.current.rewindFailed).toBe(false)
  })
})
