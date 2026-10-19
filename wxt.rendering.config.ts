import { mergeConfig } from 'vite'
import { defineConfig } from 'wxt'

import { renderingProfilerPlugin } from './e2e/helpers/rendering-profiler-plugin'
import productionConfig from './wxt.config'

// This opt-in build preserves production settings and isolates its artifacts.
// React's profiling renderer enables Profiler callbacks in a production build.
export default defineConfig({
  ...productionConfig,
  outDir: '.output/rendering',
  vite: async (env) =>
    mergeConfig((await productionConfig.vite?.(env)) ?? {}, {
      plugins: [renderingProfilerPlugin()],
      resolve: {
        alias: [
          { find: /^react-dom\/client$/u, replacement: 'react-dom/profiling' },
        ],
      },
    }),
})
