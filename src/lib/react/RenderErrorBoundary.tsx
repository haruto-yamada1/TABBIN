import { Component, useCallback, useState } from 'react'
import type { ReactNode } from 'react'

export type RenderRecoveryOptions = {
  readonly onExport?: (() => Promise<void>) | undefined
}

type Props = RenderRecoveryOptions & {
  readonly children?: ReactNode
}

type State = {
  readonly failed: boolean
}

// Recovery must also work when translation, theme, or feature providers fail.
const getLabels = () =>
  document.documentElement.lang.startsWith('ja')
    ? {
        title: '画面の表示中に問題が発生しました',
        description: '再試行するか、ページを再読み込みしてください。',
        retry: '再試行',
        reload: 'ページを再読み込み',
        export: 'データをエクスポート',
        exporting: 'エクスポート中…',
        privacy:
          'バックアップには個人データが含まれます。安全に保管してください。',
        actionFailed: '操作を完了できませんでした。再試行してください。',
      }
    : {
        title: 'Something went wrong while displaying this page',
        description: 'Try again or reload the page.',
        retry: 'Retry',
        reload: 'Reload page',
        export: 'Export data',
        exporting: 'Exporting…',
        privacy: 'The backup contains private data. Store it securely.',
        actionFailed: 'The action could not be completed. Please try again.',
      }

const buttonClassName =
  'rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50'

const RenderErrorFallback = ({
  onExport,
  onRetry,
}: RenderRecoveryOptions & { readonly onRetry: () => void }) => {
  const [exporting, setExporting] = useState(false)
  const [actionFailed, setActionFailed] = useState(false)
  const handleReload = useCallback(() => {
    try {
      window.location.reload()
    } catch {
      setActionFailed(true)
    }
  }, [])

  const handleExport = useCallback(() => {
    if (exporting || !onExport) {
      return
    }
    setExporting(true)
    setActionFailed(false)
    void Promise.resolve()
      .then(onExport)
      .catch(() => {
        setActionFailed(true)
      })
      .finally(() => {
        setExporting(false)
      })
  }, [exporting, onExport])

  const labels = getLabels()

  return (
    <section
      className='m-6 mx-auto w-full max-w-2xl rounded-xl border border-border bg-background p-6 text-foreground shadow-sm'
      role='alert'
    >
      <h1 className='text-xl font-semibold'>{labels.title}</h1>
      <p className='mt-2 text-sm'>{labels.description}</p>
      {onExport ? <p className='mt-2 text-sm'>{labels.privacy}</p> : null}
      {actionFailed ? (
        <p className='mt-3 text-sm text-destructive'>{labels.actionFailed}</p>
      ) : null}
      <div className='mt-5 flex flex-wrap gap-3'>
        <button
          className={buttonClassName}
          disabled={exporting}
          onClick={onRetry}
          type='button'
        >
          {labels.retry}
        </button>
        <button
          className={buttonClassName}
          onClick={handleReload}
          type='button'
        >
          {labels.reload}
        </button>
        {onExport ? (
          <button
            className={buttonClassName}
            disabled={exporting}
            onClick={handleExport}
            type='button'
          >
            {exporting ? labels.exporting : labels.export}
          </button>
        ) : null}
      </div>
    </section>
  )
}

export class RenderErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  private readonly handleRetry = () => {
    // eslint-disable-next-line react/no-set-state -- Resetting an Error Boundary requires React's class state API.
    this.setState({ failed: false })
  }

  override render(): ReactNode {
    if (!this.state.failed) {
      return this.props.children
    }
    return (
      <RenderErrorFallback
        onExport={this.props.onExport}
        onRetry={this.handleRetry}
      />
    )
  }
}
