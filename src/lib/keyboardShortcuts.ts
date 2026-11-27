/**
 * ページ内キーボードショートカットの一覧定義 (#1128)。
 *
 * 設定画面のショートカット一覧はこの定義だけから描画する。
 * #95 でショートカットが追加される場合は、ここへ 1 件追加すれば
 * 一覧にも自動で載る形にしている。
 */
export type KeyboardShortcutDefinition = {
  /** 安定した識別子（テスト・キー用途） */
  id: string
  /** 表示するキーの並び。例: ['Alt', '↑'] */
  keys: readonly string[]
  /** 説明文の i18n キー */
  descriptionKey: string
  /** i18n 未解決時のフォールバック文 */
  descriptionFallback: string
}

export const keyboardShortcuts: readonly KeyboardShortcutDefinition[] = [
  {
    id: 'scroll-previous-parent',
    keys: ['Alt', '↑'],
    descriptionKey: 'savedTabs.scrollControls.previousParent',
    descriptionFallback: 'Scroll to previous parent category',
  },
  {
    id: 'scroll-next-parent',
    keys: ['Alt', '↓'],
    descriptionKey: 'savedTabs.scrollControls.nextParent',
    descriptionFallback: 'Scroll to next parent category',
  },
  {
    id: 'scroll-previous-child',
    keys: ['Alt', 'Shift', '↑'],
    descriptionKey: 'savedTabs.scrollControls.previousChild',
    descriptionFallback: 'Scroll to previous child category',
  },
  {
    id: 'scroll-next-child',
    keys: ['Alt', 'Shift', '↓'],
    descriptionKey: 'savedTabs.scrollControls.nextChild',
    descriptionFallback: 'Scroll to next child category',
  },
  {
    id: 'scroll-previous-domain',
    keys: ['Alt', 'PageUp'],
    descriptionKey: 'savedTabs.scrollControls.previousDomain',
    descriptionFallback: 'Scroll to previous domain',
  },
  {
    id: 'scroll-next-domain',
    keys: ['Alt', 'PageDown'],
    descriptionKey: 'savedTabs.scrollControls.nextDomain',
    descriptionFallback: 'Scroll to next domain',
  },
  {
    id: 'toggle-sidebar',
    keys: ['Ctrl / ⌘', 'B'],
    descriptionKey: 'options.keyboardShortcuts.toggleSidebar',
    descriptionFallback: 'Toggle sidebar',
  },
]
