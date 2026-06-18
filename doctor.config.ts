import { defineConfig } from 'react-doctor/api'

export default defineConfig({
  ignore: {
    files: [
      '.output/**',
      '.wxt/**',
      '.apm/**',
      'coverage/**',
      'storybook-static/**',
      // shadcn/ui 由来 (compound component パターン + variants 同ファイル export)
      'src/components/ui/**',
      // AI チャット UI ライブラリ由来 (上流の ai-elements / @streamdown パターン)
      'src/components/ai-elements/**',
      // 上記 2 つの stories 専用コンテンツ (stories ファイルは dynamic import 経由のため react-doctor から見えない)
      'src/lib/storybook/**',
    ],
  },
})
