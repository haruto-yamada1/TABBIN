import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { strToU8, zipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'

import { verifyAcademyArtifacts } from './verifyArtifacts'

const roots: string[] = []
const root = () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'tabbin-academy-artifact-'),
  )
  roots.push(directory)
  return directory
}
afterEach(() => {
  for (const directory of roots.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('Academy production artifact boundary', () => {
  it('accepts clean builds and extension ZIPs', () => {
    const directory = root()
    writeFileSync(
      path.join(directory, 'background.js'),
      'console.log("TABBIN")',
    )
    writeFileSync(
      path.join(directory, 'extension.zip'),
      zipSync({ 'background.js': strToU8('TABBIN') }),
    )
    expect(() => verifyAcademyArtifacts([directory])).not.toThrow()
  })

  it.each([
    'academy-997-v1',
    'study.filming.test',
    'notes.filming.test',
    'garden.filming.test',
  ])(
    'rejects fixture content %s even when bundled into a normal JS filename',
    (marker) => {
      const directory = root()
      writeFileSync(path.join(directory, 'app.js'), marker)
      expect(() => verifyAcademyArtifacts([directory])).toThrow(
        /Academy fixture leaked/u,
      )
    },
  )

  it('rejects filming assets by path in builds and source ZIPs', () => {
    const directory = root()
    mkdirSync(path.join(directory, 'tools', 'academy'), { recursive: true })
    writeFileSync(
      path.join(directory, 'tools', 'academy', 'fixture.ts'),
      'empty',
    )
    expect(() => verifyAcademyArtifacts([directory])).toThrow(
      /Academy fixture leaked/u,
    )
    const archive = path.join(root(), 'sources.zip')
    writeFileSync(
      archive,
      zipSync({ 'tools/academy/README.md': strToU8('empty') }),
    )
    expect(() => verifyAcademyArtifacts([archive])).toThrow(
      /Academy fixture leaked/u,
    )
  })

  it('inspects compressed ZIP contents and fails closed for missing inputs', () => {
    const archive = path.join(root(), 'extension.zip')
    writeFileSync(
      archive,
      zipSync({ 'chunks/app.js': strToU8('study.filming.test') }),
    )
    expect(() => verifyAcademyArtifacts([archive])).toThrow(
      /Academy fixture leaked/u,
    )
    expect(() => verifyAcademyArtifacts([])).toThrow(/Pass production/u)
    expect(() =>
      verifyAcademyArtifacts([path.join(root(), 'missing')]),
    ).toThrow(/ENOENT/u)
  })
})
