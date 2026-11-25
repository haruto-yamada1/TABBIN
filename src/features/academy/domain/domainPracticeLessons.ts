export type DomainPracticeStep = {
  readonly stepId: string
  readonly action: string
  readonly dataTour: string
  readonly instruction: Readonly<Record<'en' | 'ja', string>>
}

const parentAction = 'organize-parent-category'
const childAction = 'organize-child-category'
const reorderAction = 'reorder-categories-and-domains'

const lessons: Readonly<Record<string, readonly DomainPracticeStep[]>> = {
  'parent-categories': [
    {
      stepId: 'parent-categories-create',
      action: parentAction,
      dataTour: 'academy-parent-create',
      instruction: {
        en: 'Open Manage parent categories, enter a new name such as Development, and add it.',
        ja: '「親カテゴリを管理」を開き、「開発」などの名前を入力して親カテゴリを追加します。',
      },
    },
    {
      stepId: 'parent-categories-rename',
      action: parentAction,
      dataTour: 'academy-parent-rename',
      instruction: {
        en: 'Open the parent category’s settings, choose Manage parent categories, select its name, and confirm a different name with Enter.',
        ja: '親カテゴリの設定から「親カテゴリを管理」を開き、名前を選んで別の名前を入力し、Enterで確定します。',
      },
    },
    {
      stepId: 'parent-categories-assign',
      action: parentAction,
      dataTour: 'academy-domain-assignment',
      instruction: {
        en: 'Open Manage parent categories, select a parent, and check a domain that is not already assigned to it.',
        ja: '「親カテゴリを管理」で親カテゴリを選び、まだ所属していないドメインにチェックを付けます。',
      },
    },
    {
      stepId: 'parent-categories-success',
      action: parentAction,
      dataTour: 'academy-domain-assignment',
      instruction: {
        en: 'Select a different parent category and assign that domain again. Confirm that the whole domain moves to the new parent.',
        ja: '別の親カテゴリを選び、同じドメインを割り当て直します。ドメイン全体の所属先が変わることを確認します。',
      },
    },
  ],
  'child-categories': [
    {
      stepId: 'child-categories-create',
      action: childAction,
      dataTour: 'academy-child-create',
      instruction: {
        en: 'Use the category control in a domain card to create a new child category. Domain child categories group URLs within one site.',
        ja: 'ドメインカードのカテゴリ操作から子カテゴリを作成します。Domainの子カテゴリは、そのサイト内のURLを分類するものです。',
      },
    },
    {
      stepId: 'child-categories-rename',
      action: childAction,
      dataTour: 'academy-child-rename',
      instruction: {
        en: 'Open a domain card’s category settings, select a child category, choose Rename, and confirm a different name with Enter.',
        ja: 'ドメインカードのカテゴリ設定で子カテゴリを選び、「名前を変更」から別の名前を入力してEnterで確定します。',
      },
    },
    {
      stepId: 'child-categories-keywords',
      action: childAction,
      dataTour: 'academy-child-keywords',
      instruction: {
        en: 'Edit a child category’s keywords and save a different keyword such as scratch. Keywords classify saved URL titles.',
        ja: '子カテゴリのキーワードを編集し、「scratch」など別のキーワードを保存します。キーワードは保存URLのタイトルを分類します。',
      },
    },
    {
      stepId: 'child-categories-success',
      action: childAction,
      dataTour: 'academy-child-keywords',
      instruction: {
        en: 'Change the first child category’s keywords to notes, market, or learn to match the domain’s URL titles. Save and confirm that a URL moves into that category.',
        ja: '先頭の子カテゴリに、そのドメインのURLタイトルに合う「notes」「market」「learn」のいずれかを設定します。保存してURLがその子カテゴリへ移ることを確認します。',
      },
    },
  ],
  'reorder-items': [
    {
      stepId: 'reorder-items-parents',
      action: reorderAction,
      dataTour: 'academy-parent-drag',
      instruction: {
        en: 'Enable reordering and move a parent category with its handle, then confirm. With a keyboard, focus the handle, press Space, use an arrow key, then Space to drop; Escape cancels.',
        ja: '並び替えを開始して親カテゴリのハンドルを動かし、確定します。キーボードではハンドルにフォーカスし、Space、矢印、Spaceで移動・確定します。Escapeで取り消せます。',
      },
    },
    {
      stepId: 'reorder-items-domains',
      action: reorderAction,
      dataTour: 'academy-domain-drag',
      instruction: {
        en: 'Reorder the two domains inside Demo workspace using their handles, then confirm. Use the pointer or Space, arrow keys, and Space.',
        ja: 'Demo workspace内の2つのドメインをハンドルで並べ替え、確定します。ポインター、またはSpace・矢印・Spaceを使います。',
      },
    },
    {
      stepId: 'reorder-items-success',
      action: reorderAction,
      dataTour: 'academy-child-drag',
      instruction: {
        en: 'Reorder two child categories within one domain using their handles, then confirm. A canceled drag does not complete the step.',
        ja: '同じドメイン内の子カテゴリをハンドルで並べ替え、確定します。ドラッグを取り消しただけでは達成になりません。',
      },
    },
  ],
  'restore-tabs': [
    {
      stepId: 'restore-tabs-success',
      action: 'restore-tabs',
      dataTour: 'academy-restore-tabs',
      instruction: {
        en: 'Open a sample saved URL or use Open all. This practice simulates restoration and never opens a real browser tab.',
        ja: '練習用URLを開くか、「すべて開く」を使います。練習では復元を模擬し、実際のブラウザタブは開きません。',
      },
    },
  ],
}

export const getDomainPracticeSteps = (
  lessonId: string,
): readonly DomainPracticeStep[] => lessons[lessonId] ?? []
