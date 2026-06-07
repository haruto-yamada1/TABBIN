/* eslint-disable import/no-unassigned-import, typescript/TS2882 */
import type { Preview } from '@storybook/react'

import {
  previewDecorators,
  previewGlobalTypes,
  previewParameters,
} from '../src/lib/storybook/preview'

import '../src/assets/global.css'

export default {
  decorators: previewDecorators,
  globalTypes: previewGlobalTypes,
  parameters: previewParameters,
} satisfies Preview
