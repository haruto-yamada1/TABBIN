import { courseSchema, lessonSchema } from './academySchemas'
import type { Course, Lesson } from './academySchemas'

type Chapter = {
  lessonId: string
  courseId: string
  en: [string, string, string]
  ja: [string, string, string]
  action: string | null
  dataTour: string | null
}

const chapters: Chapter[] = [
  {
    lessonId: 'install-extension',
    courseId: 'getting-started',
    en: [
      'Install TABBIN',
      'Install the extension in Chrome or Firefox.',
      'Follow the browser-specific installation instructions.',
    ],
    ja: [
      'TABBINをインストール',
      'Chrome・Firefoxに拡張機能をインストールします。',
      '利用中のブラウザに合わせた導入手順を確認します。',
    ],
    action: null,
    dataTour: null,
  },
  {
    lessonId: 'pin-extension',
    courseId: 'getting-started',
    en: [
      'Pin the extension',
      'Keep TABBIN within reach on the browser toolbar.',
      'Follow the browser-specific toolbar pinning instructions.',
    ],
    ja: [
      '拡張機能を固定',
      'ブラウザのツールバーにTABBINを固定します。',
      '利用中のブラウザに合わせてアイコンの固定手順を確認します。',
    ],
    action: null,
    dataTour: null,
  },
  {
    lessonId: 'save-tabs',
    courseId: 'getting-started',
    en: [
      'Save tabs together',
      'Learn why saved browser tabs close after saving.',
      'Use the video or text guide to understand how saving closes the original tabs.',
    ],
    ja: [
      'タブをまとめて保存',
      '保存後に元のタブが閉じる仕組みを学びます。',
      '動画またはテキストで、保存後に元のタブが閉じる仕組みを確認します。',
    ],
    action: 'save-tabs',
    dataTour: 'academy-save-tabs',
  },
  {
    lessonId: 'domain-mode',
    courseId: 'organization',
    en: [
      'Explore Domain mode',
      'Find saved URLs grouped by their domain.',
      'Expand an existing saved domain to inspect its URLs, or use the text guide if the list is empty.',
    ],
    ja: [
      'Domainモードを見る',
      '同じドメインの保存URLがまとまる表示を学びます。',
      '現在保存しているドメインのURLを確認します。一覧が空の場合はテキストを参考にします。',
    ],
    action: 'inspect-domain',
    dataTour: 'academy-saved-url',
  },
  {
    lessonId: 'parent-categories',
    courseId: 'organization',
    en: [
      'Organize parent categories',
      'Create and edit parent categories, then move a domain.',
      'Create, rename and assign the sample parent category.',
    ],
    ja: [
      '親カテゴリで整理',
      '親カテゴリの作成・編集とドメインの移動を学びます。',
      'サンプル親カテゴリを作成・改名してドメインを移動します。',
    ],
    action: 'organize-parent-category',
    dataTour: 'academy-parent-categories',
  },
  {
    lessonId: 'child-categories',
    courseId: 'organization',
    en: [
      'Organize child categories',
      'Create and edit child categories to organize URLs.',
      'Create, rename and assign a sample URL to a child category.',
    ],
    ja: [
      '子カテゴリで整理',
      '子カテゴリを作成・編集してURLを整理します。',
      'サンプル子カテゴリを作成・改名してURLを割り当てます。',
    ],
    action: 'organize-child-category',
    dataTour: 'academy-child-categories',
  },
  {
    lessonId: 'reorder-items',
    courseId: 'organization',
    en: [
      'Change the order',
      'Reorder parents, children and domains with pointer or keyboard.',
      'Move the sample category and domain to the requested positions.',
    ],
    ja: [
      '表示順を変更',
      '親・子カテゴリとドメインをポインターやキーボードで並べ替えます。',
      'サンプルカテゴリとドメインを指定した位置に移動します。',
    ],
    action: 'reorder-categories-and-domains',
    dataTour: 'academy-reorder-handle',
  },
  {
    lessonId: 'restore-tabs',
    courseId: 'recovery',
    en: [
      'Restore saved tabs',
      'Practice restoring tabs without opening real browser tabs.',
      'Restore the sample saved tabs in the simulated browser.',
    ],
    ja: [
      '保存タブを復元',
      '実際のブラウザタブを開かずに復元を練習します。',
      '練習環境の模擬ブラウザへサンプルの保存タブを復元します。',
    ],
    action: 'restore-tabs',
    dataTour: 'academy-restore-tabs',
  },
]

export const ACADEMY_MESSAGES: Record<'ja' | 'en', Record<string, string>> = {
  en: {
    'academy.courses.gettingStarted': 'Getting started',
    'academy.courses.organization': 'Organize your tabs',
    'academy.courses.recovery': 'Restore and review',
  },
  ja: {
    'academy.courses.gettingStarted': 'はじめてのTABBIN',
    'academy.courses.organization': 'タブを整理',
    'academy.courses.recovery': '復元と復習',
  },
}

export const ACADEMY_LESSONS: Lesson[] = chapters.map((chapter, index) => {
  const prefix = `academy.lessons.${chapter.lessonId.replaceAll('-', '')}`
  for (const locale of ['en', 'ja'] as const) {
    const [title, description, instruction] = chapter[locale]
    ACADEMY_MESSAGES[locale][`${prefix}.title`] = title
    ACADEMY_MESSAGES[locale][`${prefix}.description`] = description
    ACADEMY_MESSAGES[locale][`${prefix}.instruction`] = instruction
  }
  const stepId =
    chapter.lessonId + (chapter.action === null ? '-native-step' : '-success')
  return {
    lessonId: chapter.lessonId,
    courseId: chapter.courseId,
    contentVersion: 1,
    assessmentVersion: 1,
    titleKey: `${prefix}.title`,
    descriptionKey: `${prefix}.description`,
    difficulty: 'beginner',
    estimatedMinutes: 2,
    prerequisiteLessonIds:
      index === 0
        ? []
        : chapters.slice(index - 1, index).map((previous) => previous.lessonId),
    steps: [
      {
        stepId,
        instructionKey: `${prefix}.instruction`,
        dataTour: chapter.dataTour,
        practiceRequirement:
          chapter.action === null
            ? null
            : {
                action: chapter.action,
                environment: 'academy-sandbox',
              },
      },
    ],
    assets: (['ja', 'en'] as const).map((locale) => ({
      assetId: `${chapter.lessonId}-${locale}`,
      kind: 'video',
      locale,
      path: `academy/videos/${chapter.lessonId}.${locale}.mp4`,
      durationSeconds: 60,
      status: 'planned',
    })),
    mastery: {
      videoRequired: chapter.action === null,
      practiceStepIds: chapter.action === null ? [] : [stepId],
    },
  }
})

export const ACADEMY_COURSES: Course[] = [
  {
    courseId: 'getting-started',
    titleKey: 'academy.courses.gettingStarted',
    lessonIds: chapters
      .filter((item) => item.courseId === 'getting-started')
      .map((item) => item.lessonId),
  },
  {
    courseId: 'organization',
    titleKey: 'academy.courses.organization',
    lessonIds: chapters
      .filter((item) => item.courseId === 'organization')
      .map((item) => item.lessonId),
  },
  {
    courseId: 'recovery',
    titleKey: 'academy.courses.recovery',
    lessonIds: ['restore-tabs'],
  },
]

const assertUnique = (values: readonly string[]): void => {
  if (new Set(values).size !== values.length) {
    throw new Error('Academy catalog contains duplicate identifiers')
  }
}

export const validateCatalog = (
  courses: readonly Course[],
  lessons: readonly Lesson[],
): void => {
  courses.forEach((course) => courseSchema.parse(course))
  lessons.forEach((lesson) => lessonSchema.parse(lesson))
  assertUnique(courses.map((course) => course.courseId))
  assertUnique(lessons.map((lesson) => lesson.lessonId))
  assertUnique(
    lessons.flatMap((lesson) => lesson.steps.map((step) => step.stepId)),
  )
  const byLesson = new Map(lessons.map((lesson) => [lesson.lessonId, lesson]))
  const lessonIdsByCourse = new Map(
    courses.map((course) => [course.courseId, new Set(course.lessonIds)]),
  )
  for (const course of courses) {
    assertUnique(course.lessonIds)
    if (
      course.lessonIds.some(
        (lessonId) => byLesson.get(lessonId)?.courseId !== course.courseId,
      )
    ) {
      throw new Error('Academy course contains an invalid lesson reference')
    }
  }
  for (const lesson of lessons) {
    if (!lessonIdsByCourse.get(lesson.courseId)?.has(lesson.lessonId)) {
      throw new Error('Academy lesson has no owning course')
    }
    assertUnique(lesson.prerequisiteLessonIds)
    assertUnique(lesson.assets.map((asset) => asset.assetId))
    assertUnique(lesson.mastery.practiceStepIds)
    if (
      lesson.prerequisiteLessonIds.some(
        (lessonId) => !byLesson.has(lessonId),
      ) ||
      lesson.mastery.practiceStepIds.some(
        (stepId) =>
          !lesson.steps.some(
            (step) =>
              step.stepId === stepId &&
              step.practiceRequirement !== null &&
              step.dataTour !== null,
          ),
      ) ||
      (!lesson.mastery.videoRequired &&
        lesson.mastery.practiceStepIds.length === 0) ||
      (lesson.mastery.videoRequired && lesson.assets.length === 0)
    ) {
      throw new Error('Academy lesson has invalid achievement requirements')
    }
    if (
      lesson.steps.some(
        (step) => step.practiceRequirement !== null && step.dataTour === null,
      )
    ) {
      throw new Error('Academy practice requires a stable tour target')
    }
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (lessonId: string): void => {
    if (visiting.has(lessonId)) {
      throw new Error('Academy prerequisites contain a cycle')
    }
    if (visited.has(lessonId)) {
      return
    }
    visiting.add(lessonId)
    byLesson.get(lessonId)?.prerequisiteLessonIds.forEach(visit)
    visiting.delete(lessonId)
    visited.add(lessonId)
  }
  lessons.forEach((lesson) => {
    visit(lesson.lessonId)
  })
}

validateCatalog(ACADEMY_COURSES, ACADEMY_LESSONS)
