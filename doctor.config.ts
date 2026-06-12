import type { ReactDoctorConfig } from 'react-doctor/api'

export default {
  deadCode: false,
  ignore: {
    files: [
      '.agents/**',
      '.apm/**',
      '.claude/**',
      '.cursor/**',
      '.factory/**',
      '.gemini/**',
      '.github/**',
      '.kiro/**',
      '.windsurf/**',
      'skills/**',
      'src/components/ai-elements/**',
      'src/components/ui/**',
      'src/lib/storybook/**',
      '**/*.stories.tsx',
      '**/*.story.tsx',
    ],
  },
} satisfies ReactDoctorConfig
