// eslint-disable-next-line typescript/triple-slash-reference -- Oxlint requires an explicit reference for Storybook CSS declarations.
/// <reference path="./assets.d.ts" />

/* oxlint-disable import/no-relative-parent-imports */

/* eslint-disable import/no-unassigned-import */
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
