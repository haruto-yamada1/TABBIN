/* eslint-disable import/no-default-export */
import path from 'node:path'

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { playwright } from '@vitest/browser-playwright'
import { defineProject } from 'vitest/config'

const dirname =
  typeof __dirname !== 'undefined' ? __dirname : import.meta.dirname

// More info at: https://storybook.js.org/docs/writing-tests/test-addon
const workspaces = [
  'vitest.config.ts',
  defineProject({
    plugins: [
      // The plugin will run tests for the stories defined in your Storybook config
      // See options at: https://storybook.js.org/docs/writing-tests/test-addon#storybooktest
      storybookTest({ configDir: path.join(dirname, '.storybook') }),
    ],
    test: {
      browser: {
        enabled: true,
        headless: true,
        instances: [{ browser: 'chromium' }],
        provider: playwright(),
      },
      name: 'storybook',
      setupFiles: ['.storybook/vitest.setup.ts'],
    },
  }),
]

export default workspaces
