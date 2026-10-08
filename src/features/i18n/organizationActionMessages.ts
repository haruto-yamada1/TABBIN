export const organizationActionMessages = {
  en: {
    'aiChat.tool.listOrganizationTargets.description':
      'Read existing project and category IDs and paged saved URL memberships (default 50, maximum 200 per page). Filter memberships with projectId and/or urlIds from saved URL search results. Use page, totalPages, and hasNextPage to retrieve remaining memberships before proposing an organization action.',
    'aiChat.tool.listOrganizationTargets.title': 'Check organization targets',
    'aiChat.tool.proposeSavedTabsAction.description':
      'Return a proposal to move up to 100 unique saved URL IDs between projects, set their project category, delete saved URLs, or create a project. Use only known IDs and valid memberships. A move target must not already contain a selected URL. This tool never changes saved data; the user must confirm the preview. delete_urls deletes URLs and all their memberships globally. Never propose automatic duplicate deletion.',
    'aiChat.tool.proposeSavedTabsAction.title':
      'Propose saved tab organization',
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
  },
  ja: {
    'aiChat.tool.listOrganizationTargets.description':
      '既存のプロジェクト・カテゴリのIDと保存URLの所属をページ単位で読み取る（既定50件、1ページ最大200件）。projectIdと検索結果のurlIdsで所属を絞り込める。page・totalPages・hasNextPageで残りの所属を取得してから整理操作を提案する',
    'aiChat.tool.listOrganizationTargets.title': '整理対象の確認',
    'aiChat.tool.proposeSavedTabsAction.description':
      '最大100件の一意な保存URL IDについて、プロジェクト間の移動、プロジェクト内カテゴリ変更、保存URL削除、またはプロジェクト作成を提案する。既存IDと正しい所属だけを使い、移動先に対象URLがすでにある場合は提案しない。このtoolは保存状態を変更せず、ユーザーがプレビューを確認するまで実行されない。delete_urlsはURLと全所属を全プロジェクトから削除する。重複の自動削除は提案しない',
    'aiChat.tool.proposeSavedTabsAction.title': '保存タブの整理提案',
    'aiChat.action.title': '操作提案',
    'aiChat.action.review': '操作提案を確認',
    'aiChat.action.approve': '承認して実行',
    'aiChat.action.cancel': 'キャンセル',
    'aiChat.action.undo': 'この操作を元に戻す',
    'aiChat.action.move_urls': 'プロジェクト間で URL を移動',
    'aiChat.action.set_category': 'プロジェクトのカテゴリを変更',
    'aiChat.action.delete_urls': '保存 URL を削除',
    'aiChat.action.create_project': 'プロジェクトを作成',
    'aiChat.action.count': '対象 URL：{{count}} 件',
    'aiChat.action.target': '対象',
    'aiChat.action.before': '変更前',
    'aiChat.action.after': '変更後',
    'aiChat.action.approvalNotice':
      '以下の対象と変更内容を確認してください。承認するまで保存データは変更されません。',
    'aiChat.action.deleteNotice':
      '対象 URL をすべてのプロジェクトとドメインのコレクションから削除します。',
    'aiChat.action.undoNotice':
      'このページを開いている間、30分間はここで元に戻せます。対象への後続の変更により元に戻せなくなることがあります。',
    'aiChat.action.applied': '操作を実行しました。',
    'aiChat.action.undone': '操作を元に戻しました。',
    'aiChat.action.error':
      '操作を実行できませんでした。提案が無効、期限切れ、または対象が変更された可能性があります。もう一度確認してください。',
    'aiChat.action.undoError':
      '元に戻せませんでした。期限切れ、または対象が変更された可能性があります。保存データは上書きしていません。',
    'aiChat.action.notificationFailed':
      '変更は保存されましたが、他の画面に通知できませんでした。該当画面を再読み込みしてください。',
  },
}
