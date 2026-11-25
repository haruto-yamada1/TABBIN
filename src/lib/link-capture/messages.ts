export const captureMessages = {
  en: {
    selected: 'TABBIN · Selected',
    overflow: 'TABBIN · Select at most 1,000 links',
    selectionTooLarge:
      'The selected links contain too much text. Select fewer links and try again.',
    queueFull:
      'Too many clicks are waiting. This link was not queued. Wait for pending saves or retry, then click it again.',
    saving: 'Saving links…',
    confirmation: 'Save selected links?',
    preview: 'New: {new} · Already saved: {existing} · Excluded: {excluded}',
    save: 'Save links',
    cancel: 'Cancel',
    retry: 'Retry',
    error: 'Could not save links. Your selection is kept. Retry or cancel.',
    forbidden:
      'Link capture is unavailable. Check its setting and site permission.',
    complete:
      'Saved: {saved} · Already saved: {existing} · Excluded: {excluded} · Duplicates: {duplicates} · Failed: {failed}',
    dismiss: 'Dismiss',
  },
  ja: {
    selected: 'TABBIN · 選択',
    overflow: 'TABBIN · 1,000件以内で選択してください',
    selectionTooLarge:
      '選択したリンクの文字数が多すぎます。選択するリンクを減らして、もう一度お試しください。',
    queueFull:
      '保存待ちのリンクが多すぎるため、このリンクは追加できませんでした。保存の完了または再試行後に、もう一度クリックしてください。',
    saving: 'リンクを保存中…',
    confirmation: '選択したリンクを保存しますか？',
    preview: '新規: {new}件 · 保存済み: {existing}件 · 除外: {excluded}件',
    save: 'リンクを保存',
    cancel: 'キャンセル',
    retry: '再試行',
    error:
      'リンクを保存できませんでした。選択は保持されています。再試行またはキャンセルしてください。',
    forbidden:
      'リンク選択を利用できません。設定とサイト権限を確認してください。',
    complete:
      '保存: {saved}件 · 保存済み: {existing}件 · 除外: {excluded}件 · 重複: {duplicates}件 · 失敗: {failed}件',
    dismiss: '閉じる',
  },
}
export type CaptureMessages = (typeof captureMessages)['en']
