import tailwindcss from '@tailwindcss/vite'
import { type WxtViteConfig, defineConfig } from 'wxt' // eslint-disable-line

import '@wxt-dev/module-react' // eslint-disable-line

const vitePlugins = tailwindcss() as unknown as NonNullable< // eslint-disable-line
  WxtViteConfig['plugins']
>

export default defineConfig({
  srcDir: 'src',
  publicDir: 'src/public',
  manifest: (env) => ({
    default_locale: 'ja',
    name: '__MSG_extensionName__',
    description: '__MSG_extensionDescription__',
    version: '2.0.7',
    host_permissions: ['http://localhost:11434/*', 'http://127.0.0.1:11434/*'],
    permissions: ['alarms', 'tabs', 'storage', 'contextMenus', 'notifications'],
    action: {
      default_title: '__MSG_extensionName__',
    },
    options_ui: {
      page: 'options.html',
      open_in_tab: true,
    },
    // Firefox requires data_collection_permissions from Nov 3, 2025.
    // TABBIN does not collect personal data - all data stays local
    // and the only external call is to the user's local Ollama server.
    ...(env.browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              data_collection_permissions: {
                required: ['none'],
              },
            },
          },
        }
      : {}),
  }),
  modules: ['@wxt-dev/module-react', '@wxt-dev/i18n/module'],
  vite: () => ({
    plugins: vitePlugins,
  }),
})
