/* eslint-disable playwright/expect-expect -- shared scenarios assert guide UI, keyboard actions, persistence, and reload */
import { getExtensionUrl, test } from './helpers/extension'
import {
  onboardingLanguages,
  verifyOnboardingCompletion,
  verifyOnboardingSkip,
} from './helpers/onboarding'

for (const language of onboardingLanguages) {
  test(`onboarding ${language} completion persists and Options reopens the guide`, async ({
    extensionId,
    page,
    serviceWorker,
  }, testInfo) => {
    await verifyOnboardingCompletion(
      {
        appUrl: getExtensionUrl(extensionId, 'app.html'),
        language,
        page,
        serviceWorker,
      },
      testInfo,
    )
  })

  test(`onboarding ${language} skip survives reload and Options reopens the guide`, async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await verifyOnboardingSkip({
      appUrl: getExtensionUrl(extensionId, 'app.html'),
      language,
      page,
      serviceWorker,
    })
  })
}
