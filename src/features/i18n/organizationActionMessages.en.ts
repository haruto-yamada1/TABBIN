const organizationActionMessagesEn = {
  'aiChat.tool.listOrganizationTargets.description':
    'Read existing project and category IDs and paged saved URL memberships (default 50, maximum 200 per page). Filter memberships with projectId and/or urlIds from saved URL search results. Use page, totalPages, and hasNextPage to retrieve remaining memberships before proposing an organization action.',
  'aiChat.tool.listOrganizationTargets.title': 'Check organization targets',
  'aiChat.tool.proposeSavedTabsAction.description':
    'Return a proposal to move up to 100 unique saved URL IDs between projects, set their project category, delete saved URLs, or create a project. Use only known IDs and valid memberships. A move target must not already contain a selected URL. This tool never changes saved data; the user must confirm the preview. delete_urls deletes URLs and all their memberships globally. Never propose automatic duplicate deletion.',
  'aiChat.tool.proposeSavedTabsAction.title': 'Propose saved tab organization',
  'aiChat.action.title': 'Proposed action',
  'aiChat.action.review': 'Review proposed action',
  'aiChat.action.approve': 'Approve and apply',
  'aiChat.action.cancel': 'Cancel',
  'aiChat.action.undo': 'Undo this action',
  'aiChat.action.move_urls': 'Move URLs between projects',
  'aiChat.action.set_category': 'Change project category',
  'aiChat.action.delete_urls': 'Delete saved URLs',
  'aiChat.action.create_project': 'Create project',
  'aiChat.action.count': 'Affected URLs: {{count}}',
  'aiChat.action.target': 'Target',
  'aiChat.action.before': 'Before',
  'aiChat.action.after': 'After',
  'aiChat.action.approvalNotice':
    'Review every target and change below. Nothing is saved until you approve.',
  'aiChat.action.deleteNotice':
    'These URLs will be deleted from all projects and domain collections.',
  'aiChat.action.undoNotice':
    'Undo is available here for 30 minutes while this page stays open. Later changes to these targets may prevent Undo.',
  'aiChat.action.applied': 'Action applied.',
  'aiChat.action.undone': 'Action undone.',
  'aiChat.action.error':
    'The action could not be applied. The proposal may be invalid, expired, or affected by later changes. Review it again.',
  'aiChat.action.undoError':
    'Undo could not be completed. It may have expired or these targets may have changed. Your saved data was not overwritten.',
  'aiChat.action.notificationFailed':
    'The change was saved, but other views could not be notified. Reload those views to see it.',
} as const

export { organizationActionMessagesEn }
