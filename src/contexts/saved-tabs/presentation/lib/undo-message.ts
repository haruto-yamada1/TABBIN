/**
 * Undo トースト文言の単複出し分け。
 * 英語では count が 1 のとき単数形キーを使う（#1129）。
 * 対象外のキーや 2 件以上では元のキーをそのまま返す。
 */
const SINGULAR_MESSAGE_KEYS: Record<string, string> = {
  'savedTabs.undo.deletedTabs': 'savedTabs.undo.deletedTab',
  'savedTabs.undo.removedAfterOpen': 'savedTabs.undo.removedAfterOpenTab',
}

const resolveUndoMessageKey = (messageKey: string, count: number): string => {
  if (count !== 1) {
    return messageKey
  }
  return SINGULAR_MESSAGE_KEYS[messageKey] ?? messageKey
}

export { resolveUndoMessageKey }
