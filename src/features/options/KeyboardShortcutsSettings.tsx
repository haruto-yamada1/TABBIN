import { useI18nText } from '@/features/i18n/lib/useI18nText'
import { keyboardShortcuts } from '@/lib/keyboardShortcuts'

/**
 * 既存のページ内キーボードショートカットを一覧表示する設定セクション (#1128)。
 * 一覧の内容は `keyboardShortcuts` 定義が source of truth で、
 * #95 で追加されるショートカットも定義追加だけでここに載る。
 */
export const KeyboardShortcutsSettings = () => {
  const t = useI18nText()
  return (
    <div className='mb-8 rounded-lg border border-border bg-card p-6 shadow-md'>
      <h2 className='mb-4 text-xl font-semibold text-foreground'>
        {t('options.keyboardShortcuts.title', 'Keyboard shortcuts')}
      </h2>
      <p className='mb-4 text-sm text-muted-foreground'>
        {t(
          'options.keyboardShortcuts.description',
          'Shortcuts available on the saved tabs page. They do not run while you are typing in a text field.',
        )}
      </p>
      <dl className='divide-y divide-border'>
        {keyboardShortcuts.map((shortcut) => (
          <div
            key={shortcut.id}
            className='flex items-center justify-between gap-4 py-2'
          >
            <dt className='text-sm text-foreground'>
              {t(shortcut.descriptionKey, shortcut.descriptionFallback)}
            </dt>
            <dd className='flex shrink-0 items-center gap-1'>
              {shortcut.keys.map((key) => (
                <kbd
                  key={key}
                  className='rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground'
                >
                  {key}
                </kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
