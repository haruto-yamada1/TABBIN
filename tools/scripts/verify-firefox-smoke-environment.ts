import {
  FirefoxIndexedDbSmokeUnsupportedError,
  resolveFirefoxSmokeEnvironment,
} from './firefoxSmokeEnvironment'

try {
  resolveFirefoxSmokeEnvironment()
  console.info(
    'Firefox smoke executables found; browser launch and restart are not yet verified.',
  )
} catch (error) {
  if (!(error instanceof FirefoxIndexedDbSmokeUnsupportedError)) {
    throw error
  }
  console.error(error.message)
  process.exitCode = 1
}
