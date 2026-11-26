const favoriteMessagesEn = {
  'options.autoDelete.description':
    'Saved tabs are deleted automatically after the selected period. When favorite protection is on, favorites are excluded.',
  'options.autoDelete.periodDescription':
    'Saved tabs are deleted automatically when they exceed the selected period. Applying the setting deletes tabs that have already expired. When favorite protection is on, favorites are excluded.',
  'options.autoDelete.protectFavorites': 'Do not auto-delete favorite URLs',
  'options.autoDelete.protectFavoritesDescription':
    'When on, favorites are not removed by automatic cleanup after opening or expiration. You can still delete them manually.',

  'savedTabs.favorite.toggle': 'Favorite: {{name}}',
  'savedTabs.favorite.protection':
    'Favorites are protected from automatic removal while the setting is on.',
  'savedTabs.favorite.saveError': 'Could not save the favorite. Try again.',
  'savedTabs.favorite.filter': 'Show only favorites in {{name}}',
  'savedTabs.favorite.orderHint':
    'Favorites appear first. URL reordering is available when no favorites or filters are active.',
} as const

export { favoriteMessagesEn }
