import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { firefox } from '@playwright/test'
import { zipSync } from 'fflate'
import type { Zippable } from 'fflate'

const ADDON_ID = 'tabbin@local'
const COMMAND_TIMEOUT_MS = 30_000

export type FirefoxExtensionSession = {
  readonly version: string
  readonly origin: string
  readonly navigate: (relative: string) => Promise<void>
  readonly evaluate: (script: string, args?: unknown[]) => Promise<unknown>
  readonly parsedJavaScript: () => Promise<string[]>
}

type SessionCommand = (route: string, body: unknown) => Promise<unknown>

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const browserVersion = (capabilities: unknown): string =>
  record(capabilities) && typeof capabilities.browserVersion === 'string'
    ? capabilities.browserVersion
    : 'unknown'

// Extension resource timings and BiDi network events omit moz-extension loads.
// Inspect only real Window globals for this document, excluding WebDriver
// sandboxes and other extension tabs in the same process.
const parsedSourceProcessScript = (
  href: string,
  channel: string,
  marker: string,
): string => `
  (() => {
    let debuggerInstance;
    try {
      const { addDebuggerToGlobal } = ChromeUtils.importESModule('resource://gre/modules/jsdebugger.sys.mjs');
      const sandbox = Cu.Sandbox(Services.scriptSecurityManager.getSystemPrincipal(), { freshCompartment: true });
      addDebuggerToGlobal(sandbox);
      debuggerInstance = new sandbox.Debugger();
      const urls = new Set();
      let matched = false;
      for (const global of debuggerInstance.findAllGlobals()) {
        if (global.class !== 'Window') continue;
        const window = global.unsafeDereference();
        if (window.location?.href !== ${JSON.stringify(href)}) continue;
        if ((window.wrappedJSObject ?? window)[${JSON.stringify(marker)}] !== ${JSON.stringify(marker)}) continue;
        matched = true;
        debuggerInstance.addDebuggee(window);
        for (const script of debuggerInstance.findScripts({ global })) {
          const url = script.source?.url ?? script.url;
          if (typeof url === 'string') urls.add(url);
        }
      }
      if (matched && urls.size) sendAsyncMessage(${JSON.stringify(channel)}, { urls: [...urls] });
    } catch (error) {
      sendAsyncMessage(${JSON.stringify(channel)}, { error: String(error) });
    } finally {
      debuggerInstance?.removeAllDebuggees();
    }
  })();
`

const parsedSourceParentScript = `
  return new Promise((resolve, reject) => {
    const channel = arguments[1];
    const cleanup = () => {
      clearTimeout(timer);
      Services.ppmm.removeMessageListener(channel, listener);
    };
    const listener = ({ data }) => {
      cleanup();
      if (data.error) reject(new Error(data.error));
      else resolve(data.urls);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Firefox did not find parsed scripts for the selected document.'));
    }, 15000);
    Services.ppmm.addMessageListener(channel, listener);
    Services.ppmm.loadProcessScript('data:application/javascript,' + encodeURIComponent(arguments[0]), false);
  });
`

const readParsedJavaScript = async (
  evaluate: FirefoxExtensionSession['evaluate'],
  command: SessionCommand,
  origin: string,
): Promise<string[]> => {
  const href = await evaluate('return location.href')
  if (typeof href !== 'string' || !href.startsWith(`${origin}/`)) {
    throw new Error('Firefox selected document is outside the add-on.')
  }
  const channel = `tabbin-parsed-sources-${randomUUID()}`
  const marker = `__tabbinParsedSources_${randomUUID()}`
  await evaluate(
    'Object.defineProperty(window.wrappedJSObject ?? window, arguments[0], { value: arguments[0], configurable: true });',
    [marker],
  )
  let observed: unknown
  try {
    await command('/moz/context', { context: 'chrome' })
    try {
      observed = await evaluate(parsedSourceParentScript, [
        parsedSourceProcessScript(href, channel, marker),
        channel,
      ])
    } finally {
      await command('/moz/context', { context: 'content' })
    }
  } finally {
    await evaluate('delete (window.wrappedJSObject ?? window)[arguments[0]];', [
      marker,
    ])
  }
  if (!Array.isArray(observed)) {
    throw new TypeError('Firefox did not return parsed JavaScript source URLs.')
  }
  const paths = new Set<string>()
  for (const value of observed) {
    if (typeof value !== 'string' || !value.startsWith(`${origin}/`)) {
      continue
    }
    const pathname = new URL(value).pathname
    if (pathname.endsWith('.js')) {
      paths.add(pathname.slice(1))
    }
  }
  if (!paths.size) {
    throw new Error('Firefox returned no parsed production JavaScript.')
  }
  return [...paths].toSorted()
}

const archiveAddon = async (
  directory: string,
  root: string,
): Promise<string> => {
  const addon = path.join(root, 'addon')
  await cp(directory, addon, { recursive: true })
  const manifestPath = path.join(addon, 'manifest.json')
  const manifest: unknown = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (!record(manifest)) {
    throw new Error('Firefox manifest must be an object.')
  }
  const settings = record(manifest.browser_specific_settings)
    ? manifest.browser_specific_settings
    : {}
  manifest.browser_specific_settings = {
    ...settings,
    gecko: {
      ...(record(settings.gecko) ? settings.gecko : {}),
      id: ADDON_ID,
    },
  }
  await writeFile(manifestPath, JSON.stringify(manifest))
  const files: Zippable = {}
  const collect = async (relative = ''): Promise<void> => {
    for (const entry of await readdir(path.join(addon, relative), {
      withFileTypes: true,
    })) {
      const name = path.posix.join(relative, entry.name)
      if (entry.isDirectory()) {
        // eslint-disable-next-line no-await-in-loop -- filesystem walk is bounded by the production artifact
        await collect(name)
      } else if (entry.isFile()) {
        // eslint-disable-next-line no-await-in-loop -- read each archive member once
        files[name] = await readFile(path.join(addon, name))
      } else {
        throw new Error(`Unexpected Firefox artifact entry: ${name}`)
      }
    }
  }
  await collect()
  const archive = path.join(root, 'extension.xpi')
  await writeFile(archive, zipSync(files))
  return archive
}

const driverAddress = async (driver: ChildProcess): Promise<string> =>
  new Promise((resolve, reject) => {
    let output = ''
    const cleanup = (): void => {
      clearTimeout(timeout)
      driver.stdout?.off('data', onOutput)
      driver.stderr?.off('data', onOutput)
      driver.off('error', onError)
      driver.off('exit', onExit)
    }
    const onError = (error: Error): void => {
      cleanup()
      reject(error)
    }
    const onExit = (): void => {
      onError(new Error(`geckodriver exited during startup: ${output}`))
    }
    const onOutput = (chunk: Buffer): void => {
      output = `${output}${chunk.toString()}`.slice(-8_192)
      const match = /Listening on 127\.0\.0\.1:(\d+)/u.exec(output)
      if (match?.[1]) {
        cleanup()
        resolve(`http://127.0.0.1:${match[1]}`)
      }
    }
    const timeout = setTimeout(() => {
      onError(new Error(`geckodriver startup timed out: ${output}`))
    }, 15_000)
    driver.stdout?.on('data', onOutput)
    driver.stderr?.on('data', onOutput)
    driver.once('error', onError)
    driver.once('exit', onExit)
  })

/** Each invocation installs the unchanged production scripts in a fresh profile. */
export const withFirefoxExtension = async <T>(
  directory: string,
  run: (session: FirefoxExtensionSession) => Promise<T>,
): Promise<T> => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tabbin-entry-load-'))
  let driver: ChildProcess | undefined
  let sessionId: string | undefined
  let base = ''
  const request = async (
    route: string,
    body?: unknown,
    method = 'POST',
  ): Promise<unknown> => {
    const response = await fetch(`${base}${route}`, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(COMMAND_TIMEOUT_MS),
    })
    const payload: unknown = await response.json()
    if (!response.ok || !record(payload) || !Object.hasOwn(payload, 'value')) {
      throw new Error(`Firefox WebDriver ${route}: ${JSON.stringify(payload)}`)
    }
    if (record(payload.value) && typeof payload.value.error === 'string') {
      throw new Error(
        `Firefox WebDriver ${route}: ${JSON.stringify(payload.value)}`,
      )
    }
    return payload.value
  }
  const failures: unknown[] = []
  let completion: { value: T } | undefined
  try {
    const archive = await archiveAddon(directory, root)
    const profile = path.join(root, 'profile')
    await mkdir(profile)
    const uuid = randomUUID()
    const origin = `moz-extension://${uuid}`
    driver = spawn(
      process.env.GECKODRIVER_PATH ?? 'geckodriver',
      ['--host', '127.0.0.1', '--port', '0', '--allow-system-access'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    base = await driverAddress(driver)
    const created = await request('/session', {
      capabilities: {
        alwaysMatch: {
          browserName: 'firefox',
          'moz:firefoxOptions': {
            binary:
              process.env.FIREFOX_EXECUTABLE_PATH ?? firefox.executablePath(),
            args: ['-headless', '-profile', profile],
            prefs: {
              'extensions.webextensions.uuids': JSON.stringify({
                [ADDON_ID]: uuid,
              }),
              'app.update.enabled': false,
              'extensions.update.enabled': false,
              'datareporting.healthreport.uploadEnabled': false,
              'intl.locale.requested': 'en-US',
              'intl.accept_languages': 'en-US,en',
            },
          },
        },
      },
    })
    if (!record(created) || typeof created.sessionId !== 'string') {
      throw new Error('Firefox did not return a WebDriver session ID.')
    }
    const id = created.sessionId
    sessionId = id
    const command = async (route: string, body: unknown): Promise<unknown> =>
      request(`/session/${id}${route}`, body)
    const installed = await command('/moz/addon/install', {
      path: archive,
      temporary: true,
    })
    if (installed !== ADDON_ID) {
      throw new Error('Firefox installed the wrong add-on.')
    }
    await command('/timeouts', {
      pageLoad: COMMAND_TIMEOUT_MS,
      script: COMMAND_TIMEOUT_MS,
    })
    const evaluate = async (
      script: string,
      args: unknown[] = [],
    ): Promise<unknown> => command('/execute/sync', { script, args })
    completion = {
      value: await run({
        origin,
        version: browserVersion(created.capabilities),
        evaluate,
        parsedJavaScript: async () =>
          readParsedJavaScript(evaluate, command, origin),
        navigate: async (relative) => {
          const target = new URL(relative, `${origin}/`)
          if (target.protocol !== 'moz-extension:' || target.host !== uuid) {
            throw new Error(
              'Firefox measurements must navigate within the add-on.',
            )
          }
          await command('/url', { url: target.href })
          if ((await evaluate('return location.origin')) !== origin) {
            throw new Error(
              'Firefox did not navigate to the installed add-on origin.',
            )
          }
        },
      }),
    }
  } catch (error) {
    failures.push(error)
  } finally {
    try {
      if (sessionId) {
        await request(`/session/${sessionId}`, undefined, 'DELETE')
      }
    } catch (error) {
      failures.push(error)
    } finally {
      driver?.kill('SIGTERM')
      try {
        await rm(root, { recursive: true, force: true })
      } catch (error) {
        failures.push(error)
      }
    }
  }
  if (failures.length === 1) {
    throw failures[0]
  }
  if (failures.length > 1) {
    throw new AggregateError(failures, 'Firefox run and cleanup failed.')
  }
  if (!completion) {
    throw new Error('Firefox run did not complete.')
  }
  return completion.value
}
