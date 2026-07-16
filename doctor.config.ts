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
    // `PrepareTabGroupDeletionUseCase` 内部で
    // `tabGroupRepository.findRawTabGroupById` を呼ぶため、
    // `deleteTabGroup` を先に走らせると preflight が silent skip する
    // (Codex review P2)。`async-parallel` ルールはこの race を検出しない
    // ため、SavedTabsApp.tsx でのみ sequential await を許容する。
    rules: ['react-doctor/async-parallel'],
    overrides: [
      {
        // Chrome 拡張 API の addListener/removeListener は
        // React Doctor が cleanup として静的認識しない (DOM の
        // addEventListener/removeEventListener のみ認識対象)。
        // ThemeProvider では effect 内で removeListener を cleanup
        // しているが、false positive になるため対象ファイルのみ抑制。
        files: ['src/components/ThemeProvider.tsx'],
        rules: ['react-doctor/effect-needs-cleanup'],
      },
    ],
  },
  // SavedTabsApp.tsx に絞って `async-parallel` を許容
  // (Codex review P2: prepareTabGroupDeletion は findRawTabGroupById を
  // 先に呼ぶため、delete との Promise.all は race condition になる)
  // 上記 ignore.rules と等価だが、ファイル単位の ignore として明示
})
