import { getMessage } from '@/features/i18n/lib/language'
import type { AppLanguage } from '@/features/i18n/messages'

interface AiChatToolDefinition {
  descriptionKey: string
  name: string
  titleKey: string
}

const AI_CHAT_TOOL_DEFINITIONS = [
  {
    descriptionKey: 'aiChat.tool.getCurrentDateTime.description',
    name: 'getCurrentDateTime',
    titleKey: 'aiChat.tool.getCurrentDateTime.title',
  },
  {
    descriptionKey: 'aiChat.tool.listSavedUrls.description',
    name: 'listSavedUrls',
    titleKey: 'aiChat.tool.listSavedUrls.title',
  },
  {
    descriptionKey: 'aiChat.tool.findUrlsByMonth.description',
    name: 'findUrlsByMonth',
    titleKey: 'aiChat.tool.findUrlsByMonth.title',
  },
  {
    descriptionKey: 'aiChat.tool.searchSavedUrls.description',
    name: 'searchSavedUrls',
    titleKey: 'aiChat.tool.searchSavedUrls.title',
  },
  {
    descriptionKey: 'aiChat.tool.generateSavedTabsAnalytics.description',
    name: 'generateSavedTabsAnalytics',
    titleKey: 'aiChat.tool.generateSavedTabsAnalytics.title',
  },
  {
    descriptionKey: 'aiChat.tool.inferUserInterests.description',
    name: 'inferUserInterests',
    titleKey: 'aiChat.tool.inferUserInterests.title',
  },
] as const satisfies readonly AiChatToolDefinition[]

type AiChatToolDefinitionEntry = (typeof AI_CHAT_TOOL_DEFINITIONS)[number]
type AiChatToolName = AiChatToolDefinitionEntry['name']

const AI_CHAT_TOOL_NAMES: readonly AiChatToolName[] =
  AI_CHAT_TOOL_DEFINITIONS.map((toolDefinition) => toolDefinition.name)

const getAiChatToolDefinition = (
  toolName: string,
): AiChatToolDefinition | undefined =>
  AI_CHAT_TOOL_DEFINITIONS.find(
    (toolDefinition) => toolDefinition.name === toolName,
  )

const getAiChatToolTitle = (
  language: AppLanguage,
  toolName: string,
): string => {
  const toolDefinition = getAiChatToolDefinition(toolName)
  if (!toolDefinition) {
    return toolName
  }
  return getMessage(language, toolDefinition.titleKey, toolName)
}

const getAiChatToolDescription = (
  language: AppLanguage,
  toolName: string,
): string => {
  const toolDefinition = getAiChatToolDefinition(toolName)
  if (!toolDefinition) {
    return toolName
  }
  return getMessage(language, toolDefinition.descriptionKey, toolName)
}

interface ResolvedAiChatToolDefinition {
  description: string
  name: string
  title: string
}

const getAiChatToolDefinitions = (
  language: AppLanguage,
): readonly ResolvedAiChatToolDefinition[] =>
  AI_CHAT_TOOL_DEFINITIONS.map((toolDefinition) => ({
    description: getMessage(
      language,
      toolDefinition.descriptionKey,
      toolDefinition.name,
    ),
    name: toolDefinition.name,
    title: getMessage(language, toolDefinition.titleKey, toolDefinition.name),
  }))

export type {
  AiChatToolDefinition,
  AiChatToolDefinitionEntry,
  AiChatToolName,
  ResolvedAiChatToolDefinition,
}
export {
  AI_CHAT_TOOL_DEFINITIONS,
  AI_CHAT_TOOL_NAMES,
  getAiChatToolDefinition,
  getAiChatToolDefinitions,
  getAiChatToolDescription,
  getAiChatToolTitle,
}
