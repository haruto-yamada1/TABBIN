import {
  MAX_AI_SYSTEM_PROMPT_NAME_LENGTH,
  MAX_AI_SYSTEM_PROMPT_PRESETS,
} from '@/features/ai-chat/lib/systemPromptPresets'
import type { AiSystemPromptPreset } from '@/types/storage'

import type { TranslateFn } from './messages'

const HEX_RADIX = 16
const SYSTEM_PROMPT_SELECTOR_EMPTY_VALUE = '__no-system-prompt__'

const createSystemPromptId = (): string =>
  `system-prompt-${Date.now()}-${Math.random().toString(HEX_RADIX).slice(2)}`

const clampPromptName = (value: string): string =>
  value.trim().slice(0, MAX_AI_SYSTEM_PROMPT_NAME_LENGTH)

const buildPromptNameCandidate = (
  baseName: string,
  t: TranslateFn,
  suffix = '',
): string => {
  const normalizedBaseName =
    clampPromptName(baseName) || t('aiChat.systemPrompt.new')
  if (!suffix) {
    return normalizedBaseName
  }

  const truncatedBaseName = normalizedBaseName
    .slice(0, Math.max(0, MAX_AI_SYSTEM_PROMPT_NAME_LENGTH - suffix.length))
    .trimEnd()

  return `${truncatedBaseName}${suffix}`.trim()
}

const getUniquePromptName = (
  presets: AiSystemPromptPreset[],
  baseName: string,
  t: TranslateFn,
  initialSuffix = '',
): string => {
  const normalizedBaseName =
    clampPromptName(baseName) || t('aiChat.systemPrompt.new')
  const existingNames = new Set(presets.map((preset) => preset.name.trim()))
  const initialCandidateName = buildPromptNameCandidate(
    normalizedBaseName,
    t,
    initialSuffix,
  )

  if (!existingNames.has(initialCandidateName)) {
    return initialCandidateName
  }

  for (let index = 2; index <= MAX_AI_SYSTEM_PROMPT_PRESETS + 1; index += 1) {
    const candidateName = buildPromptNameCandidate(
      normalizedBaseName,
      t,
      initialSuffix ? `${initialSuffix} ${index}` : ` ${index}`,
    )
    if (!existingNames.has(candidateName)) {
      return candidateName
    }
  }

  return buildPromptNameCandidate(normalizedBaseName, t, ` ${Date.now()}`)
}

const getSelectedPrompt = (
  presets: AiSystemPromptPreset[],
  selectedPromptId: string,
): AiSystemPromptPreset | undefined =>
  presets.find((prompt) => prompt.id === selectedPromptId)

const getPromptManagerValidationError = (
  presets: AiSystemPromptPreset[],
  t: TranslateFn,
): string => {
  const trimmedPresets = presets.map((prompt) => ({
    name: prompt.name.trim(),
    template: prompt.template.trim(),
  }))

  if (
    trimmedPresets.some(
      (prompt) => prompt.name.length === 0 || prompt.template.length === 0,
    )
  ) {
    return t('aiChat.systemPrompt.validation.empty')
  }

  if (
    trimmedPresets.some(
      (prompt) => prompt.name.length > MAX_AI_SYSTEM_PROMPT_NAME_LENGTH,
    )
  ) {
    return t('aiChat.systemPrompt.validation.maxLength', undefined, {
      count: String(MAX_AI_SYSTEM_PROMPT_NAME_LENGTH),
    })
  }

  const duplicateNames = new Set<string>()
  const seenNames = new Set<string>()

  for (const prompt of trimmedPresets) {
    if (seenNames.has(prompt.name)) {
      duplicateNames.add(prompt.name)
      continue
    }

    seenNames.add(prompt.name)
  }

  if (duplicateNames.size > 0) {
    return t('aiChat.systemPrompt.validation.duplicate')
  }

  return ''
}

export {
  buildPromptNameCandidate,
  clampPromptName,
  createSystemPromptId,
  getPromptManagerValidationError,
  getSelectedPrompt,
  getUniquePromptName,
  MAX_AI_SYSTEM_PROMPT_NAME_LENGTH,
  MAX_AI_SYSTEM_PROMPT_PRESETS,
  SYSTEM_PROMPT_SELECTOR_EMPTY_VALUE,
}
