import type { favoriteMessagesEn } from './favoriteMessages.en'

const favoriteMessagesJa: Record<keyof typeof favoriteMessagesEn, string> = {
  'options.autoDelete.description':
    '保存されたタブが指定した期間を超えると自動的に削除されます。お気に入り保護がONのときはお気に入りは対象外です。',
  'options.autoDelete.periodDescription':
    '保存されたタブが指定した期間を超えると自動的に削除されます。お気に入り保護がONのときはお気に入りは対象外です。設定を適用すると、その時点で期限切れのタブは削除されます。',
  'options.autoDelete.protectFavorites': 'お気に入りのURLを自動削除しない',
  'options.autoDelete.protectFavoritesDescription':
    'ONの場合、URLを開いたあとや期限切れなどの自動整理では消えません。手動削除は可能です',

  'savedTabs.favorite.toggle': 'お気に入り: {{name}}',
  'savedTabs.favorite.protection':
    '設定がONのとき、お気に入りは自動削除から保護されます。',
  'savedTabs.favorite.saveError':
    'お気に入りを保存できませんでした。もう一度お試しください。',
  'savedTabs.favorite.filter': '{{name}}のお気に入りのみ表示',
  'savedTabs.favorite.orderHint':
    'お気に入りを先頭に表示します。URLの手動並び替えは、お気に入りと絞り込みがないときに利用できます。',
}

export { favoriteMessagesJa }
