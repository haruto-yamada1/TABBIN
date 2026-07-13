const messages = {
  en: {
    'aiChat.attachments.add': 'Attach files',
    'aiChat.attachments.contextTitle': 'Attachment contents:',
    'aiChat.attachments.defaultName': 'attachment',
    'aiChat.attachments.deleteAria': 'Delete {{filename}}',
    'aiChat.attachments.maxFileSize': 'Attachments must be 2 MB or smaller.',
    'aiChat.attachments.maxFiles': 'You can attach up to {{count}} files.',
    'aiChat.attachments.readError': 'Could not read the attachment.',
    'aiChat.attachments.unsupportedType':
      'Only text files and image files are supported.',
    'aiChat.attachments.unsupportedTypeDetail':
      '{{filename}} is not supported in the current AI chat ({{mediaType}}).',
    'aiChat.chatTitle': 'Chat',
    'aiChat.close': 'Close AI chat',
    'aiChat.copy.assistant': 'AI:',
    'aiChat.copy.attachments': 'Attachments:',
    'aiChat.copy.user': 'User:',
    'aiChat.copyConversation': 'Copy conversation',
    'aiChat.copyConversationError': 'Could not copy the conversation',
    'aiChat.copyConversationSuccess': 'Copied the conversation',
    'aiChat.dataScope':
      'AI answers use your saved URLs, titles, categories, projects, attachments, and the selected local Ollama model.',
    'aiChat.deleteConversationAria': 'Delete {{title}}',
    'aiChat.deleteDescription': 'This action cannot be undone.',
    'aiChat.deleteTitle': 'Delete this conversation?',
    'aiChat.emptySelectModel': 'Select a model',
    'aiChat.history.empty': 'No saved conversations yet',
    'aiChat.history.resumeHint': 'Resume from a saved conversation',
    'aiChat.history.startPrompt': 'Start a new conversation',
    'aiChat.historyHint': 'Click to continue',
    'aiChat.historyTitle': 'Recent conversations',
    'aiChat.inputLabel': 'Ask AI',
    'aiChat.inputPlaceholder': 'Ask about your saved tabs',
    'aiChat.inputPlaceholderSelectModel':
      'Select an Ollama model in the lower-left corner',
    'aiChat.interests.categoryBias':
      'Categories such as {{categories}} stand out.',
    'aiChat.interests.categoryCountDescription':
      'Saved count by recently saved category',
    'aiChat.interests.categoryCountTitle': 'Saved count by genre',
    'aiChat.interests.categoryShareDescription':
      'Share of recently saved categories',
    'aiChat.interests.categoryWeak': 'No strong category bias is visible yet.',
    'aiChat.interests.domainCountDescription':
      'Saved count by recently saved domain',
    'aiChat.interests.noDataSummary':
      'There is no saved data yet, so I cannot infer your interests.',
    'aiChat.interests.savedCountLabel': 'Saved count',
    'aiChat.interests.summary':
      'Based on your saved trends, interest is strongest around {{domainSummary}}, and {{categorySummary}}',
    'aiChat.interests.tentativeSummary':
      'There are only a few saved items so far, so it is still hard to infer a strong trend.',
    'aiChat.interests.topCategoriesTitle': 'Frequently saved genres',
    'aiChat.interests.topDomainsTitle': 'Frequently saved domains',
    'aiChat.interruptedResponse':
      'The previous response was interrupted. Send your message again if needed.',
    'aiChat.intro': 'Ask questions about your saved tabs.',
    'aiChat.modelListLoadError': 'Could not load the model list',
    'aiChat.modelSettingsSaveError': 'Could not save model settings',
    'aiChat.newConversation': 'New conversation',
    'aiChat.ollama.checkCommand':
      'Copy and paste the check command to verify the connection.',
    'aiChat.ollama.connectionError': 'Could not connect to Ollama.',
    'aiChat.ollama.connectionUrl': 'Connection URL:',
    'aiChat.ollama.copied': 'Copied',
    'aiChat.ollama.copy': 'Copy',
    'aiChat.ollama.copyCheckCommand': 'Copy check command',
    'aiChat.ollama.copyCommand': 'Copy command',
    'aiChat.ollama.copyError': 'Could not copy {{label}}',
    'aiChat.ollama.copySuccess': 'Copied {{label}}',
    'aiChat.ollama.copyValue': 'Copy value',
    'aiChat.ollama.downloadUrl': 'Download URL:',
    'aiChat.ollama.faq': 'FAQ:',
    'aiChat.ollama.forbiddenError':
      'Ollama denied access from the extension (403 Forbidden).',
    'aiChat.ollama.loadModels': 'Load models',
    'aiChat.ollama.loading': 'Loading...',
    'aiChat.ollama.loadingModelList': 'Loading model list...',
    'aiChat.ollama.mac.step1': 'Open Terminal from Spotlight search.',
    'aiChat.ollama.mac.step2': 'Copy and paste the following command.',
    'aiChat.ollama.mac.step3': 'Press the Return key.',
    'aiChat.ollama.mac.step4': 'Quit Ollama.app.',
    'aiChat.ollama.mac.step5': 'Launch Ollama.app again.',
    'aiChat.ollama.noModelsFound': 'No models found',
    'aiChat.ollama.notInstalledDownload':
      'If you have not installed Ollama yet, download it.',
    'aiChat.ollama.notInstalledStart':
      'If it is already installed, start Ollama.',
    'aiChat.ollama.selectModel': 'Select a model',
    'aiChat.ollama.setOrigins': 'Set OLLAMA_ORIGINS to the following value.',
    'aiChat.ollama.tagsUrl': 'Tags URL:',
    'aiChat.ollama.unknown.step1':
      'Set OLLAMA_ORIGINS and then restart Ollama.',
    'aiChat.ollama.unknown.step2': 'The value is below.',
    'aiChat.ollama.win.step1':
      'Search for Environment Variables in the Windows start menu.',
    'aiChat.ollama.win.step2': 'Open Edit the system environment variables.',
    'aiChat.ollama.win.step3':
      'In the window that appears, select Environment Variables.',
    'aiChat.ollama.win.step4': 'Under User variables, select New.',
    'aiChat.ollama.win.step5': 'Enter OLLAMA_ORIGINS as the variable name.',
    'aiChat.ollama.win.step6':
      'Enter the following value as the variable value.',
    'aiChat.ollama.win.step7': 'Save the setting and restart Ollama.',
    'aiChat.open': 'Open AI chat',
    'aiChat.pageAria': 'AI chat page',
    'aiChat.reasoning': 'Reasoning',
    'aiChat.resizeAria': 'Resize the AI chat width',
    'aiChat.responseError': 'Could not get a response from AI.',
    'aiChat.scrollLatest': 'Jump to latest message',
    'aiChat.send': 'Send',
    'aiChat.sending': 'Sending...',
    'aiChat.shimmer': 'Assembling the answer...',
    'aiChat.sidebarAria': 'AI chat sidebar',
    'aiChat.sources.one': '{{count}} source',
    'aiChat.sources.other': '{{count}} sources',
    'aiChat.streaming.checkingTabs': '- Checking saved tabs.',
    'aiChat.streaming.receivedQuestion': '- Received question: {{prompt}}',
    'aiChat.streaming.toolsFollow':
      '- Tools and reasoning update after each completed step.',
    'aiChat.tool.findUrlsByMonth.description':
      'List tabs saved in the specified year and month. page/pageSize/sortDirection are configurable.',
    'aiChat.tool.findUrlsByMonth.title': 'Search tabs by month',
    'aiChat.tool.generateSavedTabsAnalytics.description':
      'Aggregate saved tabs by domain, category, project, and time series, then return chartSpecs. Prefer this when charts or analysis are requested.',
    'aiChat.tool.generateSavedTabsAnalytics.title': 'Saved tabs analytics',
    'aiChat.tool.getCurrentDateTime.description':
      'Get the current time. Use this before handling today, this month, days ago, or relative dates.',
    'aiChat.tool.getCurrentDateTime.title': 'Check current time',
    'aiChat.tool.inferUserInterests.description':
      'Estimate themes that may match your interests from saved trends.',
    'aiChat.tool.inferUserInterests.title': 'Infer interests',
    'aiChat.tool.listSavedUrls.description':
      'List currently saved tabs in order of saved time. page/pageSize/sortDirection are configurable.',
    'aiChat.tool.listSavedUrls.title': 'List saved tabs',
    'aiChat.tool.searchSavedUrls.description':
      'Search saved tabs by keyword. page/pageSize/sortDirection are configurable.',
    'aiChat.tool.searchSavedUrls.title': 'Search tabs by keyword',
    'aiChat.suggestion.favoriteContent':
      'What kinds of content do I save most often?',
    'aiChat.suggestion.recentTabs': 'Show me the tabs I added this month',
    'aiChat.suggestion.recommendation': 'Tell me what content I might like',
    'aiChat.systemPrompt.availableTools': 'Available tools',
    'aiChat.systemPrompt.availableToolsDescription':
      'Tool names and descriptions are listed here so you can easily include them in a system prompt.',
    'aiChat.systemPrompt.bodyLabel': 'System prompt body',
    'aiChat.systemPrompt.copySuffix': ' copy',
    'aiChat.systemPrompt.defaultName': 'Default',
    'aiChat.systemPrompt.defaultTemplate':
      'You are an assistant that answers only based on the tabs saved in TABBIN.\nDo not infer facts that are not present in the saved data.\nIf an answer includes inference, explicitly say "Based on your saved trends".\nWhen asked about months or periods, answer with as specific year and month as possible.\nIf asked what tabs are currently saved, first check with listSavedUrls.\nOnly say there are no saved tabs when the tool results or saved-tab summary are empty.\nAnswer concisely in English.',
    'aiChat.systemPrompt.duplicate': 'Duplicate',
    'aiChat.systemPrompt.empty': 'No system prompts available',
    'aiChat.systemPrompt.inUse': 'In use',
    'aiChat.systemPrompt.listTitle': 'System prompts',
    'aiChat.systemPrompt.managerTitle': 'System prompt manager',
    'aiChat.systemPrompt.nameLabel': 'Prompt name',
    'aiChat.systemPrompt.new': 'New prompt',
    'aiChat.systemPrompt.openSettings': 'Open system prompt settings',
    'aiChat.systemPrompt.placeholder': 'Prompt',
    'aiChat.systemPrompt.save': 'Save',
    'aiChat.systemPrompt.saveError': 'Could not save the system prompts',
    'aiChat.systemPrompt.saving': 'Saving...',
    'aiChat.systemPrompt.select': 'Select a system prompt',
    'aiChat.systemPrompt.settingsTooltip': 'System prompt settings',
    'aiChat.systemPrompt.switchSaveError':
      'Could not save the system prompt change',
    'aiChat.systemPrompt.validation.duplicate':
      'You cannot save prompts with the same name.',
    'aiChat.systemPrompt.validation.empty':
      'Enter both a prompt name and system prompt body.',
    'aiChat.systemPrompt.validation.maxLength':
      'Prompt names must be within {{count}} characters.',
    'aiChat.toolsRun': 'Tools run',
    'analytics.aiSummary': 'This is an AI-generated analytics chart.',
    'analytics.canvasTitle': 'Analytics canvas',
    'analytics.chart.dailySavedTrend': 'Daily saved trend',
    'analytics.chart.descriptionAggregated':
      '{{count}} saved records aggregated',
    'analytics.chart.descriptionCompareMode':
      '{{count}} saved records compared by mode',
    'analytics.chart.monthlySavedTrend': 'Monthly saved trend',
    'analytics.chart.savedCountByDomain': 'Saved count by domain',
    'analytics.chart.savedCountByParentCategory':
      'Saved count by parent category',
    'analytics.chart.savedCountByProject': 'Saved count by project',
    'analytics.chart.savedCountByProjectCategory':
      'Saved count by project category',
    'analytics.chart.savedCountBySubCategory': 'Saved count by sub category',
    'analytics.chart.seriesCustomMode': 'Custom mode',
    'analytics.chart.seriesDomainMode': 'Domain mode',
    'analytics.chart.seriesSavedCount': 'Saved count',
    'analytics.chart.seriesShare': 'Share',
    'analytics.chart.weeklySavedTrend': 'Weekly saved trend',
    'analytics.chartType.area': 'Area chart',
    'analytics.chartType.bar': 'Bar chart',
    'analytics.chartType.line': 'Line chart',
    'analytics.chartType.pie': 'Pie chart',
    'analytics.chartType.radar': 'Radar',
    'analytics.chartTypeLabel': 'Chart type',
    'analytics.conditionsTitle': 'Analysis conditions',
    'analytics.deleteAllAria': 'Delete all tabs in this item',
    'analytics.deleteTabsError': 'Failed to delete the tabs',
    'analytics.deleteViewAria': 'Delete {{name}}',
    'analytics.drilldownCount': '{{count}} items',
    'analytics.drilldownEmpty': 'No matching saved tabs were found.',
    'analytics.drilldownTitle': 'Saved tabs in this item',
    'analytics.groupBy.domain': 'Domain',
    'analytics.groupBy.parentCategory': 'Parent category',
    'analytics.groupBy.project': 'Project',
    'analytics.groupBy.subCategory': 'Sub category',
    'analytics.groupBy.timeRecent': 'Time series (recent)',
    'analytics.groupBy.timeTop': 'Time series (top counts)',
    'analytics.groupByLabel': 'Group by',
    'analytics.limitLabel': 'Top count',
    'analytics.open': 'Open',
    'analytics.openAllAria': 'Open all tabs in this item',
    'analytics.openAria': 'Open {{title}}',
    'analytics.saveView': 'Save',
    'analytics.savedViewsDescription':
      'Reuse saved analytics conditions from here.',
    'analytics.savedViewsEmpty': 'No saved analytics views yet.',
    'analytics.savedViewsTitle': 'Saved views',
    'analytics.summary': 'Created {{title}} from {{count}} saved records.',
    'analytics.uncategorized': 'Uncategorized',
    'analytics.viewName': 'View name',
    'analytics.viewNameDuplicate': 'A view with this name already exists',
    'analytics.viewNameRequired': 'Enter a view name',
    'background.aiChat.intent.interests': 'Infer saved-tab trends',
    'background.aiChat.intent.list': 'Review the list of saved tabs',
    'background.aiChat.intent.search': 'Search and summarize saved tabs',
    'background.aiChat.intent.time': 'Check timing and saved periods',
    'background.aiChat.none': 'None',
    'background.aiChat.ollama.macTitle': 'If you use Ollama.app on macOS:',
    'background.aiChat.ollama.setOriginsValue':
      'Set OLLAMA_ORIGINS to {{value}}.',
    'background.aiChat.reasoning.intentLabel': 'Question understanding:',
    'background.aiChat.reasoning.policyLabel': 'Answering approach:',
    'background.aiChat.reasoning.policyWithTools':
      'Answered using tool results as evidence from your saved tabs.',
    'background.aiChat.reasoning.policyWithoutTools':
      'Answered directly from the saved-tab summary context.',
    'background.aiChat.reasoning.referenceLabel': 'Reference scope:',
    'background.aiChat.reasoning.toolsLabel': 'Tools used:',
    'background.aiChat.recentTabs': 'Recently saved tabs:',
    'background.aiChat.savedTabsCount': 'Saved tabs: {{count}}',
    'background.aiChat.toolSummary.callReviewed':
      'Reviewed the tool call details.',
    'background.aiChat.toolSummary.fetchedCount': 'Reviewed {{count}} results.',
    'background.aiChat.toolSummary.fetchedWithTotal':
      'Retrieved {{count}} items. Total items: {{total}}.',
    'background.aiChat.toolSummary.resultRetrieved': 'Retrieved the result.',
    'background.contextMenu.openSavedTabs': 'Open saved tabs',
    'background.contextMenu.saveAllTabs': 'Save all tabs in this window',
    'background.contextMenu.saveAllWindowsTabs':
      'Save all tabs across all windows',
    'background.contextMenu.saveCurrentTab': 'Save current tab',
    'background.contextMenu.saveSameDomainTabs':
      'Save all tabs from the current domain',
    'background.saveTabs.allWindowsSaved':
      'Saved {{count}} tabs across all windows.',
    'background.saveTabs.currentTabSaved': 'Saved the current tab.',
    'background.saveTabs.notificationTitle': 'Tab saved',
    'background.saveTabs.sameDomainSaved':
      'Saved {{count}} tabs from {{domain}}.',
    'background.saveTabs.windowTabsSaved':
      'Saved {{count}} tabs. Closing the tabs now.',
    'changelog.heading': 'Release Notes',
    'common.cache': 'Cache',
    'common.cancel': 'Cancel',
    'common.no': 'No',
    'common.yes': 'Yes',
    'common.close': 'Close',
    'common.confirm': 'Confirm',
    'common.console': 'Console',
    'common.copy': 'Copy',
    'common.delete': 'Delete',
    'common.enterUrl': 'Enter URL...',
    'common.input': 'Input',
    'common.instructions': 'Instructions',
    'common.loading': 'Loading...',
    'common.loadingLabel': 'Loading',
    'common.manage': 'Manage',
    'common.modelContextUsage': 'Model context usage',
    'common.next': 'Next',
    'common.nextBranch': 'Next branch',
    'common.nextSlide': 'Next slide',
    'common.noConsoleOutput': 'No console output',
    'common.noDescription': 'No description',
    'common.noStackFrames': 'No stack frames',
    'common.open': 'Open',
    'common.output': 'Output',
    'common.parameters': 'Parameters',
    'common.pausePreview': 'Pause preview',
    'common.playPreview': 'Play preview',
    'common.preview': 'Preview',
    'common.previous': 'Previous',
    'common.previousBranch': 'Previous branch',
    'common.previousSlide': 'Previous slide',
    'common.reasoning': 'Reasoning',
    'common.requestBody': 'Request Body',
    'common.required': 'required',
    'common.reset': 'Reset',
    'common.response': 'Response',
    'common.result': 'Result',
    'common.searchMicrophones': 'Search microphones...',
    'common.stop': 'Stop',
    'common.submit': 'Submit',
    'common.thinking': 'Thinking...',
    'common.thoughtForFewSeconds': 'Thought for a few seconds',
    'common.thoughtForSeconds': 'Thought for {{count}} seconds',
    'common.togglePlan': 'Toggle plan',
    'common.toggleSidebar': 'Toggle Sidebar',
    'common.toggleValueVisibility': 'Toggle value visibility',
    'common.tools': 'Tools',
    'common.totalCost': 'Total cost',
    'common.undo': 'Undo',
    'common.uploadFiles': 'Upload files',
    'common.usedSources.one': 'Used {{count}} source',
    'common.usedSources.other': 'Used {{count}} sources',
    'htmlTitle.aiChat': 'AI Chat - TABBIN',
    'htmlTitle.analytics': 'Analytics - TABBIN',
    'htmlTitle.app': 'TABBIN',
    'htmlTitle.changelog': 'Release Notes - TABBIN',
    'htmlTitle.options': 'Options - TABBIN',
    'htmlTitle.periodicExecution': 'Scheduled tasks - TABBIN',
    'htmlTitle.savedTabs': 'Saved tabs - TABBIN',
    'language.english': 'English',
    'language.japanese': 'Japanese',
    'language.label': 'Display language',
    'language.system': 'System',
    'options.autoDelete.14days': '14 days',
    'options.autoDelete.180days': '6 months',
    'options.autoDelete.1day': '1 day',
    'options.autoDelete.1hour': '1 hour',
    'options.autoDelete.30days': '30 days',
    'options.autoDelete.365days': '1 year',
    'options.autoDelete.7days': '7 days',
    'options.autoDelete.allWindows': 'Open all tabs including other windows',
    'options.autoDelete.allWindowsDescription':
      'When enabled, the "Open all" button opens tabs in a new window.',
    'options.autoDelete.apply': 'Apply',
    'options.autoDelete.background': 'Open in background tabs',
    'options.autoDelete.confirmDeleteAll': 'Confirm before deleting all',
    'options.autoDelete.confirmDeleteAllDescription':
      'When enabled, a confirmation dialog appears before deleting all tabs in a category.',
    'options.autoDelete.confirmDeleteEach': 'Confirm before deleting tabs',
    'options.autoDelete.confirmDeleteEachDescription':
      'When enabled, a confirmation dialog appears before deleting a tab.',
    'options.autoDelete.confirmMessage':
      'Set auto-delete period to "{{periodLabel}}".\n\n{{warningMessage}}\n\nContinue?',
    'options.autoDelete.description':
      'Saved tabs are deleted automatically after the selected period.',
    'options.autoDelete.disabled': 'Disabled auto delete',
    'options.autoDelete.enabled': 'Set auto-delete period to "{{periodLabel}}"',
    'options.autoDelete.excludePinned': 'Exclude pinned tabs',
    'options.autoDelete.excludePinnedDescription':
      'When enabled, pinned tabs are excluded from saved tabs.',
    'options.autoDelete.externalDrop':
      'Delete automatically after dropping into another browser',
    'options.autoDelete.externalDropDescription':
      'When enabled, saved tabs are removed after you drag and drop them into another browser.',
    'options.autoDelete.openAfter':
      'Delete automatically after opening a saved tab',
    'options.autoDelete.openAfterDescription':
      'When enabled, a saved tab is removed from the list after you open it. When disabled, the tab stays in the list.',
    'options.autoDelete.periodDescription':
      'Saved tabs are deleted automatically when they exceed the selected period. Applying the setting deletes tabs that have already expired.',
    'options.autoDelete.periodLabel': 'Auto-delete period for tabs',
    'options.autoDelete.saveError': 'Failed to save settings',
    'options.autoDelete.saveInBackground': 'Open in background tabs',
    'options.autoDelete.saveInBackgroundDescription':
      'When enabled, saved tabs open in the background.',
    'options.autoDelete.savedTime': 'Show saved time',
    'options.autoDelete.savedTimeDescription':
      'When enabled, the saved date is shown in the saved tabs list.',
    'options.autoDelete.selectPlaceholder': 'Select an auto-delete period',
    'options.autoDelete.shorterWarning':
      'Warning: This shortens the current period, so some tabs may be deleted immediately!',
    'options.autoDelete.title': 'Auto delete',
    'options.autoDelete.validateWarning':
      'Note: Tabs older than the selected period may be deleted immediately.',
    'options.autoDelete.zero': 'Do not auto delete',
    'options.backupRestore': 'Backup & Restore',
    'options.behavior.description':
      'When enabled, tabs are opened in a new window.',
    'options.behaviorSettings': 'Tab behavior',
    'options.categories.addError': 'Could not add the category.',
    'options.categories.duplicate':
      'A category with the same name already exists.',
    'options.categories.validation.maxLength':
      'Category names must be 25 characters or fewer',
    'options.clickBehavior.allWindows': 'Save all tabs including other windows',
    'options.clickBehavior.currentTab': 'Save current tab',
    'options.clickBehavior.sameDomain': 'Save all tabs from the current domain',
    'options.clickBehavior.windowTabs': 'Save all tabs in the window',
    'options.clickBehaviorLabel': 'Click action',
    'options.clickBehaviorPlaceholder': 'Select click action',
    'options.color.accent': 'Accent background',
    'options.color.accentForeground': 'Accent text',
    'options.color.background': 'Background',
    'options.color.border': 'Border',
    'options.color.card': 'Card background',
    'options.color.cardForeground': 'Card text',
    'options.color.chart1': 'Chart 1',
    'options.color.chart2': 'Chart 2',
    'options.color.chart3': 'Chart 3',
    'options.color.chart4': 'Chart 4',
    'options.color.chart5': 'Chart 5',
    'options.color.destructive': 'Destructive background',
    'options.color.destructiveForeground': 'Destructive text',
    'options.color.foreground': 'Text',
    'options.color.hexPlaceholder': 'e.g. #FF5733, #3366CC',
    'options.color.input': 'Input background',
    'options.color.muted': 'Muted background',
    'options.color.mutedForeground': 'Sub text',
    'options.color.popover': 'Popover',
    'options.color.popoverForeground': 'Popover text',
    'options.color.primary': 'Primary background',
    'options.color.primaryForeground': 'Primary text',
    'options.color.resetError': 'Failed to reset color settings',
    'options.color.resetSuccess': 'Reset color settings',
    'options.color.ring': 'Ring',
    'options.color.secondary': 'Secondary background',
    'options.color.secondaryForeground': 'Secondary text',
    'options.color.sidebar': 'Sidebar background',
    'options.color.sidebarAccent': 'Sidebar accent background',
    'options.color.sidebarAccentForeground': 'Sidebar accent text',
    'options.color.sidebarBorder': 'Sidebar border',
    'options.color.sidebarForeground': 'Sidebar text',
    'options.color.sidebarPrimary': 'Sidebar primary background',
    'options.color.sidebarPrimaryForeground': 'Sidebar primary text',
    'options.color.sidebarRing': 'Sidebar ring',
    'options.contact': 'Contact',
    'options.contactDescription':
      'Google Forms is used. A Google account is required because image uploads are enabled.',
    'options.excludePatterns.add': 'Add',
    'options.excludePatterns.empty': 'No exclude patterns',
    'options.excludePatterns.help':
      'Matching URLs are not saved and tabs are not closed.',
    'options.excludePatterns.label': 'URLs that should not be saved or closed',
    'options.excludePatterns.placeholder': 'e.g. chrome-extension://',
    'options.excludePatterns.removeAria': 'Remove exclude pattern {{pattern}}',
    'options.excludePatterns.title': 'Exclude settings',
    'options.fontSize.currentValue': 'Current value: {{value}}%',
    'options.fontSize.description': 'Adjust the font size used.',
    'options.fontSize.inputLabel': 'Font size percentage',
    'options.fontSize.rangeLabel': 'Font size slider',
    'options.importExport.back': 'Back',
    'options.importExport.cancel': 'Cancel',
    'options.importExport.confirmImport': 'Confirm Import',
    'options.importExport.dialogDescription':
      'Restore settings and tab data from a previously exported backup file.',
    'options.importExport.dialogTitle': 'Import settings and tab data',
    'options.importExport.dropActive': 'Drop the file here',
    'options.importExport.dropIdle': 'Drag and drop a JSON file',
    'options.importExport.export': 'Export settings and tab data',
    'options.importExport.exportError':
      'An error occurred while exporting settings and tab data',
    'options.importExport.exportSuccess':
      'Exported settings and tab data successfully',
    'options.importExport.exporting': 'Exporting...',
    'options.importExport.fileTooLarge':
      'The file is too large. Maximum size is {{maxSize}}.',
    'options.importExport.import': 'Import settings and tab data',
    'options.importExport.importError':
      'Failed to import settings and tab data',
    'options.importExport.importFormatError':
      'The imported data format is invalid',
    'options.importExport.importing': 'Importing...',
    'options.importExport.invalidJson': 'Please select a JSON file',
    'options.importExport.merge': 'Merge with existing data (recommended)',
    'options.importExport.mergeDescription':
      'Keep existing data and add or update new data.',
    'options.importExport.mergeLabel': 'Note',
    'options.importExport.mergeSuccess':
      'Merged data (added {{categories}} categories and {{domains}} domains){{unresolved}}',
    'options.importExport.mergeWarning':
      'When merging, data with the same ID is updated.',
    'options.importExport.placeholderUrlTitle':
      'Recovered data (missing original URL)',
    'options.importExport.previewAiChat': 'AI Chat History: {{hasAiChat}}',
    'options.importExport.previewAnalytics':
      'Analytics Views: {{hasAnalytics}}',
    'options.importExport.previewCategoriesLabel': 'Categories',
    'options.importExport.previewDescription':
      'Review the data before importing.',
    'options.importExport.previewDomainsLabel': 'Domains',
    'options.importExport.previewProjectsLabel': 'Projects',
    'options.importExport.previewAiChatLabel': 'AI Chat History',
    'options.importExport.previewTimestampLabel': 'Backup Date',
    'options.importExport.previewTitle': 'Import Preview',
    'options.importExport.previewVersionLabel': 'Backup Version',
    'options.importExport.readError': 'Failed to read the file',
    'options.importExport.replaceDescription':
      'Importing will overwrite all current settings and tab data. This cannot be undone.',
    'options.importExport.replaceLabel': 'Warning',
    'options.importExport.replaceSuccess':
      'Replaced settings and tab data (version: {{version}}, created at: {{timestamp}}){{unresolved}}',
    'options.importExport.replaceWarning':
      'Importing will overwrite all current settings and tab data. This cannot be undone.',
    'options.importExport.scopeDescription':
      'Backups include saved URLs, categories, custom projects, analytics data, AI chat history, and AI settings.',
    'options.importExport.scopeTitle': 'Backup scope',
    'options.importExport.selectFile': 'Click to choose a file',
    'options.importExport.unresolvedWarning':
      ' (Warning: {{count}} domains were missing URL records, so {{placeholderCount}} replacement URLs were generated)',
    'options.importExport.uploadTitle': 'Import settings and tab data',
    'options.previewColorCustomization': '(preview) Color customization',
    'options.previewColorCustomizationReset': 'Reset',
    'options.previewFontSizeCustomization': '(preview) Font size',
    'options.releaseNotes': 'Release Notes',
    'options.showSavedTime': 'Show saved time',
    'options.showSavedTimeDescription':
      'When enabled, the saved date is shown in the saved tabs list.',
    'options.title': 'Options',
    'periodicExecution.title': 'Scheduled tasks',
    'savedTabs.addProject': 'Add project',
    'savedTabs.category.deleteAllItemName': 'domains in this category',
    'savedTabs.category.deleteAllWarning':
      'Delete all domains in this category. This action cannot be undone.',
    'savedTabs.categoryCardAria': 'Category: {{name}}',
    'savedTabs.categoryGroupAria': '{{name}} category group',
    'savedTabs.categoryManagement.addDomainLabel': 'Add a new domain',
    'savedTabs.categoryManagement.addDomainPlaceholder':
      'Select a domain to add to the category',
    'savedTabs.categoryManagement.addDomainTooltip':
      'Add the selected domain to this parent category',
    'savedTabs.categoryManagement.deleteAction': 'Delete parent category',
    'savedTabs.categoryManagement.deleteConfirmDescription':
      'Delete the parent category "{{name}}"? This action cannot be undone.',
    'savedTabs.categoryManagement.deleteConfirmDomains':
      'This category is linked to {{count}} domains. Deleting it also removes those associations.',
    'savedTabs.categoryManagement.nameLabel': 'Parent category name',
    'savedTabs.categoryManagement.noAvailableDomains':
      'There are no domains you can add.',
    'savedTabs.categoryManagement.registeredDomainsEmpty':
      'No registered domains',
    'savedTabs.categoryManagement.registeredDomainsLabel': 'Registered domains',
    'savedTabs.categoryManagement.removeDomainAria': 'Delete domain',
    'savedTabs.categoryManagement.renameAction': 'Rename parent category',
    'savedTabs.categoryManagement.renameError':
      'Failed to rename the parent category',
    'savedTabs.categoryManagement.renamePlaceholder':
      'e.g. Business tools, Tech information',
    'savedTabs.categoryManagement.renamePrompt':
      'Enter a new parent category name for "{{name}}"',
    'savedTabs.categoryManagement.renamed':
      'Renamed the parent category from "{{before}}" to "{{after}}"',
    'savedTabs.categoryManagement.reorderCanceled':
      'Canceled parent category reordering',
    'savedTabs.categoryManagement.reorderUpdateError':
      'Failed to update the parent category order',
    'savedTabs.categoryManagement.reorderUpdated':
      'Updated the parent category order',
    'savedTabs.categoryManagement.title': 'Manage parent category "{{name}}"',
    'savedTabs.categoryModal.allCategorized':
      'All domains are already categorized',
    'savedTabs.categoryModal.belongsToCategory': 'Assigned category: {{name}}',
    'savedTabs.categoryModal.createError': 'Could not create the category',
    'savedTabs.categoryModal.createLabel': 'New parent category',
    'savedTabs.categoryModal.created': 'Created the category',
    'savedTabs.categoryModal.currentCategory':
      'Currently selected category: {{name}}',
    'savedTabs.categoryModal.deleteConfirmDescription':
      'Delete the parent category "{{name}}"? This action cannot be undone.',
    'savedTabs.categoryModal.deleteConfirmDomains':
      '{{count}} domains are assigned to this category. Deleting it also removes those assignments.',
    'savedTabs.categoryModal.deleteError': 'Could not delete the category',
    'savedTabs.categoryModal.deleteSelected':
      'Delete the selected parent category',
    'savedTabs.categoryModal.deleteSelectionMissing':
      'No category is selected for deletion',
    'savedTabs.categoryModal.deleted': 'Deleted "{{name}}"',
    'savedTabs.categoryModal.domainAssigned':
      'Added domain {{domain}} to "{{categoryName}}"',
    'savedTabs.categoryModal.domainRemoved':
      'Removed domain {{domain}} from "{{categoryName}}"',
    'savedTabs.categoryModal.domainsLabel': 'Domain selection',
    'savedTabs.categoryModal.domainsLabelUncategorized':
      'Domain selection (showing only unassigned domains)',
    'savedTabs.categoryModal.duplicateName':
      'A category named "{{name}}" already exists',
    'savedTabs.categoryModal.invalid': 'The category name is invalid',
    'savedTabs.categoryModal.loadError': 'Could not load the categories',
    'savedTabs.categoryModal.noDomains': 'There are no saved domains',
    'savedTabs.categoryModal.placeholder': 'e.g. Work, Hobby, Learning',
    'savedTabs.categoryModal.selectLabel': 'Select parent category',
    'savedTabs.categoryModal.selectPlaceholder':
      'Select a created category to manage domains',
    'savedTabs.categoryModal.title': 'Manage parent categories',
    'savedTabs.categoryModal.toggleError':
      'Could not update the category assignment',
    'savedTabs.categoryModal.uncategorized': 'Uncategorized',
    'savedTabs.categoryModal.uncategorizedAria': 'Uncategorized domain',
    'savedTabs.categoryModal.uncategorizedDirectEditError':
      'You cannot edit the uncategorized view directly. Select a category first.',
    'savedTabs.categoryModal.validation.empty':
      'Enter a new parent category name',
    'savedTabs.categoryModal.validation.maxLength':
      'Parent category names must be within 25 characters.',
    'savedTabs.accessibility.nounAction': '{{action}} for "{{target}}"',
    'savedTabs.accessibility.objectAction': '{{action}} "{{target}}"',
    'savedTabs.accessibility.sortState':
      'Sort order for "{{target}}": {{sort}}',
    'savedTabs.collapse': 'Collapse',
    'savedTabs.customProjects.createAction': 'Create',
    'savedTabs.customProjects.createDialogTitle': 'Create a new project',
    'savedTabs.customProjects.createPlaceholder':
      'e.g. Website redesign, Library research',
    'savedTabs.customProjects.emptyDescription':
      'No projects are available to display',
    'savedTabs.customProjects.emptyHint':
      'Create a parent category to show it as a project',
    'savedTabs.customProjects.emptyTitle': 'No projects',
    'savedTabs.customProjects.nameLabel': 'Project name *',
    'savedTabs.deleteAll': 'Delete all',
    'savedTabs.deleteAllConfirmDescription':
      'Delete all tabs in "{{categoryName}}". This action cannot be undone.',
    'savedTabs.deleteAllConfirmDescriptionWithCount':
      'Delete all {{count}} tabs in "{{categoryName}}". This action cannot be undone.',
    'savedTabs.deleteError': 'Failed to delete',
    'savedTabs.deleteAllConfirmTitle': 'Delete all tabs?',
    'savedTabs.deleteAllDefaultWarning':
      'Delete all items. This action cannot be undone.',
    'savedTabs.deleteAllTabs': 'Delete all tabs',
    'savedTabs.deleteAllTitle': 'Delete all {{itemName}}?',
    'savedTabs.deletingAll': 'Deleting...',
    'savedTabs.domain.deleteAllWarning':
      'Delete all tabs in this domain. This action cannot be undone.',
    'savedTabs.domain.emptyManageCategoriesHint':
      'To add categories, use category management.',
    'savedTabs.domain.emptyNoTabs': 'This domain has no tabs',
    'savedTabs.domainOrder.canceled': 'Canceled reordering',
    'savedTabs.domainOrder.updateError': 'Failed to update the domain order',
    'savedTabs.domainOrder.updated': 'Updated the domain order',
    'savedTabs.domainsCount': 'Domains:{{count}}',
    'savedTabs.emptyDescription':
      'Right-click a tab to save it, or click the extension icon.',
    'savedTabs.emptyTitle': 'No saved tabs',
    'savedTabs.expand': 'Expand',
    'savedTabs.keywordModal.title': 'Manage subcategories for "{{domain}}"',
    'savedTabs.keywords.activeCategoryLabel':
      'Keywords for the "{{name}}" subcategory',
    'savedTabs.keywords.addAria': 'Add keyword',
    'savedTabs.keywords.autoAssignHint':
      'If the title contains a keyword, it is automatically assigned to this subcategory.',
    'savedTabs.keywords.deleteAria': 'Delete keyword',
    'savedTabs.keywords.deleteAriaWithName': 'Delete keyword {{name}}',
    'savedTabs.keywords.duplicate': 'This keyword has already been added',
    'savedTabs.keywords.empty': 'No keywords',
    'savedTabs.keywords.placeholder': 'e.g. Tech, New features, Tutorial',
    'savedTabs.manageParentCategories': 'Manage parent categories',
    'savedTabs.manageSubcategories': 'Manage subcategories',
    'savedTabs.newProjectPlaceholder': 'e.g. Work, Research, Read later',
    'savedTabs.newProjectTitle': 'Add a new project',
    'savedTabs.openAll': 'Open all',
    'savedTabs.openAllConfirmDescription':
      'You are about to open {{count}} or more tabs. Continue?',
    'savedTabs.openAllConfirmDescriptionWithName':
      'Open {{count}} tabs for "{{name}}". Continue?',
    'savedTabs.openAllConfirmTitle': 'Open all tabs?',
    'savedTabs.openAllTabs': 'Open all tabs',
    'savedTabs.project.deleteAllItemName': 'tabs in this project',
    'savedTabs.project.deleteAllWarning':
      'Delete all tabs in this project. This action cannot be undone.',
    'savedTabs.project.emptyDescription':
      'Save tabs from the extension icon or add them from the context menu.',
    'savedTabs.project.emptyDragHint':
      'You can also drag and drop tabs from other projects.',
    'savedTabs.project.emptyTitle': 'This project has no tabs.',
    'savedTabs.project.loadingTabs': 'Loading tabs...',
    'savedTabs.projectAdded': 'Added project "{{name}}"',
    'savedTabs.projectCard.dropToUncategorized':
      'Drop tabs here to move them to uncategorized',
    'savedTabs.projectCard.uncategorizedArea': 'Uncategorized tabs area',
    'savedTabs.projectCard.uncategorizedTitle': 'Uncategorized tabs',
    'savedTabs.projectCategory.added': 'Added category "{{name}}"',
    'savedTabs.projectCategory.deleteAction': 'Delete category',
    'savedTabs.projectCategory.deleteAllWarning':
      'Delete all tabs in "{{categoryName}}". This action cannot be undone.',
    'savedTabs.projectCategory.deleteWarning':
      'Deleting this category makes all tabs in it uncategorized.',
    'savedTabs.projectCategory.deleted': 'Deleted category "{{name}}"',
    'savedTabs.projectCategory.manage': 'Manage category',
    'savedTabs.projectCategory.orderUpdateError':
      'Failed to update the category order',
    'savedTabs.projectCategory.orderUpdated': 'Updated the category order',
    'savedTabs.projectCategory.renameDescription':
      'You can edit the category "{{name}}".',
    'savedTabs.projectCategory.renameLabel': 'Category name',
    'savedTabs.projectCategory.renamePlaceholder':
      'e.g. Development resources, Reference sites',
    'savedTabs.projectCategory.renamed': 'Renamed the category',
    'savedTabs.projectCategory.required': 'Enter a category name',
    'savedTabs.projectCategory.title': 'Manage category',
    'savedTabs.projectManagement.autoAssignDescription':
      'Applies to newly saved tabs.',
    'savedTabs.projectManagement.autoAssignLabel': 'Auto-assignment keywords',
    'savedTabs.projectManagement.deleteAction': 'Delete project',
    'savedTabs.projectManagement.deleteConfirmDescription':
      'Delete the project "{{name}}"? This action cannot be undone.',
    'savedTabs.projectManagement.deleteConfirmHint':
      'All tab associations in this project will also be removed.',
    'savedTabs.projectManagement.keywordDomainDescription':
      'If the domain contains a keyword, assign it to this project.',
    'savedTabs.projectManagement.keywordDomainLabel': 'Domain keywords',
    'savedTabs.projectManagement.keywordDomainPlaceholder': 'e.g. github.com',
    'savedTabs.projectManagement.keywordTitleDescription':
      'If the title contains a keyword, assign it to this project.',
    'savedTabs.projectManagement.keywordTitleLabel': 'Title keywords',
    'savedTabs.projectManagement.keywordTitlePlaceholder': 'e.g. release',
    'savedTabs.projectManagement.keywordUrlDescription':
      'If the URL contains a keyword, assign it to this project.',
    'savedTabs.projectManagement.keywordUrlLabel': 'URL keywords',
    'savedTabs.projectManagement.keywordUrlPlaceholder': 'e.g. docs',
    'savedTabs.projectManagement.nameLabel': 'Project name',
    'savedTabs.projectManagement.renameAction': 'Rename',
    'savedTabs.projectManagement.renameError': 'Failed to rename the project',
    'savedTabs.projectManagement.renamePlaceholder': 'e.g. Website redesign',
    'savedTabs.projectManagement.renamePrompt': 'Enter a new project name',
    'savedTabs.projectManagement.renamed': 'Renamed the project',
    'savedTabs.projectManagement.title': 'Settings for "{{name}}"',
    'savedTabs.projectNameDuplicate':
      'You cannot add a project with the same name',
    'savedTabs.projectNameMaxLength':
      'Project names must be 50 characters or fewer',
    'savedTabs.projectNameRequired': 'Enter a project name',
    'savedTabs.projects.createError': 'Failed to create the project',
    'savedTabs.projects.deleteError': 'Failed to delete the project',
    'savedTabs.projects.deleted': 'Deleted project "{{name}}"',
    'savedTabs.projects.duplicateName':
      'The project name "{{name}}" is already in use',
    'savedTabs.projects.keywordsUpdateError':
      'Failed to update keyword settings',
    'savedTabs.projects.keywordsUpdated': 'Updated keyword settings',
    'savedTabs.projects.orderUpdateError': 'Failed to update the project order',
    'savedTabs.projects.orderUpdated': 'Updated the project order',
    'savedTabs.projectsCount': 'Projects:{{count}}',
    'savedTabs.reorder.cancel': 'Cancel',
    'savedTabs.reorder.cancelAria': 'Cancel parent category reordering',
    'savedTabs.reorder.confirm': 'Confirm',
    'savedTabs.reorder.confirmAria': 'Confirm parent category reordering',
    'savedTabs.reorder.disabled': 'Reorder mode active',
    'savedTabs.scrollControls.bottom': 'Scroll to bottom',
    'savedTabs.scrollControls.nextChild': 'Scroll to next child category',
    'savedTabs.scrollControls.nextDomain': 'Scroll to next domain',
    'savedTabs.scrollControls.nextParent': 'Scroll to next parent category',
    'savedTabs.scrollControls.nextProject': 'Scroll to next project',
    'savedTabs.scrollControls.previousChild':
      'Scroll to previous child category',
    'savedTabs.scrollControls.previousDomain': 'Scroll to previous domain',
    'savedTabs.scrollControls.previousParent':
      'Scroll to previous parent category',
    'savedTabs.scrollControls.previousProject': 'Scroll to previous project',
    'savedTabs.scrollControls.top': 'Scroll to top',
    'savedTabs.searchClear': 'Clear search',
    'savedTabs.searchPlaceholder': 'Search',
    'savedTabs.sort.asc': 'Saved date ascending',
    'savedTabs.sort.default': 'Default',
    'savedTabs.sort.desc': 'Saved date descending',
    'savedTabs.sortableCategory.bulkDeleteDescription':
      'Delete all tabs in "{{name}}"?',
    'savedTabs.sortableCategory.bulkDeleteTitle': 'Delete tabs',
    'savedTabs.sortableCategory.bulkOpenTitle': 'Open multiple tabs',
    'savedTabs.sortableCategory.tabCountLabel': 'Tabs',
    'savedTabs.subCategory.addPlaceholder': 'e.g. News, Blog, Column',
    'savedTabs.subCategory.addTitle': 'Add a new subcategory',
    'savedTabs.subCategory.createError': 'Failed to add the category',
    'savedTabs.subCategory.created': 'Added a new category "{{name}}"',
    'savedTabs.subCategory.deleteAria': 'Delete category {{name}}',
    'savedTabs.subCategory.deleteConfirmHint':
      'All tabs in this subcategory will become uncategorized.',
    'savedTabs.subCategory.deleteConfirmTitle':
      'Delete the "{{name}}" subcategory?',
    'savedTabs.subCategory.deleteError': 'Failed to delete the category',
    'savedTabs.subCategory.deleteSelected': 'Delete the selected subcategory',
    'savedTabs.subCategory.deleted': 'Deleted category "{{name}}"',
    'savedTabs.subCategory.duplicateName': 'This category name already exists',
    'savedTabs.subCategory.empty': 'This domain has no subcategories.',
    'savedTabs.subCategory.keywordManagerTitle': 'Manage subcategory keywords',
    'savedTabs.subCategory.rename': 'Rename subcategory',
    'savedTabs.subCategory.renameError': 'Failed to rename the category',
    'savedTabs.subCategory.renameHint':
      'Press Enter to save, or Escape to cancel',
    'savedTabs.subCategory.renamePrompt':
      'Enter a new name for "{{name}}". After typing, blur or press Enter to save. Press Escape to cancel.',
    'savedTabs.subCategory.renamed':
      'Renamed the category from "{{before}}" to "{{after}}"',
    'savedTabs.subCategory.reorderCanceled': 'Canceled subcategory reordering',
    'savedTabs.subCategory.reorderUpdateError':
      'Failed to update the subcategory order',
    'savedTabs.subCategory.reorderUpdated': 'Updated the subcategory order',
    'savedTabs.subCategory.selectLabel': 'Select subcategory',
    'savedTabs.subCategory.selectPlaceholder': 'Select a subcategory to manage',
    'savedTabs.subCategory.titleKeywords': 'Keywords for "{{name}}"',
    'savedTabs.tab.addError': 'Failed to add the tab',
    'savedTabs.tab.added': 'Added the tab',
    'savedTabs.tab.categoryClearedAlt': 'Cleared the tab category (Alt+click)',
    'savedTabs.tab.deleteError': 'Failed to delete the tab',
    'savedTabs.tab.deleted': 'Deleted the tab',
    'savedTabs.tab.moveBetweenProjectsError': 'Failed to move the tab',
    'savedTabs.tab.moveError': 'Failed to update the tab category',
    'savedTabs.tab.movedBetweenProjects': 'Moved the tab',
    'savedTabs.tab.movedToCategory': 'Moved the tab to "{{name}}"',
    'savedTabs.tab.movedToUncategorized': 'Moved the tab to uncategorized',
    'savedTabs.tab.orderUpdateError': 'Failed to update the tab order',
    'savedTabs.tab.orderUpdated': 'Updated the tab order',
    'savedTabs.tabCount': 'Tabs:{{count}}',
    'savedTabs.tabs.deletedCount': 'Deleted {{count}} tabs',
    'savedTabs.uncategorized': 'Uncategorized',
    'savedTabs.uncategorizedDomainsTitle': 'Uncategorized domains',
    'savedTabs.undo.deletedTabs':
      'You can restore {{count}} deleted tabs to saved data',
    'savedTabs.undo.removedAfterOpen':
      'Removed {{count}} opened tabs from saved data',
    'savedTabs.undo.restoreError': 'Could not restore saved data',
    'savedTabs.undo.restored': 'Restored saved data',
    'savedTabs.url.deleteAria': 'Delete tab',
    'savedTabs.url.deleteConfirmDescription':
      'Delete this tab. This action cannot be undone.',
    'savedTabs.url.deleteConfirmTitle': 'Delete this tab?',
    'savedTabs.viewMode.changeError': 'Failed to switch the view mode',
    'savedTabs.viewMode.custom': 'Custom mode',
    'savedTabs.viewMode.domain': 'Domain mode',
    'savedTabs.viewMode.placeholder': 'View mode',
    'savedTabs.viewMode.selectPlaceholder': 'Select domain or custom mode',
    'savedTabs.viewMode.tooltip': 'Switch view mode',
    'sidebar.analytics': 'Analytics',
    'sidebar.chat': 'Chat',
    'sidebar.collapse': 'Collapse sidebar',
    'sidebar.open': 'Open sidebar',
    'sidebar.options': 'Options',
    'sidebar.periodicExecution': 'Scheduled tasks',
    'sidebar.resize': 'Resize sidebar width',
    'sidebar.tabList': 'Saved tabs',
    'theme.dark': 'Dark mode',
    'theme.light': 'Light mode',
    'theme.system': 'System setting',
    'theme.toggle': 'Toggle theme',
    'theme.user': 'User setting',
    'tool.status.approvalRequested': 'Awaiting Approval',
    'tool.status.approvalResponded': 'Responded',
    'tool.status.inputAvailable': 'Running',
    'tool.status.inputStreaming': 'Pending',
    'tool.status.outputAvailable': 'Completed',
    'tool.status.outputDenied': 'Denied',
    'tool.status.outputError': 'Error',
  },
  ja: {
    'aiChat.attachments.add': 'ファイルを添付',
    'aiChat.attachments.contextTitle': '添付ファイルの内容:',
    'aiChat.attachments.defaultName': '添付ファイル',
    'aiChat.attachments.deleteAria': '{{filename}}を削除',
    'aiChat.attachments.maxFileSize':
      '添付ファイルは 2 MB 以下にしてください。',
    'aiChat.attachments.maxFiles':
      '添付できるファイルは最大 {{count}} 件です。',
    'aiChat.attachments.readError': '添付ファイルを読み取れませんでした。',
    'aiChat.attachments.unsupportedType':
      'テキストファイルと画像ファイルのみ対応しています。',
    'aiChat.attachments.unsupportedTypeDetail':
      '{{filename}} は現在の AI チャットで扱えません ({{mediaType}})。',
    'aiChat.chatTitle': 'チャット',
    'aiChat.close': 'AIチャットを閉じる',
    'aiChat.copy.assistant': 'AI:',
    'aiChat.copy.attachments': '添付:',
    'aiChat.copy.user': 'ユーザー:',
    'aiChat.copyConversation': '会話をコピー',
    'aiChat.copyConversationError': '会話をコピーできませんでした',
    'aiChat.copyConversationSuccess': '会話をコピーしました',
    'aiChat.dataScope':
      'AIの回答には、保存済みURL、タイトル、カテゴリ、プロジェクト、添付ファイル、選択中のローカル Ollama モデルを使用します。',
    'aiChat.deleteConversationAria': '{{title}}を削除',
    'aiChat.deleteDescription': '削除すると元に戻せません。',
    'aiChat.deleteTitle': 'この会話を削除しますか？',
    'aiChat.emptySelectModel': 'モデルを選択してください',
    'aiChat.history.empty': 'まだ保存された会話はありません',
    'aiChat.history.resumeHint': '保存済みの会話から再開できます',
    'aiChat.history.startPrompt': '新しい会話を始めてください',
    'aiChat.historyHint': 'クリックして続きを開く',
    'aiChat.historyTitle': '最近の会話',
    'aiChat.inputLabel': 'AIに質問する',
    'aiChat.inputPlaceholder': '保存済みタブについて質問してください',
    'aiChat.inputPlaceholderSelectModel':
      '左下で Ollama モデルを選択してください',
    'aiChat.interests.categoryBias':
      'カテゴリでは {{categories}} が目立ちます。',
    'aiChat.interests.categoryCountDescription': '最近保存したカテゴリ件数',
    'aiChat.interests.categoryCountTitle': 'ジャンル別の保存数',
    'aiChat.interests.categoryShareDescription': '最近保存したカテゴリ比率',
    'aiChat.interests.categoryWeak': 'カテゴリ偏りはまだ弱めです。',
    'aiChat.interests.domainCountDescription': '最近保存したドメイン件数',
    'aiChat.interests.noDataSummary':
      'まだ保存データがないため、興味の傾向は判断できません。',
    'aiChat.interests.savedCountLabel': '保存数',
    'aiChat.interests.summary':
      '保存傾向から見ると {{domainSummary}} 周辺への関心が強く、{{categorySummary}}',
    'aiChat.interests.tentativeSummary':
      '保存件数が少なく判断材料が限られるため、まだ強い傾向は読み取りにくいです。',
    'aiChat.interests.topCategoriesTitle': 'よく保存しているジャンル',
    'aiChat.interests.topDomainsTitle': 'よく保存しているドメイン',
    'aiChat.interruptedResponse':
      '前回の応答は途中で中断されました。必要であれば、もう一度送信してください。',
    'aiChat.intro': '保存済みタブを質問できます。',
    'aiChat.modelListLoadError': 'モデル一覧を取得できませんでした',
    'aiChat.modelSettingsSaveError': 'モデル設定を保存できませんでした',
    'aiChat.newConversation': '新しい会話',
    'aiChat.ollama.checkCommand':
      '確認コマンドをコピーして貼り付けると状態を確認できます。',
    'aiChat.ollama.connectionError': 'Ollama に接続できませんでした。',
    'aiChat.ollama.connectionUrl': '接続先 URL:',
    'aiChat.ollama.copied': 'コピーしました',
    'aiChat.ollama.copy': 'コピー',
    'aiChat.ollama.copyCheckCommand': '確認コマンドをコピー',
    'aiChat.ollama.copyCommand': 'コマンドをコピー',
    'aiChat.ollama.copyError': '{{label}}をコピーできませんでした',
    'aiChat.ollama.copySuccess': '{{label}}をコピーしました',
    'aiChat.ollama.copyValue': '入力値をコピー',
    'aiChat.ollama.downloadUrl': 'ダウンロード URL:',
    'aiChat.ollama.faq': 'FAQ:',
    'aiChat.ollama.forbiddenError':
      'Ollama が拡張機能からのアクセスを拒否しました (403 Forbidden)。',
    'aiChat.ollama.loadModels': 'モデル一覧を取得',
    'aiChat.ollama.loading': '読み込み中...',
    'aiChat.ollama.loadingModelList': 'モデル一覧を読み込み中...',
    'aiChat.ollama.mac.step1':
      'Spotlight 検索で「ターミナル」と入力して開きます。',
    'aiChat.ollama.mac.step2': '次のコマンドをコピーして貼り付けます。',
    'aiChat.ollama.mac.step3': 'return キーを押します。',
    'aiChat.ollama.mac.step4': 'Ollama.app を終了します。',
    'aiChat.ollama.mac.step5': 'Ollama.app を起動し直します。',
    'aiChat.ollama.noModelsFound': 'モデルが見つかりません',
    'aiChat.ollama.notInstalledDownload':
      'まだ Ollama をインストールしていない場合は、先にダウンロードしてください。',
    'aiChat.ollama.notInstalledStart':
      'すでにインストール済みなら、Ollama を起動してください。',
    'aiChat.ollama.selectModel': 'モデルを選択',
    'aiChat.ollama.setOrigins': '次の値で OLLAMA_ORIGINS を設定してください。',
    'aiChat.ollama.tagsUrl': 'Tags URL:',
    'aiChat.ollama.unknown.step1':
      'OLLAMA_ORIGINS を設定してから Ollama を再起動してください。',
    'aiChat.ollama.unknown.step2': '設定する値は以下です。',
    'aiChat.ollama.win.step1':
      'Windows のスタートメニューで「環境変数」と入力します。',
    'aiChat.ollama.win.step2': '「システム環境変数の編集」を開きます。',
    'aiChat.ollama.win.step3': '表示された画面で「環境変数」を押します。',
    'aiChat.ollama.win.step4': '「ユーザー環境変数」の「新規」を押します。',
    'aiChat.ollama.win.step5': '変数名に OLLAMA_ORIGINS を入力します。',
    'aiChat.ollama.win.step6': '変数値に次の値を入力します。',
    'aiChat.ollama.win.step7': '保存してから Ollama を再起動します。',
    'aiChat.open': 'AIチャットを開く',
    'aiChat.pageAria': 'AIチャット画面',
    'aiChat.reasoning': '推論',
    'aiChat.resizeAria': 'AIチャットの幅を調整',
    'aiChat.responseError': 'AI からの応答を取得できませんでした。',
    'aiChat.scrollLatest': '最新メッセージへ移動',
    'aiChat.send': '送信',
    'aiChat.sending': '送信中...',
    'aiChat.shimmer': '回答を組み立てています...',
    'aiChat.sidebarAria': 'AIチャットサイドバー',
    'aiChat.sources.one': '参照ソース {{count}}件',
    'aiChat.sources.other': '参照ソース {{count}}件',
    'aiChat.streaming.checkingTabs': '- 保存済みタブを確認しています。',
    'aiChat.streaming.receivedQuestion': '- 質問を受け取りました: {{prompt}}',
    'aiChat.streaming.toolsFollow':
      '- ステップ完了ごとにツール実行結果と推論を更新します。',
    'aiChat.tool.findUrlsByMonth.description':
      '指定した年月に保存されたタブを一覧化する。page/pageSize/sortDirection を指定できる',
    'aiChat.tool.findUrlsByMonth.title': '月別タブ検索',
    'aiChat.tool.generateSavedTabsAnalytics.description':
      '保存済みタブをドメイン、カテゴリ、プロジェクト、時系列で集計し、chartSpecs を返す。チャートや分析を求められたら優先して使う',
    'aiChat.tool.generateSavedTabsAnalytics.title': '保存分析',
    'aiChat.tool.getCurrentDateTime.description':
      '現在時刻を取得する。今日、今月、何日前、相対日付を扱う前に使う',
    'aiChat.tool.getCurrentDateTime.title': '現在時刻確認',
    'aiChat.tool.inferUserInterests.description':
      '保存傾向から興味のありそうなテーマを推定する',
    'aiChat.tool.inferUserInterests.title': '興味推定',
    'aiChat.tool.listSavedUrls.description':
      '現在保存されているタブを保存日時順に一覧化する。page/pageSize/sortDirection を指定できる',
    'aiChat.tool.listSavedUrls.title': '保存済みタブ一覧',
    'aiChat.tool.searchSavedUrls.description':
      'キーワードで保存済みタブを検索する。page/pageSize/sortDirection を指定できる',
    'aiChat.tool.searchSavedUrls.title': 'キーワードタブ検索',
    'aiChat.suggestion.favoriteContent': '最近よく保存しているジャンルは？',
    'aiChat.suggestion.recentTabs': '今月追加したタブを教えて',
    'aiChat.suggestion.recommendation': 'どんなコンテンツが好きそうか教えて',
    'aiChat.systemPrompt.availableTools': '利用できるツール',
    'aiChat.systemPrompt.availableToolsDescription':
      'システムプロンプトに含めやすいよう、ツール名と説明を一覧表示しています。',
    'aiChat.systemPrompt.bodyLabel': 'システムプロンプト本文',
    'aiChat.systemPrompt.copySuffix': ' のコピー',
    'aiChat.systemPrompt.defaultName': 'デフォルト',
    'aiChat.systemPrompt.defaultTemplate':
      'あなたは TABBIN に保存されたタブの情報だけを根拠に答えるアシスタントです。\n保存データにない事実は推測しないでください。\n推測が含まれる場合は「保存傾向から見ると」と明示してください。\n月や期間に関する質問では、できるだけ具体的な年月を答えてください。\n現在どんなタブが保存されているかを聞かれたら、まず listSavedUrls を使って確認してください。\n保存済みタブが存在しないとは、tools の結果または保存済みタブ要約が空の場合にだけ答えてください。\n返答は日本語で簡潔にしてください。',
    'aiChat.systemPrompt.duplicate': '複製',
    'aiChat.systemPrompt.empty': '利用可能なシステムプロンプトがありません',
    'aiChat.systemPrompt.inUse': '使用中',
    'aiChat.systemPrompt.listTitle': 'システムプロンプト',
    'aiChat.systemPrompt.managerTitle': 'システムプロンプト管理',
    'aiChat.systemPrompt.nameLabel': 'プロンプト名',
    'aiChat.systemPrompt.new': '新規作成',
    'aiChat.systemPrompt.openSettings': 'システムプロンプト設定を開く',
    'aiChat.systemPrompt.placeholder': 'プロンプト',
    'aiChat.systemPrompt.save': '保存',
    'aiChat.systemPrompt.saveError': 'システムプロンプトを保存できませんでした',
    'aiChat.systemPrompt.saving': '保存中...',
    'aiChat.systemPrompt.select': 'システムプロンプトを選択',
    'aiChat.systemPrompt.settingsTooltip': 'システムプロンプト設定',
    'aiChat.systemPrompt.switchSaveError':
      'システムプロンプトの切り替えを保存できませんでした',
    'aiChat.systemPrompt.validation.duplicate':
      '同じ名前のプロンプトは保存できません。',
    'aiChat.systemPrompt.validation.empty':
      'プロンプト名とシステムプロンプト本文を入力してください。',
    'aiChat.systemPrompt.validation.maxLength':
      'プロンプト名は {{count}} 文字以内で入力してください。',
    'aiChat.toolsRun': '実行ツール',
    'analytics.aiSummary': 'AI が生成した分析チャートです。',
    'analytics.canvasTitle': '分析キャンバス',
    'analytics.chart.dailySavedTrend': '日別の保存推移',
    'analytics.chart.descriptionAggregated': '{{count}} 件の保存データを集計',
    'analytics.chart.descriptionCompareMode':
      '{{count}} 件の保存データをモード別に比較',
    'analytics.chart.monthlySavedTrend': '月別の保存推移',
    'analytics.chart.savedCountByDomain': 'ドメインごとの保存数',
    'analytics.chart.savedCountByParentCategory': '親カテゴリごとの保存数',
    'analytics.chart.savedCountByProject': 'プロジェクトごとの保存数',
    'analytics.chart.savedCountByProjectCategory':
      'プロジェクトカテゴリごとの保存数',
    'analytics.chart.savedCountBySubCategory': '子カテゴリごとの保存数',
    'analytics.chart.seriesCustomMode': 'カスタム保存',
    'analytics.chart.seriesDomainMode': 'ドメイン保存',
    'analytics.chart.seriesSavedCount': '保存数',
    'analytics.chart.seriesShare': '割合',
    'analytics.chart.weeklySavedTrend': '週別の保存推移',
    'analytics.chartType.area': '面グラフ',
    'analytics.chartType.bar': '棒グラフ',
    'analytics.chartType.line': '折れ線',
    'analytics.chartType.pie': '円グラフ',
    'analytics.chartType.radar': 'レーダー',
    'analytics.chartTypeLabel': 'グラフ種別',
    'analytics.conditionsTitle': '分析条件',
    'analytics.deleteAllAria': 'この項目のタブをすべて削除',
    'analytics.deleteTabsError': 'タブを削除できませんでした',
    'analytics.deleteViewAria': '{{name}}を削除',
    'analytics.drilldownCount': '{{count}}件',
    'analytics.drilldownEmpty': '該当する保存タブはありません。',
    'analytics.drilldownTitle': '項目に含まれる保存タブ',
    'analytics.groupBy.domain': 'ドメイン',
    'analytics.groupBy.parentCategory': '親カテゴリ',
    'analytics.groupBy.project': 'プロジェクト',
    'analytics.groupBy.subCategory': '子カテゴリ',
    'analytics.groupBy.timeRecent': '時系列（直近）',
    'analytics.groupBy.timeTop': '時系列（件数）',
    'analytics.groupByLabel': '集計軸',
    'analytics.limitLabel': '上位件数',
    'analytics.open': '開く',
    'analytics.openAllAria': 'この項目のタブをすべて開く',
    'analytics.openAria': '{{title}} を開く',
    'analytics.saveView': '保存する',
    'analytics.savedViewsDescription':
      '保存した分析条件をここから再利用できます。',
    'analytics.savedViewsEmpty': 'まだ保存された分析ビューはありません。',
    'analytics.savedViewsTitle': '保存済みビュー',
    'analytics.summary':
      '{{count}} 件の保存データから「{{title}}」を作成しました。',
    'analytics.uncategorized': '未分類',
    'analytics.viewName': 'ビュー名',
    'analytics.viewNameDuplicate': 'このビュー名は既に存在しています',
    'analytics.viewNameRequired': 'ビュー名を入力してください',
    'background.aiChat.intent.interests': '保存傾向の推定',
    'background.aiChat.intent.list': '保存済みタブの一覧確認',
    'background.aiChat.intent.search': '保存済みタブの検索と要約',
    'background.aiChat.intent.time': '期間や追加時期の確認',
    'background.aiChat.none': 'なし',
    'background.aiChat.ollama.macTitle': 'macOS で Ollama.app を使う場合:',
    'background.aiChat.ollama.setOriginsValue':
      'OLLAMA_ORIGINS に {{value}} を設定してください。',
    'background.aiChat.reasoning.intentLabel': '質問の解釈:',
    'background.aiChat.reasoning.policyLabel': '回答方針:',
    'background.aiChat.reasoning.policyWithTools':
      'ツール結果を保存済みタブの根拠として使って回答しました。',
    'background.aiChat.reasoning.policyWithoutTools':
      '保存済みタブの要約コンテキストを直接参照して回答しました。',
    'background.aiChat.reasoning.referenceLabel': '参照対象:',
    'background.aiChat.reasoning.toolsLabel': '使用ツール:',
    'background.aiChat.recentTabs': '最近保存したタブ一覧:',
    'background.aiChat.savedTabsCount': '保存済みタブ {{count}} 件',
    'background.aiChat.toolSummary.callReviewed':
      '呼び出し内容を確認しました。',
    'background.aiChat.toolSummary.fetchedCount':
      '{{count}} 件の結果を確認しました。',
    'background.aiChat.toolSummary.fetchedWithTotal':
      '{{count}} 件を取得しました。総件数は {{total}} 件です。',
    'background.aiChat.toolSummary.resultRetrieved': '結果を取得しました。',
    'background.contextMenu.openSavedTabs': '保存したタブを開く',
    'background.contextMenu.saveAllTabs': 'ウィンドウのすべてのタブを保存',
    'background.contextMenu.saveAllWindowsTabs':
      '他のウィンドウを含めすべてのタブを保存',
    'background.contextMenu.saveCurrentTab': '現在のタブを保存',
    'background.contextMenu.saveSameDomainTabs':
      '現在開いているドメインのタブをすべて保存',
    'background.saveTabs.allWindowsSaved':
      'すべてのウィンドウから{{count}}個のタブを保存しました',
    'background.saveTabs.currentTabSaved': '現在のタブを保存しました',
    'background.saveTabs.notificationTitle': 'タブ保存',
    'background.saveTabs.sameDomainSaved':
      '{{domain}}の{{count}}個のタブを保存しました',
    'background.saveTabs.windowTabsSaved':
      '{{count}}個のタブが保存されました。タブを閉じます。',
    'changelog.heading': 'リリースノート',
    'common.cache': 'キャッシュ',
    'common.cancel': 'キャンセル',
    'common.no': 'なし',
    'common.yes': 'あり',
    'common.close': '閉じる',
    'common.confirm': '確定',
    'common.console': 'コンソール',
    'common.copy': 'コピー',
    'common.delete': '削除',
    'common.enterUrl': 'URLを入力...',
    'common.input': '入力',
    'common.instructions': '手順',
    'common.loading': '読み込み中...',
    'common.loadingLabel': '読み込み中',
    'common.manage': '管理',
    'common.modelContextUsage': 'モデルのコンテキスト使用量',
    'common.next': '次へ',
    'common.nextBranch': '次の分岐',
    'common.nextSlide': '次のスライド',
    'common.noConsoleOutput': 'コンソール出力はありません',
    'common.noDescription': '説明はありません',
    'common.noStackFrames': 'スタックフレームはありません',
    'common.open': '開く',
    'common.output': '出力',
    'common.parameters': 'パラメーター',
    'common.pausePreview': 'プレビュー停止',
    'common.playPreview': 'プレビュー再生',
    'common.preview': 'プレビュー',
    'common.previous': '前へ',
    'common.previousBranch': '前の分岐',
    'common.previousSlide': '前のスライド',
    'common.reasoning': '推論',
    'common.requestBody': 'リクエスト本文',
    'common.required': '必須',
    'common.reset': 'リセット',
    'common.response': 'レスポンス',
    'common.result': '結果',
    'common.searchMicrophones': 'マイクを検索...',
    'common.stop': '停止',
    'common.submit': '送信',
    'common.thinking': '考え中...',
    'common.thoughtForFewSeconds': '数秒考えました',
    'common.thoughtForSeconds': '{{count}} 秒考えました',
    'common.togglePlan': 'プランを切り替え',
    'common.toggleSidebar': 'サイドバーを切り替え',
    'common.toggleValueVisibility': '値の表示を切り替え',
    'common.tools': 'ツール',
    'common.totalCost': '合計コスト',
    'common.undo': '元に戻す',
    'common.uploadFiles': 'ファイルをアップロード',
    'common.usedSources.one': '使用したソース {{count}} 件',
    'common.usedSources.other': '使用したソース {{count}} 件',
    'htmlTitle.aiChat': 'AIチャット - TABBIN',
    'htmlTitle.analytics': '分析 - TABBIN',
    'htmlTitle.app': 'TABBIN',
    'htmlTitle.changelog': 'リリースノート - TABBIN',
    'htmlTitle.options': 'オプション - TABBIN',
    'htmlTitle.periodicExecution': '定期実行 - TABBIN',
    'htmlTitle.savedTabs': '保存したタブ - TABBIN',
    'language.english': 'English',
    'language.japanese': '日本語',
    'language.label': '表示言語',
    'language.system': 'System',
    'options.autoDelete.14days': '14日',
    'options.autoDelete.180days': '6ヶ月',
    'options.autoDelete.1day': '1日',
    'options.autoDelete.1hour': '1時間',
    'options.autoDelete.30days': '30日',
    'options.autoDelete.365days': '1年',
    'options.autoDelete.7days': '7日',
    'options.autoDelete.allWindows': '他のウィンドウを含めすべてのタブを開く',
    'options.autoDelete.allWindowsDescription':
      'オンにすると、「すべて開く」ボタンで新しいウィンドウを作成し、タブを開きます。',
    'options.autoDelete.apply': '設定する',
    'options.autoDelete.background': 'バックグラウンドタブで開く',
    'options.autoDelete.confirmDeleteAll': 'すべて削除前に確認する',
    'options.autoDelete.confirmDeleteAllDescription':
      'オンにすると、カテゴリごとにすべてのタブを削除する前に確認ダイアログを表示します。',
    'options.autoDelete.confirmDeleteEach': 'タブ削除前に確認する',
    'options.autoDelete.confirmDeleteEachDescription':
      'オンにすると、タブを削除する前に確認ダイアログを表示します。',
    'options.autoDelete.confirmMessage':
      '自動削除期間を「{{periodLabel}}」に設定します。\n\n{{warningMessage}}\n\n続行しますか？',
    'options.autoDelete.description':
      '保存されたタブが指定した期間を超えると自動的に削除されます。',
    'options.autoDelete.disabled': '自動削除を無効にしました',
    'options.autoDelete.enabled':
      '自動削除期間を「{{periodLabel}}」に設定しました',
    'options.autoDelete.excludePinned': '固定タブ（ピン留め）を除外する',
    'options.autoDelete.excludePinnedDescription':
      'オンにすると、ピン留めされたタブは保存対象から除外されます。',
    'options.autoDelete.externalDrop':
      '別ブラウザへドラッグ&ドロップした後、リストから自動的に削除する',
    'options.autoDelete.externalDropDescription':
      'オンにすると、保存したタブを別ブラウザへドラッグ&ドロップした際にリストから削除します。',
    'options.autoDelete.openAfter':
      '保存したタブを開いた後、リストから自動的に削除する',
    'options.autoDelete.openAfterDescription':
      'オンにすると、保存したタブを開いた後、そのタブは保存リストから自動的に削除されます。オフにすると、保存したタブを開いても、リストからは削除されません。',
    'options.autoDelete.periodDescription':
      '保存されたタブが指定した期間を超えると自動的に削除されます。設定を適用すると、その時点で期限切れのタブは削除されます。',
    'options.autoDelete.periodLabel': 'タブの自動削除期間',
    'options.autoDelete.saveError': '設定の保存に失敗しました',
    'options.autoDelete.saveInBackground': 'バックグラウンドタブで開く',
    'options.autoDelete.saveInBackgroundDescription':
      'オンにすると、保存したタブをバックグラウンドで開きます。',
    'options.autoDelete.savedTime': '保存日時を表示する',
    'options.autoDelete.savedTimeDescription':
      'オンにすると、保存タブ一覧に保存された日時が表示されます。',
    'options.autoDelete.selectPlaceholder': '自動削除期間を選択',
    'options.autoDelete.shorterWarning':
      '警告: 現在よりも短い期間に設定するため、一部のタブがすぐに削除される可能性があります！',
    'options.autoDelete.title': '自動削除',
    'options.autoDelete.validateWarning':
      '注意: 設定した期間より古いタブはすぐに削除される可能性があります。',
    'options.autoDelete.zero': '自動削除しない',
    'options.backupRestore': 'バックアップと復元',
    'options.behavior.description':
      'オンにすると、すべてのタブを新しいウィンドウで開きます。',
    'options.behaviorSettings': 'タブの挙動設定',
    'options.categories.addError': 'カテゴリの追加に失敗しました。',
    'options.categories.duplicate': '同じ名前のカテゴリがすでに存在します。',
    'options.categories.validation.maxLength':
      'カテゴリ名は25文字以下にしてください',
    'options.clickBehavior.allWindows':
      '他のウィンドウを含めすべてのタブを保存',
    'options.clickBehavior.currentTab': '現在のタブを保存',
    'options.clickBehavior.sameDomain':
      '現在開いているドメインのタブをすべて保存',
    'options.clickBehavior.windowTabs': 'ウィンドウのすべてのタブを保存',
    'options.clickBehaviorLabel': '拡張機能ボタンをクリックした時の挙動',
    'options.clickBehaviorPlaceholder': 'クリック時の挙動を選択してください',
    'options.color.accent': 'アクセント背景',
    'options.color.accentForeground': 'アクセントテキスト',
    'options.color.background': '背景',
    'options.color.border': 'ボーダー',
    'options.color.card': 'カード背景',
    'options.color.cardForeground': 'カードテキスト',
    'options.color.chart1': 'チャート1',
    'options.color.chart2': 'チャート2',
    'options.color.chart3': 'チャート3',
    'options.color.chart4': 'チャート4',
    'options.color.chart5': 'チャート5',
    'options.color.destructive': 'デストラクティブ背景',
    'options.color.destructiveForeground': 'デストラクティブテキスト',
    'options.color.foreground': 'テキスト',
    'options.color.hexPlaceholder': '例: #FF5733, #3366CC',
    'options.color.input': '入力背景',
    'options.color.muted': '控えめ背景',
    'options.color.mutedForeground': 'サブテキスト',
    'options.color.popover': 'ポップオーバー',
    'options.color.popoverForeground': 'ポップオーバーテキスト',
    'options.color.primary': 'プライマリ背景',
    'options.color.primaryForeground': 'プライマリテキスト',
    'options.color.resetError': 'カラー設定のリセットに失敗しました',
    'options.color.resetSuccess': 'カラー設定をリセットしました',
    'options.color.ring': 'リング',
    'options.color.secondary': 'セカンダリ背景',
    'options.color.secondaryForeground': 'セカンダリテキスト',
    'options.color.sidebar': 'サイドバー背景',
    'options.color.sidebarAccent': 'サイドバー アクセント背景',
    'options.color.sidebarAccentForeground': 'サイドバー アクセントテキスト',
    'options.color.sidebarBorder': 'サイドバー ボーダー',
    'options.color.sidebarForeground': 'サイドバー テキスト',
    'options.color.sidebarPrimary': 'サイドバー プライマリ背景',
    'options.color.sidebarPrimaryForeground': 'サイドバー プライマリテキスト',
    'options.color.sidebarRing': 'サイドバー リング',
    'options.contact': 'お問い合わせ',
    'options.contactDescription':
      'Google Formsを使用します。※画像アップロード可能な設定ですので、Googleアカウントでのログインが必要です。',
    'options.excludePatterns.add': '追加',
    'options.excludePatterns.empty': '除外パターンはありません',
    'options.excludePatterns.help':
      'これらのパターンに一致するURLは保存されず、タブも閉じられません。',
    'options.excludePatterns.label': '保存・閉じない URL パターン',
    'options.excludePatterns.placeholder': '例: chrome-extension://',
    'options.excludePatterns.removeAria': '除外パターン {{pattern}} を削除',
    'options.excludePatterns.title': '除外設定',
    'options.fontSize.currentValue': '現在の値: {{value}}%',
    'options.fontSize.description': 'フォントサイズを調整できます。',
    'options.fontSize.inputLabel': 'フォントサイズ (%)',
    'options.fontSize.rangeLabel': 'フォントサイズスライダー',
    'options.importExport.back': '戻る',
    'options.importExport.cancel': 'キャンセル',
    'options.importExport.confirmImport': 'インポートを実行',
    'options.importExport.dialogDescription':
      '以前にエクスポートしたバックアップファイルから設定とタブデータを復元します。',
    'options.importExport.dialogTitle': '設定とタブデータのインポート',
    'options.importExport.dropActive': 'ファイルをドロップ',
    'options.importExport.dropIdle': 'JSONファイルをドラッグ&ドロップ',
    'options.importExport.export': '設定とタブデータをエクスポート',
    'options.importExport.exportError': 'エクスポート中にエラーが発生しました',
    'options.importExport.exportSuccess':
      '設定とタブデータをエクスポートしました',
    'options.importExport.exporting': 'エクスポート中...',
    'options.importExport.fileTooLarge':
      'ファイルが大きすぎます。最大サイズは{{maxSize}}です。',
    'options.importExport.import': '設定とタブデータをインポート',
    'options.importExport.importError': 'インポートに失敗しました',
    'options.importExport.importFormatError':
      'インポートされたデータの形式が正しくありません',
    'options.importExport.importing': 'インポート中...',
    'options.importExport.invalidJson': 'JSONファイルを選択してください',
    'options.importExport.merge': '既存データとマージする（推奨）',
    'options.importExport.mergeDescription':
      '既存のデータを保持しつつ、新しいデータを追加・更新します。',
    'options.importExport.mergeLabel': '注意',
    'options.importExport.mergeSuccess':
      'データをマージしました（{{categories}}個のカテゴリと{{domains}}個のドメインを追加）{{unresolved}}',
    'options.importExport.mergeWarning':
      'マージの際、同じIDのデータは更新されます。',
    'options.importExport.placeholderUrlTitle': '復元データ（元URL欠損）',
    'options.importExport.previewAiChat': 'AIチャット履歴: {{hasAiChat}}',
    'options.importExport.previewAiChatLabel': 'AIチャット履歴',
    'options.importExport.previewAnalytics': '分析ビュー: {{hasAnalytics}}',
    'options.importExport.previewCategoriesLabel': 'カテゴリ数',
    'options.importExport.previewDescription':
      'インポート前にデータの内容を確認してください。',
    'options.importExport.previewDomainsLabel': 'ドメイン数',
    'options.importExport.previewProjectsLabel': 'プロジェクト数',
    'options.importExport.previewTimestampLabel': 'バックアップ日時',
    'options.importExport.previewTitle': 'インポートプレビュー',
    'options.importExport.previewVersionLabel': 'バックアップバージョン',
    'options.importExport.readError': 'ファイルの読み込みに失敗しました',
    'options.importExport.replaceDescription':
      'インポートすると現在の設定とタブデータがすべて上書きされます。この操作は元に戻せません。',
    'options.importExport.replaceLabel': '警告',
    'options.importExport.replaceSuccess':
      '設定とタブデータを置き換えました（バージョン: {{version}}、作成日時: {{timestamp}}）{{unresolved}}',
    'options.importExport.replaceWarning':
      'インポートすると現在の設定とタブデータがすべて上書きされます。この操作は元に戻せません。',
    'options.importExport.scopeDescription':
      'バックアップには、保存済みURL、カテゴリ、カスタムプロジェクト、分析データ、AIチャット履歴、AI設定が含まれます。',
    'options.importExport.scopeTitle': 'バックアップ対象',
    'options.importExport.selectFile': 'クリックしてファイルを選択',
    'options.importExport.unresolvedWarning':
      '（注意: {{count}}個のドメインでURL実体が欠損していたため、{{placeholderCount}}件の代替URLを生成しました）',
    'options.importExport.uploadTitle': '設定とタブデータのインポート',
    'options.previewColorCustomization': '(preview)カラーカスタマイズ',
    'options.previewColorCustomizationReset': 'リセット',
    'options.previewFontSizeCustomization': '(preview)フォントサイズ',
    'options.releaseNotes': 'リリースノート',
    'options.showSavedTime': '保存日時を表示する',
    'options.showSavedTimeDescription':
      'オンにすると、保存タブ一覧に保存された日時が表示されます。',
    'options.title': 'オプション',
    'periodicExecution.title': '定期実行',
    'savedTabs.addProject': 'プロジェクト追加',
    'savedTabs.category.deleteAllItemName': 'このカテゴリのドメイン',
    'savedTabs.category.deleteAllWarning':
      'カテゴリ内のすべてのドメインを削除します。この操作は元に戻せません。',
    'savedTabs.categoryCardAria': 'カテゴリ: {{name}}',
    'savedTabs.categoryGroupAria': '{{name}} カテゴリグループ',
    'savedTabs.categoryManagement.addDomainLabel': '新しいドメインを追加',
    'savedTabs.categoryManagement.addDomainPlaceholder':
      'カテゴリに追加するドメインを選択',
    'savedTabs.categoryManagement.addDomainTooltip':
      '選択したドメインを親カテゴリに追加',
    'savedTabs.categoryManagement.deleteAction': '親カテゴリを削除',
    'savedTabs.categoryManagement.deleteConfirmDescription':
      '親カテゴリ「{{name}}」を削除しますか？この操作は取り消せません。',
    'savedTabs.categoryManagement.deleteConfirmDomains':
      'このカテゴリには {{count}} 件のドメインが関連付けられています。削除すると、ドメインと親カテゴリの関連付けも削除されます。',
    'savedTabs.categoryManagement.nameLabel': '親カテゴリ名',
    'savedTabs.categoryManagement.noAvailableDomains':
      '追加できるドメインがありません。',
    'savedTabs.categoryManagement.registeredDomainsEmpty':
      '登録されているドメインがありません',
    'savedTabs.categoryManagement.registeredDomainsLabel': '登録済みドメイン',
    'savedTabs.categoryManagement.removeDomainAria': 'ドメインを削除',
    'savedTabs.categoryManagement.renameAction': '親カテゴリ名を変更',
    'savedTabs.categoryManagement.renameError':
      '親カテゴリ名の更新に失敗しました',
    'savedTabs.categoryManagement.renamePlaceholder':
      '例: ビジネスツール、技術情報',
    'savedTabs.categoryManagement.renamePrompt':
      '「{{name}}」の新しい親カテゴリ名を入力してください',
    'savedTabs.categoryManagement.renamed':
      'カテゴリ名を「{{before}}」から「{{after}}」に変更しました',
    'savedTabs.categoryManagement.reorderCanceled':
      '親カテゴリの並び替えをキャンセルしました',
    'savedTabs.categoryManagement.reorderUpdateError':
      '親カテゴリ順序の更新に失敗しました',
    'savedTabs.categoryManagement.reorderUpdated':
      '親カテゴリの順序を変更しました',
    'savedTabs.categoryManagement.title': '「{{name}}」の親カテゴリ管理',
    'savedTabs.categoryModal.allCategorized':
      'すべてのドメインがカテゴリに分類されています',
    'savedTabs.categoryModal.belongsToCategory': '所属カテゴリ: {{name}}',
    'savedTabs.categoryModal.createError': 'カテゴリの作成に失敗しました',
    'savedTabs.categoryModal.createLabel': '新規親カテゴリ名',
    'savedTabs.categoryModal.created': 'カテゴリを作成しました',
    'savedTabs.categoryModal.currentCategory': '現在選択中のカテゴリ: {{name}}',
    'savedTabs.categoryModal.deleteConfirmDescription':
      '親カテゴリ「{{name}}」を削除しますか？この操作は取り消せません。',
    'savedTabs.categoryModal.deleteConfirmDomains':
      'このカテゴリには {{count}} 件のドメインが関連付けられています。削除すると、ドメインと親カテゴリの関連付けも削除されます。',
    'savedTabs.categoryModal.deleteError': 'カテゴリの削除に失敗しました',
    'savedTabs.categoryModal.deleteSelected': '選択中の親カテゴリを削除',
    'savedTabs.categoryModal.deleteSelectionMissing':
      '削除するカテゴリが選択されていません',
    'savedTabs.categoryModal.deleted': 'カテゴリ「{{name}}」を削除しました',
    'savedTabs.categoryModal.domainAssigned':
      'ドメイン {{domain}} を「{{categoryName}}」に追加しました',
    'savedTabs.categoryModal.domainRemoved':
      'ドメイン {{domain}} を「{{categoryName}}」から削除しました',
    'savedTabs.categoryModal.domainsLabel': 'ドメイン選択',
    'savedTabs.categoryModal.domainsLabelUncategorized':
      'ドメイン選択（未割り当てドメインのみ表示）',
    'savedTabs.categoryModal.duplicateName':
      'カテゴリ名「{{name}}」は既に存在します',
    'savedTabs.categoryModal.invalid': 'カテゴリ名が無効です',
    'savedTabs.categoryModal.loadError': 'カテゴリの読み込みに失敗しました',
    'savedTabs.categoryModal.noDomains': '保存されたドメインがありません',
    'savedTabs.categoryModal.placeholder': '例: 仕事、趣味、学習',
    'savedTabs.categoryModal.selectLabel': '親カテゴリ選択',
    'savedTabs.categoryModal.selectPlaceholder':
      '作成済みのカテゴリを選択してドメインを管理',
    'savedTabs.categoryModal.title': '親カテゴリ管理',
    'savedTabs.categoryModal.toggleError': 'カテゴリの設定に失敗しました',
    'savedTabs.categoryModal.uncategorized': '未分類',
    'savedTabs.categoryModal.uncategorizedAria': '未分類のドメイン',
    'savedTabs.categoryModal.uncategorizedDirectEditError':
      '未分類カテゴリでは直接操作できません。カテゴリを選択してください。',
    'savedTabs.categoryModal.validation.empty':
      '新規親カテゴリ名を入力してください',
    'savedTabs.categoryModal.validation.maxLength':
      '新規親カテゴリ名は25文字以下にしてください',
    'savedTabs.accessibility.nounAction': '「{{target}}」の{{action}}',
    'savedTabs.accessibility.objectAction': '「{{target}}」を{{action}}',
    'savedTabs.accessibility.sortState': '「{{target}}」の並び順: {{sort}}',
    'savedTabs.collapse': '折りたたむ',
    'savedTabs.customProjects.createAction': '作成',
    'savedTabs.customProjects.createDialogTitle': '新規プロジェクト作成',
    'savedTabs.customProjects.createPlaceholder':
      '例: ウェブサイトリニューアル、ライブラリ調査',
    'savedTabs.customProjects.emptyDescription':
      '表示可能なプロジェクトがありません',
    'savedTabs.customProjects.emptyHint':
      '親カテゴリを作成するとプロジェクトとして表示されます',
    'savedTabs.customProjects.emptyTitle': 'プロジェクトがありません',
    'savedTabs.customProjects.nameLabel': 'プロジェクト名 *',
    'savedTabs.deleteAll': 'すべて削除',
    'savedTabs.deleteAllConfirmDescription':
      '「{{categoryName}}」のタブをすべて削除します。この操作は元に戻せません。',
    'savedTabs.deleteAllConfirmDescriptionWithCount':
      '「{{categoryName}}」のタブ{{count}}件をすべて削除します。この操作は元に戻せません。',
    'savedTabs.deleteError': '削除に失敗しました',
    'savedTabs.deleteAllConfirmTitle': 'タブをすべて削除しますか？',
    'savedTabs.deleteAllDefaultWarning':
      'すべての項目を削除します。この操作は元に戻せません。',
    'savedTabs.deleteAllTabs': 'すべてのタブを削除',
    'savedTabs.deleteAllTitle': '{{itemName}}をすべて削除しますか？',
    'savedTabs.deletingAll': '削除中...',
    'savedTabs.domain.deleteAllWarning':
      'このドメインのすべてのタブを削除します。この操作は元に戻せません。',
    'savedTabs.domain.emptyManageCategoriesHint':
      'カテゴリを追加するにはカテゴリ管理から行ってください',
    'savedTabs.domain.emptyNoTabs': 'このドメインにはタブがありません',
    'savedTabs.domainOrder.canceled': '並び替えをキャンセルしました',
    'savedTabs.domainOrder.updateError': 'ドメイン順序の更新に失敗しました',
    'savedTabs.domainOrder.updated': 'ドメインの順序を変更しました',
    'savedTabs.domainsCount': 'ドメイン:{{count}}',
    'savedTabs.emptyDescription':
      'タブを右クリックして保存するか、拡張機能のアイコンをクリックしてください',
    'savedTabs.emptyTitle': '保存されたタブはありません',
    'savedTabs.expand': '展開',
    'savedTabs.keywordModal.title': '「{{domain}}」の子カテゴリ管理',
    'savedTabs.keywords.activeCategoryLabel':
      '「{{name}}」子カテゴリのキーワード',
    'savedTabs.keywords.addAria': 'キーワードを追加',
    'savedTabs.keywords.autoAssignHint':
      'タイトルにキーワードが含まれていると自動的にこの子カテゴリに分類されます',
    'savedTabs.keywords.deleteAria': 'キーワードを削除',
    'savedTabs.keywords.deleteAriaWithName': 'キーワード {{name}} を削除',
    'savedTabs.keywords.duplicate': 'このキーワードは既に追加されています',
    'savedTabs.keywords.empty': 'キーワードがありません',
    'savedTabs.keywords.placeholder': '例: 技術、新機能、チュートリアル',
    'savedTabs.manageParentCategories': '親カテゴリ管理',
    'savedTabs.manageSubcategories': '子カテゴリ管理',
    'savedTabs.newProjectPlaceholder': '例: 仕事、調査、後で読む',
    'savedTabs.newProjectTitle': '新しいプロジェクトを追加',
    'savedTabs.openAll': 'すべて開く',
    'savedTabs.openAllConfirmDescription':
      '{{count}}個以上のタブを開こうとしています。続行しますか？',
    'savedTabs.openAllConfirmDescriptionWithName':
      '「{{name}}」のタブ{{count}}件を開きます。続行しますか？',
    'savedTabs.openAllConfirmTitle': 'タブをすべて開きますか？',
    'savedTabs.openAllTabs': 'すべてのタブを開く',
    'savedTabs.project.deleteAllItemName': 'このプロジェクトのタブ',
    'savedTabs.project.deleteAllWarning':
      'このプロジェクト内のすべてのタブを削除します。この操作は元に戻せません。',
    'savedTabs.project.emptyDescription':
      '拡張機能アイコンからタブを保存するか、右クリックメニューから追加できます。',
    'savedTabs.project.emptyDragHint':
      '他のプロジェクトからタブをドラッグ&ドロップして追加することもできます。',
    'savedTabs.project.emptyTitle': 'このプロジェクトにはタブがありません。',
    'savedTabs.project.loadingTabs': 'タブを読み込み中...',
    'savedTabs.projectAdded': 'プロジェクト「{{name}}」を追加しました',
    'savedTabs.projectCard.dropToUncategorized':
      'タブをここにドロップして未分類に移動',
    'savedTabs.projectCard.uncategorizedArea': '未分類タブエリア',
    'savedTabs.projectCard.uncategorizedTitle': '未分類のタブ',
    'savedTabs.projectCategory.added': 'カテゴリ「{{name}}」を追加しました',
    'savedTabs.projectCategory.deleteAction': 'カテゴリを削除',
    'savedTabs.projectCategory.deleteAllWarning':
      '「{{categoryName}}」のタブをすべて削除します。この操作は元に戻せません。',
    'savedTabs.projectCategory.deleteWarning':
      'カテゴリを削除すると、このカテゴリに属するすべてのタブは未分類になります。',
    'savedTabs.projectCategory.deleted': 'カテゴリ「{{name}}」を削除しました',
    'savedTabs.projectCategory.manage': 'カテゴリ管理',
    'savedTabs.projectCategory.orderUpdateError':
      'カテゴリの順序更新に失敗しました',
    'savedTabs.projectCategory.orderUpdated': 'カテゴリの順序を変更しました',
    'savedTabs.projectCategory.renameDescription':
      'カテゴリ「{{name}}」を編集できます',
    'savedTabs.projectCategory.renameLabel': 'カテゴリ名',
    'savedTabs.projectCategory.renamePlaceholder': '例: 開発資料、参考サイト',
    'savedTabs.projectCategory.renamed': 'カテゴリ名を変更しました',
    'savedTabs.projectCategory.required': 'カテゴリ名を入力してください',
    'savedTabs.projectCategory.title': 'カテゴリ管理',
    'savedTabs.projectManagement.autoAssignDescription':
      '新規保存されたタブが対象です。',
    'savedTabs.projectManagement.autoAssignLabel': '自動振り分けキーワード',
    'savedTabs.projectManagement.deleteAction': 'プロジェクトを削除',
    'savedTabs.projectManagement.deleteConfirmDescription':
      'プロジェクト「{{name}}」を削除しますか？この操作は取り消せません。',
    'savedTabs.projectManagement.deleteConfirmHint':
      'このプロジェクトに含まれるすべてのタブとの紐付けも解除されます。',
    'savedTabs.projectManagement.keywordDomainDescription':
      'ドメインにキーワードが含まれていると、このプロジェクトに振り分けます',
    'savedTabs.projectManagement.keywordDomainLabel': 'ドメインキーワード',
    'savedTabs.projectManagement.keywordDomainPlaceholder': '例: github.com',
    'savedTabs.projectManagement.keywordTitleDescription':
      'タイトルにキーワードが含まれていると、このプロジェクトに振り分けます',
    'savedTabs.projectManagement.keywordTitleLabel': 'タイトルキーワード',
    'savedTabs.projectManagement.keywordTitlePlaceholder': '例: release',
    'savedTabs.projectManagement.keywordUrlDescription':
      'URL にキーワードが含まれていると、このプロジェクトに振り分けます',
    'savedTabs.projectManagement.keywordUrlLabel': 'URLキーワード',
    'savedTabs.projectManagement.keywordUrlPlaceholder': '例: docs',
    'savedTabs.projectManagement.nameLabel': 'プロジェクト名',
    'savedTabs.projectManagement.renameAction': '名前を変更',
    'savedTabs.projectManagement.renameError':
      'プロジェクト名の変更に失敗しました',
    'savedTabs.projectManagement.renamePlaceholder':
      '例: ウェブサイトリニューアル',
    'savedTabs.projectManagement.renamePrompt':
      '新しいプロジェクト名を入力してください',
    'savedTabs.projectManagement.renamed': 'プロジェクト名を変更しました',
    'savedTabs.projectManagement.title': '「{{name}}」の設定',
    'savedTabs.projectNameDuplicate': '同じプロジェクト名は追加できません',
    'savedTabs.projectNameMaxLength':
      'プロジェクト名は50文字以下にしてください',
    'savedTabs.projectNameRequired': 'プロジェクト名を入力してください',
    'savedTabs.projects.createError': 'プロジェクトの作成に失敗しました',
    'savedTabs.projects.deleteError': 'プロジェクトの削除に失敗しました',
    'savedTabs.projects.deleted': 'プロジェクト「{{name}}」を削除しました',
    'savedTabs.projects.duplicateName':
      'プロジェクト名「{{name}}」は既に使用されています',
    'savedTabs.projects.keywordsUpdateError':
      'キーワード設定の更新に失敗しました',
    'savedTabs.projects.keywordsUpdated': 'キーワード設定を更新しました',
    'savedTabs.projects.orderUpdateError':
      'プロジェクト順序の更新に失敗しました',
    'savedTabs.projects.orderUpdated': 'プロジェクトの順序を変更しました',
    'savedTabs.projectsCount': 'プロジェクト:{{count}}',
    'savedTabs.reorder.cancel': 'キャンセル',
    'savedTabs.reorder.cancelAria': '親カテゴリの並び替えをキャンセル',
    'savedTabs.reorder.confirm': '確定',
    'savedTabs.reorder.confirmAria': '親カテゴリの並び替えを確定',
    'savedTabs.reorder.disabled': '並び替えモード中',
    'savedTabs.scrollControls.bottom': '最下部へ移動',
    'savedTabs.scrollControls.nextChild': '下の子カテゴリへ移動',
    'savedTabs.scrollControls.nextDomain': '下のドメインへ移動',
    'savedTabs.scrollControls.nextParent': '下の親カテゴリへ移動',
    'savedTabs.scrollControls.nextProject': '下のプロジェクトへ移動',
    'savedTabs.scrollControls.previousChild': '上の子カテゴリへ移動',
    'savedTabs.scrollControls.previousDomain': '上のドメインへ移動',
    'savedTabs.scrollControls.previousParent': '上の親カテゴリへ移動',
    'savedTabs.scrollControls.previousProject': '上のプロジェクトへ移動',
    'savedTabs.scrollControls.top': '最上部へ移動',
    'savedTabs.searchClear': '検索をクリア',
    'savedTabs.searchPlaceholder': '検索',
    'savedTabs.sort.asc': '保存日時の昇順',
    'savedTabs.sort.default': 'デフォルト',
    'savedTabs.sort.desc': '保存日時の降順',
    'savedTabs.sortableCategory.bulkDeleteDescription':
      '「{{name}}」のタブをすべて削除しますか？',
    'savedTabs.sortableCategory.bulkDeleteTitle': 'タブを削除',
    'savedTabs.sortableCategory.bulkOpenTitle': '複数タブを開く',
    'savedTabs.sortableCategory.tabCountLabel': 'タブ数',
    'savedTabs.subCategory.addPlaceholder': '例: ニュース、ブログ、コラム',
    'savedTabs.subCategory.addTitle': '新しい子カテゴリを追加',
    'savedTabs.subCategory.createError': 'カテゴリの追加に失敗しました',
    'savedTabs.subCategory.created': '新しいカテゴリ「{{name}}」を追加しました',
    'savedTabs.subCategory.deleteAria': 'カテゴリ {{name}} を削除',
    'savedTabs.subCategory.deleteConfirmHint':
      'この子カテゴリに属するすべてのタブは未分類になります',
    'savedTabs.subCategory.deleteConfirmTitle':
      '「{{name}}」子カテゴリを削除しますか？',
    'savedTabs.subCategory.deleteError': 'カテゴリの削除に失敗しました',
    'savedTabs.subCategory.deleteSelected': '選択中の子カテゴリを削除',
    'savedTabs.subCategory.deleted': 'カテゴリ「{{name}}」を削除しました',
    'savedTabs.subCategory.duplicateName': 'このカテゴリ名は既に存在しています',
    'savedTabs.subCategory.empty': 'このドメインには子カテゴリがありません。',
    'savedTabs.subCategory.keywordManagerTitle': '子カテゴリキーワード管理',
    'savedTabs.subCategory.rename': '子カテゴリ名を変更',
    'savedTabs.subCategory.renameError': 'カテゴリ名の変更に失敗しました',
    'savedTabs.subCategory.renameHint': 'Enter で確定、Escape でキャンセル',
    'savedTabs.subCategory.renamePrompt':
      '「{{name}}」の新しい名前を入力してください。入力後、フォーカスを外すかEnterキーで保存されます。キャンセルするにはEscを押してください',
    'savedTabs.subCategory.renamed':
      'カテゴリ名を「{{before}}」から「{{after}}」に変更しました',
    'savedTabs.subCategory.reorderCanceled':
      '子カテゴリの並び替えをキャンセルしました',
    'savedTabs.subCategory.reorderUpdateError':
      '子カテゴリ順序の更新に失敗しました',
    'savedTabs.subCategory.reorderUpdated': '子カテゴリの順序を変更しました',
    'savedTabs.subCategory.selectLabel': '子カテゴリを選択',
    'savedTabs.subCategory.selectPlaceholder': '管理する子カテゴリを選択',
    'savedTabs.subCategory.titleKeywords': '「{{name}}」カテゴリのキーワード',
    'savedTabs.tab.addError': 'タブの追加に失敗しました',
    'savedTabs.tab.added': 'タブを追加しました',
    'savedTabs.tab.categoryClearedAlt':
      'タブのカテゴリを解除しました（Alt+クリック）',
    'savedTabs.tab.deleteError': 'タブの削除に失敗しました',
    'savedTabs.tab.deleted': 'タブを削除しました',
    'savedTabs.tab.moveBetweenProjectsError': 'タブの移動に失敗しました',
    'savedTabs.tab.moveError': 'タブの分類更新に失敗しました',
    'savedTabs.tab.movedBetweenProjects': 'タブを移動しました',
    'savedTabs.tab.movedToCategory': 'タブを「{{name}}」に移動しました',
    'savedTabs.tab.movedToUncategorized': 'タブを未分類に移動しました',
    'savedTabs.tab.orderUpdateError': 'タブの順序更新に失敗しました',
    'savedTabs.tab.orderUpdated': 'タブの順序を変更しました',
    'savedTabs.tabCount': 'タブ:{{count}}',
    'savedTabs.tabs.deletedCount': '{{count}}件のタブを削除しました',
    'savedTabs.uncategorized': '未分類',
    'savedTabs.uncategorizedDomainsTitle': '未分類のドメイン',
    'savedTabs.undo.deletedTabs':
      '削除した{{count}}件のタブを保存データに戻せます',
    'savedTabs.undo.removedAfterOpen':
      '開いた{{count}}件のタブを保存データから削除しました',
    'savedTabs.undo.restoreError': '保存データを復元できませんでした',
    'savedTabs.undo.restored': '保存データを復元しました',
    'savedTabs.url.deleteAria': 'タブを削除',
    'savedTabs.url.deleteConfirmDescription':
      'このタブを削除します。この操作は元に戻せません。',
    'savedTabs.url.deleteConfirmTitle': 'タブを削除しますか？',
    'savedTabs.viewMode.changeError': '表示モードの切り替えに失敗しました',
    'savedTabs.viewMode.custom': 'カスタムモード',
    'savedTabs.viewMode.domain': 'ドメインモード',
    'savedTabs.viewMode.placeholder': '表示モード',
    'savedTabs.viewMode.selectPlaceholder':
      'ドメインまたはカスタムモードを選択',
    'savedTabs.viewMode.tooltip': '表示モード切り替え',
    'sidebar.analytics': '分析',
    'sidebar.chat': 'チャット',
    'sidebar.collapse': 'サイドバーを小さくする',
    'sidebar.open': 'サイドバーを開く',
    'sidebar.options': 'オプション',
    'sidebar.periodicExecution': '定期実行',
    'sidebar.resize': 'サイドバーの幅を調整',
    'sidebar.tabList': 'タブ一覧',
    'theme.dark': 'ダークモード',
    'theme.light': 'ライトモード',
    'theme.system': 'システム設定',
    'theme.toggle': 'テーマの切り替え',
    'theme.user': 'ユーザー設定',
    'tool.status.approvalRequested': '承認待ち',
    'tool.status.approvalResponded': '応答済み',
    'tool.status.inputAvailable': '実行中',
    'tool.status.inputStreaming': '待機中',
    'tool.status.outputAvailable': '完了',
    'tool.status.outputDenied': '却下',
    'tool.status.outputError': 'エラー',
  },
} as const satisfies Record<AppLanguage, Record<string, string>>

const getMessages = (language: AppLanguage) => messages[language]
type AppLanguage = 'ja' | 'en'
type LanguageSetting = 'system' | AppLanguage

type ChangelogFeature = {
  text: string
  highlight?: boolean
}

type ChangelogItem = {
  version: string
  date: string
  features: ChangelogFeature[]
}

const changelogItems: Record<AppLanguage, ChangelogItem[]> = {
  en: [
    {
      date: '2026-03-14',
      features: [
        {
          text: 'Added a sidebar chat experience that lets you work with saved tabs without leaving the current screen. Use it to research and organize without switching contexts.',
        },
        {
          text: 'Preview: added analytics so you can review patterns in saved tabs with charts and summaries.',
        },
        {
          text: 'Made Custom Mode generally available. Project-specific organization and management are now safer and easier to use.',
        },
        {
          text: 'Various usability improvements and minor fixes.',
        },
      ],
      version: '2.0.0',
    },
    {
      date: '2026-02-27',
      features: [
        {
          text: 'Added the ability to remove an item from its original list when a drag-and-drop move succeeds.',
        },
        {
          text: 'Various improvements including performance gains and bug fixes.',
        },
      ],
      version: '1.2.0',
    },
    {
      date: '2025-04-29',
      features: [
        {
          text: 'Added a powerful search feature. Just type a keyword to quickly find saved tabs.',
        },
        {
          text: 'Refreshed the design to make the app easier to use and easier to scan.',
        },
        {
          text: 'Confirmation dialogs now appear when tabs or categories are deleted, helping prevent mistakes.',
        },
        {
          text: 'Domains and categories can now be temporarily collapsed, so you can focus on the information you need.',
        },
        {
          text: 'Sorting by registration date now supports ascending and descending order, making it easy to review newer or older saved tabs.',
        },
        {
          text: 'Added a background-tab open option so you can open saved tabs without interrupting your current work.',
        },
        {
          text: 'Preview: implemented Custom Mode for more flexible configuration.',
        },
        {
          text: "Preview: added color customization so you can change the app's appearance to match your preference.",
        },
        {
          text: 'Various improvements including performance gains and bug fixes.',
        },
      ],
      version: '1.1.0',
    },
    {
      date: '2025-03-21',
      features: [
        {
          text: 'Initial release. Categories, quick access, and efficient organization for tabs and bookmarks.',
        },
      ],
      version: '1.0.0',
    },
  ],
  ja: [
    {
      date: '2026-03-14',
      features: [
        {
          text: '保存したタブを見ながらそのまま使える、サイドバーのチャット機能を追加しました。調べものや整理を、画面を切り替えずに進められます。',
        },
        {
          text: 'プレビュー版：分析機能を追加しました。保存したタブの傾向を、グラフや要約で確認できます。',
        },
        {
          text: 'カスタムモードを正式リリースしました。プロジェクトごとの整理や管理を、これまで以上に安心して使えるようになりました。',
        },
        {
          text: 'その他、使いやすさの向上や細かな改善を行いました。',
        },
      ],
      version: '2.0.0',
    },
    {
      date: '2026-02-27',
      features: [
        {
          text: 'ドラッグ&ドロップで移動が成功した際、元のリストから削除できる機能を追加しました。',
        },
        {
          text: 'その他、パフォーマンスの向上やバグ修正など、様々な改善を行いました。',
        },
      ],
      version: '1.2.0',
    },
    {
      date: '2025-04-29',
      features: [
        {
          text: '便利な検索機能を追加しました。キーワードを入力するだけで、保存したタブをすばやく見つけることができます。',
        },
        { text: 'より使いやすく、見やすくなるようデザインを改善しました。' },
        {
          text: 'タブやカテゴリの削除時に確認ダイアログが表示されるようになり、誤操作を防止できます。',
        },
        {
          text: 'ドメインやカテゴリを一時的に閉じることができるようになり、必要な情報だけを表示できます。',
        },
        {
          text: '登録日時によって昇順・降順に並び替えができるようになり、新しく保存したタブや古く保存したタブを簡単に確認できます。',
        },
        {
          text: '保存したタブをバックグラウンドタブで開く機能を追加し、現在の作業を中断せずにタブを開けるようになりました。',
        },
        {
          text: 'プレビュー版：カスタムモードを実装し、より柔軟な設定が可能になりました。',
        },
        {
          text: 'プレビュー版：カラーカスタマイズ機能を追加し、お好みの色でアプリの外観を変更できます。',
        },
        {
          text: 'その他、パフォーマンスの向上やバグ修正など、様々な改善を行いました。',
        },
      ],
      version: '1.1.0',
    },
    {
      date: '2025-03-21',
      features: [
        {
          text: '初回リリース。タブやブックマークを効率的に管理できるツールとして、カテゴリ別の整理や簡単なアクセスが可能になりました。',
        },
      ],
      version: '1.0.0',
    },
  ],
}

const getChangelogItems = (language: AppLanguage) => changelogItems[language]

export type { AppLanguage, ChangelogFeature, ChangelogItem, LanguageSetting }
export { getChangelogItems, getMessages }
