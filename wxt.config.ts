import tailwindcss from '@tailwindcss/vite'
import { type WxtViteConfig, defineConfig } from 'wxt' // eslint-disable-line

import '@wxt-dev/module-react' // eslint-disable-line

const vitePlugins = tailwindcss() as unknown as NonNullable< // eslint-disable-line
  WxtViteConfig['plugins']
>

export default defineConfig({
  srcDir: 'src',
  publicDir: 'src/public',
  manifest: {
    default_locale: 'ja',
    name: '__MSG_extensionName__',
    description: '__MSG_extensionDescription__',
    version: '2.0.6',
    host_permissions: ['http://localhost:11434/*', 'http://127.0.0.1:11434/*'],
    permissions: ['alarms', 'tabs', 'storage', 'contextMenus', 'notifications'],
    action: {
      default_title: '__MSG_extensionName__',
    },
    options_ui: {
      page: 'options.html',
      open_in_tab: true,
    },
  },
  modules: ['@wxt-dev/module-react', '@wxt-dev/i18n/module'],
  vite: () => ({
    plugins: vitePlugins,
  }),
})
