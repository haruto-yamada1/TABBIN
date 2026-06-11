import { z } from 'zod'

const MAX_CATEGORY_NAME_LENGTH = 25

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
    .max(MAX_CATEGORY_NAME_LENGTH, {
      message: validationMessages.maxLength,
    })

const categoryNameSchema = {
  safeParse(value: string) {
    return this.schema.safeParse(value)
  },
  schema: createCategoryNameSchema(),
}

export { categoryNameSchema, createCategoryNameSchema }
