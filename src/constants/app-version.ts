import { getManifestVersion } from '@/lib/browser/runtime'

const DEFAULT_APP_VERSION = '1.0.0'

/**
 * package.json version をビルド時に Vite define された値、または実行時の
 * manifest version から取得する。
 *
 * プロダクションビルドでは `__APP_VERSION__` が package.json.version から注入される。
 * テスト環境では注入されないため、mock された manifest version にフォールバックする。
 * manifest version が空文字列の場合はデフォルト値を返す。
 */
export const getAppVersion = (): string => {
  if (typeof __APP_VERSION__ !== 'undefined') {
    return __APP_VERSION__
  }
  // eslint-disable-next-line typescript/prefer-nullish-coalescing -- empty version string should fall through to default
  return getManifestVersion() || DEFAULT_APP_VERSION
}
