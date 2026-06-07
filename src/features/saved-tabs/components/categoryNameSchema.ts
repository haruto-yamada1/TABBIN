import { z } from 'zod'

const createCategoryNameSchema = (
  validationMessages: { empty: string; maxLength: string } = {
    empty: 'カテゴリ名を入力してください',
    maxLength: '新規親カテゴリ名は25文字以下にしてください',
  },
) =>
  z
    .string()
    .trim()
    .min(1, {
      message: validationMessages.empty,
    })
// eslint-disable-next-line eslint/no-magic-numbers
    .max(25, {
      message: validationMessages.maxLength,
    })

const categoryNameSchema = {
  safeParse(value: string) {
    return this.schema.safeParse(value)
  },
  schema: createCategoryNameSchema(),
}

export { categoryNameSchema, createCategoryNameSchema }
