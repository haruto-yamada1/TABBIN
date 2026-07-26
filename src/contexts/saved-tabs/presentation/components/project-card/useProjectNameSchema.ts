import { z } from 'zod'

export const MAX_PROJECT_NAME_LENGTH = 50

export type ProjectNameSchema = z.ZodString

export const createProjectNameSchema = (
  validationMessages: { empty: string; maxLength: string } = {
    empty: 'プロジェクト名を入力してください',
    maxLength: 'プロジェクト名は50文字以下で入力してください',
  },
): ProjectNameSchema =>
  z
    .string()
    .trim()
    .min(1, {
      message: validationMessages.empty,
    })
    .max(MAX_PROJECT_NAME_LENGTH, {
      message: validationMessages.maxLength,
    })

export const projectNameSchema = {
  safeParse(value: string) {
    return this.schema.safeParse(value)
  },
  schema: createProjectNameSchema(),
}
