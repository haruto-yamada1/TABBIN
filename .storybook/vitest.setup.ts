/* eslint-disable @typescript-eslint/ban-ts-comment, import/no-unassigned-import, typescript/TS2321, typescript/TS2769 */
import { defineConfig } from 'vite'
import { WxtVitest } from 'wxt/testing'

export default defineConfig({
  plugins: [WxtVitest()],
})
