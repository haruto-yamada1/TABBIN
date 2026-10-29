import { createHash } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  isReviewedLicense,
  readReviewedLicenseContents,
  reviewedLicenseDependencies,
  verifyDependencyLicensePolicy,
} from './dependency-license-policy'

const now = new Date('2026-10-22T00:00:00Z')
const license = readFileSync('node_modules/react-doctor/LICENSE', 'utf8')
const names = ['react-doctor', 'oxlint-plugin-react-doctor']
const integrity = (value: string) =>
  `sha512-${createHash('sha512').update(value).digest('base64')}`
const manifest = { devDependencies: { 'react-doctor': '^0.9.16' } }
const snapshot = (version = '0.9.16') => ({
  workspaces: { '': structuredClone(manifest) },
  packages: Object.fromEntries(
    names.map((name) => [
      name,
      [
        `${name}@${version}`,
        '',
        name === 'react-doctor'
          ? { dependencies: { 'oxlint-plugin-react-doctor': version } }
          : {},
        integrity(`${name}@${version}`),
      ],
    ]),
  ) as Record<string, unknown>,
})
const contents = (versions = ['0.9.16']) =>
  Object.fromEntries(
    versions.flatMap((version) =>
      names.map((name) => [`${name}@${version}`, license]),
    ),
  )

describe('reviewed development license distributions', () => {
  it('accepts a same-LICENSE version upgrade without editing policy pins', () => {
    expect(() =>
      verifyDependencyLicensePolicy(manifest, snapshot(), contents(), now),
    ).not.toThrow()
    expect(() =>
      verifyDependencyLicensePolicy(
        manifest,
        snapshot('0.9.17'),
        contents(['0.9.17']),
        now,
      ),
    ).not.toThrow()
    expect(reviewedLicenseDependencies.map(({ name }) => name)).toEqual(names)
  })

  it('accepts canonical semver build metadata without treating it as a new license', () => {
    const version = '0.9.17+review.1'
    expect(() =>
      verifyDependencyLicensePolicy(
        manifest,
        snapshot(version),
        contents([version]),
        now,
      ),
    ).not.toThrow()
  })

  it('allows a same-LICENSE Doctor upgrade that no longer requires the plugin', () => {
    const lock = snapshot('0.9.17')
    delete lock.packages['oxlint-plugin-react-doctor']
    lock.packages['react-doctor'] = [
      'react-doctor@0.9.17',
      '',
      {},
      integrity('react-doctor@0.9.17'),
    ]
    expect(() =>
      verifyDependencyLicensePolicy(
        manifest,
        lock,
        { 'react-doctor@0.9.17': license },
        now,
      ),
    ).not.toThrow()
  })

  it.each(['dependencies', 'optionalDependencies'])(
    'requires plugin resolutions when Doctor declares them in %s, including aliases',
    (scope) => {
      for (const references of [
        { 'oxlint-plugin-react-doctor': '^0.9.16' },
        { alias: 'npm:oxlint-plugin-react-doctor@^0.9.16' },
      ]) {
        const lock = snapshot()
        delete lock.packages['oxlint-plugin-react-doctor']
        lock.packages['react-doctor'] = [
          'react-doctor@0.9.16',
          '',
          { [scope]: references },
          integrity('react-doctor@0.9.16'),
        ]
        expect(() =>
          verifyDependencyLicensePolicy(manifest, lock, contents(), now),
        ).toThrow(/license review/)
      }
    },
  )

  it('checks each nested version using its exact content key', () => {
    const lock = snapshot()
    lock.packages['nested/react-doctor'] = [
      'react-doctor@0.9.18',
      'https://registry.npmjs.org',
      {},
      integrity('react-doctor@0.9.18'),
    ]
    expect(() =>
      verifyDependencyLicensePolicy(
        manifest,
        lock,
        contents(['0.9.16', '0.9.18']),
        now,
      ),
    ).not.toThrow()
    expect(() =>
      verifyDependencyLicensePolicy(manifest, lock, contents(), now),
    ).toThrow(/license review/)
    expect(() =>
      verifyDependencyLicensePolicy(
        manifest,
        lock,
        { ...contents(), 'react-doctor@0.9.18': `${license}\n` },
        now,
      ),
    ).toThrow(/license review/)
  })

  it.each(['2026-10-20T23:59:59Z', '2026-11-20T00:00:00Z', 'invalid'])(
    'rejects a not-yet-approved, expired or invalid date %s',
    (date) =>
      expect(() =>
        verifyDependencyLicensePolicy(
          manifest,
          snapshot(),
          contents(),
          new Date(date),
        ),
      ).toThrow(/license review/),
  )

  it.each([
    'latest',
    'npm:react-doctor@0.9.16',
    'github:owner/doctor',
    'invalid',
  ])('rejects a non-semver root declaration %s', (reference) => {
    const root = { devDependencies: { 'react-doctor': reference } }
    const lock = snapshot()
    lock.workspaces[''] = root
    expect(() =>
      verifyDependencyLicensePolicy(root, lock, contents(), now),
    ).toThrow(/react-doctor|license review/)
  })

  it('requires a root range matching the lock declaration and resolution', () => {
    const lock = snapshot()
    lock.workspaces[''].devDependencies['react-doctor'] = '~0.9.16'
    expect(() =>
      verifyDependencyLicensePolicy(manifest, lock, contents(), now),
    ).toThrow(/license review/)
    expect(() =>
      verifyDependencyLicensePolicy(
        manifest,
        snapshot('0.10.0'),
        contents(['0.10.0']),
        now,
      ),
    ).toThrow(/license review/)
  })

  it.each(names)(
    'rejects missing, wrong-identity, noncanonical or malformed resolutions of %s',
    (name) => {
      const lock = snapshot()
      const id = `${name}@0.9.16`
      for (const bad of [
        ['other@0.9.16', '', {}, integrity(id)],
        [`${name}@01.9.16`, '', {}, integrity(id)],
        [id, 'https://evil.invalid', {}, integrity(id)],
        [id, 'https://registry.npmjs.org/', {}, integrity(id)],
        [id, '', {}, 'sha512-changed'],
        [id, '', {}, 'sha512-'],
        [id, '', {}, undefined],
        [id, '', {}, integrity(id), 'extra'],
      ]) {
        expect(() =>
          verifyDependencyLicensePolicy(
            manifest,
            {
              ...lock,
              packages: { ...lock.packages, [`nested/${name}`]: bad },
            },
            contents(),
            now,
          ),
        ).toThrow(/license review/)
      }
      lock.packages[`nested/${name}`] = [id, '', {}, integrity('changed')]
      expect(() =>
        verifyDependencyLicensePolicy(manifest, lock, contents(), now),
      ).toThrow(/license review/)
      delete lock.packages[`nested/${name}`]
      delete lock.packages[name]
      expect(() =>
        verifyDependencyLicensePolicy(manifest, lock, contents(), now),
      ).toThrow(/license review/)
    },
  )

  it.each(['dependencies', 'optionalDependencies', 'peerDependencies'])(
    'rejects direct and aliased reviewed packages in production scope %s',
    (scope) => {
      for (const name of names) {
        for (const declaration of [
          { [name]: '^0.9.16' },
          { alias: `npm:${name}@^0.9.16` },
          { alias: `npm:${name}` },
        ]) {
          const workspace = { [scope]: declaration }
          const lock = snapshot()
          expect(() =>
            verifyDependencyLicensePolicy(
              { ...manifest, ...workspace },
              lock,
              contents(),
              now,
            ),
          ).toThrow(/license review/)
          expect(() =>
            verifyDependencyLicensePolicy(
              manifest,
              { ...lock, workspaces: { ...lock.workspaces, tools: workspace } },
              contents(),
              now,
            ),
          ).toThrow(/license review/)
        }
      }
    },
  )

  it.each(names)(
    'rejects absent, package-only or changed LICENSE bytes for %s',
    (name) => {
      const missing = contents()
      delete missing[`${name}@0.9.16`]
      expect(() =>
        verifyDependencyLicensePolicy(manifest, snapshot(), missing, now),
      ).toThrow(/license review/)
      expect(() =>
        verifyDependencyLicensePolicy(
          manifest,
          snapshot(),
          { ...missing, [name]: license },
          now,
        ),
      ).toThrow(/license review/)
      expect(() =>
        verifyDependencyLicensePolicy(
          manifest,
          snapshot(),
          { ...contents(), [`${name}@0.9.16`]: `${license}\n` },
          now,
        ),
      ).toThrow(/license review/)
    },
  )

  it('does not accept another package, mismatched resolution or registry license', () => {
    const resolution = snapshot().packages['react-doctor']
    for (const [id, metadataLicense] of [
      ['other@0.9.16', 'SEE LICENSE IN LICENSE'],
      ['react-doctor@0.9.17', 'SEE LICENSE IN LICENSE'],
      ['react-doctor@0.9.16', 'UNKNOWN'],
      ['react-doctor@0.9.16', undefined],
    ]) {
      expect(
        isReviewedLicense(
          id ?? '',
          metadataLicense,
          [resolution],
          contents(),
          now,
        ),
      ).toBe(false)
    }
  })
})

describe('installed reviewed LICENSE discovery', () => {
  const withInstallation = (run: (root: string) => void) => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'tabbin-license-'))
    try {
      for (const name of names) {
        const directory = path.join(
          root,
          'node_modules/.bun',
          `${name}@0.9.16`,
          'node_modules',
          name,
        )
        mkdirSync(directory, { recursive: true })
        writeFileSync(
          path.join(directory, 'package.json'),
          JSON.stringify({
            name,
            version: '0.9.16',
            license: 'SEE LICENSE IN LICENSE',
          }),
        )
        writeFileSync(path.join(directory, 'LICENSE'), license)
        if (name === 'react-doctor') {
          symlinkSync(directory, path.join(root, 'node_modules', name))
        }
      }
      run(root)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }

  it('reads canonical package roots without assuming the plugin is private inside Doctor', () => {
    withInstallation((root) =>
      expect(readReviewedLicenseContents(snapshot(), root)).toEqual(contents()),
    )
  })

  it('keeps the zero-argument CLI wrapper keyed by installed name and version', () => {
    const installed = readReviewedLicenseContents()
    for (const name of names) {
      expect(
        Object.keys(installed).some((id) => id.startsWith(`${name}@`)),
      ).toBe(true)
    }
    expect(
      Object.values(installed).every((content) => content === license),
    ).toBe(true)
  })

  it('rejects a symlinked LICENSE even if its target contains approved bytes', () => {
    withInstallation((root) => {
      const file = path.join(
        root,
        'node_modules/.bun/react-doctor@0.9.16/node_modules/react-doctor/LICENSE',
      )
      rmSync(file)
      symlinkSync(path.join(root, 'approved-LICENSE'), file)
      writeFileSync(path.join(root, 'approved-LICENSE'), license)
      expect(() => readReviewedLicenseContents(snapshot(), root)).toThrow(
        /regular file/,
      )
    })
  })

  it('checks a second same-version peer variant instead of overwriting its content', () => {
    withInstallation((root) => {
      const packageRoot = path.join(
        root,
        'node_modules/.bun/react-doctor@0.9.16+other-peer/node_modules/react-doctor',
      )
      mkdirSync(packageRoot, { recursive: true })
      writeFileSync(
        path.join(packageRoot, 'package.json'),
        JSON.stringify({
          name: 'react-doctor',
          version: '0.9.16',
          license: 'SEE LICENSE IN LICENSE',
        }),
      )
      writeFileSync(path.join(packageRoot, 'LICENSE'), `${license}\n`)
      expect(() => readReviewedLicenseContents(snapshot(), root)).toThrow(
        /installed LICENSE/,
      )
    })
  })

  it.each(['name', 'version', 'license'])(
    'rejects installed package metadata mismatch: %s',
    (field) => {
      withInstallation((root) => {
        const file = path.join(
          root,
          'node_modules/.bun/oxlint-plugin-react-doctor@0.9.16/node_modules/oxlint-plugin-react-doctor/package.json',
        )
        const metadata = JSON.parse(readFileSync(file, 'utf8'))
        metadata[field] = 'unexpected'
        writeFileSync(file, JSON.stringify(metadata))
        expect(() => readReviewedLicenseContents(snapshot(), root)).toThrow(
          /Invalid input|installed identity/,
        )
      })
    },
  )

  it('rejects changed LICENSE in a second installed version', () => {
    withInstallation((root) => {
      const directory = path.join(
        root,
        'node_modules/.bun/react-doctor@0.9.18/node_modules/react-doctor',
      )
      mkdirSync(directory, { recursive: true })
      writeFileSync(
        path.join(directory, 'package.json'),
        JSON.stringify({
          name: 'react-doctor',
          version: '0.9.18',
          license: 'SEE LICENSE IN LICENSE',
        }),
      )
      writeFileSync(path.join(directory, 'LICENSE'), `${license}\n`)
      const lock = snapshot()
      lock.packages['nested/react-doctor'] = [
        'react-doctor@0.9.18',
        '',
        {},
        integrity('react-doctor@0.9.18'),
      ]
      expect(() => readReviewedLicenseContents(lock, root)).toThrow(
        /LICENSE|license/,
      )
    })
  })
})
