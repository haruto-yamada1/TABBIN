type Guide = { en: string[]; ja: string[] }
const guides: Record<string, Guide> = {
  'install-extension': {
    en: [
      'Chrome: open the official TABBIN page in Chrome Web Store, choose Add to Chrome, read the permission prompt and confirm Add extension.',
      'Firefox: open the official TABBIN page in Firefox Add-ons, choose Add to Firefox, read the permissions and confirm Add. Browser labels can vary. Check that TABBIN appears in Extensions; installation does not pin the icon.',
    ],
    ja: [
      'ChromeではChrome ウェブストアの公式TABBINページを開き、「Chromeに追加」を選びます。権限の確認を読んで「拡張機能を追加」を選びます。',
      'FirefoxではFirefox Add-onsの公式TABBINページから「Firefoxへ追加」を選び、権限を読んで追加します。表記はバージョンにより異なります。拡張機能メニューにTABBINがあることを確認します。導入だけでは固定されません。',
    ],
  },
  'pin-extension': {
    en: [
      'Chrome: open the puzzle-shaped Extensions menu and select the pin next to TABBIN.',
      'Firefox: open the Extensions menu, then the gear or three-dot menu beside TABBIN, and choose Pin to Toolbar. Labels may vary by browser version.',
    ],
    ja: [
      'Chromeではパズル型の拡張機能メニューを開き、TABBINの横のピンを選びます。',
      'Firefoxでは拡張機能メニュー内のTABBINの歯車または三点メニューから「ツールバーにピン留め」を選びます。表記はブラウザのバージョンによって異なる場合があります。',
    ],
  },
  'save-tabs': {
    en: [
      'The toolbar action saves the selected scope of tabs according to your Options settings, then closes the original saved tabs. Check the scope and finish any unsaved work before using it.',
      'Saved URLs appear in the tab list. Saving is an action you perform from the extension toolbar; this guide does not trigger it.',
    ],
    ja: [
      'ツールバーの操作はOptionsで選んだ範囲のタブを保存し、保存した元のタブを閉じます。実行前に対象範囲を確認し、未保存の作業を終えてください。',
      '保存したURLはタブ一覧で確認できます。実際の保存は拡張機能のツールバーから操作します。このガイドは保存を実行しません。',
    ],
  },
  'domain-mode': {
    en: [
      'Open Domain mode from the sidebar. URLs from the same domain are grouped together, making sites easy to find.',
      'Expand a domain to inspect its saved URLs. The search field helps find a title or URL across the saved list.',
    ],
    ja: [
      'サイドバーからDomainモードを開きます。同じドメインのURLがまとまるため、サイトごとに探しやすくなります。',
      'ドメインを開くと保存URLを確認できます。検索欄では、保存済みのタイトルやURLから探せます。',
    ],
  },
  'parent-categories': {
    en: [
      'In Domain mode, use the category controls to create a parent category and give it a meaningful name.',
      'Move domains into that category to organize whole sites. Open the parent category settings, edit its name and save. Check the new name and domain assignment after reopening the list.',
    ],
    ja: [
      'Domainモードのカテゴリ操作から親カテゴリを作成し、内容が分かる名前を付けます。',
      'ドメインを親カテゴリに移動すると、サイト全体を分類できます。親カテゴリの設定を開き、名前を編集して保存します。一覧を開き直して名前と割り当てを確認します。',
    ],
  },
  'child-categories': {
    en: [
      'Open a domain card’s category controls to create a child category. These categories classify URLs within that domain; Custom mode has its own category structure.',
      'Edit a child category’s name and keywords. Keywords match saved URL titles and move matching URLs into the category.',
    ],
    ja: [
      'ドメインカードのカテゴリ操作から子カテゴリを作成します。子カテゴリはそのドメイン内のURLを分類します。Customモードのカテゴリ構造とは別です。',
      '子カテゴリの名前とキーワードを編集します。保存URLのタイトルがキーワードに一致すると、その子カテゴリへ再分類されます。',
    ],
  },
  'reorder-items': {
    en: [
      'Use the drag handle to change the order of categories and domains when manual ordering is available.',
      'With the keyboard, focus a drag handle, press Space to pick it up, use arrow keys to move, then Space to drop. Review the preview and use Confirm to save the order. Escape cancels the move.',
    ],
    ja: [
      '手動の並び順に対応する場所では、ドラッグハンドルでカテゴリやドメインの表示順を変更できます。',
      'キーボードではハンドルにフォーカスし、Spaceで持ち上げ、矢印キーで移動し、Spaceでドロップします。プレビューを確認して「確定」で並び順を保存します。Escapeで取り消せます。',
    ],
  },
  'restore-tabs': {
    en: [
      'In the saved tab list, open a URL to restore it in your browser. Bulk opening can create many tabs, so check the selection first.',
      'Keep a JSON backup of important saved tabs from Options. Review the import preview before restoring any backup.',
    ],
    ja: [
      '保存タブ一覧のURLを開くと、ブラウザのタブとして復元できます。一括で開くと多くのタブが作られるため、実行前に対象を確認します。',
      '大切な保存タブはOptionsからJSONバックアップも保存しておきましょう。バックアップの復元前にはインポートプレビューを確認します。',
    ],
  },
}
export const getAcademyGuide = (lessonId: string, language: 'ja' | 'en') =>
  guides[lessonId]?.[language] ?? []
export const getAcademyRelatedRoute = (lessonId: string) =>
  lessonId === 'pin-extension' || lessonId === 'install-extension'
    ? '/options'
    : '/saved-tabs?mode=domain'
