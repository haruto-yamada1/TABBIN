import { describe, expect, it, vi } from 'vitest'

import { createSetSavedUrlFavoriteUseCase } from './SetSavedUrlFavoriteUseCase'

const setup = () => {
  const setFavorite = vi.fn(async () => true)
  return {
    setFavorite,
    useCase: createSetSavedUrlFavoriteUseCase({
      setSavedUrlFavoritePort: { setFavorite },
    }),
  }
}

describe('SetSavedUrlFavoriteUseCase', () => {
  it('forwards the explicit desired state to a targeted mutation', async () => {
    const { useCase, setFavorite } = setup()
    await useCase({ url: 'https://example.com/', isFavorite: false })
    expect(setFavorite).toHaveBeenCalledWith({
      url: 'https://example.com/',
      isFavorite: false,
    })
  })

  it('rejects a missing URL without creating records', async () => {
    const { useCase, setFavorite } = setup()
    setFavorite.mockResolvedValueOnce(false)
    await expect(
      useCase({ url: 'https://missing.example/', isFavorite: true }),
    ).rejects.toMatchObject({ code: 'URL_RECORD_NOT_FOUND' })
  })

  it('rejects a malformed runtime flag before attempting persistence', async () => {
    const { useCase, setFavorite } = setup()
    const command = { url: 'https://example.com/', isFavorite: true }
    Object.defineProperty(command, 'isFavorite', { value: 'true' })
    await expect(useCase(command)).rejects.toMatchObject({
      code: 'INVALID_URL_RECORD',
    })
    expect(setFavorite).not.toHaveBeenCalled()
  })

  it('propagates a rejected write', async () => {
    const { useCase, setFavorite } = setup()
    setFavorite.mockRejectedValueOnce(new Error('write failed'))
    await expect(
      useCase({ url: 'https://example.com/', isFavorite: true }),
    ).rejects.toThrow('write failed')
  })
})
