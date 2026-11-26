import type { linkCaptureMessagesEn } from './linkCaptureMessages.en'

const linkCaptureMessagesJa: Record<
  keyof typeof linkCaptureMessagesEn,
  string
> = {
  'options.linkClickCapture.title': 'リンク保存操作',
  'options.linkClickCapture.enable': 'キー＋クリックでのリンク保存を有効にする',
  'options.linkClickCapture.instructions':
    '登録キーを押しながらリンクを左クリックすると、リンク先を開かず保存します。一括選択と同じキーの場合、ドラッグは範囲選択、クリックは1件保存になります。Ctrl・Alt・Shift・Meta を含む組み合わせはリンクの標準操作と競合するため登録できません。',
  'options.linkClickCapture.reserved':
    'ブラウザ・OS またはリンクの標準操作と競合します。Ctrl・Alt・Shift・Meta を含まないキーを選んでください。',
  'options.linkCapture.title': 'リンクの一括選択・保存',
  'options.linkCapture.enable': 'リンクの選択と保存を有効にする',
  'options.linkCapture.description':
    'HTTP・HTTPS サイトへのアクセスを許可してリンクを選択します。ブラウザの組込ページ、拡張機能ストア、保護されたサイト、埋込フレームでは利用できません。ページ本文の保存や第三者への送信は行いません。',
  'options.linkCapture.instructions':
    'キーを押したまま左マウスボタンでドラッグします。途中でキーを離すか Escape でキャンセルします。キーボードだけで保存する場合はリンクへフォーカスし、キーを押しながら Enter を押します。',
  'options.linkCapture.physical':
    'キーは物理的な位置（KeyboardEvent.code）で判定し、配列に応じた文字を併記します。ブラウザ・OS の予約操作は登録できません。OS が先に受け取るキーはブラウザへ届かない場合があります。',
  'options.linkCapture.change': 'キーを変更',
  'options.linkCapture.save': 'キーを保存',
  'options.linkCapture.reset': '初期キーに戻す',
  'options.linkCapture.cancel': 'キャンセル',
  'options.linkCapture.recording':
    'キーまたは組み合わせを押してください。修飾キーだけを使う場合は押して離します。10 秒で記録を終了します。',
  'options.linkCapture.permissionError':
    'サイトへのアクセスが許可されなかったため、機能は OFF のままです。再度有効にするか、ブラウザの拡張機能設定でサイトへのアクセスを確認してください。',
  'options.linkCapture.loadError':
    '設定を読み込めませんでした。設定ページを再読み込みしてください。',
  'options.linkCapture.storageError':
    '設定を保存できませんでした。前の設定を表示しています。もう一度お試しください。',
  'options.linkCapture.unavailable':
    '利用できるキー入力を取得できませんでした。ブラウザや OS が予約している可能性があるため、別のキーをお試しください。',
  'options.linkCapture.composition':
    'IME 変換中の入力や AltGraph は起動キーに使えません。変換を終了して別のキーをお試しください。',
  'options.linkCapture.reserved':
    'ブラウザまたは OS の操作と競合するキーです。別のキーを選んでください。',
  'options.linkCapture.saved': 'キーを保存しました。',
}

export { linkCaptureMessagesJa }
