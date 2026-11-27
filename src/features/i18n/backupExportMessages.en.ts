const backupExportMessagesEn = {
  'options.importExport.exportSizeLimit':
    'Maximum backup file size: {{maxSize}}.',
  'options.importExport.exportPreviewTitle': 'Export Preview',
  'options.importExport.exportPreviewDescription':
    'Choose what to include in the JSON backup. Only the data captured when this preview opened will be exported.',
  'options.importExport.preparingExport': 'Preparing backup preview...',
  'options.importExport.exportSections': 'Choose data to export',
  'options.importExport.exportCollections': 'Domains and projects to include',
  'options.importExport.exportSharedUrls':
    'A URL remains included if it also belongs to another selected domain or project.',
  'options.importExport.exportUncollected':
    'URLs without a domain or project ({{count}})',
  'options.importExport.exportCollectionPages': 'Domain and project pages',
  'options.importExport.exportCounts': 'Records in the selected backup',
  'options.importExport.exportPrivacy':
    'Selected data includes full URLs, titles, notes and, when selected, AI content and settings. Check for private information before sharing. Nothing is uploaded.',
  'options.importExport.exportPartialWarning':
    'Unselected data is empty in the file; unselected settings use defaults. When restoring a partial backup, select only the sections you intend to replace. A selected saved-tabs section replaces all current saved tabs.',
  'options.importExport.confirmExport': 'Download JSON backup',
} as const

export { backupExportMessagesEn }
