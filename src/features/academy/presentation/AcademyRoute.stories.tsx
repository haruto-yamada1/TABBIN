import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { createGetAcademyProgressUseCase } from '@/features/academy/application/use-cases/GetAcademyProgressUseCase'
import { createSkipLessonUseCase } from '@/features/academy/application/use-cases/SkipLessonUseCase'
import { createStartLessonUseCase } from '@/features/academy/application/use-cases/StartLessonUseCase'
import { ACADEMY_LESSONS } from '@/features/academy/domain/academyCatalog'
import { createLessonProgress } from '@/features/academy/domain/academyProgress'
import { emptyAcademyState } from '@/features/academy/domain/AcademyProgressRepository'
import type { AcademyState } from '@/features/academy/domain/AcademyProgressRepository'
import { I18nProvider } from '@/features/i18n/context/I18nProvider'

import { AcademyRoute } from './AcademyRoute'
import type { AcademyUiUseCases } from './AcademyRoute'

type Scenario =
  | 'courses'
  | 'lesson'
  | 'empty'
  | 'failure'
  | 'resume'
  | 'loading'
const createPreviewUseCases = (scenario: Scenario): AcademyUiUseCases => {
  let state: AcademyState = emptyAcademyState()
  const lesson = ACADEMY_LESSONS.find((item) => item.lessonId === 'domain-mode')
  if (scenario === 'resume' && lesson) {
    state.lessons[lesson.lessonId] = {
      ...createLessonProgress(lesson, 'preview-attempt'),
      startedAt: 100,
    }
  }
  const ports = {
    lessons: scenario === 'empty' ? [] : ACADEMY_LESSONS,
    repository: {
      read: async () => structuredClone(state),
      exportRaw: async () => structuredClone(state),
      update: async (change: (value: AcademyState) => AcademyState) => {
        state = change(structuredClone(state))
        return structuredClone(state)
      },
    },
    now: () => 100,
    newId: () => 'preview-attempt',
  }
  return {
    getProgress: async () => {
      if (scenario === 'failure') {
        throw new Error('Preview progress unavailable')
      }
      if (scenario === 'loading') {
        return new Promise(() => undefined)
      }
      return createGetAcademyProgressUseCase(ports)()
    },
    startLesson: createStartLessonUseCase(ports),
    skipLesson: createSkipLessonUseCase(ports),
  }
}
const AcademyPreview = ({ scenario }: { scenario: Scenario }) => {
  const [useCases, setUseCases] = useState(() =>
    createPreviewUseCases(scenario),
  )
  const [previousScenario, setPreviousScenario] = useState(scenario)
  if (previousScenario !== scenario) {
    setPreviousScenario(scenario)
    setUseCases(createPreviewUseCases(scenario))
  }
  const route = scenario === 'lesson' ? '/academy/domain-mode' : '/academy'
  return (
    <I18nProvider>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route
            path='/academy'
            element={
              <AcademyRoute
                useCases={useCases}
                {...(scenario === 'empty' ? { lessons: [], courses: [] } : {})}
              />
            }
          />
          <Route
            path='/academy/:lessonId'
            element={<AcademyRoute useCases={useCases} />}
          />
        </Routes>
      </MemoryRouter>
    </I18nProvider>
  )
}
const meta = {
  component: AcademyRoute,
  render: () => <AcademyPreview scenario='courses' />,
  title: 'Features/Academy/Learning center',
} satisfies Meta<typeof AcademyRoute>
type Story = StoryObj<typeof AcademyRoute>
export const AcademyCourses: Story = {}
export const AcademyLesson: Story = {
  render: () => <AcademyPreview scenario='lesson' />,
}
export const AcademyResume: Story = {
  render: () => <AcademyPreview scenario='resume' />,
}
export const AcademyEmpty: Story = {
  render: () => <AcademyPreview scenario='empty' />,
}
export const AcademyLoadFailure: Story = {
  render: () => <AcademyPreview scenario='failure' />,
}
export const AcademyLoading: Story = {
  render: () => <AcademyPreview scenario='loading' />,
}
export default meta
