import { readFileSync } from 'node:fs'
import path from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import { type WxtViteConfig, defineConfig } from 'wxt' // eslint-disable-line

import '@wxt-dev/module-react' // eslint-disable-line

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const readPackageVersion = (): string => {
  const packageJsonPath = path.resolve(import.meta.dirname, 'package.json')
  const parsed: unknown = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
  if (!isRecord(parsed)) {
    throw new TypeError('package.json is not an object')
  }
  const version: unknown = parsed.version
  if (typeof version !== 'string' || version === '') {
    throw new TypeError(
      'package.json version is missing, not a string, or empty',
    )
  }
  return version
}

const APP_VERSION = readPackageVersion()

const vitePlugins = tailwindcss()

export default defineConfig({
  srcDir: 'src',
  publicDir: 'src/public',
  manifest: (env) => ({
    default_locale: 'ja',
    name: '__MSG_extensionName__',
    description: '__MSG_extensionDescription__',
    version: APP_VERSION,
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
  vite: (env) => {
    const isProduction = env.mode === 'production'

    return {
      build: isProduction ? { minify: 'esbuild' } : undefined,
      define: {
        __APP_VERSION__: JSON.stringify(APP_VERSION),
      },
      esbuild: isProduction ? { drop: ['console', 'debugger'] } : undefined,
      plugins: vitePlugins,
    }
  },
})
