import { isObjectLike } from './chrome-global'

const EXTENSION_PAGE_PATHS = new Set([
  '/app.html',
  '/options.html',
  '/saved-tabs.html',
  '/ai-chat.html',
  '/periodic-execution.html',
  '/changelog.html',
])

const isPublicTopFrame = (sender: object): boolean => {
  const frameId: unknown = Reflect.get(sender, 'frameId')
  const tab: unknown = Reflect.get(sender, 'tab')
  return (
    (frameId === undefined || frameId === 0) &&
    (tab === undefined ||
      (isObjectLike(tab) && Reflect.get(tab, 'incognito') !== true))
  )
}

const isExtensionPageUrl = (documentUrl: URL, root: URL): boolean =>
  (root.protocol === 'chrome-extension:' ||
    root.protocol === 'moz-extension:') &&
  root.hostname.length > 0 &&
  documentUrl.protocol === root.protocol &&
  documentUrl.host === root.host &&
  documentUrl.username === '' &&
  documentUrl.password === '' &&
  documentUrl.port === '' &&
  EXTENSION_PAGE_PATHS.has(documentUrl.pathname)

/** Content scripts share runtime.id, so only a known extension document is trusted. */
export const isTrustedExtensionPageSender = (
  sender: unknown,
  runtime: unknown,
): boolean => {
  try {
    if (!isObjectLike(sender) || !isObjectLike(runtime)) {
      return false
    }
    const extensionId: unknown = Reflect.get(runtime, 'id')
    const getURL: unknown = Reflect.get(runtime, 'getURL')
    const senderUrl: unknown = Reflect.get(sender, 'url')
    if (
      typeof extensionId !== 'string' ||
      extensionId.length === 0 ||
      Reflect.get(sender, 'id') !== extensionId ||
      typeof getURL !== 'function' ||
      typeof senderUrl !== 'string' ||
      !isPublicTopFrame(sender)
    ) {
      return false
    }

    const extensionRoot: unknown = Reflect.apply(getURL, runtime, [''])
    if (typeof extensionRoot !== 'string') {
      return false
    }
    const root = new URL(extensionRoot)
    const documentUrl = new URL(senderUrl)
    const expectedOrigin = `${root.protocol}//${root.host}`
    const senderOrigin: unknown = Reflect.get(sender, 'origin')
    return (
      isExtensionPageUrl(documentUrl, root) &&
      (senderOrigin === undefined || senderOrigin === expectedOrigin)
    )
  } catch {
    return false
  }
}
