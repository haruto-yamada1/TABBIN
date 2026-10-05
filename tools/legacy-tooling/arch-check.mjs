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

// dependency-cruiser loads TypeScript optionally without declaring a peer.
// Route only its legacy API requests to this workspace's supported compiler;
// project parsing and compilation continue to resolve the root TypeScript 7.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      context.parentURL?.startsWith(cruiserUrl) &&
      (specifier === 'typescript' || specifier.startsWith('typescript/'))
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
