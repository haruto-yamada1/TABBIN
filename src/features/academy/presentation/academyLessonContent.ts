type LessonContent = {
  goal: string
  screen: string
  prerequisites: string
  notes: string
  completion: string
}
type ContentParts = [string, string, string, string, string]
const metadata: Record<string, Record<'ja' | 'en', ContentParts>> = {
  'install-extension': {
    en: [
      'Install the official extension and identify the browser confirmation prompt.',
      'Chrome Web Store / Firefox Add-ons',
      'Open the official TABBIN listing in your browser. No account is needed for this lesson.',
      'Read the permissions before adding the extension. The video shows Chrome; Firefox uses its own Add-ons confirmation.',
      'TABBIN appears in the browser’s Extensions menu.',
    ],
    ja: [
      '公式の拡張機能を導入し、ブラウザの確認画面を見分けます。',
      'Chrome ウェブストア / Firefox Add-ons',
      '利用ブラウザで公式のTABBIN掲載ページを開きます。この教材にアカウント登録は不要です。',
      '追加前に権限の説明を読みます。映像はChromeです。FirefoxではAdd-ons独自の確認画面を使います。',
      'ブラウザの拡張機能メニューにTABBINが表示されます。',
    ],
  },
  'pin-extension': {
    en: [
      'Keep the extension icon visible and undo pinning when needed.',
      'Browser Extensions menu / toolbar',
      'Install TABBIN first.',
      'Click the same pin again to unpin. Firefox’s gear/menu item and labels vary by version.',
      'TABBIN remains visible on the toolbar after closing the menu.',
    ],
    ja: [
      '拡張機能のアイコンを常時表示し、必要なら固定を解除できます。',
      'ブラウザの拡張機能メニュー / ツールバー',
      '先にTABBINをインストールします。',
      '同じピンをもう一度押すと解除できます。Firefoxの歯車メニューや表記はバージョンによって異なります。',
      'メニューを閉じてもツールバーにTABBINが表示されます。',
    ],
  },
  'save-tabs': {
    en: [
      'Save several sites and explain why the original tabs close.',
      'Options → click action / browser toolbar / Saved Tabs',
      'Use only disposable tabs after finishing unsaved work. The video uses six fictional URLs across three hostnames.',
      'The default saves tabs from the current domain. The video explicitly selects all tabs in the current window. Check pinned-tab exclusions and the selected scope first.',
      'The saved original tabs close, and their URLs appear in Domain mode.',
    ],
    ja: [
      '複数サイトを保存し、元のタブが閉じる理由を説明できます。',
      'Optionsのクリック時動作 / ツールバー / 保存タブ一覧',
      '未保存の作業を終え、閉じてもよいタブだけで試します。映像は3ホスト名・6件の架空URLです。',
      '既定は現在のドメインのタブを保存します。映像ではウィンドウの全タブ保存へ明示的に変更します。固定タブの除外と対象範囲も確認します。',
      '保存した元のタブが閉じ、URLがDomainモードに表示されます。',
    ],
  },
  'domain-mode': {
    en: [
      'Locate URLs grouped by hostname and expand their domain card.',
      'Saved Tabs → Domain mode',
      'Have saved URLs, or follow the text guide if the list is empty.',
      'URLs with the same hostname share a domain card. Paths do not create separate domains. Search can hide rows; clear it to see the whole list.',
      'Find two URLs under one domain and distinguish a second hostname.',
    ],
    ja: [
      'ホスト名ごとにまとまるURLを探し、ドメインカードを開けます。',
      '保存タブ一覧 → Domainモード',
      '保存URLがある状態で確認します。空の場合はテキストを使えます。',
      '同じホスト名のURLが1つのカードにまとまります。パスの違いだけでは別ドメインになりません。検索中は行が隠れるため、全体を見るときは解除します。',
      '同じドメインの2件のURLと、別ホスト名のカードを見分けられます。',
    ],
  },
  'parent-categories': {
    en: [
      'Create and rename a parent category, then assign a whole domain.',
      'Domain mode → parent category controls',
      'Use sample practice for changes you do not want applied to real saved data.',
      'A parent category groups domains. Moving a domain moves its whole URL group; it does not change the URLs or their hostname.',
      'The renamed parent contains the intended domain and its URLs.',
    ],
    ja: [
      '親カテゴリを作成・改名し、ドメイン全体を割り当てられます。',
      'Domainモード → 親カテゴリ操作',
      '本物のデータを変更したくない場合はサンプル練習を使います。',
      '親カテゴリはドメインをまとめます。ドメインを移動するとURLのまとまりごと移動し、URLやホスト名は変わりません。',
      '改名した親カテゴリに目的のドメインとURLが表示されます。',
    ],
  },
  'child-categories': {
    en: [
      'Create and rename a domain’s child category, move a URL and edit matching keywords.',
      'Domain card → child category controls / settings',
      'Expand a domain containing saved URLs. Use sample practice for safe edits.',
      'Child categories belong to a domain. Keyword matching uses saved URL titles; a settings change can reclassify more than the URL you are looking at.',
      'The category’s new name and keywords persist and the intended URL appears there.',
    ],
    ja: [
      'ドメインの子カテゴリを作成・改名し、URL移動とキーワード設定を確認できます。',
      'ドメインカード → 子カテゴリ操作 / 設定',
      '保存URLを含むドメインを開きます。安全に試すときはサンプル練習を使います。',
      '子カテゴリはドメインごとに存在します。キーワードは保存URLのタイトルに一致させるため、設定変更で複数URLが再分類されることがあります。',
      '子カテゴリの新しい名前・キーワードが保持され、目的のURLが分類されます。',
    ],
  },
  'reorder-items': {
    en: [
      'Reorder parents, child categories and domains using their handles.',
      'Domain mode → category / domain drag handles',
      'Use manual ordering; clear search or filters to check the final order.',
      'Keyboard: Space to pick up, arrows to move, Space to drop, Escape to cancel. Touch dragging starts on the handle. Favorites and ordinary URLs keep separate ordering.',
      'The requested order remains after reloading the list.',
    ],
    ja: [
      'ハンドルで親・子カテゴリとドメインの表示順を変更できます。',
      'Domainモード → カテゴリ / ドメインのドラッグハンドル',
      '手動の並び順で操作し、最終確認では検索や絞り込みを解除します。',
      'キーボードはSpaceで持ち上げ、矢印で移動、Spaceで確定、Escapeで中止します。タッチではハンドルから開始します。お気に入りと通常URLの順序は別です。',
      '一覧を再読み込みしても目的の表示順が保たれます。',
    ],
  },
  'restore-tabs': {
    en: [
      'Open one saved URL and a group, then check the result and removal setting.',
      'Domain mode → saved URL / group open controls; Options',
      'Check how many tabs will open. Finish unsaved work and keep a JSON backup of important data.',
      'Options “remove after opening” controls removal of successfully opened saved URLs. Failed URLs remain. Undo can restore removed entries; sample practice simulates opening.',
      'The intended tabs open and saved entries behave according to your removal setting.',
    ],
    ja: [
      '保存URLを1件・グループで開き、結果と削除設定を確認できます。',
      'Domainモード → URL / グループを開く操作、Options',
      '開く件数を確認します。未保存の作業を終え、大切なデータはJSONバックアップも用意します。',
      'Optionsの「開いた後に削除」で、開くことに成功した保存URLの削除を選べます。失敗したURLは残ります。削除はUndoで戻せます。サンプル練習の復元は模擬操作です。',
      '目的のタブが開き、保存一覧は削除設定どおりになります。',
    ],
  },
}
export const getAcademyLessonContent = (
  lessonId: string,
  language: 'ja' | 'en',
): LessonContent | null => {
  const values = metadata[lessonId]?.[language]
  if (!values) {
    return null
  }
  return {
    goal: values[0],
    screen: values[1],
    prerequisites: values[2],
    notes: values[3],
    completion: values[4],
  }
}
