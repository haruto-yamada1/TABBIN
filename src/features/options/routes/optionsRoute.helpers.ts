import type { Dispatch, SetStateAction } from 'react'

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
