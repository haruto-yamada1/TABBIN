import type { Dispatch, SetStateAction } from 'react'
import { z } from 'zod'

import type { UserSettings } from '@/types/storage'

const resetFontSizeInputValue = <
  T extends {
    fontSizeInputValue: string
  },
>(
  values: T,
  fontSizePercent: number,
): T => ({
  ...values,
  fontSizeInputValue: String(fontSizePercent),
})

const createResetFontSizeInputValueUpdater =
  <
    T extends {
      fontSizeInputValue: string
    },
  >(
    fontSizePercent: number,
  ) =>
  (values: T): T =>
    resetFontSizeInputValue(values, fontSizePercent)

const resetFontSizeInputState = <
  T extends {
    fontSizeInputValue: string
  },
>(
  setValues: Dispatch<SetStateAction<T>>,
  fontSizePercent: number,
): void => {
  setValues(createResetFontSizeInputValueUpdater(fontSizePercent))
}

export {
  createResetFontSizeInputValueUpdater,
  resetFontSizeInputState,
  resetFontSizeInputValue,
}

const clickBehaviorSchema = z.enum([
  'saveCurrentTab',
  'saveWindowTabs',
  'saveSameDomainTabs',
  'saveAllWindowsTabs',
])

const parseClickBehavior = (value: string): UserSettings['clickBehavior'] =>
  clickBehaviorSchema.parse(value)

export { parseClickBehavior }
