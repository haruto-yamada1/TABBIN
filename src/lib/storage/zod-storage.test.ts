/* eslint-disable max-lines-per-function */
import { beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line
import { z } from 'zod'

import {
  fromStorageChange,
  safeParseArrayFromStorage,
  TabGroupSchema,
} from './zod-storage'

const ItemSchema = z.object({
  id: z.string(),
  value: z.number(),
})

describe('zod-storage helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('fromStorageChange', () => {
    it('正常値はスキーマに従い変換して返す', () => {
      const result = fromStorageChange(ItemSchema, { id: 'a', value: 1 })
      expect(result).toStrictEqual({ id: 'a', value: 1 })
    })

    it('不正値は例外を投げる', () => {
      expect(() =>
        fromStorageChange(ItemSchema, { id: 'a', value: 'not-number' }),
      ).toThrow(/expected number/)
    })
  })

  describe('safeParseArrayFromStorage', () => {
    it('正常値だけの配列は全要素を返す', () => {
      const result = safeParseArrayFromStorage(ItemSchema, [
        { id: 'a', value: 1 },
        { id: 'b', value: 2 },
      ])
      expect(result).toStrictEqual([
        { id: 'a', value: 1 },
        { id: 'b', value: 2 },
      ])
    })

    it('不正な要素はスキップし、正常要素だけ返す', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const result = safeParseArrayFromStorage(ItemSchema, [
        { id: 'a', value: 1 },
        { id: 'b' }, // value 欠損
        { id: 'c', value: 'not-number' }, // value 型不正
        { id: 'd', value: 4 },
      ])
      expect(result).toStrictEqual([
        { id: 'a', value: 1 },
        { id: 'd', value: 4 },
      ])
      expect(warnSpy).toHaveBeenCalledTimes(2)
    })

    it('空配列は空配列を返す', () => {
      expect(safeParseArrayFromStorage(ItemSchema, [])).toStrictEqual([])
    })

    it('配列でない値は空配列を返す', () => {
      expect(safeParseArrayFromStorage(ItemSchema, null)).toStrictEqual([])
      expect(
        safeParseArrayFromStorage(ItemSchema, { invalid: true }),
      ).toStrictEqual([])
      expect(safeParseArrayFromStorage(ItemSchema, 'not-array')).toStrictEqual(
        [],
      )
    })

    it('TabGroupSchema で壊れた1件を含む配列でも正常分は保持される', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const valid = {
        id: 'group-1',
        domain: 'https://example.com',
        urlIds: ['url-1'],
      }
      const result = safeParseArrayFromStorage(TabGroupSchema, [
        valid,
        { id: 'broken' }, // domain 欠損
        valid,
      ])
      expect(result).toHaveLength(2)
      expect(result[0]).toStrictEqual(valid)
      expect(result[1]).toStrictEqual(valid)
      expect(warnSpy).toHaveBeenCalledTimes(1)
    })
  })
})
