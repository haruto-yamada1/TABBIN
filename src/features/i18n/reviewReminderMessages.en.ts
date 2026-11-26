const reviewReminderMessagesEn = {
  'periodicExecution.review.targetTitle': 'Review candidates',
  'periodicExecution.review.scheduleTitle': 'Notification schedule',
  'periodicExecution.review.quietTitle': 'Quiet hours',
  'options.review.title': 'Review reminders',
  'options.review.description':
    'Choose when to review saved tabs. Reminders suggest candidates for you to organize; they never delete tabs automatically.',
  'options.review.noHistory':
    'Viewing history is not tracked, so reminders cannot select unread tabs.',
  'options.review.enabled': 'Enable review reminders',
  'options.review.target': 'Tabs to review',
  'options.review.target.all': 'All saved tabs',
  'options.review.target.uncategorized': 'Uncategorized tabs',
  'options.review.target.older': 'Tabs saved at least this many days ago',
  'options.review.target.category': 'A specific category',
  'options.review.olderThanDays': 'Days since first save',
  'options.review.olderHelp':
    'Only exact first-save dates are used. Tabs with unknown dates are excluded.',
  'options.review.category': 'Category',
  'options.review.chooseCategory': 'Choose a category',
  'options.review.missingCategory':
    'Previously selected category is unavailable',
  'options.review.categoriesError':
    'Categories could not be loaded. Reload the page before choosing a category.',
  'options.review.frequency': 'Frequency',
  'options.review.frequency.daily': 'Daily',
  'options.review.frequency.weekly': 'Weekly',
  'options.review.hour': 'Reminder hour',
  'options.review.weekday': 'Day of the week',
  'options.review.weekday.0': 'Sunday',
  'options.review.weekday.1': 'Monday',
  'options.review.weekday.2': 'Tuesday',
  'options.review.weekday.3': 'Wednesday',
  'options.review.weekday.4': 'Thursday',
  'options.review.weekday.5': 'Friday',
  'options.review.weekday.6': 'Saturday',
  'options.review.localTime':
    'Times use your device’s local time. One notification is sent per scheduled review when candidates exist.',
  'options.review.quietEnabled': 'Pause notifications during quiet hours',
  'options.review.quietStart': 'Quiet hours start',
  'options.review.quietEnd': 'Quiet hours end',
  'options.review.quietHelp':
    'Reminders due during quiet hours are delivered after quiet hours end. Equal start and end hours mean there is no quiet period.',
  'options.review.save': 'Save reminder settings',
  'options.review.saving': 'Saving reminder settings…',
  'options.review.saved': 'Reminder settings saved.',
  'options.review.unsaved': 'You have unsaved reminder changes.',
  'options.review.invalid':
    'Check the category, day count, and hours before saving.',
  'options.review.loading': 'Loading reminder settings…',
  'options.review.loadError':
    'Reminder settings could not be loaded. Reload the page before editing.',
  'options.review.saveError':
    'Reminder settings could not be saved. Your changes are still here; try saving again.',
  'options.review.reviewNow': 'Review now',
  'reviewReminder.notificationTitle': 'Time to review your saved tabs',
  'reviewReminder.notificationMessage':
    'Saved tabs to review: {{count}}. Open the review list to organize them.',
  'reviewReminder.listTitle': 'Review saved tabs',
  'reviewReminder.description':
    'Search your review candidates, open tabs to check them, and delete tabs you no longer need.',
  'reviewReminder.search': 'Search review candidates',
  'reviewReminder.searchPlaceholder': 'Search by title or URL',
  'reviewReminder.clearSearch': 'Clear search',
  'reviewReminder.filteredCount':
    'Showing {{count}} of {{total}} review candidates',
  'reviewReminder.searchEmpty': 'No review candidates match your search.',
  'reviewReminder.results': 'Review candidates',
  'reviewReminder.sort': 'Sort by',
  'reviewReminder.sortOldest': 'Oldest saved first',
  'reviewReminder.sortNewest': 'Newest saved first',
  'reviewReminder.sortTitle': 'Title',
  'reviewReminder.savedDate': 'First saved: {{date}}',
  'reviewReminder.unknownDate': 'First save date unknown',
  'reviewReminder.select': 'Select tab',
  'reviewReminder.selectVisible': 'Select displayed tabs',
  'reviewReminder.clearSelection': 'Clear selection',
  'reviewReminder.selectionHelp':
    'Select up to 100 displayed tabs at a time. Changing the search or refreshing the list clears the selection.',
  'reviewReminder.delete': 'Delete tab',
  'reviewReminder.deleteSelected': 'Delete selected ({{count}})',
  'reviewReminder.deleteTitle': 'Delete these saved tabs?',
  'reviewReminder.deleteDescription':
    'These tabs will be deleted from all categories and projects. You can undo the most recent deletion for 30 minutes while this page stays open.',
  'reviewReminder.confirmDelete': 'Delete {{count}} tabs',
  'reviewReminder.cancel': 'Cancel',
  'reviewReminder.deleted': 'Saved tabs deleted.',
  'reviewReminder.undone': 'Deletion undone.',
  'reviewReminder.undo': 'Undo deletion',
  'reviewReminder.actionError':
    'The tabs could not be deleted. The saved data may have changed. Refresh the list and try again.',
  'reviewReminder.undoError':
    'Deletion could not be undone. The saved data may have changed or the undo period has expired.',
  'reviewReminder.notificationFailed':
    'The change was saved, but other open pages could not be notified. Refresh those pages to see the change.',
  'reviewReminder.listCount': 'Tabs to review: {{count}}',
  'reviewReminder.listEmpty':
    'There are no tabs matching your reminder settings.',
  'reviewReminder.listError':
    'The review list could not be loaded. Try refreshing it.',
  'reviewReminder.refresh': 'Refresh review list',
  'reviewReminder.backToSavedTabs': 'Back to Saved Tabs',
  'reviewReminder.open': 'Open tab',
  'reviewReminder.configure': 'Reminder settings',
  'reviewReminder.loading': 'Loading review candidates…',
} as const

export { reviewReminderMessagesEn }
