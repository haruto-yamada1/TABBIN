import { defineContentScript } from 'wxt/utils/define-content-script'

import { startLinkCapture } from '@/lib/link-capture/content'

export default defineContentScript({
  // eslint-disable-line import/no-default-export
  main: async () => {
    await startLinkCapture()
  },
  matches: [],
  registration: 'runtime',
})
