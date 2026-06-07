/* eslint-disable @typescript-eslint/ban-ts-comment, import/no-unassigned-import */
import { defineConfig } from 'vite'
import { WxtVitest } from 'wxt/testing'

// @ts-expect-error - Vite/Storybook type incompatibility
export default defineConfig({
  // @ts-expect-error - WxtVitest overload mismatch
  plugins: [WxtVitest()],
})
