import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'

const FIREFOX_MIGRATION_SMOKE_UNSUPPORTED_EXECUTABLE =
  'FIREFOX_MIGRATION_SMOKE_UNSUPPORTED_EXECUTABLE'
const EXTENSION_ID = 'tabbin@local'
const DRIVER_START_TIMEOUT_MS = 15_000
const EXTENSION_UUID_TIMEOUT_MS = 10_000
const WEBDRIVER_SCRIPT_TIMEOUT_MS = 60_000

const repoRoot = path.resolve(import.meta.dirname, '../..')
const firefoxArtifactDir = path.join(repoRoot, '.output', 'firefox-mv2')
const harnessBundlePath = path.join(
  repoRoot,
  '.output',
  'firefox-persistence-v2-migration-harness.js',
)

type JsonRecord = Record<string, unknown>

type WebDriverSession = {
  readonly baseUrl: string
  readonly id: string
  readonly profileDir: string
  readonly version: string
}

type SmokeResult = {
  readonly backup: {
    readonly data: {
      readonly savedTabs: {
        readonly memberships: readonly { readonly notes?: string }[]
        readonly urls: readonly { readonly url: string }[]
      }
    }
    readonly schemaVersion: number
  }
  readonly fallbackCalls: number
  readonly indexedDbFailureName?: string
  readonly legacySourceAfterWrite?: JsonRecord
  readonly legacySourceBefore?: JsonRecord
  readonly preflightStatus?: string
  readonly projection: {
    readonly collections: number
    readonly memberships: number
    readonly urls: number
  }
  readonly savedTabsReadCount?: number
  readonly state: { readonly status: string }
}

class FirefoxMigrationSmokeUnsupportedError extends Error {
  readonly code = FIREFOX_MIGRATION_SMOKE_UNSUPPORTED_EXECUTABLE

  constructor(message: string, options?: ErrorOptions) {
    super(
      `${FIREFOX_MIGRATION_SMOKE_UNSUPPORTED_EXECUTABLE}: ${message}`,
      options,
    )
    this.name = 'FirefoxMigrationSmokeUnsupportedError'
  }
}

class WebDriverCommandError extends Error {
  constructor(command: string, value: unknown) {
    super(`WebDriver command ${command} failed: ${JSON.stringify(value)}`)
    this.name = 'WebDriverCommandError'
  }
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const delay = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })

const reservePort = async (): Promise<number> => {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
  if (!address || typeof address === 'string') {
    throw new Error('Could not reserve a local geckodriver port.')
  }
  return address.port
}

const webdriverRequest = async <Value>(
  baseUrl: string,
  command: string,
  init?: RequestInit,
): Promise<Value> => {
  const response = await fetch(`${baseUrl}${command}`, init)
  const payload: unknown = await response.json()
  if (!isRecord(payload) || !Object.hasOwn(payload, 'value')) {
    throw new WebDriverCommandError(command, payload)
  }
  const value = payload.value
  if (!response.ok || (isRecord(value) && typeof value.error === 'string')) {
    throw new WebDriverCommandError(command, value)
  }
  // eslint-disable-next-line typescript/consistent-type-assertions, typescript/no-unsafe-type-assertion -- WebDriver protocol response type is validated by each command boundary
  return value as Value
}

const createSmokeAddon = async (temporaryRoot: string): Promise<string> => {
  if (!existsSync(firefoxArtifactDir) || !existsSync(harnessBundlePath)) {
    throw new Error(
      'Firefox artifact and migration harness must be built before the smoke.',
    )
  }

  const addonDir = path.join(temporaryRoot, 'addon')
  const xpiPath = path.join(temporaryRoot, 'tabbin-firefox-migration.xpi')
  await cp(firefoxArtifactDir, addonDir, { recursive: true })
  await cp(
    harnessBundlePath,
    path.join(addonDir, 'firefox-persistence-v2-migration-harness.js'),
  )

  const manifestPath = path.join(addonDir, 'manifest.json')
  const parsedManifest: unknown = JSON.parse(
    await readFile(manifestPath, 'utf8'),
  )
  if (!isRecord(parsedManifest)) {
    throw new Error('Firefox artifact manifest must be an object.')
  }
  const manifest = parsedManifest
  const browserSpecificSettings = isRecord(manifest.browser_specific_settings)
    ? manifest.browser_specific_settings
    : {}
  const gecko = isRecord(browserSpecificSettings.gecko)
    ? browserSpecificSettings.gecko
    : {}
  manifest.browser_specific_settings = {
    ...browserSpecificSettings,
    gecko: { ...gecko, id: EXTENSION_ID },
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, 'utf8')

  const zip = spawnSync('zip', ['-qr', xpiPath, '.'], {
    cwd: addonDir,
    encoding: 'utf8',
  })
  if (zip.error || zip.status !== 0) {
    throw new FirefoxMigrationSmokeUnsupportedError(
      `could not create the temporary XPI: ${zip.error?.message ?? zip.stderr}`,
    )
  }
  return xpiPath
}

const waitForDriver = async (
  baseUrl: string,
  getDriverFailure: () => Error | undefined,
): Promise<void> => {
  const deadline = Date.now() + DRIVER_START_TIMEOUT_MS
  while (Date.now() < deadline) {
    const failure = getDriverFailure()
    if (failure) {
      throw new FirefoxMigrationSmokeUnsupportedError(
        'geckodriver exited before accepting requests.',
        { cause: failure },
      )
    }
    try {
      // eslint-disable-next-line no-await-in-loop -- readiness polling must be sequential
      await webdriverRequest<unknown>(baseUrl, '/status')
      return
    } catch {
      // eslint-disable-next-line no-await-in-loop -- readiness polling must be sequential
      await delay(100)
    }
  }
  throw new FirefoxMigrationSmokeUnsupportedError(
    'geckodriver did not become ready before timeout.',
  )
}

const createSession = async (
  baseUrl: string,
  profileDir: string,
): Promise<WebDriverSession> => {
  const binary = process.env.FIREFOX_EXECUTABLE_PATH
  const headless = process.env.FIREFOX_MIGRATION_HEADLESS !== '0'
  const firefoxOptions: JsonRecord = {
    args: [...(headless ? ['-headless'] : []), '-profile', profileDir],
    prefs: {
      'app.update.enabled': false,
      'datareporting.healthreport.uploadEnabled': false,
      'datareporting.policy.dataSubmissionEnabled': false,
      'extensions.autoDisableScopes': 0,
      'extensions.enabledScopes': 15,
      'extensions.startupScanScopes': 15,
      'extensions.update.enabled': false,
      'xpinstall.signatures.required': false,
    },
    ...(binary ? { binary } : {}),
  }
  let created: unknown
  try {
    created = await webdriverRequest<unknown>(baseUrl, '/session', {
      body: JSON.stringify({
        capabilities: {
          alwaysMatch: {
            browserName: 'firefox',
            'moz:firefoxOptions': firefoxOptions,
          },
        },
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
  } catch (error) {
    throw new FirefoxMigrationSmokeUnsupportedError(
      'Firefox could not be launched by geckodriver.',
      { cause: error },
    )
  }
  if (!isRecord(created) || typeof created.sessionId !== 'string') {
    throw new WebDriverCommandError('/session', created)
  }
  const capabilities = isRecord(created.capabilities)
    ? created.capabilities
    : {}
  const actualProfile = capabilities['moz:profile']
  if (actualProfile !== profileDir) {
    throw new Error(
      `Firefox did not use the restart profile (${String(actualProfile)}).`,
    )
  }
  return {
    baseUrl,
    id: created.sessionId,
    profileDir,
    version:
      typeof capabilities.browserVersion === 'string'
        ? capabilities.browserVersion
        : 'unknown',
  }
}

const sessionCommand = async <Value>(
  session: WebDriverSession,
  command: string,
  body?: unknown,
): Promise<Value> =>
  webdriverRequest<Value>(
    session.baseUrl,
    `/session/${session.id}${command}`,
    body === undefined
      ? undefined
      : {
          body: JSON.stringify(body),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        },
  )

const deleteSession = async (session: WebDriverSession): Promise<void> => {
  await webdriverRequest<unknown>(session.baseUrl, `/session/${session.id}`, {
    method: 'DELETE',
  })
}

const installAddon = async (
  session: WebDriverSession,
  xpiPath: string,
): Promise<void> => {
  const addonId = await sessionCommand<string>(session, '/moz/addon/install', {
    path: xpiPath,
    temporary: true,
  })
  assert.equal(addonId, EXTENSION_ID)
}

const decodeFirefoxUuidPreference = (source: string): string | undefined => {
  const match =
    /user_pref\("extensions\.webextensions\.uuids",\s*("(?:\\.|[^"\\])*")\);/u.exec(
      source,
    )
  if (!match?.[1]) {
    return undefined
  }
  const serializedMap: unknown = JSON.parse(match[1])
  if (typeof serializedMap !== 'string') {
    return undefined
  }
  const uuidMap: unknown = JSON.parse(serializedMap)
  if (!isRecord(uuidMap)) {
    return undefined
  }
  const uuid = uuidMap[EXTENSION_ID]
  return typeof uuid === 'string' ? uuid : undefined
}

const resolveExtensionUuid = async (profileDir: string): Promise<string> => {
  const prefsPath = path.join(profileDir, 'prefs.js')
  const deadline = Date.now() + EXTENSION_UUID_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const uuid = decodeFirefoxUuidPreference(
        // eslint-disable-next-line no-await-in-loop -- Firefox preference polling must be sequential
        await readFile(prefsPath, 'utf8'),
      )
      if (uuid) {
        return uuid
      }
    } catch {
      // Firefox writes prefs.js asynchronously after the temporary install.
    }
    // eslint-disable-next-line no-await-in-loop -- Firefox preference polling must be sequential
    await delay(100)
  }
  throw new Error('Firefox did not persist the extension internal UUID.')
}

const runHarnessPhase = async (
  session: WebDriverSession,
  phase: 'migrate' | 'verify',
): Promise<SmokeResult> => {
  const uuid = await resolveExtensionUuid(session.profileDir)
  await sessionCommand(session, '/url', {
    url: `moz-extension://${uuid}/options.html`,
  })
  await sessionCommand(session, '/timeouts', {
    script: WEBDRIVER_SCRIPT_TIMEOUT_MS,
  })
  const execution = await sessionCommand<unknown>(session, '/execute/async', {
    args: [phase],
    script: `
      const phase = arguments[0]
      const done = arguments[arguments.length - 1]
      const run = () => {
        const api = globalThis.__tabbinFirefoxPersistenceMigrationSmoke
        if (!api) {
          done({ ok: false, error: { name: 'HarnessMissingError', message: 'Migration harness global is missing.' } })
          return
        }
        api.runFirefoxPersistenceMigrationSmoke(phase).then(
          (value) => done({ ok: true, value }),
          (error) => done({ ok: false, error: { name: error?.name, message: error?.message, stack: error?.stack } }),
        )
      }
      const element = document.createElement('script')
      element.type = 'module'
      element.src = chrome.runtime.getURL('firefox-persistence-v2-migration-harness.js')
      element.onload = run
      element.onerror = () => done({ ok: false, error: { name: 'HarnessLoadError', message: element.src } })
      document.documentElement.append(element)
    `,
  })
  if (!isRecord(execution) || execution.ok !== true) {
    throw new WebDriverCommandError(`migration harness ${phase}`, execution)
  }
  // eslint-disable-next-line typescript/consistent-type-assertions, typescript/no-unsafe-type-assertion -- harness result is asserted field-by-field immediately after this protocol boundary
  return execution.value as SmokeResult
}

const assertMigrateResult = (result: SmokeResult): JsonRecord => {
  assert.equal(result.preflightStatus, 'healthy')
  assert.equal(result.state.status, 'indexeddb')
  assert.equal(result.fallbackCalls, 0)
  assert.deepEqual(result.projection, {
    collections: 2,
    memberships: 2,
    urls: 2,
  })
  assert.equal(result.backup.schemaVersion, 2)
  assert.ok(result.legacySourceBefore)
  return result.legacySourceBefore
}

const assertVerifyResult = (
  result: SmokeResult,
  legacySourceBefore: JsonRecord,
): void => {
  assert.equal(result.state.status, 'indexeddb')
  assert.equal(result.fallbackCalls, 0)
  assert.ok(result.savedTabsReadCount && result.savedTabsReadCount > 0)
  assert.ok(result.indexedDbFailureName)
  assert.deepEqual(result.projection, {
    collections: 2,
    memberships: 3,
    urls: 3,
  })
  assert.deepEqual(result.legacySourceAfterWrite, legacySourceBefore)
  assert.equal(result.backup.schemaVersion, 2)
  assert.ok(
    result.backup.data.savedTabs.urls.some(
      ({ url }) => url === 'https://example.com/firefox-write',
    ),
  )
  assert.ok(
    result.backup.data.savedTabs.memberships.some(
      ({ notes }) => notes === 'written after Firefox restart',
    ),
  )
}

const run = async (): Promise<void> => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'tabbin-firefox-persistence-migration-'),
  )
  const profileDir = path.join(temporaryRoot, 'profile')
  await mkdir(profileDir)
  const xpiPath = await createSmokeAddon(temporaryRoot)
  const port = await reservePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const driverLogs: string[] = []
  let driverFailure: Error | undefined
  const geckodriver = spawn(
    process.env.GECKODRIVER_PATH ?? 'geckodriver',
    ['--port', String(port), '--allow-system-access', '--log', 'info'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  for (const stream of [geckodriver.stdout, geckodriver.stderr]) {
    stream.setEncoding('utf8')
    stream.on('data', (chunk: string) => driverLogs.push(chunk))
  }
  geckodriver.once('error', (error) => {
    driverFailure = error
  })
  geckodriver.once('exit', (code, signal) => {
    if (code !== 0) {
      driverFailure = new Error(
        `geckodriver exited with ${String(code)} (${String(signal)}).`,
      )
    }
  })

  let session: WebDriverSession | undefined
  try {
    await waitForDriver(baseUrl, () => driverFailure)
    session = await createSession(baseUrl, profileDir)
    await installAddon(session, xpiPath)
    const migrated = await runHarnessPhase(session, 'migrate')
    const legacySourceBefore = assertMigrateResult(migrated)
    const firefoxVersion = session.version

    await deleteSession(session)
    session = undefined

    session = await createSession(baseUrl, profileDir)
    await installAddon(session, xpiPath)
    const verified = await runHarnessPhase(session, 'verify')
    assertVerifyResult(verified, legacySourceBefore)

    console.log(
      JSON.stringify(
        {
          firefoxVersion,
          migration: {
            ...migrated.projection,
            preflightStatus: migrated.preflightStatus,
          },
          restart: {
            fallbackCalls: verified.fallbackCalls,
            indexedDbFailureName: verified.indexedDbFailureName,
            legacyUnchanged: true,
            projection: verified.projection,
            savedTabsReadCount: verified.savedTabsReadCount,
          },
          schemaVersion: verified.backup.schemaVersion,
          status: 'passed',
        },
        null,
        2,
      ),
    )
  } catch (error) {
    if (driverLogs.length > 0) {
      console.error(driverLogs.join('').trim())
    }
    throw error
  } finally {
    if (session) {
      await deleteSession(session).catch(() => undefined)
    }
    geckodriver.kill('SIGTERM')
    await rm(temporaryRoot, { force: true, recursive: true })
  }
}

await run()
