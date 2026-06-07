/* eslint-disable @typescript-eslint/ban-ts-comment, import/no-unassigned-import */
import { defineConfig } from 'vite'
import { WxtVitest } from 'wxt/testing'

export default defineConfig({
  // eslint-disable-line
  plugins: [WxtVitest()], // eslint-disable-line
})
