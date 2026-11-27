import { createRequire, registerHooks } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { parseSync } from '@swc/core'

// Fail rather than letting the upstream optional loader fall back to a
// different parser when the configured native parser cannot be loaded.
parseSync('export type ArchitectureParserProbe = string', {
  syntax: 'typescript',
})

const require = createRequire(import.meta.url)
const cruiserDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.resolve('dependency-cruiser'))),
  '../..',
)
const cruiserUrl = pathToFileURL(`${cruiserDirectory}${path.sep}`).href

// dependency-cruiser loads TypeScript and SWC as optional parsers. Resolve both
// from this workspace so it uses the TypeScript 6 API and the same native SWC
// binding as the probe above. Loading two SWC bindings can crash on macOS.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      context.parentURL?.startsWith(cruiserUrl) &&
      /^(?:typescript|@swc\/core)(?:\/|$)/u.test(specifier)
    ) {
      return {
        shortCircuit: true,
        url: pathToFileURL(require.resolve(specifier)).href,
      }
    }
    return nextResolve(specifier, context)
  },
})

// Keep the upstream CLI, configuration, diagnostics and exit codes intact.
await import(
  pathToFileURL(path.join(cruiserDirectory, 'bin/dependency-cruiser.mjs')).href
)
