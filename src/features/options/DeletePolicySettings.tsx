import { useI18n } from '@/features/i18n/context/I18nProvider'

type DeletePolicySettingsProps = {
  readonly confirmDeleteAll: boolean
  readonly confirmDeleteEach: boolean
}

type DeletePolicyRow = {
  readonly confirmationKey: string
  readonly operationKey: string
  readonly undoAvailable: boolean
  readonly undoWindowKey: string
}

/**
 * 削除ポリシーの一覧表示 (issue #1116)。
 *
 * ADR-0001 の操作インベントリを利用者向けに要約し、「操作前に、確認が出るか /
 * 元に戻せるか / いつまで戻せるか」を Options で予測できるようにする。
 * 表示専用であり、削除や Undo の挙動そのものは変更しない
 * (Undo の一貫性そのものは #922 の範囲)。
 * 確認列のうち設定依存の2行は、現在の設定値に連動して表示する。
 */
const DeletePolicySettings = ({
  confirmDeleteAll,
  confirmDeleteEach,
}: DeletePolicySettingsProps) => {
  const { t } = useI18n()

  const confirmBySetting = (enabled: boolean): string =>
    enabled
      ? 'options.deletePolicy.confirmBySettingOn'
      : 'options.deletePolicy.confirmBySettingOff'

  const rows: readonly DeletePolicyRow[] = [
    {
      operationKey: 'options.deletePolicy.rowDeleteOneUrl',
      confirmationKey: confirmBySetting(confirmDeleteEach),
      undoAvailable: true,
      undoWindowKey: 'options.deletePolicy.windowWhileNotification',
    },
    {
      operationKey: 'options.deletePolicy.rowDeleteGroupUrls',
      confirmationKey: confirmBySetting(confirmDeleteAll),
      undoAvailable: true,
      undoWindowKey: 'options.deletePolicy.windowWhileNotification',
    },
    {
      operationKey: 'options.deletePolicy.rowRemoveFromProject',
      confirmationKey: confirmBySetting(confirmDeleteEach),
      undoAvailable: true,
      undoWindowKey: 'options.deletePolicy.windowWhileNotification',
    },
    {
      operationKey: 'options.deletePolicy.rowRemoveAfterOpen',
      confirmationKey: 'options.deletePolicy.confirmNone',
      undoAvailable: true,
      undoWindowKey: 'options.deletePolicy.windowWhileNotification',
    },
    {
      operationKey: 'options.deletePolicy.rowRemoveAfterExternalDrop',
      confirmationKey: 'options.deletePolicy.confirmNone',
      undoAvailable: false,
      undoWindowKey: 'options.deletePolicy.windowNone',
    },
    {
      operationKey: 'options.deletePolicy.rowDeleteProject',
      confirmationKey: 'options.deletePolicy.confirmAlways',
      undoAvailable: true,
      undoWindowKey: 'options.deletePolicy.windowWhileNotification',
    },
    {
      operationKey: 'options.deletePolicy.rowDeleteCategory',
      confirmationKey: 'options.deletePolicy.confirmAlways',
      undoAvailable: false,
      undoWindowKey: 'options.deletePolicy.windowNone',
    },
    {
      operationKey: 'options.deletePolicy.rowAutoDelete',
      confirmationKey: 'options.deletePolicy.confirmNone',
      undoAvailable: false,
      undoWindowKey: 'options.deletePolicy.windowNone',
    },
    {
      operationKey: 'options.deletePolicy.rowReviewReminderDelete',
      confirmationKey: 'options.deletePolicy.confirmAlways',
      undoAvailable: true,
      undoWindowKey: 'options.deletePolicy.windowPageOpen30Minutes',
    },
    {
      operationKey: 'options.deletePolicy.rowAiActionDelete',
      confirmationKey: 'options.deletePolicy.confirmAlways',
      undoAvailable: true,
      undoWindowKey: 'options.deletePolicy.windowPageOpen30Minutes',
    },
  ]

  return (
    <div className='mb-8 rounded-lg border border-border bg-card p-6 shadow-md'>
      <h2 className='mb-2 text-xl font-semibold text-foreground'>
        {t('options.deletePolicy.title')}
      </h2>
      <p className='mb-4 text-sm text-muted-foreground'>
        {t('options.deletePolicy.description')}
      </p>
      <div className='overflow-x-auto'>
        <table className='w-full text-left text-sm'>
          <thead>
            <tr className='border-b border-border text-foreground'>
              <th scope='col' className='py-2 pr-4 font-medium'>
                {t('options.deletePolicy.columnOperation')}
              </th>
              <th scope='col' className='py-2 pr-4 font-medium'>
                {t('options.deletePolicy.columnConfirmation')}
              </th>
              <th scope='col' className='py-2 pr-4 font-medium'>
                {t('options.deletePolicy.columnUndo')}
              </th>
              <th scope='col' className='py-2 font-medium'>
                {t('options.deletePolicy.columnUndoWindow')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.operationKey}
                className='border-b border-border/60 text-foreground last:border-b-0'
              >
                <td className='py-2 pr-4'>{t(row.operationKey)}</td>
                <td className='py-2 pr-4'>{t(row.confirmationKey)}</td>
                <td className='py-2 pr-4'>
                  {t(
                    row.undoAvailable
                      ? 'options.deletePolicy.undoAvailable'
                      : 'options.deletePolicy.undoUnavailable',
                  )}
                </td>
                <td className='py-2'>{t(row.undoWindowKey)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className='mt-3 text-sm text-muted-foreground'>
        {t('options.deletePolicy.autoDeleteNote')}
      </p>
    </div>
  )
}

export { DeletePolicySettings }
