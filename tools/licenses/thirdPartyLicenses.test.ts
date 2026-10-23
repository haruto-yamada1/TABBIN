import { createHash } from 'node:crypto'
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  addThirdPartyLicenseFilesToSourceZip,
  verifyThirdPartyLicenseFiles,
  verifyThirdPartyLicenseZip,
  writeThirdPartyLicenseFiles,
} from './thirdPartyLicenses'

const mit = `MIT License\n\nCopyright (c) Fixture authors\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN\nTHE SOFTWARE.\n`
const digest = (text: string | Uint8Array) =>
  createHash('sha256').update(text).digest('hex')
const packageIntegrity = `sha512-${Buffer.alloc(64).toString('base64')}`

describe('third-party release notices', () => {
  let root: string
  let outDir: string
  let legalDir: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'tabbin-licenses-'))
    outDir = path.join(root, 'output')
    legalDir = path.join(root, 'tools/licenses')
    await mkdir(legalDir, { recursive: true })
    await writeFile(path.join(legalDir, 'reviewed-licenses.json'), '[]')
    await writeFile(path.join(legalDir, 'sources.json'), '[]')
    await writeFile(
      path.join(root, 'bun.lock'),
      JSON.stringify({ packages: {} }),
    )
  })
  afterEach(async () => {
    await rm(root, { force: true, recursive: true })
  })

  async function file(name: string, text: string | Uint8Array) {
    const target = path.join(root, name)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, text)
    return target
  }

  async function pkg(
    name: string,
    version = '1.0.0',
    license: string | null = 'MIT',
    prefix = '',
  ) {
    const lockFile = path.join(root, 'bun.lock')
    const lock = JSON.parse(await readFile(lockFile, 'utf8'))
    lock.packages[`${name}@${version}`] = [
      `${name}@${version}`,
      '',
      {},
      packageIntegrity,
    ]
    await writeFile(lockFile, JSON.stringify(lock))
    const directory = path.join(prefix, 'node_modules', name)
    await file(
      path.join(directory, 'package.json'),
      JSON.stringify({
        name,
        version,
        ...(license ? { license } : {}),
        repository: { url: 'https://github.com/example/fixture.git' },
      }),
    )
    await file(
      path.join(directory, 'LICENSE'),
      license === 'MPL-2.0'
        ? await readFile(
            path.join(import.meta.dirname, 'fixtures/MPL-2.0.txt'),
            'utf8',
          )
        : mit,
    )
    return file(path.join(directory, 'index.js'), 'export const value = 1')
  }

  const build = async (moduleIds: string[]) =>
    writeThirdPartyLicenseFiles({ outDir, projectRoot: root, moduleIds })

  it('attributes private subpaths to their npm distribution and retains distinct versions', async () => {
    const first = await pkg('@scope/resolvers')
    const internal = await file(
      'node_modules/@scope/resolvers/zod/package.json',
      JSON.stringify({ name: '@scope/resolvers/zod', private: true }),
    )
    const subpath = await file(
      'node_modules/@scope/resolvers/zod/index.js',
      'export {}',
    )
    const second = await pkg('fixture', '2.0.0', 'MIT', 'node_modules/host')
    const third = await pkg('fixture', '1.0.0')
    const result = await build([
      third,
      subpath,
      second,
      first,
      `${subpath}?commonjs-proxy`,
      '\0virtual:module',
      internal,
    ])
    expect(result.packageCount).toBe(3)
    const inventory = JSON.parse(
      await readFile(path.join(outDir, 'THIRD_PARTY_LICENSES.json'), 'utf8'),
    )
    expect(
      inventory.packages.map(
        (entry: { name: string; version: string }) =>
          `${entry.name}@${entry.version}`,
      ),
    ).toEqual(['@scope/resolvers@1.0.0', 'fixture@1.0.0', 'fixture@2.0.0'])
    expect(
      await readFile(path.join(outDir, 'THIRD_PARTY_NOTICES.txt'), 'utf8'),
    ).toContain(mit)
    await expect(verifyThirdPartyLicenseFiles(outDir)).resolves.toBeUndefined()
  })

  it('writes byte-identical legal files independent of module order and duplicates', async () => {
    const a = await pkg('alpha')
    const b = await pkg('beta')
    await build([b, a, a])
    const first = await readFile(path.join(outDir, 'THIRD_PARTY_LICENSES.json'))
    const firstNotice = await readFile(
      path.join(outDir, 'THIRD_PARTY_NOTICES.txt'),
    )
    await build([a, b])
    expect(
      await readFile(path.join(outDir, 'THIRD_PARTY_LICENSES.json')),
    ).toEqual(first)
    expect(
      await readFile(path.join(outDir, 'THIRD_PARTY_NOTICES.txt')),
    ).toEqual(firstNotice)
  })

  it.each(['UNKNOWN', 'SEE LICENSE IN LICENSE', 'MIT OR GPL-3.0'])(
    'rejects unsupported metadata %s',
    async (license) => {
      await expect(
        build([await pkg('fixture', '1.0.0', license)]),
      ).rejects.toThrow(/unsupported license/i)
    },
  )

  it('rejects missing license text and does not manufacture one from SPDX metadata', async () => {
    const module = await pkg('fixture')
    await rm(path.join(path.dirname(module), 'LICENSE'))
    await expect(build([module])).rejects.toThrow(/license text/i)
  })

  it('requires a reviewed exact package and digest for missing metadata or fallback texts', async () => {
    const module = await pkg('khroma', '2.1.0', null)
    await expect(build([module])).rejects.toThrow(/unsupported license/i)
    await file('tools/licenses/reviewed/khroma-LICENSE', mit)
    await writeFile(
      path.join(legalDir, 'reviewed-licenses.json'),
      JSON.stringify([
        {
          name: 'khroma',
          version: '2.1.0',
          license: 'MIT',
          packageIntegrity,
          sourceUrl:
            'https://github.com/fabiospampinato/khroma/blob/v2.1.0/license',
          files: [
            {
              path: 'khroma-LICENSE',
              originalPath: 'license',
              sha256: digest(mit),
            },
          ],
        },
      ]),
    )
    await expect(build([module])).resolves.toMatchObject({ packageCount: 1 })
    await file('tools/licenses/reviewed/khroma-LICENSE', `${mit}changed`)
    await expect(build([module])).rejects.toThrow(/digest/i)
  })

  it('rejects a reviewed fallback that is not bound to an npm integrity', async () => {
    const module = await pkg('unbound', '1.0.0', null)
    await file('tools/licenses/reviewed/unbound-LICENSE', mit)
    await writeFile(
      path.join(legalDir, 'reviewed-licenses.json'),
      JSON.stringify([
        {
          name: 'unbound',
          version: '1.0.0',
          license: 'MIT',
          sourceUrl: 'https://example.invalid/original/LICENSE',
          files: [
            {
              path: 'unbound-LICENSE',
              originalPath: 'LICENSE',
              sha256: digest(mit),
            },
          ],
        },
      ]),
    )
    await expect(build([module])).rejects.toThrow(/packageIntegrity/)
  })

  it('preserves vendored licenses and NOTICE files rather than only package metadata', async () => {
    const module = await pkg('vendor', '1.0.0', 'MIT AND ISC')
    await file(
      'node_modules/vendor/lib-vendor/part/LICENSE',
      'ISC License\nCopyright Vendor Author\nPermission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.\nTHE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES.\n',
    )
    await file('node_modules/vendor/NOTICE', 'Required upstream notice\n')
    await build([module])
    const notice = await readFile(
      path.join(outDir, 'THIRD_PARTY_NOTICES.txt'),
      'utf8',
    )
    expect(notice).toContain('Required upstream notice')
    expect(notice).toContain('Copyright Vendor Author')
    expect(notice).toContain('lib-vendor/part/LICENSE')
  })

  it('preserves named documents under license directories', async () => {
    const module = await pkg('fixture')
    await file(
      'node_modules/fixture/licenses/secondary/MIT.txt',
      'Original secondary copyright and permission\n',
    )
    await build([module])
    expect(
      await readFile(path.join(outDir, 'THIRD_PARTY_NOTICES.txt'), 'utf8'),
    ).toContain('Original secondary copyright and permission')
  })

  it('completes a standard Apache header without a package-version exception', async () => {
    const module = await pkg('apache-fixture', '2.0.0', 'Apache-2.0')
    await file(
      'node_modules/apache-fixture/LICENSE',
      'Copyright 2026 Original Author\nLicensed under the Apache License, Version 2.0 (the "License");\nhttp://www.apache.org/licenses/LICENSE-2.0\n',
    )
    const canonical = await readFile(
      path.join(import.meta.dirname, 'reviewed/apache-2.0/LICENSE-2.0.txt'),
    )
    await file('tools/licenses/reviewed/apache-2.0/LICENSE-2.0.txt', canonical)
    await expect(build([module])).resolves.toMatchObject({ packageCount: 1 })
    const text = await readFile(
      path.join(outDir, 'THIRD_PARTY_NOTICES.txt'),
      'utf8',
    )
    expect(text).toContain('Copyright 2026 Original Author')
    expect(text).toContain(canonical.toString('utf8'))
  })

  it.each(['react-doctor', 'oxlint-plugin-react-doctor', 'node-forge'])(
    'rejects development-only %s in the runtime graph',
    async (name) => {
      await expect(build([await pkg(name)])).rejects.toThrow(
        /development-only/i,
      )
    },
  )

  it('rejects traversal and symlinked files escaping a package or legal source root', async () => {
    const module = await pkg('fixture')
    await expect(
      build([`${path.dirname(module)}/../fixture/index.js`]),
    ).rejects.toThrow(/traversal/i)
    const outside = await file('outside-license', mit)
    await rm(path.join(path.dirname(module), 'LICENSE'))
    await symlink(outside, path.join(path.dirname(module), 'LICENSE'))
    await expect(build([module])).rejects.toThrow(/symlink/i)
  })

  async function mplSource(module: string, version = '0.12.0') {
    const archive = strToU8(
      'fixture archive containing preferred-form source and LICENSE',
    )
    await file(
      'tools/licenses/sources/webextension-polyfill-0.12.0.tar.gz',
      archive,
    )
    await writeFile(
      path.join(legalDir, 'sources.json'),
      JSON.stringify([
        {
          name: 'webextension-polyfill',
          version,
          license: 'MPL-2.0',
          packageIntegrity,
          path: 'sources/webextension-polyfill-0.12.0.tar.gz',
          sha256: digest(archive),
          sourceUrl:
            'https://github.com/mozilla/webextension-polyfill/archive/refs/tags/0.12.0.tar.gz',
        },
      ]),
    )
    return module
  }

  it('requires the matching MPL preferred-form source, includes it and detects stale bytes', async () => {
    const module = await pkg('webextension-polyfill', '0.12.0', 'MPL-2.0')
    await expect(build([module])).rejects.toThrow(/source/i)
    await mplSource(module)
    const result = await build([module])
    expect(result.emittedFiles).toContain(
      'third-party-sources/webextension-polyfill-0.12.0.tar.gz',
    )
    expect(
      await readFile(path.join(outDir, 'THIRD_PARTY_NOTICES.txt'), 'utf8'),
    ).toContain('third-party-sources/webextension-polyfill-0.12.0.tar.gz')
    await file(
      'tools/licenses/sources/webextension-polyfill-0.12.0.tar.gz',
      'changed',
    )
    await expect(build([module])).rejects.toThrow(/digest/i)
  })

  it('rejects a source approval for another package version', async () => {
    const module = await pkg('webextension-polyfill', '0.13.0', 'MPL-2.0')
    await mplSource(module)
    await expect(build([module])).rejects.toThrow(/source/i)
  })

  it('verifies notices and legal source entries in output directories and ZIPs', async () => {
    await build([
      await mplSource(await pkg('webextension-polyfill', '0.12.0', 'MPL-2.0')),
    ])
    const zipFile = await file(
      'source.zip',
      zipSync({ 'package.json': strToU8('{}') }),
    )
    await addThirdPartyLicenseFilesToSourceZip(zipFile, outDir)
    const first = await readFile(zipFile)
    await expect(verifyThirdPartyLicenseZip(zipFile)).resolves.toBeUndefined()
    await addThirdPartyLicenseFilesToSourceZip(zipFile, outDir)
    expect(await readFile(zipFile)).toEqual(first)
    const entries = unzipSync(first)
    expect(
      strFromU8(entries['THIRD_PARTY_NOTICES.txt'] ?? new Uint8Array()),
    ).toContain('webextension-polyfill@0.12.0')
    entries['THIRD_PARTY_NOTICES.txt'] = strToU8('tampered')
    await writeFile(zipFile, zipSync(entries))
    await expect(verifyThirdPartyLicenseZip(zipFile)).rejects.toThrow(/digest/i)
    delete entries['THIRD_PARTY_NOTICES.txt']
    await writeFile(zipFile, zipSync(entries))
    await expect(verifyThirdPartyLicenseZip(zipFile)).rejects.toThrow(
      /missing/i,
    )
    await writeFile(path.join(outDir, 'THIRD_PARTY_NOTICES.txt'), 'tampered')
    await expect(verifyThirdPartyLicenseFiles(outDir)).rejects.toThrow(
      /digest/i,
    )
  })
})
