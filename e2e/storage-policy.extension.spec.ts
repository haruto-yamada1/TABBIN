import { expect, test } from './helpers/extension'

test('the installed Chrome extension refuses private browsing access', async ({
  serviceWorker,
}) => {
  const policy = await serviceWorker.evaluate(async () => ({
    incognito: chrome.runtime.getManifest().incognito,
    privateAccessAllowed: await chrome.extension.isAllowedIncognitoAccess(),
    inIncognitoContext: chrome.extension.inIncognitoContext,
  }))
  expect(policy).toEqual({
    incognito: 'not_allowed',
    privateAccessAllowed: false,
    inIncognitoContext: false,
  })
})
