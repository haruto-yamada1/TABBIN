import { useCallback, useEffect, useRef, useState } from 'react'

import {
  buildConversationTitle,
  createConversationRecord,
  loadConversationHistory,
  saveConversationHistory,
} from '@/features/ai-chat/lib/conversation-history'
import type {
  AiChatConversation,
  AiChatConversationMessage,
  AiChatHistoryItem,
} from '@/features/ai-chat/types'
import { useI18n } from '@/features/i18n/context/I18nProvider'

type ConversationHistoryState = {
  activeConversationId: string
  conversations: AiChatConversation[]
}

type ConversationHistoryError = 'load' | 'save'

type UseSharedAiChatHistoryResult = {
  activeConversation: AiChatConversation | null
  createConversation: () => void
  deleteConversation: (conversationId: string) => void
  historyError: ConversationHistoryError | null
  historyItems: AiChatHistoryItem[]
  isLoading: boolean
  selectConversation: (conversationId: string) => void
  updateMessages: (messages: AiChatConversationMessage[]) => void
}

const EMPTY_HISTORY_ITEMS: AiChatHistoryItem[] = []

const sortConversationsByRecent = (
  conversations: AiChatConversation[],
): AiChatConversation[] =>
  conversations.toSorted((left, right) => {
    if (right.updatedAt !== left.updatedAt) {
      return right.updatedAt - left.updatedAt
    }

    if (right.createdAt !== left.createdAt) {
      return right.createdAt - left.createdAt
    }

    return right.id.localeCompare(left.id)
  })

const getConversationPreview = (
  conversation: AiChatConversation,
  defaultPreview: string,
): AiChatHistoryItem['preview'] =>
  conversation.messages.at(-1)?.content || defaultPreview // eslint-disable-line typescript/prefer-nullish-coalescing -- empty content should fall through

const resolveCurrentConversationId = (
  activeConversationId: string | null,
  historyActiveConversationId: string,
): string => activeConversationId ?? historyActiveConversationId

const resolveNextActiveConversationId = ({
  activeConversationId,
  currentActiveConversationId,
  deletedConversationId,
  nextConversations,
  pendingConversationId,
}: {
  activeConversationId: string | null
  currentActiveConversationId: string
  deletedConversationId: string
  nextConversations: AiChatConversation[]
  pendingConversationId: string | null
}): string => {
  if (nextConversations.length === 0) {
    return createConversationRecord().id
  }

  if (
    activeConversationId === deletedConversationId ||
    currentActiveConversationId === deletedConversationId
  ) {
    return nextConversations[0].id
  }

  if (
    pendingConversationId !== null &&
    activeConversationId === pendingConversationId
  ) {
    return pendingConversationId
  }

  return currentActiveConversationId
}

const useSharedAiChatHistory = (): UseSharedAiChatHistoryResult => {
  // eslint-disable-line eslint/max-lines-per-function
  const { t } = useI18n()
  const newConversationTitle = t('aiChat.newConversation')
  const historyStartPrompt = t('aiChat.history.startPrompt')
  const interruptedResponseMessage = t('aiChat.interruptedResponse')
  const [historyState, setHistoryState] =
    useState<ConversationHistoryState | null>(null)
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null)
  const [pendingConversationId, setPendingConversationId] = useState<
    string | null
  >(null)
  const [historyError, setHistoryError] =
    useState<ConversationHistoryError | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const historyStateRef = useRef<ConversationHistoryState | null>(null)
  const isMountedRef = useRef(false)
  const saveQueueRef = useRef<Promise<void> | null>(null)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    let isCurrentLoad = true

    const loadHistory = loadConversationHistory(
      newConversationTitle,
      interruptedResponseMessage,
    )
    void loadHistory.then(
      (nextState) => {
        if (!isCurrentLoad) {
          return
        }

        const loadedState = {
          ...nextState,
          conversations: sortConversationsByRecent(nextState.conversations),
        }
        historyStateRef.current = loadedState
        setHistoryState(loadedState)
        setActiveConversationId(nextState.activeConversationId)
        setHistoryError(null)
        setIsLoading(false)
      },
      () => {
        if (!isCurrentLoad) {
          return
        }
        setHistoryError('load')
        setIsLoading(false)
      },
    )

    return () => {
      isCurrentLoad = false
    }
  }, [interruptedResponseMessage, newConversationTitle])

  const enqueueSave = useCallback((state: ConversationHistoryState) => {
    const previousSave = saveQueueRef.current
    const queuedSave = (
      previousSave ? previousSave.catch(() => undefined) : Promise.resolve()
    ).then(async () => saveConversationHistory(state))
    saveQueueRef.current = queuedSave
    setHistoryError((current) => (current === 'save' ? null : current))
    void queuedSave.then(
      () => {
        if (isMountedRef.current && saveQueueRef.current === queuedSave) {
          setHistoryError((current) => (current === 'save' ? null : current))
        }
      },
      () => {
        if (isMountedRef.current) {
          setHistoryError('save')
        }
      },
    )
  }, [])

  const persistHistory = useCallback(
    (
      update: (current: ConversationHistoryState) => ConversationHistoryState,
    ) => {
      const current = historyStateRef.current
      if (!current) {
        return
      }

      const nextState = update(current)
      const normalizedState = {
        ...nextState,
        conversations: sortConversationsByRecent(nextState.conversations),
      }
      historyStateRef.current = normalizedState
      setHistoryState(normalizedState)
      setActiveConversationId(normalizedState.activeConversationId)
      enqueueSave(normalizedState)
    },
    [enqueueSave],
  )

  const createConversation = useCallback(() => {
    const conversation = createConversationRecord({
      defaultTitle: newConversationTitle,
    })
    setPendingConversationId(conversation.id)
    setActiveConversationId(conversation.id)
  }, [newConversationTitle])

  const deleteConversation = useCallback(
    (conversationId: string) => {
      const current = historyStateRef.current
      if (!current) {
        return
      }

      const nextConversations = sortConversationsByRecent(
        current.conversations.filter(
          (conversation) => conversation.id !== conversationId,
        ),
      )

      if (nextConversations.length === current.conversations.length) {
        return
      }

      const nextActiveConversationId = resolveNextActiveConversationId({
        activeConversationId,
        currentActiveConversationId: current.activeConversationId,
        deletedConversationId: conversationId,
        nextConversations,
        pendingConversationId,
      })

      if (nextConversations.length === 0) {
        setPendingConversationId(nextActiveConversationId)
      }

      const nextState = {
        activeConversationId: nextActiveConversationId,
        conversations: nextConversations,
      }

      historyStateRef.current = nextState
      setHistoryState(nextState)
      setActiveConversationId(nextActiveConversationId)
      enqueueSave(nextState)
    },
    [activeConversationId, enqueueSave, pendingConversationId],
  )

  const selectConversation = useCallback(
    (conversationId: string) => {
      setPendingConversationId(null)
      persistHistory((current) => {
        if (current.activeConversationId === conversationId) {
          return current
        }

        return {
          ...current,
          activeConversationId: conversationId,
        }
      })
    },
    [persistHistory],
  )

  const updateMessages = useCallback(
    (messages: AiChatConversationMessage[]) => {
      if (!activeConversationId) {
        return
      }

      const hasStartedConversation = messages.some(
        (message) => message.content.trim().length > 0,
      )

      if (
        pendingConversationId &&
        activeConversationId === pendingConversationId
      ) {
        if (!hasStartedConversation) {
          return
        }

        const conversation = createConversationRecord({
          defaultTitle: newConversationTitle,
          id: pendingConversationId,
          messages,
        })

        setPendingConversationId(null)
        persistHistory((current) => {
          const existingConversation = current.conversations.find(
            (currentConversation) =>
              currentConversation.id === pendingConversationId,
          )

          return {
            activeConversationId: conversation.id,
            conversations: existingConversation
              ? current.conversations.map((currentConversation) =>
                  currentConversation.id === pendingConversationId
                    ? {
                        ...currentConversation,
                        messages,
                        title: buildConversationTitle(
                          messages,
                          newConversationTitle,
                        ),
                        updatedAt: Date.now(),
                      }
                    : currentConversation,
                )
              : [conversation, ...current.conversations],
          }
        })
        return
      }

      persistHistory((current) => ({
        ...current,
        conversations: current.conversations.map((conversation) =>
          conversation.id === activeConversationId
            ? {
                ...conversation,
                messages,
                title: buildConversationTitle(messages, newConversationTitle),
                updatedAt: Date.now(),
              }
            : conversation,
        ),
      }))
    },
    [
      activeConversationId,
      newConversationTitle,
      pendingConversationId,
      persistHistory,
    ],
  )

  if (!historyState) {
    return {
      activeConversation: null,
      createConversation,
      deleteConversation,
      historyError,
      historyItems: EMPTY_HISTORY_ITEMS,
      isLoading,
      selectConversation,
      updateMessages,
    }
  }

  const currentConversationId = resolveCurrentConversationId(
    activeConversationId,
    historyState.activeConversationId,
  )
  const conversations = sortConversationsByRecent(historyState.conversations)

  const activeConversation =
    pendingConversationId && currentConversationId === pendingConversationId
      ? createConversationRecord({
          defaultTitle: newConversationTitle,
          id: pendingConversationId,
        })
      : (conversations.find(
          (conversation) => conversation.id === currentConversationId,
        ) ?? conversations[0])
  const historyItems = conversations.map((conversation) => ({
    id: conversation.id,
    isActive: conversation.id === currentConversationId,
    preview: getConversationPreview(conversation, historyStartPrompt),
    title: conversation.title,
  }))

  return {
    activeConversation,
    createConversation,
    deleteConversation,
    historyError,
    historyItems,
    isLoading,
    selectConversation,
    updateMessages,
  }
}

export {
  resolveCurrentConversationId,
  resolveNextActiveConversationId,
  useSharedAiChatHistory,
}
export type { ConversationHistoryError }
