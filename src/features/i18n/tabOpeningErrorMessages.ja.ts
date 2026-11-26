import type { tabOpeningErrorMessagesEn } from './tabOpeningErrorMessages.en'

const tabOpeningErrorMessagesJa: Record<
  keyof typeof tabOpeningErrorMessagesEn,
  string
> = {
  'savedTabs.tab.openError': 'URLを開けませんでした。保存したままです。',
  'savedTabs.tab.openAllError':
    '一部のURLを開けませんでした。開けなかったURLは保存したままです。',
  'savedTabs.tab.openUpdateError':
    'URLは開きましたが、保存データや一覧を更新できませんでした。続ける前に再読み込みしてください。',
}

export { tabOpeningErrorMessagesJa }
