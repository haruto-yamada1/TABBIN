type Guide = { en: string[]; ja: string[] }
const guides: Record<string, Guide> = {
  'install-extension': {
    en: [
      'Chrome: install TABBIN from the Chrome Web Store. Firefox: install it from Firefox Add-ons. Check the extension name and requested permissions before adding it.',
      'After installation, return to Academy from the sidebar or Options whenever you need help. Reading this guide does not save any tabs.',
    ],
    ja: [
      'ChromeではChrome ウェブストア、FirefoxではFirefox Add-onsからTABBINを追加します。拡張機能名と要求される権限を確認してください。',
      '追加後はサイドバーやOptionsからAcademyへいつでも戻れます。このガイドを読むだけではタブは保存されません。',
    ],
  },
  'pin-extension': {
    en: [
      'Chrome: open the puzzle-shaped Extensions menu and select the pin next to TABBIN.',
      'Firefox: open the Extensions menu, then the gear menu beside TABBIN, and choose Pin to Toolbar. Labels may vary by browser version.',
    ],
    ja: [
      'Chromeではパズル型の拡張機能メニューを開き、TABBINの横のピンを選びます。',
      'Firefoxでは拡張機能メニュー内のTABBINの歯車メニューから「ツールバーにピン留め」を選びます。表記はブラウザのバージョンによって異なる場合があります。',
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
      'Move domains into that category to organize whole sites. Edit the category name when your organization changes.',
    ],
    ja: [
      'Domainモードのカテゴリ操作から親カテゴリを作成し、内容が分かる名前を付けます。',
      'ドメインを親カテゴリに移動すると、サイト全体を分類できます。整理方針が変わったらカテゴリ名を編集できます。',
    ],
  },
  'child-categories': {
    en: [
      'Create a child category within a parent to organize a more specific topic.',
      'Assign saved URLs to the child category. Choose names that help distinguish the URLs within the same site.',
    ],
    ja: [
      '親カテゴリの中に子カテゴリを作ると、より細かいテーマで整理できます。',
      '保存URLを子カテゴリに割り当てます。同じサイト内でも内容を区別しやすい名前を付けましょう。',
    ],
  },
  'reorder-items': {
    en: [
      'Use the drag handle to change the order of categories and domains when manual ordering is available.',
      'With the keyboard, focus a drag handle, press Space to pick it up, use arrow keys to move, then Space to drop. Escape cancels the move.',
    ],
    ja: [
      '手動の並び順に対応する場所では、ドラッグハンドルでカテゴリやドメインの表示順を変更できます。',
      'キーボードではハンドルにフォーカスし、Spaceで持ち上げ、矢印キーで移動し、Spaceで確定します。Escapeで取り消せます。',
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
  lessonId === 'install-extension' || lessonId === 'pin-extension'
    ? '/options'
    : '/saved-tabs?mode=domain'
