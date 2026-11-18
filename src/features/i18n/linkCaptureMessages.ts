export const linkCaptureMessages = {
  en: {
    'options.linkClickCapture.title': 'Link saving gesture',
    'options.linkClickCapture.enable': 'Enable key + click saving',
    'options.linkClickCapture.instructions':
      'Hold the recorded key and left-click a link to save it without opening it. When the same key is used for link selection, dragging selects links and clicking saves one. Ctrl, Alt, Shift and Meta combinations are reserved for standard link actions and cannot be registered here.',
    'options.linkClickCapture.reserved':
      'This key conflicts with a browser, OS or standard link action. Choose a key without Ctrl, Alt, Shift or Meta.',
    'options.linkCapture.title': 'Select and save links',
    'options.linkCapture.enable': 'Enable link selection and saving',
    'options.linkCapture.description':
      'Allow access to HTTP and HTTPS sites to select links. Browser pages, extension stores, protected sites and embedded frames are unavailable. No page text is saved or sent to third parties.',
    'options.linkCapture.instructions':
      'Hold the key and drag with the left mouse button. Release the key or press Escape to cancel. To save one focused link using the keyboard, hold the key and press Enter.',
    'options.linkCapture.physical':
      'Keys use their physical position (KeyboardEvent.code); the label shows the character from your keyboard layout. Browser and OS shortcuts cannot be used. Some operating systems intercept keys before the browser can receive them.',
    'options.linkCapture.change': 'Change key',
    'options.linkCapture.save': 'Save key',
    'options.linkCapture.reset': 'Reset key',
    'options.linkCapture.cancel': 'Cancel',
    'options.linkCapture.recording':
      'Press a key or key combination. Release a modifier to use it alone. Recording ends after 10 seconds.',
    'options.linkCapture.permissionError':
      'Site access was not granted. The feature stays off. Enable it again to retry, or review site access in your browser’s extension settings.',
    'options.linkCapture.loadError':
      'Could not load these settings. Reload the settings page to try again.',
    'options.linkCapture.storageError':
      'Could not save these settings. Your previous setting is still shown. Try again.',
    'options.linkCapture.unavailable':
      'No usable key event was received. The browser or operating system may reserve this key. Try a different key.',
    'options.linkCapture.composition':
      'IME composition and AltGraph cannot be used as activation keys. Finish composition and try a different key.',
    'options.linkCapture.reserved':
      'This key conflicts with a browser or OS operation. Choose a different key.',
    'options.linkCapture.saved': 'Key saved.',
  },
  ja: {
    'options.linkClickCapture.title': 'リンク保存操作',
    'options.linkClickCapture.enable':
      'キー＋クリックでのリンク保存を有効にする',
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
  },
}
