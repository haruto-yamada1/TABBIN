import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const projectRoot = path.resolve(import.meta.dirname, '../..')
const root = mkdtempSync(path.join(tmpdir(), 'wxt-build-contract-'))
const sourceFiles = {
  'package.json': JSON.stringify({
    name: 'source-contract',
    version: '1.0.0',
    type: 'module',
  }),
  'bun.lock': '{}',
  '.node-version': '24',
  '.bun-version': '1.3.14',
  'tsconfig.json': '{}',
  'wxt.config.ts': 'export default {}',
  'tailwind.config.js': 'export default {}',
  'README.md': 'Build with bun run build:firefox',
  'PRIVACY.md': 'No data is collected.',
  'src/entrypoints/background.ts': `export default {
    main() {
      console.info('legacy diagnostic must be removed');
      debugger;
      globalThis.console.info({ event: 'structured_event_is_retained' });
    },
  }`,
  'src/public/asset.txt': 'packaged asset',
  'src/features/helper.ts': 'export const value = 1',
}
const excludedFiles = [
  '.env.local',
  '.agents/private.json',
  '.worktrees/another-checkout/package.json',
  'src/.env.local',
  'src/.local/private.json',
  'src/features/helper.test.ts',
  'coverage/report.json',
  'artifacts/local-diagnostics.log',
]
let sourceEntries: string[] = []
let productionScript = ''
let developmentScript = ''

beforeAll(() => {
  for (const [file, content] of Object.entries({
    ...sourceFiles,
    ...Object.fromEntries(excludedFiles.map((file) => [file, 'excluded'])),
  })) {
    const target = path.join(root, file)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
  symlinkSync(
    path.join(projectRoot, 'node_modules'),
    path.join(root, 'node_modules'),
  )
  execFileSync(
    'bun',
    [
      '--eval',
      `import { build, zip } from 'wxt';
       import config from './wxt.config.ts';
       process.chdir(process.argv[1]);
       const fixtureConfig = {
         root: process.cwd(),
         configFile: false,
         srcDir: 'src',
         publicDir: 'src/public',
         browser: 'firefox',
         imports: false,
         modules: ['@wxt-dev/module-react'],
         manifest: {
           name: 'source-contract',
           version: '1.0.0',
           browser_specific_settings: {
             gecko: {
               id: 'build-contract@example.test',
               data_collection_permissions: { required: ['none'] },
             },
           },
         },
         zip: config.zip,
         vite: config.vite,
       };
       await zip({ ...fixtureConfig, mode: 'production' });
       await build({ ...fixtureConfig, mode: 'development' });`,
      root,
    ],
    { cwd: projectRoot, encoding: 'utf8', timeout: 30000 },
  )
  sourceEntries = execFileSync(
    'unzip',
    ['-Z1', path.join(root, '.output/source-contract-1.0.0-sources.zip')],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
  productionScript = readFileSync(
    path.join(root, '.output/firefox-mv2/background.js'),
    'utf8',
  )
  developmentScript = readFileSync(
    path.join(root, '.output/firefox-mv2-dev/background.js'),
    'utf8',
  )
}, 30000)

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('WXT build and Firefox source archive contract', () => {
  it('includes every build input, including hidden runtime version files', () => {
    expect(sourceEntries).toEqual(
      expect.arrayContaining(Object.keys(sourceFiles)),
    )
  })

  it('excludes local state, secrets, tests and generated artifacts', () => {
    for (const file of excludedFiles) {
      expect(sourceEntries).not.toContain(file)
    }
    expect(sourceEntries.some((file) => file.startsWith('node_modules/'))).toBe(
      false,
    )
    expect(sourceEntries.some((file) => file.startsWith('.output/'))).toBe(
      false,
    )
  })

  it('removes legacy console diagnostics and debugger while retaining structured logging', () => {
    expect(productionScript).not.toContain('legacy diagnostic must be removed')
    expect(productionScript).not.toMatch(/\bdebugger\b/u)
    expect(productionScript).toContain('structured_event_is_retained')
  })

  it('retains diagnostics in development builds', () => {
    expect(developmentScript).toContain('legacy diagnostic must be removed')
    expect(developmentScript).toContain('structured_event_is_retained')
  })
})
