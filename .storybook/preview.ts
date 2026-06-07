/* eslint-disable import/no-unassigned-import */
import type { Preview } from '@storybook/react'

import {
  previewDecorators,
  previewGlobalTypes,
  previewParameters,
} from '../src/lib/storybook/preview'

import '../src/assets/global.css' // eslint-disable-line

export default {
  decorators: previewDecorators,
  globalTypes: previewGlobalTypes,
  parameters: previewParameters,
} satisfies Preview
